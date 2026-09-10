import pytest
from src.core.schemas import ChecklistRubric, Paper, ResearchGraphState, ScoreBreakdown

def test_paper_schema():
    p = Paper(
        id="test-1",
        title="Scaling Laws for Neural Language Models",
        abstract="We investigate empirical scaling laws for language model performance.",
        citation_count=1500,
        year=2020
    )
    assert p.id == "test-1"
    assert p.year == 2020
    assert p.citation_count == 1500
    assert p.score is None

def test_checklist_rubric():
    chk = ChecklistRubric(
        has_ablation=True,
        has_baselines=True,
        has_code_repo=True,
        code_url="https://github.com/openai/gpt-2",
        rubric_score=65.0
    )
    assert chk.has_ablation is True
    assert chk.has_code_repo is True
    assert chk.rubric_score == 65.0
