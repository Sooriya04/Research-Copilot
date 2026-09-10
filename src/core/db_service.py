from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.models import ArtifactModel, CitationEdgeModel, PaperCacheModel, ProjectModel, SessionModel
from src.core.schemas import Paper, ResearchArtifact

class SQLiteResearchDB:
    """Convenience service for all SQLite database operations."""

    @staticmethod
    async def cache_paper(db: AsyncSession, paper: Paper) -> PaperCacheModel:
        """Upsert a paper record into SQLite cache."""
        result = await db.execute(select(PaperCacheModel).where(PaperCacheModel.id == paper.id))
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.title = paper.title
            existing.abstract = paper.abstract
            existing.citation_count = paper.citation_count
            existing.score = paper.score
            existing.score_breakdown_json = paper.score_breakdown.model_dump() if paper.score_breakdown else {}
            existing.checklist_json = paper.checklist.model_dump() if paper.checklist else {}
            existing.sections_json = [s.model_dump() for s in paper.sections]
            return existing
        
        record = PaperCacheModel(
            id=paper.id,
            doi=paper.doi,
            arxiv_id=paper.arxiv_id,
            openalex_id=paper.openalex_id,
            title=paper.title,
            abstract=paper.abstract,
            authors_json=[a.model_dump() for a in paper.authors],
            year=paper.year,
            citation_count=paper.citation_count,
            score=paper.score,
            score_breakdown_json=paper.score_breakdown.model_dump() if paper.score_breakdown else {},
            checklist_json=paper.checklist.model_dump() if paper.checklist else {},
            sections_json=[s.model_dump() for s in paper.sections],
            data_json={"url": paper.url, "pdf_url": paper.pdf_url}
        )
        db.add(record)
        return record

    @staticmethod
    async def store_citation_edge(db: AsyncSession, source_id: str, target_id: str) -> CitationEdgeModel:
        """Store directed citation edge in SQLite."""
        edge = CitationEdgeModel(source_paper_id=source_id, target_paper_id=target_id)
        db.add(edge)
        return edge

    @staticmethod
    async def save_artifact(db: AsyncSession, session_id: str, artifact: ResearchArtifact) -> ArtifactModel:
        """Save a generated research artifact into SQLite."""
        record = ArtifactModel(
            id=artifact.id,
            session_id=session_id,
            kind=artifact.kind.value,
            path=artifact.path,
            label=artifact.label,
            role=artifact.role,
            content=artifact.content
        )
        db.add(record)
        return record
