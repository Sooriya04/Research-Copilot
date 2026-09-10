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
