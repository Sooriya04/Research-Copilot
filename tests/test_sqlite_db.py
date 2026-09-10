import pytest
from sqlalchemy import select
from src.core.database import get_db_session
from src.core.db_service import SQLiteResearchDB
from src.core.models import ArtifactModel, CitationEdgeModel, PaperCacheModel
from src.core.schemas import Author, ChecklistRubric, Paper, ResearchArtifact, ResearchArtifactKind, ScoreBreakdown

@pytest.mark.asyncio
async def test_sqlite_paper_caching_and_citation_edges():
    async with get_db_session() as db:
        paper = Paper(
            id="test-paper-101",
            title="Attention Is All You Need",
            abstract="We propose the Transformer.",
            authors=[Author(name="Vaswani et al.")],
            year=2017,
            citation_count=120000,
            score=99.5,
            score_breakdown=ScoreBreakdown(topical_relevance=98.0, total_score=99.5),
            checklist=ChecklistRubric(has_ablation=True, has_code_repo=True, rubric_score=85.0)
        )
        
        # 1. Cache Paper in SQLite
        record = await SQLiteResearchDB.cache_paper(db, paper)
        assert record.id == "test-paper-101"
        assert record.title == "Attention Is All You Need"
        
        # 2. Store Citation Edge in SQLite
        edge = await SQLiteResearchDB.store_citation_edge(db, "paper-bert", "test-paper-101")
        assert edge.source_paper_id == "paper-bert"
        assert edge.target_paper_id == "test-paper-101"

@pytest.mark.asyncio
async def test_sqlite_query_verification():
    async with get_db_session() as db:
        result = await db.execute(select(PaperCacheModel).where(PaperCacheModel.id == "test-paper-101"))
        cached = result.scalar_one_or_none()
        assert cached is not None
        assert cached.citation_count == 120000
        assert cached.score == 99.5
        assert cached.checklist_json.get("has_code_repo") is True
