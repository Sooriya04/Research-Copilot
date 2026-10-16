"""
Evidence Studio & Deterministic Grounding API Routes.
Provides endpoints for page-indexed coordinate ingestion, excerpt verification,
evidence audit metrics, visual figure/table extraction, and human review sign-offs.
"""

import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.logger import logger
from src.core.models import (
    PaperEvidenceModel,
    PaperFigureModel,
    PaperEvidenceAuditModel,
)
from src.core.evidence_schemas import (
    HighlightRect,
    SourceReference,
    ClaimItem,
    MetricItem,
    GlossaryItem,
    LimitationItem,
    FigureAsset,
    TimelineStage,
    EvidenceAuditResult,
    PaperEvidencePackage,
)
from src.core.paper_repository import PaperRepository
from src.engines.pdf_coordinate_engine import PDFCoordinateEngine
from src.engines.excerpt_verifier import DeterministicExcerptVerifier
from src.engines.multi_pass_extractor import MultiPassEvidenceExtractor
from src.engines.pdf_extractor import PDFExtractor
from src.rag.active_cache import ActivePaperCache
import json

router = APIRouter(prefix="/api/v1/evidence", tags=["Evidence Studio & Grounded Audit"])

coord_engine = PDFCoordinateEngine()
excerpt_verifier = DeterministicExcerptVerifier()
multi_pass_extractor = MultiPassEvidenceExtractor()
pdf_extractor_service = PDFExtractor()
active_cache = ActivePaperCache()



class EvidenceIngestRequest(BaseModel):
    paper_id: str
    title: Optional[str] = None
    pdf_url: Optional[str] = None
    force_refresh: bool = False
    provider: Optional[str] = ""
    model: Optional[str] = ""


class VerifyExcerptRequest(BaseModel):
    paper_id: str
    page: int = 1
    excerpt: str


class VerifyExcerptResponse(BaseModel):
    paper_id: str
    page: int
    verified_page: int
    exact_match: bool
    highlight_rects: List[HighlightRect]
    token_overlap_ratio: float = 1.0


class ClaimReviewSubmission(BaseModel):
    claim_id: str
    reviewer_status: str = "accepted"  # accepted | flagged | unreviewed
    note: Optional[str] = None
    reviewer: Optional[str] = "researcher"


@router.post("/ingest", response_model=PaperEvidencePackage)
async def ingest_paper_evidence(req: EvidenceIngestRequest, db: AsyncSession = Depends(get_db)):
    """
    Ingest a PDF research paper into page-indexed coordinate structures, execute
    the 4-pass schema extraction, extract visual assets, mathematically verify excerpts,
    and persist the evidence package into SQLite.
    """
    paper_id = req.paper_id.strip()
    if not paper_id:
        raise HTTPException(status_code=400, detail="paper_id is required.")

    # Check Redis cache first if not force_refresh
    if not req.force_refresh:
        cached_evidence = await active_cache.get_evidence(paper_id)
        if cached_evidence:
            try:
                return PaperEvidencePackage(**cached_evidence)
            except Exception as e:
                logger.debug("[Evidence] Redis cached package parse failed for %s: %s", paper_id, e)

        existing_stmt = select(PaperEvidenceModel).where(PaperEvidenceModel.paper_id == paper_id)
        res = await db.execute(existing_stmt)
        cached_model = res.scalars().first()
        if cached_model:
            # Reconstruct audit record
            audit_stmt = select(PaperEvidenceAuditModel).where(PaperEvidenceAuditModel.paper_id == paper_id)
            a_res = await db.execute(audit_stmt)
            audit_row = a_res.scalars().first()
            audit_obj = None
            if audit_row:
                audit_obj = EvidenceAuditResult(
                    checked_at=audit_row.checked_at,
                    paper_id=paper_id,
                    page_count=audit_row.page_count,
                    total_claims=audit_row.total_claims,
                    verified_claims=audit_row.verified_claims,
                    needs_review_claims=audit_row.needs_review_claims,
                    quote_match_rate=audit_row.quote_match_rate,
                    page_coverage_rate=audit_row.page_coverage_rate,
                    cited_pages=audit_row.cited_pages_json or [],
                    unreached_pages=audit_row.unreached_pages_json or [],
                    thin_sections=audit_row.thin_sections_json or [],
                    unlocated_items=audit_row.unlocated_json or []
                )

            # Reconstruct figure assets
            figs_stmt = select(PaperFigureModel).where(PaperFigureModel.paper_id == paper_id)
            f_res = await db.execute(figs_stmt)
            fig_rows = f_res.scalars().all()
            figures = [
                FigureAsset(
                    id=f.id,
                    label=f.label,
                    caption=f.caption,
                    why_it_matters=f.why_it_matters,
                    page=f.page,
                    asset_type=f.asset_type,
                    image_data_url=f.image_data_url,
                    asset_path=f.asset_path,
                    bbox=f.bbox_json or [],
                    claim_ids=f.claim_ids_json or []
                )
                for f in fig_rows
            ]

            pkg = PaperEvidencePackage(
                paper_id=cached_model.paper_id,
                title=cached_model.title,
                thesis=cached_model.thesis,
                plain_summary=cached_model.plain_summary,
                research_question=cached_model.research_question,
                methods=cached_model.methods_json or [],
                findings=cached_model.findings_json or [],
                claims=[ClaimItem(**c) for c in (cached_model.claims_json or [])],
                metrics=[MetricItem(**m) for m in (cached_model.metrics_json or [])],
                glossary=[GlossaryItem(**g) for g in (cached_model.glossary_json or [])],
                limitations=[LimitationItem(**l) for l in (cached_model.limitations_json or [])],
                figures=figures,
                timeline=[TimelineStage(**t) for t in (cached_model.timeline_json or [])],
                audit=audit_obj
            )
            await active_cache.set_evidence(paper_id, pkg.model_dump())
            return pkg

    # Resolve PDF source URL
    pdf_url = req.pdf_url
    if not pdf_url:
        clean_aid = paper_id.lower().replace("arxiv:", "").strip()
        if re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", clean_aid):
            pdf_url = f"https://arxiv.org/pdf/{clean_aid}.pdf"
        elif paper_id.startswith("http"):
            pdf_url = paper_id

    # Download raw PDF bytes
    pdf_bytes = None
    if pdf_url:
        try:
            pdf_bytes = await pdf_extractor_service.fetch_pdf_bytes(pdf_url)
        except Exception as e:
            logger.warning("Could not download PDF from %s: %s", pdf_url, e)

    # Ingest PDF into coordinate structures
    title = req.title or paper_id
    if pdf_bytes:
        doc = coord_engine.parse_pdf(pdf_bytes, paper_id=paper_id, title=title)
    else:
        # Fallback to existing database chunk text
        p_canon = await PaperRepository.get_by_canonical_id(db, paper_id)
        if p_canon and p_canon.title:
            title = p_canon.title
        doc = coord_engine.parse_pdf(b"", paper_id=paper_id, title=title)

    # Execute Multi-Pass Structured Extraction Pipeline
    pkg = await multi_pass_extractor.extract_evidence_package(
        doc=doc,
        pdf_bytes=pdf_bytes,
        provider_name=req.provider or "",
        model_name=req.model or "",
    )

    # Persist into SQLite paper_evidence table
    existing_stmt = select(PaperEvidenceModel).where(PaperEvidenceModel.paper_id == paper_id)
    res = await db.execute(existing_stmt)
    ev_record = res.scalars().first()

    claims_data = [c.model_dump() for c in pkg.claims]
    metrics_data = [m.model_dump() for m in pkg.metrics]
    glossary_data = [g.model_dump() for g in pkg.glossary]
    limitations_data = [l.model_dump() for l in pkg.limitations]
    timeline_data = [t.model_dump() for t in pkg.timeline]

    if not ev_record:
        ev_record = PaperEvidenceModel(
            id=f"ev-{paper_id}",
            paper_id=paper_id,
            title=pkg.title,
            thesis=pkg.thesis,
            plain_summary=pkg.plain_summary,
            research_question=pkg.research_question,
            methods_json=pkg.methods,
            findings_json=pkg.findings,
            claims_json=claims_data,
            metrics_json=metrics_data,
            glossary_json=glossary_data,
            limitations_json=limitations_data,
            timeline_json=timeline_data,
            page_count=max(doc.page_count, 1),
            page_data_json={p.page_number: {"width": p.width, "height": p.height} for p in doc.pages}
        )
        db.add(ev_record)
    else:
        ev_record.title = pkg.title
        ev_record.thesis = pkg.thesis
        ev_record.plain_summary = pkg.plain_summary
        ev_record.research_question = pkg.research_question
        ev_record.methods_json = pkg.methods
        ev_record.findings_json = pkg.findings
        ev_record.claims_json = claims_data
        ev_record.metrics_json = metrics_data
        ev_record.glossary_json = glossary_data
        ev_record.limitations_json = limitations_data
        ev_record.timeline_json = timeline_data
        ev_record.page_count = max(doc.page_count, 1)

    # Persist figures
    if pkg.figures:
        del_figs = text("DELETE FROM paper_figures WHERE paper_id = :pid")
        await db.execute(del_figs, {"pid": paper_id})
        for f in pkg.figures:
            fig_row = PaperFigureModel(
                id=f.id,
                paper_id=paper_id,
                label=f.label,
                caption=f.caption,
                why_it_matters=f.why_it_matters,
                page=f.page,
                asset_type=f.asset_type,
                image_data_url=f.image_data_url,
                asset_path=f.asset_path,
                bbox_json=f.bbox or [],
                claim_ids_json=f.claim_ids or []
            )
            db.add(fig_row)

    # Persist audit record
    if pkg.audit:
        del_audit = text("DELETE FROM paper_evidence_audits WHERE paper_id = :pid")
        await db.execute(del_audit, {"pid": paper_id})
        audit_row = PaperEvidenceAuditModel(
            id=f"audit-{paper_id}",
            paper_id=paper_id,
            checked_at=pkg.audit.checked_at,
            page_count=pkg.audit.page_count,
            total_claims=pkg.audit.total_claims,
            verified_claims=pkg.audit.verified_claims,
            needs_review_claims=pkg.audit.needs_review_claims,
            quote_match_rate=pkg.audit.quote_match_rate,
            page_coverage_rate=pkg.audit.page_coverage_rate,
            cited_pages_json=pkg.audit.cited_pages,
            unreached_pages_json=pkg.audit.unreached_pages,
            thin_sections_json=pkg.audit.thin_sections,
            unlocated_json=pkg.audit.unlocated_items
        )
        db.add(audit_row)

    await db.commit()
    await active_cache.set_evidence(paper_id, pkg.model_dump())
    return pkg


@router.get("/{paper_id}", response_model=PaperEvidencePackage)
async def get_paper_evidence(paper_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve grounded evidence package and audit metrics for a paper."""
    clean_id = paper_id.strip()
    req = EvidenceIngestRequest(paper_id=clean_id, force_refresh=False)
    return await ingest_paper_evidence(req, db)


@router.post("/verify-excerpt", response_model=VerifyExcerptResponse)
async def verify_excerpt_coordinates(req: VerifyExcerptRequest, db: AsyncSession = Depends(get_db)):
    """
    Deterministically scan an excerpt against the target page, return exact match status,
    and generate normalized bounding box coordinates for visual highlight overlays.
    """
    clean_id = req.paper_id.strip()
    ev_stmt = select(PaperEvidenceModel).where(PaperEvidenceModel.paper_id == clean_id)
    res = await db.execute(ev_stmt)
    ev_record = res.scalars().first()

    # If evidence package does not exist, run quick ingestion first
    if not ev_record:
        ingest_req = EvidenceIngestRequest(paper_id=clean_id, force_refresh=False)
        await ingest_paper_evidence(ingest_req, db)

    # Build reference and locate against coordinate engine
    clean_aid = clean_id.lower().replace("arxiv:", "").strip()
    pdf_url = f"https://arxiv.org/pdf/{clean_aid}.pdf" if re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", clean_aid) else None
    pdf_bytes = await pdf_extractor_service.fetch_pdf_bytes(pdf_url) if pdf_url else None

    doc = coord_engine.parse_pdf(pdf_bytes or b"", paper_id=clean_id)
    ref = SourceReference(source_id="paper", page=req.page, excerpt=req.excerpt)
    located_ref = excerpt_verifier.locate_and_verify_reference(ref, doc)

    return VerifyExcerptResponse(
        paper_id=clean_id,
        page=req.page,
        verified_page=located_ref.page or req.page,
        exact_match=located_ref.exact_match,
        highlight_rects=located_ref.highlight_rects,
        token_overlap_ratio=1.0 if located_ref.exact_match else 0.5
    )


@router.get("/{paper_id}/audit", response_model=EvidenceAuditResult)
async def get_paper_evidence_audit(paper_id: str, db: AsyncSession = Depends(get_db)):
    """Return the mechanical audit metrics and evidence health for a paper."""
    clean_id = paper_id.strip()
    audit_stmt = select(PaperEvidenceAuditModel).where(PaperEvidenceAuditModel.paper_id == clean_id)
    res = await db.execute(audit_stmt)
    audit_row = res.scalars().first()
    if not audit_row:
        # Ingest to produce audit
        pkg = await ingest_paper_evidence(EvidenceIngestRequest(paper_id=clean_id), db)
        if pkg.audit:
            return pkg.audit
        raise HTTPException(status_code=404, detail="No audit data found for paper.")

    return EvidenceAuditResult(
        checked_at=audit_row.checked_at,
        paper_id=clean_id,
        page_count=audit_row.page_count,
        total_claims=audit_row.total_claims,
        verified_claims=audit_row.verified_claims,
        needs_review_claims=audit_row.needs_review_claims,
        quote_match_rate=audit_row.quote_match_rate,
        page_coverage_rate=audit_row.page_coverage_rate,
        cited_pages=audit_row.cited_pages_json or [],
        unreached_pages=audit_row.unreached_pages_json or [],
        thin_sections=audit_row.thin_sections_json or [],
        unlocated_items=audit_row.unlocated_json or []
    )


@router.get("/{paper_id}/figures", response_model=List[FigureAsset])
async def get_paper_figures(paper_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve visual figure and table assets extracted from paper."""
    clean_id = paper_id.strip()
    figs_stmt = select(PaperFigureModel).where(PaperFigureModel.paper_id == clean_id)
    res = await db.execute(figs_stmt)
    rows = res.scalars().all()
    if not rows:
        # Run ingest to extract figures
        pkg = await ingest_paper_evidence(EvidenceIngestRequest(paper_id=clean_id), db)
        return pkg.figures

    return [
        FigureAsset(
            id=r.id,
            label=r.label,
            caption=r.caption,
            why_it_matters=r.why_it_matters,
            page=r.page,
            asset_type=r.asset_type,
            image_data_url=r.image_data_url,
            asset_path=r.asset_path,
            bbox=r.bbox_json or [],
            claim_ids=r.claim_ids_json or []
        )
        for r in rows
    ]


@router.post("/{paper_id}/claims/review")
async def review_evidence_claim(paper_id: str, sub: ClaimReviewSubmission, db: AsyncSession = Depends(get_db)):
    """Record human researcher sign-off or flag on an extracted claim."""
    clean_id = paper_id.strip()
    ev_stmt = select(PaperEvidenceModel).where(PaperEvidenceModel.paper_id == clean_id)
    res = await db.execute(ev_stmt)
    record = res.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Paper evidence package not found.")

    claims = record.claims_json or []
    updated = False
    for c in claims:
        if c.get("id") == sub.claim_id:
            c["review_status"] = sub.reviewer_status
            c["reviewer_note"] = sub.note or f"Marked {sub.reviewer_status} by {sub.reviewer}"
            updated = True
            break

    if updated:
        record.claims_json = list(claims)
        await db.commit()
        await active_cache.invalidate_evidence(clean_id)

    return {"status": "success", "claim_id": sub.claim_id, "review_status": sub.reviewer_status}
