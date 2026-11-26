import pytest
from src.novelty.candidate_generator import CandidateGenerator
from src.novelty.evaluator import ProposalEvaluator
from src.novelty.json_utils import parse_llm_json
from src.novelty.persistence import NoveltyPersistence
from src.novelty.prior_art import PriorArtVerifier
from src.novelty.schemas import (
    GroundedPaper,
    NoveltyCandidate,
    NoveltyItem,
    PriorArtStatus,
)


def test_parse_llm_json_repairs_latex_and_trailing_commas():
    raw = '```json\n{"proposals": [{"title": "Sparse \\alpha-Attention", "math": "\\sum_{i=1}^n x_i",}],}\n```'
    parsed = parse_llm_json(raw)
    assert isinstance(parsed, dict)
    assert parsed["proposals"][0]["title"] == "Sparse \\alpha-Attention"


def test_candidate_deduplication_removes_near_duplicates():
    cands = [
        NoveltyCandidate(
            id="c1",
            title="Sparse Routing for Long Context Transformers",
            core_contribution="Adaptive token routing reduces quadratic attention cost",
        ),
        NoveltyCandidate(
            id="c2",
            title="Sparse Routing for Long Context Transformers",
            core_contribution="Adaptive token routing reduces quadratic attention cost in LLMs",
        ),
        NoveltyCandidate(
            id="c3",
            title="Hyperbolic Graph Memory Compression",
            core_contribution="Embeds citation subgraphs in Poincare balls",
        ),
    ]
    deduped = CandidateGenerator.deduplicate(cands, threshold=0.7)
    assert len(deduped) == 2
    assert deduped[0].id == "c1"
    assert deduped[1].id == "c3"


def test_proposal_evaluator_flags_ungrounded_and_vague_proposals():
    weak = NoveltyItem(id="p1", title="Weak Idea")
    strong = NoveltyItem(
        id="p2",
        title="Grounded Idea",
        grounded_paper_ids=["arxiv-1", "arxiv-2"],
        novelty_statement="Combines sparse state-space recurrence with cross-layer KV routing.",
        technical_methodology="Two-stage gating over block-sparse attention heads.",
        testable_hypothesis="Reduces perplexity by at least 8% on PG19 at 64k context.",
        baselines_to_beat=["Transformer-XL", "Mamba-2"],
        expected_metrics=["Perplexity", "Latency"],
    )
    evaluated = ProposalEvaluator().evaluate([weak, strong])
    assert evaluated[0].quality_assessment.passed is False
    assert len(evaluated[0].quality_assessment.issues) >= 2
    assert evaluated[1].quality_assessment.passed is True
    assert evaluated[1].quality_assessment.grounding_score == 1.0


def test_cache_key_invalidates_on_content_or_config_change():
    k1 = NoveltyPersistence.compute_cache_key(["p1", "p2"], provider="gemini", model="flash", content_hash="abc", analysis_mode="focused")
    k2 = NoveltyPersistence.compute_cache_key(["p1", "p2"], provider="gemini", model="flash", content_hash="def", analysis_mode="focused")
    k3 = NoveltyPersistence.compute_cache_key(["p1", "p2"], provider="gemini", model="flash", content_hash="abc", analysis_mode="comprehensive")
    assert k1 != k2
    assert k1 != k3


@pytest.mark.asyncio
async def test_prior_art_verifier_detects_workspace_overlap():
    verifier = PriorArtVerifier()
    cand = NoveltyCandidate(
        id="c-overlap",
        title="Adaptive Sparse Attention Routing for Transformers",
        core_contribution="Adaptive sparse attention routing reduces memory footprint",
        supporting_paper_ids=["p-base"],
    )
    ws_papers = [
        GroundedPaper(
            id="p-other",
            title="Adaptive Sparse Attention Routing in Long-Context Transformers",
            abstract="We introduce adaptive sparse attention routing to reduce memory footprint.",
            year=2025,
        )
    ]
    res = await verifier.verify_candidate(cand, ws_papers, run_external_search=False)
    assert res.status in (PriorArtStatus.POTENTIAL_OVERLAP, PriorArtStatus.SUBSTANTIAL_OVERLAP)
    assert len(res.closest_papers) == 1
