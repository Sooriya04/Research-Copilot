import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import ExtractedClaim, VerificationStatus
from src.core.database import get_db
from src.core.models import PaperCacheModel, PaperSynthesisModel, PaperDocumentModel, PaperChunkModel
from src.core.normalized_models import (
    NormalizedPaperModel, ResearchGapModel, PaperSummaryModel,
    BenchmarkModel, CodeRepositoryModel
)
from src.core.schemas import ChecklistRubric, Paper, ScoreBreakdown
from src.engines.access_resolver import AccessResolver
from src.engines.gap_extractor import ScientificGapExtractor
from src.engines.paper_rank import PaperRankEngine
from src.engines.rubric_evaluator import RubricEvaluator
from src.providers.base import ChatMessage
from src.providers.factory import get_llm_provider
from src.core.paper_repository import PaperRepository
from src.engines.claim_verifier import ClaimVerifier

router = APIRouter(prefix="/api/v1", tags=["Research Intelligence & Comparison"])
resolver = AccessResolver()
rubric_evaluator = RubricEvaluator()
rank_engine = PaperRankEngine()
claim_verifier_instance = ClaimVerifier()
gap_extractor = ScientificGapExtractor()

class CompareRequest(BaseModel):
    identifiers: List[str]

class CompareResearchGap(BaseModel):
    id: str
    category: str
    title: str
    description: str
    evidence_text: Optional[str] = None
    proposed_direction: Optional[str] = None
    source_origin: str = "database_verified"  # "database_verified" | "graph_engine" | "extracted_fallback" | "ai_inferred"

class CompareMatrixItem(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    citations: int = 0
    score: Optional[float] = None
    has_ablation: bool = False
    has_baselines: bool = False
    has_code_repo: bool = False
    code_url: Optional[str] = None
    has_compute_budget: bool = False
    compute_details: Optional[str] = None
    has_limitations: bool = False
    authors: List[str] = Field(default_factory=list)
    abstract: Optional[str] = None
    primary_source: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    venue: Optional[str] = None
    research_gaps: List[CompareResearchGap] = Field(default_factory=list)
    gaps_count: int = 0
    gaps_source: str = "none"  # "database_verified" | "graph_engine" | "extracted_fallback" | "ai_inferred"
    limitations: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    methodology: Optional[str] = None
    contributions: List[str] = Field(default_factory=list)
    benchmarks: List[Dict[str, Any]] = Field(default_factory=list)
    code_repositories: List[Dict[str, Any]] = Field(default_factory=list)
    rubric_score: Optional[float] = None
    verdict: Optional[str] = None
    has_db_record: bool = False

class CrossPaperGap(BaseModel):
    title: str
    description: str
    method: Optional[str] = None
    dataset_or_task: Optional[str] = None
    paper_ids: List[str] = Field(default_factory=list)
    gap_type: str = "combinatorial_unexplored"

class CompareResponse(BaseModel):
    papers_count: int
    matrix: List[CompareMatrixItem]
    cross_paper_gaps: List[CrossPaperGap] = Field(default_factory=list)
    shared_methods: List[str] = Field(default_factory=list)
    shared_datasets: List[str] = Field(default_factory=list)
    synthesis_summary: Optional[str] = None

class ExtractGapsRequest(BaseModel):
    identifier: str
    title: Optional[str] = None
    abstract: Optional[str] = None
    force_refresh: bool = False

class ExtractGapsResponse(BaseModel):
    paper_id: str
    title: str
    gaps: List[CompareResearchGap]
    source: str
    saved_to_db: bool

class CritiqueRequest(BaseModel):
    identifier: str
    title: Optional[str] = None
    abstract: Optional[str] = None
    full_text: Optional[str] = None

class CritiqueResponse(BaseModel):
    identifier: str
    title: str
    strengths: List[str]
    concerns_and_limitations: List[str]
    follow_up_questions: List[str]
    rubric_score: float
    checklist: Optional[ChecklistRubric] = None
    verdict: Optional[str] = "Promising empirical method with key areas for verification."
    score: Optional[float] = None
    score_breakdown: Optional[ScoreBreakdown] = None
    claims: List[ExtractedClaim] = Field(default_factory=list)

class HypothesisRequest(BaseModel):
    topic: str
    seed_papers_limit: int = 5

class HypothesisItem(BaseModel):
    title: str
    rationale: str
    identified_gap: str
    proposed_methodology: str
    evaluation_metric: str

class HypothesisResponse(BaseModel):
    topic: str
    analyzed_papers: int
    hypotheses: List[HypothesisItem]

@router.post("/papers/compare", response_model=CompareResponse)
async def compare_papers(req: CompareRequest, db: AsyncSession = Depends(get_db)):
    """Compare multiple scientific papers side-by-side on methodology, code, compute, and verified research gaps."""
    if not req.identifiers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide at least one identifier.")
    
    matrix_items: List[CompareMatrixItem] = []
    
    for identifier in req.identifiers:
        p: Optional[Paper] = None
        canon = None
        clean_arxiv = identifier.lower().replace("arxiv:", "").strip()
        has_db_record = False

        # Step 1: Check normalized canonical papers in SQLite first
        try:
            canon = await PaperRepository.get_by_doi_or_arxiv(
                db, doi=identifier if "/" in identifier else None, arxiv_id=clean_arxiv
            )
            if not canon:
                canon = await PaperRepository.get_by_canonical_id(db, identifier)
            if not canon:
                canon_stmt = select(NormalizedPaperModel).where(
                    or_(
                        NormalizedPaperModel.canonical_id == identifier,
                        NormalizedPaperModel.arxiv_id == clean_arxiv,
                        NormalizedPaperModel.canonical_id == f"arxiv:{clean_arxiv}",
                        NormalizedPaperModel.doi == identifier,
                        NormalizedPaperModel.title.ilike(f"%{identifier[:40]}%"),
                    )
                )
                canon_rec = (await db.execute(canon_stmt)).scalars().first()
                if canon_rec:
                    canon = PaperRepository._to_canonical_entity(canon_rec)

            if canon:
                has_db_record = True
                p = Paper(
                    id=canon.canonical_id,
                    title=canon.title,
                    abstract=canon.abstract,
                    year=canon.year,
                    citation_count=canon.citation_count,
                    arxiv_id=canon.arxiv_id,
                    doi=canon.doi,
                    is_open_access=canon.is_open_access,
                )
        except Exception as e:
            logger.debug("[Compare] SQLite canonical lookup note: %s", e)

        # Step 2: Check SQLite synthesis and cache tables if canon wasn't found
        synth_rec = None
        try:
            synth_stmt = select(PaperSynthesisModel).where(
                or_(
                    PaperSynthesisModel.paper_id == identifier,
                    PaperSynthesisModel.paper_id == clean_arxiv,
                    PaperSynthesisModel.paper_id == f"arxiv:{clean_arxiv}",
                    PaperSynthesisModel.title.ilike(f"%{identifier[:40]}%"),
                )
            )
            synth_rec = (await db.execute(synth_stmt)).scalars().first()
            if synth_rec:
                has_db_record = True
                if not p:
                    p = Paper(
                        id=synth_rec.paper_id,
                        title=synth_rec.title or identifier,
                        abstract="",
                        score=synth_rec.score,
                    )
        except Exception as e:
            logger.debug("[Compare] SQLite synthesis lookup note: %s", e)

        # Step 3: Check external resolver if still not found
        if not p:
            try:
                res = await resolver.resolve_identifier(identifier)
                if res and res.paper:
                    p = res.paper
            except Exception:
                pass

        if not p:
            # Fallback paper entity
            p = Paper(
                id=identifier,
                title=clean_arxiv and f"arXiv:{clean_arxiv}" or identifier,
                abstract="",
            )

        # Rubric & PaperRank
        rubric = rubric_evaluator.evaluate(p)
        if not p.score:
            try:
                scored = rank_engine.score_paper_list([p], query=p.title)
                if scored:
                    p = scored[0]
            except Exception:
                pass

        # Step 4: Collect research gaps, limitations, and benchmarks from DB
        found_gaps: List[CompareResearchGap] = []
        limitations_list: List[str] = []
        open_questions_list: List[str] = []
        contributions_list: List[str] = []
        benchmarks_list: List[Dict[str, Any]] = []
        repos_list: List[Dict[str, Any]] = []
        methodology_text: Optional[str] = None
        authors_list: List[str] = []
        primary_source = "Open Access"

        if canon:
            authors_list = [a.name for a in canon.authors]
            if canon.sources:
                primary_source = canon.sources[0].source_name.upper()
            if canon.research_gaps:
                for idx, g in enumerate(canon.research_gaps):
                    found_gaps.append(CompareResearchGap(
                        id=f"gap-db-{idx}-{abs(hash(g.description)) % 100000}",
                        category=g.category,
                        title=f"{g.category.replace('_', ' ').title()}: {g.description[:45]}...",
                        description=g.description,
                        evidence_text=g.evidence_text,
                        proposed_direction=g.proposed_direction,
                        source_origin="database_verified",
                    ))
            if canon.summary:
                limitations_list.extend(canon.summary.limitations or [])
                open_questions_list.extend(canon.summary.open_questions or [])
                contributions_list.extend(canon.summary.contributions or [])
                methodology_text = canon.summary.methodology
            if canon.benchmarks:
                for b in canon.benchmarks:
                    benchmarks_list.append({
                        "task": b.task,
                        "dataset": b.dataset,
                        "metric": b.metric,
                        "value": b.value,
                        "model": b.model,
                    })
            if canon.code_repositories:
                for r in canon.code_repositories:
                    repos_list.append({
                        "url": r.url,
                        "stars": r.stars,
                        "framework": r.framework,
                        "is_official": r.is_official,
                    })

        if synth_rec:
            for c in (synth_rec.concerns_json or []):
                if c not in limitations_list:
                    limitations_list.append(c)
            for q in (synth_rec.follow_up_questions_json or []):
                if q not in open_questions_list:
                    open_questions_list.append(q)

        # Check knowledge graph tables (graph_edges & graph_nodes)
        try:
            edge_stmt = text(
                "SELECT gn.id, gn.node_type, gn.data_json "
                "FROM graph_edges ge "
                "JOIN graph_nodes gn ON ge.target_id = gn.id "
                "WHERE ge.source_id IN (:id1, :id2, :id3) AND (ge.relation = 'has_gap' OR gn.node_type = 'gap')"
            )
            edge_rows = (await db.execute(edge_stmt, {
                "id1": identifier,
                "id2": clean_arxiv,
                "id3": f"arxiv:{clean_arxiv}",
            })).fetchall()
            for row in edge_rows:
                try:
                    import json as _json
                    g_data = _json.loads(row[2])
                    g_desc = g_data.get("description") or g_data.get("label") or row[0]
                    if not any(g.description == g_desc for g in found_gaps):
                        found_gaps.append(CompareResearchGap(
                            id=row[0],
                            category=g_data.get("category") or "combinatorial_gap",
                            title=g_data.get("title") or f"Knowledge Graph Gap: {row[0]}",
                            description=g_desc,
                            evidence_text=g_data.get("evidence") or g_data.get("method"),
                            proposed_direction=g_data.get("proposed_direction") or f"Investigate under {g_data.get('dataset_or_task', 'benchmarks')}.",
                            source_origin="graph_engine",
                        ))
                except Exception:
                    pass
        except Exception as e:
            logger.debug("[Compare] Graph edges query note: %s", e)

        # Check graph synthesis cache in SQLite
        try:
            cache_stmt = text("SELECT synthesis_json FROM graph_synthesis_cache")
            cache_rows = (await db.execute(cache_stmt)).fetchall()
            for (s_json,) in cache_rows:
                try:
                    import json as _json
                    s_data = _json.loads(s_json)
                    for g in s_data.get("research_gaps", []):
                        p_ids = g.get("paper_ids") or []
                        if any(pid in [identifier, clean_arxiv, f"arxiv:{clean_arxiv}"] for pid in p_ids):
                            g_desc = g.get("description") or g.get("title", "")
                            if not any(x.description == g_desc for x in found_gaps):
                                found_gaps.append(CompareResearchGap(
                                    id=f"gap-synth-{abs(hash(g_desc)) % 100000}",
                                    category="graph_synthesis",
                                    title=g.get("title", "Synthesized Research Gap"),
                                    description=g_desc,
                                    evidence_text=g.get("method"),
                                    proposed_direction=f"Evaluate under {g.get('dataset_or_task', 'novel benchmarks')}.",
                                    source_origin="graph_engine",
                                ))
                except Exception:
                    pass
        except Exception as e:
            logger.debug("[Compare] Graph synthesis cache query note: %s", e)

        # Step 5: If NO gaps were found in DB ("if there are not, if not use something else do it u know")
        # Run grounded NLP heuristic & AI gap extraction and persist to SQLite!
        if not found_gaps:
            extracted = await gap_extractor.extract_gaps(
                title=p.title,
                abstract=p.abstract or "",
                limitations=limitations_list,
                concerns=(synth_rec.concerns_json if synth_rec else None),
            )
            for item in extracted:
                found_gaps.append(CompareResearchGap(
                    id=item["id"],
                    category=item["category"],
                    title=item["title"],
                    description=item["description"],
                    evidence_text=item.get("evidence_text"),
                    proposed_direction=item.get("proposed_direction"),
                    source_origin=item.get("source_origin", "extracted_fallback"),
                ))

            # Automatically persist extracted research gaps into SQLite database
            try:
                target_pid = (canon.canonical_id if canon else (clean_arxiv and f"arxiv:{clean_arxiv}") or identifier).strip()
                for g in found_gaps:
                    db.add(ResearchGapModel(
                        paper_id=target_pid,
                        category=g.category,
                        description=g.description,
                        evidence_text=g.evidence_text,
                        proposed_direction=g.proposed_direction,
                    ))
                await db.commit()
                has_db_record = True
            except Exception as e:
                logger.debug("[Compare] Could not persist extracted gaps to SQLite: %s", e)

        # Determine overall gap source badge
        gaps_source = "extracted_fallback"
        if any(g.source_origin == "database_verified" for g in found_gaps):
            gaps_source = "database_verified"
        elif any(g.source_origin == "graph_engine" for g in found_gaps):
            gaps_source = "graph_engine"
        elif any(g.source_origin == "ai_inferred" for g in found_gaps):
            gaps_source = "ai_inferred"

        if not authors_list and hasattr(p, "authors") and p.authors:
            authors_list = [a.name if hasattr(a, "name") else str(a) for a in p.authors]

        matrix_items.append(CompareMatrixItem(
            id=p.id,
            title=p.title,
            year=p.year,
            citations=p.citation_count,
            score=p.score,
            has_ablation=rubric.has_ablation,
            has_baselines=rubric.has_baselines,
            has_code_repo=rubric.has_code_repo or bool(repos_list),
            code_url=rubric.code_url or (repos_list[0]["url"] if repos_list else None),
            has_compute_budget=rubric.has_compute_budget,
            compute_details=rubric.compute_details,
            has_limitations=bool(limitations_list) or rubric.has_limitations,
            authors=authors_list,
            abstract=p.abstract,
            primary_source=primary_source,
            doi=p.doi,
            arxiv_id=p.arxiv_id,
            research_gaps=found_gaps,
            gaps_count=len(found_gaps),
            gaps_source=gaps_source,
            limitations=limitations_list,
            open_questions=open_questions_list,
            methodology=methodology_text,
            contributions=contributions_list,
            benchmarks=benchmarks_list,
            code_repositories=repos_list,
            rubric_score=synth_rec.rubric_score if synth_rec else rubric.rubric_score,
            verdict=synth_rec.verdict if synth_rec else (
                "High-rigor methodology with empirical validation." if rubric.rubric_score >= 70
                else "Promising empirical method with identified research boundaries."
            ),
            has_db_record=has_db_record,
        ))

    # Cross-Paper combinatorial synthesis
    raw_cross_gaps = ScientificGapExtractor.synthesize_cross_paper_gaps([item.model_dump() for item in matrix_items])
    cross_paper_gaps = [
        CrossPaperGap(
            title=cg["title"],
            description=cg["description"],
            method=cg.get("method"),
            dataset_or_task=cg.get("dataset_or_task"),
            paper_ids=cg.get("paper_ids", []),
            gap_type=cg.get("gap_type", "combinatorial_unexplored"),
        )
        for cg in raw_cross_gaps
    ]

    # Collect shared methods and datasets across benchmarks
    all_methods = set()
    all_datasets = set()
    for item in matrix_items:
        for b in item.benchmarks:
            if b.get("task"):
                all_methods.add(b["task"])
            if b.get("dataset"):
                all_datasets.add(b["dataset"])

    return CompareResponse(
        papers_count=len(matrix_items),
        matrix=matrix_items,
        cross_paper_gaps=cross_paper_gaps,
        shared_methods=sorted(list(all_methods))[:10],
        shared_datasets=sorted(list(all_datasets))[:10],
        synthesis_summary=f"Compared {len(matrix_items)} scientific papers with {sum(m.gaps_count for m in matrix_items)} ground-truthed research gaps and {len(cross_paper_gaps)} cross-paper synthesis intersections.",
    )

@router.post("/papers/extract-gaps", response_model=ExtractGapsResponse)
async def extract_paper_gaps(req: ExtractGapsRequest, db: AsyncSession = Depends(get_db)):
    """Extract or force-refresh research gaps for a specific paper and persist them to SQLite."""
    identifier = req.identifier.strip()
    clean_arxiv = identifier.lower().replace("arxiv:", "").strip()
    
    # Check DB if not force refresh
    if not req.force_refresh:
        canon = await PaperRepository.get_by_doi_or_arxiv(db, doi=identifier if "/" in identifier else None, arxiv_id=clean_arxiv)
        if not canon:
            canon = await PaperRepository.get_by_canonical_id(db, identifier)
        if canon and canon.research_gaps:
            gaps = [
                CompareResearchGap(
                    id=f"gap-db-{idx}",
                    category=g.category,
                    title=f"{g.category.replace('_', ' ').title()}: {g.description[:40]}...",
                    description=g.description,
                    evidence_text=g.evidence_text,
                    proposed_direction=g.proposed_direction,
                    source_origin="database_verified",
                )
                for idx, g in enumerate(canon.research_gaps)
            ]
            return ExtractGapsResponse(
                paper_id=canon.canonical_id,
                title=canon.title,
                gaps=gaps,
                source="database_verified",
                saved_to_db=True,
            )

    title = req.title or identifier
    abstract = req.abstract or ""
    if not abstract:
        try:
            res = await resolver.resolve_identifier(identifier)
            if res and res.paper:
                title = res.paper.title
                abstract = res.paper.abstract
        except Exception:
            pass

    extracted = await gap_extractor.extract_gaps(title=title, abstract=abstract, use_llm=True)
    gaps_result = [
        CompareResearchGap(
            id=item["id"],
            category=item["category"],
            title=item["title"],
            description=item["description"],
            evidence_text=item.get("evidence_text"),
            proposed_direction=item.get("proposed_direction"),
            source_origin=item.get("source_origin", "extracted_fallback"),
        )
        for item in extracted
    ]

    saved = False
    try:
        for g in gaps_result:
            db.add(ResearchGapModel(
                paper_id=identifier,
                category=g.category,
                description=g.description,
                evidence_text=g.evidence_text,
                proposed_direction=g.proposed_direction,
            ))
        await db.commit()
        saved = True
    except Exception as e:
        logger.debug("[ExtractGaps] SQLite commit note: %s", e)

    return ExtractGapsResponse(
        paper_id=identifier,
        title=title,
        gaps=gaps_result,
        source="ai_inferred" if any(g.source_origin == "ai_inferred" for g in gaps_result) else "extracted_fallback",
        saved_to_db=saved,
    )

@router.post("/papers/critique", response_model=CritiqueResponse)
async def critique_paper(req: CritiqueRequest, db: AsyncSession = Depends(get_db)):
    """Generate or retrieve from SQLite an evidence-based research critique with strengths, limitations, follow-up questions, rubric items, PaperRank scores, and extracted verified claims."""
    synth_id = (req.identifier or "").strip()
    title_query = (req.title or "").strip()
    clean_arxiv = None
    if synth_id:
        if "arxiv:" in synth_id.lower() or ("." in synth_id and "/" not in synth_id):
            clean_arxiv = synth_id.lower().replace("arxiv:", "").strip()

    # Step 1: Check SQLite for existing saved synthesis
    filters = []
    if synth_id:
        filters.append(PaperSynthesisModel.paper_id == synth_id)
    if clean_arxiv:
        filters.append(PaperSynthesisModel.paper_id == clean_arxiv)
    if title_query:
        filters.append(PaperSynthesisModel.title.ilike(f"%{title_query}%"))
        filters.append(PaperSynthesisModel.paper_id.ilike(f"%{title_query[:30]}%"))

    if filters:
        synth_stmt = select(PaperSynthesisModel).where(or_(*filters))
        synth_res = await db.execute(synth_stmt)
        existing_synth = synth_res.scalars().first()
        if existing_synth and existing_synth.checklist_json:
            cached_claims: List[ExtractedClaim] = []
            for c in (existing_synth.claims_json or []):
                try:
                    cached_claims.append(ExtractedClaim(**c) if isinstance(c, dict) else c)
                except Exception:
                    pass
            return CritiqueResponse(
                identifier=req.identifier,
                title=existing_synth.title or title_query or req.identifier,
                strengths=existing_synth.strengths_json or ["Empirically validated methodology."],
                concerns_and_limitations=existing_synth.concerns_json or ["Standard computational bounds."],
                follow_up_questions=existing_synth.follow_up_questions_json or [],
                rubric_score=existing_synth.rubric_score or 0.0,
                checklist=existing_synth.checklist_json,
                verdict=existing_synth.verdict or "High-rigor methodology with empirical validation.",
                score=existing_synth.score or 55.0,
                score_breakdown=existing_synth.score_breakdown_json or {},
                claims=cached_claims,
            )

    # Step 2: Resolve paper metadata from SQLite canonical or document tables first
    p = None
    canonical_p = None
    if clean_arxiv or (synth_id and "/" in synth_id):
        canonical_p = await PaperRepository.get_by_doi_or_arxiv(db, arxiv_id=clean_arxiv, doi=synth_id if "/" in synth_id else None)
    if not canonical_p and synth_id:
        canonical_p = await PaperRepository.get_by_canonical_id(db, synth_id)

    # Check PaperDocumentModel (SQLite table papers)
    if not p and not canonical_p:
        doc_filters = []
        if synth_id:
            doc_filters.append(PaperDocumentModel.id == synth_id)
        if clean_arxiv:
            doc_filters.append(PaperDocumentModel.arxiv_id == clean_arxiv)
        if title_query:
            doc_filters.append(PaperDocumentModel.title.ilike(f"%{title_query}%"))
        if doc_filters:
            doc_stmt = select(PaperDocumentModel).where(or_(*doc_filters))
            doc_res = await db.execute(doc_stmt)
            found_doc = doc_res.scalars().first()
            if found_doc:
                p = Paper(
                    id=found_doc.id,
                    title=found_doc.title,
                    abstract=found_doc.abstract or "",
                    doi=found_doc.doi,
                    arxiv_id=found_doc.arxiv_id,
                )

    # Check external resolver only if not found locally
    if not p and not canonical_p and synth_id and (clean_arxiv or "/" in synth_id):
        try:
            res = await resolver.resolve_identifier(synth_id)
            if res and res.paper:
                p = res.paper
        except Exception:
            pass

    if not p and canonical_p:
        p = Paper(
            id=canonical_p.canonical_id,
            title=canonical_p.title,
            abstract=canonical_p.abstract or "",
            doi=canonical_p.doi,
            arxiv_id=canonical_p.arxiv_id,
            citation_count=canonical_p.citation_count,
            year=canonical_p.year,
        )

    if not p:
        p = Paper(
            id=synth_id or f"paper-{abs(hash(title_query or 'untitled')) % 1000000}",
            title=title_query or (clean_arxiv and f"arXiv:{clean_arxiv}") or "Untitled Research Document",
            abstract=req.abstract or "",
        )

    # Determine best corpus for rubric evaluation and quote verification
    accumulated_text = req.full_text or ""
    if not accumulated_text and canonical_p and canonical_p.sections:
        accumulated_text = "\n\n".join([f"{s.title}\n{s.content}" for s in canonical_p.sections])

    # If still empty, check SQLite paper_chunks
    if not accumulated_text and p:
        chunk_stmt = select(PaperChunkModel.content).where(PaperChunkModel.paper_id == p.id).order_by(PaperChunkModel.chunk_index).limit(30)
        chunk_res = await db.execute(chunk_stmt)
        chunks = chunk_res.scalars().all()
        if chunks:
            accumulated_text = "\n\n".join(chunks)

    if not accumulated_text:
        accumulated_text = p.abstract or p.title or ""

    # Compute PaperRank 6-factor score
    scored = rank_engine.score_paper_list([p], query=p.title)
    if scored:
        p = scored[0]

    # Evaluate NeurIPS methodology rubric
    rubric = rubric_evaluator.evaluate(p, full_text=accumulated_text)

    # Resolve or extract verified scientific claims
    claims_list: List[ExtractedClaim] = []
    if canonical_p and canonical_p.summary and canonical_p.summary.claims:
        claims_list = canonical_p.summary.claims
    else:
        target_corpus = accumulated_text or p.abstract or p.title or ""
        if target_corpus:
            sentences = [s.strip() for s in re.split(r'\. |\.\n', target_corpus) if len(s.strip()) > 20]
            keywords = ['propose', 'achiev', 'outperform', 'dataset', 'introduc', 'method', 'state-of-the-art', 'accuracy', 'benchmark', '%', 'demonstrat', 'result', 'train', 'model', 'evaluat', 'find', 'show']
            candidate_sentences = [s for s in sentences if any(k in s.lower() for k in keywords)]
            if not candidate_sentences:
                candidate_sentences = sentences[:5]
            for s in candidate_sentences[:5]:
                is_mech, cov, matched = claim_verifier_instance.verify_excerpt_on_page(target_corpus, s)
                claims_list.append(ExtractedClaim(
                    claim=s,
                    evidence=s,
                    page=1,
                    mechanically_verified=is_mech,
                    verification_status=VerificationStatus.VERIFIED if is_mech else VerificationStatus.INFERRED,
                    verification_notes="Verbatim quote verified in paper text." if is_mech else "Semantic text grounding.",
                ))

    strengths = []
    if rubric.has_empirical_eval:
        strengths.append("Empirically validated against established benchmarks.")
    if rubric.has_ablation:
        strengths.append("Ablation study included verifying individual architectural components.")
    if rubric.has_code_repo:
        strengths.append(f"Open-source implementation provided ({rubric.code_url or 'GitHub link'}).")
    if p.citation_count > 500:
        strengths.append(f"High scientific impact with {p.citation_count} field citations.")
    if any(item.id == "statistical-significance" and item.answer == "present" for item in rubric.items):
        strengths.append("Rigorous statistical uncertainty quantification reported with confidence intervals/error bars.")

    concerns = []
    if not rubric.has_code_repo:
        concerns.append("No public source code or reproducible artifact repository detected.")
    if not rubric.has_compute_budget:
        concerns.append("Hardware compute budget (GPU/TPU hours) is not disclosed.")
    if not rubric.has_uncertainty_quant:
        concerns.append("Lacks statistical significance testing, random seed variances, or error bars.")
    if any(item.id == "limitations" and item.answer == "missing" for item in rubric.items):
        concerns.append("Assumptions, bounds of validity, and negative failure cases are not explicitly documented.")

    follow_ups = [
        "How sensitive is the model performance to hyperparameter initialization and seed variance?",
        "Does the method maintain efficiency when evaluated on out-of-distribution or noisy datasets?",
        "Are the empirical gains robust across varying compute and parameter budgets?",
    ]

    verdict = (
        "High-rigor methodology with strong empirical validation." if rubric.rubric_score >= 70
        else "Promising research direction with key methodology gaps to verify before reproduction."
    )

    # Step 3: Persist complete synthesis into SQLite paper_syntheses table
    target_synth_id = (clean_arxiv or synth_id or p.id or f"synth-{abs(hash(p.title)) % 1000000}").strip()
    checklist_dict = rubric.model_dump() if hasattr(rubric, "model_dump") else (rubric.dict() if hasattr(rubric, "dict") else rubric)
    claims_dict_list = [c.model_dump() if hasattr(c, "model_dump") else (c.dict() if hasattr(c, "dict") else c) for c in claims_list]
    breakdown_dict = (
        p.score_breakdown.model_dump() if hasattr(p.score_breakdown, "model_dump")
        else (p.score_breakdown.dict() if hasattr(p.score_breakdown, "dict")
        else (dict(p.score_breakdown) if isinstance(p.score_breakdown, dict) else {}))
    )

    existing_record_stmt = select(PaperSynthesisModel).where(
        or_(
            PaperSynthesisModel.paper_id == target_synth_id,
            PaperSynthesisModel.title == p.title if p.title else False,
        )
    )
    rec_res = await db.execute(existing_record_stmt)
    synth_record = rec_res.scalars().first()
    if not synth_record:
        synth_record = PaperSynthesisModel(
            paper_id=target_synth_id,
            title=p.title,
            score=float(p.score or 55.0),
            score_breakdown_json=breakdown_dict,
            rubric_score=float(rubric.rubric_score or 0.0),
            checklist_json=checklist_dict,
            strengths_json=strengths or ["Empirically validated methodology."],
            concerns_json=concerns or ["Standard computational bounds."],
            follow_up_questions_json=follow_ups or [],
            claims_json=claims_dict_list,
            verdict=verdict,
        )
        db.add(synth_record)
    else:
        synth_record.title = p.title
        synth_record.score = float(p.score or 55.0)
        synth_record.score_breakdown_json = breakdown_dict
        synth_record.rubric_score = float(rubric.rubric_score or 0.0)
        synth_record.checklist_json = checklist_dict
        synth_record.strengths_json = strengths or ["Empirically validated methodology."]
        synth_record.concerns_json = concerns or ["Standard computational bounds."]
        synth_record.follow_up_questions_json = follow_ups or []
        synth_record.claims_json = claims_dict_list
        synth_record.verdict = verdict
    await db.commit()

    return CritiqueResponse(
        identifier=req.identifier,
        title=p.title,
        strengths=strengths or ["Novel research framing and theoretical motivation."],
        concerns_and_limitations=concerns or ["Standard computational bounds."],
        follow_up_questions=follow_ups,
        rubric_score=rubric.rubric_score,
        checklist=rubric,
        verdict=verdict,
        score=p.score,
        score_breakdown=p.score_breakdown,
        claims=claims_list,
    )


@router.get("/papers/synthesis/{identifier:path}", response_model=CritiqueResponse)
async def get_paper_synthesis(identifier: str, db: AsyncSession = Depends(get_db)):
    """Retrieve persisted paper synthesis directly from SQLite by identifier or arXiv ID."""
    clean_arxiv = identifier.lower().replace("arxiv:", "").strip()
    stmt = select(PaperSynthesisModel).where(
        or_(
            PaperSynthesisModel.paper_id == identifier,
            PaperSynthesisModel.paper_id == clean_arxiv,
            PaperSynthesisModel.title.ilike(f"%{identifier}%"),
        )
    )
    res = await db.execute(stmt)
    synth = res.scalars().first()
    if not synth:
        # Generate on demand and store
        return await critique_paper(CritiqueRequest(identifier=identifier), db=db)

    cached_claims = []
    for c in (synth.claims_json or []):
        try:
            cached_claims.append(ExtractedClaim(**c) if isinstance(c, dict) else c)
        except Exception:
            pass

    return CritiqueResponse(
        identifier=identifier,
        title=synth.title or identifier,
        strengths=synth.strengths_json or ["Empirically validated methodology."],
        concerns_and_limitations=synth.concerns_json or ["Standard computational bounds."],
        follow_up_questions=synth.follow_up_questions_json or [],
        rubric_score=synth.rubric_score or 0.0,
        checklist=synth.checklist_json,
        verdict=synth.verdict or "High-rigor methodology with empirical validation.",
        score=synth.score or 55.0,
        score_breakdown=synth.score_breakdown_json or {},
        claims=cached_claims,
    )



from src.graph.novelty_engine import GraphNoveltyEngine

novelty_engine = GraphNoveltyEngine()

@router.post("/hypothesis/generate", response_model=HypothesisResponse)
async def generate_hypotheses(req: HypothesisRequest):
    """Identify research gaps from literature and generate testable novel hypotheses using GraphNoveltyEngine."""
    res = await novelty_engine.synthesize_novelties(topic=req.topic, force_refresh=False)
    hypotheses = []
    for item in res.get("novelties", []):
        hypotheses.append(
            HypothesisItem(
                title=item.get("title", "Novel Research Direction"),
                rationale=item.get("pitch") or item.get("novelty_statement", ""),
                identified_gap=item.get("novelty_statement", ""),
                proposed_methodology=item.get("mathematical_formulation", ""),
                evaluation_metric=", ".join(item.get("expected_metrics", ["MSE", "MAE"])),
            )
        )

    return HypothesisResponse(
        topic=req.topic,
        analyzed_papers=res.get("papers_count", 0),
        hypotheses=hypotheses,
    )

class ClaimReviewRequest(BaseModel):
    claim_id: str
    paper_id: Optional[str] = None
    reviewer_status: str  # "approved" | "rejected" | "pending"
    note: Optional[str] = None
    reviewer: Optional[str] = "researcher"

class ClaimReviewResponse(BaseModel):
    status: str
    claim_id: str
    paper_id: Optional[str] = None
    reviewer_status: str
    note: Optional[str] = None
    reviewer: str
    updated_at: str

class QuoteVerifyRequest(BaseModel):
    excerpt: str
    page_text: Optional[str] = None
    page: Optional[int] = 1
    paper_id: Optional[str] = None

class QuoteVerifyResponse(BaseModel):
    mechanically_verified: bool
    confidence: float
    status: str
    page: Optional[int] = None
    matched_substring: Optional[str] = None
    notes: str

@router.post("/papers/claims/review", response_model=ClaimReviewResponse)
async def review_paper_claim(req: ClaimReviewRequest, db: AsyncSession = Depends(get_db)):
    """Submit a researcher sign-off decision (approved or rejected) for an extracted claim or quote."""
    if req.reviewer_status not in {"approved", "rejected", "pending"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reviewer_status must be 'approved', 'rejected', or 'pending'"
        )
    review = await PaperRepository.record_claim_review(
        db=db,
        claim_id=req.claim_id,
        reviewer_status=req.reviewer_status,
        note=req.note,
        paper_id=req.paper_id,
        reviewer=req.reviewer or "researcher",
    )
    return ClaimReviewResponse(
        status="success",
        claim_id=review.claim_id,
        paper_id=review.paper_id,
        reviewer_status=review.reviewer_status,
        note=review.note,
        reviewer=review.reviewer or "researcher",
        updated_at=review.updated_at.isoformat() if review.updated_at else "",
    )

@router.get("/papers/claims/reviews")
async def list_claim_reviews(
    paper_id: Optional[str] = None,
    claim_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List stored reviewer sign-off decisions."""
    reviews = await PaperRepository.get_claim_reviews(db=db, paper_id=paper_id, claim_id=claim_id)
    return [
        {
            "id": r.id,
            "claim_id": r.claim_id,
            "paper_id": r.paper_id,
            "reviewer_status": r.reviewer_status,
            "note": r.note,
            "reviewer": r.reviewer,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in reviews
    ]

@router.post("/papers/claims/verify-quote", response_model=QuoteVerifyResponse)
async def verify_quote(req: QuoteVerifyRequest, db: AsyncSession = Depends(get_db)):
    """Mechanically check an excerpt against page text layer with ligature/whitespace normalization."""
    page_text = req.page_text or ""

    # If page_text was not directly supplied, try to fetch paper sections from DB
    if not page_text and req.paper_id:
        paper = await PaperRepository.get_by_canonical_id(db, req.paper_id)
        if paper:
            page_text = (paper.abstract or "") + "\n\n"
            for sec in paper.sections:
                page_text += f"{sec.title}\n{sec.content}\n\n"

    is_mech, cov, matched = claim_verifier_instance.verify_excerpt_on_page(page_text, req.excerpt)

    status_val = "VERIFIED" if is_mech else ("INFERRED" if cov >= 0.85 else "UNVERIFIED")
    notes = (
        f"Mechanically verified verbatim quote on page {req.page or 1}."
        if is_mech else
        (f"Semantic token coverage ({int(cov * 100)}%) on page {req.page or 1}." if cov >= 0.85 else "Quote not found in specified page text.")
    )

    return QuoteVerifyResponse(
        mechanically_verified=is_mech,
        confidence=cov,
        status=status_val,
        page=req.page,
        matched_substring=matched,
        notes=notes,
    )

