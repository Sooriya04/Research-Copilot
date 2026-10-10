import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import ExtractedClaim, VerificationStatus
from src.core.database import get_db
from src.core.models import PaperCacheModel
from src.core.schemas import ChecklistRubric, Paper, ScoreBreakdown
from src.engines.access_resolver import AccessResolver
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

class CompareRequest(BaseModel):
    identifiers: List[str]

class CompareMatrixItem(BaseModel):
    id: str
    title: str
    year: Optional[int]
    citations: int
    score: Optional[float]
    has_ablation: bool
    has_baselines: bool
    has_code_repo: bool
    code_url: Optional[str]
    has_compute_budget: bool
    compute_details: Optional[str]
    has_limitations: bool

class CompareResponse(BaseModel):
    papers_count: int
    matrix: List[CompareMatrixItem]

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
async def compare_papers(req: CompareRequest):
    """Compare multiple scientific papers side-by-side on methodology, code, and compute."""
    if not req.identifiers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide at least one identifier.")
    
    matrix_items: List[CompareMatrixItem] = []
    for identifier in req.identifiers:
        res = await resolver.resolve_identifier(identifier)
        if res.paper:
            p = res.paper
            rubric = rubric_evaluator.evaluate(p)
            matrix_items.append(CompareMatrixItem(
                id=p.id,
                title=p.title,
                year=p.year,
                citations=p.citation_count,
                score=p.score,
                has_ablation=rubric.has_ablation,
                has_baselines=rubric.has_baselines,
                has_code_repo=rubric.has_code_repo,
                code_url=rubric.code_url,
                has_compute_budget=rubric.has_compute_budget,
                compute_details=rubric.compute_details,
                has_limitations=rubric.has_limitations,
            ))
    
    return CompareResponse(papers_count=len(matrix_items), matrix=matrix_items)

@router.post("/papers/critique", response_model=CritiqueResponse)
async def critique_paper(req: CritiqueRequest, db: AsyncSession = Depends(get_db)):
    """Generate an evidence-based research critique with strengths, limitations, follow-up questions, rubric items, PaperRank scores, and extracted verified claims."""
    p = None
    canonical_p = None
    clean_arxiv = None
    if req.identifier:
        if "arxiv:" in req.identifier.lower() or ("." in req.identifier and "/" not in req.identifier):
            clean_arxiv = req.identifier.replace("arxiv:", "").strip()
        canonical_p = await PaperRepository.get_by_doi_or_arxiv(db, arxiv_id=clean_arxiv, doi=req.identifier if "/" in req.identifier else None)
        if not canonical_p:
            canonical_p = await PaperRepository.get_by_canonical_id(db, req.identifier)

        res = await resolver.resolve_identifier(req.identifier)
        if res and res.paper:
            p = res.paper

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
        if req.title or req.abstract:
            from src.core.schemas import Paper
            p = Paper(
                id=req.identifier or "paper-synthesis",
                title=req.title or "Untitled Research Document",
                abstract=req.abstract or "",
            )
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Paper '{req.identifier}' not found.")

    # Determine best corpus for rubric evaluation and quote verification
    accumulated_text = req.full_text or ""
    if not accumulated_text and canonical_p and canonical_p.sections:
        accumulated_text = "\n\n".join([f"{s.title}\n{s.content}" for s in canonical_p.sections])
    if not accumulated_text:
        accumulated_text = p.abstract or ""

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
        target_corpus = accumulated_text or p.abstract or ""
        if target_corpus:
            sentences = [s.strip() for s in re.split(r'\. |\.\n', target_corpus) if len(s.strip()) > 25]
            keywords = ['propose', 'achiev', 'outperform', 'dataset', 'introduc', 'method', 'state-of-the-art', 'accuracy', 'benchmark', '%', 'demonstrat', 'result', 'train']
            candidate_sentences = [s for s in sentences if any(k in s.lower() for k in keywords)]
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

