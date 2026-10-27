import pytest
from src.core.schemas import Paper, RankRequest
from src.engines.citation_graph import CitationGraphEngine
from src.engines.paper_rank import PaperRankEngine
from src.engines.rubric_evaluator import RubricEvaluator

def test_rubric_evaluator():
    evaluator = RubricEvaluator()
    paper = Paper(
        id="p1",
        title="Empirical evaluation of Deep Learning Baselines",
        abstract="We present an ablation study comparing against SOTA baselines. Code is available at https://github.com/org/repo. We trained on 8x A100 GPUs with confidence intervals reported.",
    )
    rubric = evaluator.evaluate(paper)
    assert rubric.has_ablation is True
    assert rubric.has_baselines is True
    assert rubric.has_code_repo is True
    assert rubric.code_url == "https://github.com/org/repo"
    assert rubric.has_uncertainty_quant is True
    assert rubric.has_compute_budget is True
    assert rubric.rubric_score > 50.0

def test_citation_graph_prestige():
    graph_engine = CitationGraphEngine()
    papers = [
        Paper(id="p1", title="Foundational Attention Paper", referenced_works=[]),
        Paper(id="p2", title="BERT Pre-training", referenced_works=["p1"]),
        Paper(id="p3", title="RoBERTa Optimization", referenced_works=["p1", "p2"]),
    ]
    graph = graph_engine.build_graph(papers)
    scores = graph_engine.calculate_prestige(graph)
    assert len(scores) >= 3
    # p1 is cited by p2 and p3, so it should have high prestige
    assert scores["p1"] >= scores["p3"]


@pytest.mark.asyncio
async def test_paper_rank_pipeline_with_critique_and_synthesis():
    """Verify PaperRankEngine.rank() executes critique and synthesis and populates RankResponse fields."""
    from unittest.mock import AsyncMock, patch

    rank_engine = PaperRankEngine()
    mock_papers = [
        Paper(
            id="p1",
            title="Selective State Spaces for Long Sequences",
            abstract="We present Mamba with linear-time sequence modeling and selective state compression.",
            citation_count=450,
            year=2023,
            openalex_id="W_MAMBA",
        ),
        Paper(
            id="p2",
            title="Attention Is All You Need",
            abstract="We propose the Transformer relying entirely on self-attention.",
            citation_count=90000,
            year=2017,
            openalex_id="W_TRANSFORMER",
        ),
    ]

    with patch.object(rank_engine.resolver, "search_openalex", new_callable=AsyncMock, return_value=mock_papers), \
         patch.object(rank_engine.resolver, "search_arxiv", new_callable=AsyncMock, return_value=[]), \
         patch.object(
             rank_engine.critique_synthesizer,
             "critique_papers",
             new_callable=AsyncMock,
             side_effect=lambda papers, top_n: [
                 setattr(p, "critique_strengths", ["Novel selective mechanism"]) or p for p in papers[:top_n]
             ] + papers[top_n:],
         ), \
         patch.object(
             rank_engine.critique_synthesizer,
             "synthesize_papers",
             new_callable=AsyncMock,
             return_value="# Topic Synthesis: Selective State Spaces\n\nExecutive brief on sequence models.",
         ):
        req = RankRequest(query="state space models", limit=5, critique_top=1, synthesize=True)
        res = await rank_engine.rank(req)

        assert res.total_found == 2
        assert len(res.papers) == 2
        # Top paper must have critique strengths populated
        assert res.papers[0].critique_strengths == ["Novel selective mechanism"]
        # Synthesis field must be populated
        assert res.synthesis is not None
        assert "# Topic Synthesis: Selective State Spaces" in res.synthesis

