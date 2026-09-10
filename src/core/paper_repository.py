from typing import Optional
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from src.core.canonical_models import (
    AuthorEntity, BenchmarkEvidence, CanonicalPaper, CodeRepository,
    ExtractedClaim, PaperSectionEntity, PaperSectionType, ResearchGapEntity,
    SourceMetadata, StructuredPaperSummary
)
from src.core.logger import logger
from src.core.normalized_models import (
    BenchmarkModel, CodeRepositoryModel, NormalizedPaperModel,
    PaperSectionModel, PaperSourceModel, PaperSummaryModel, ResearchGapModel
)

class PaperRepository:
    """Async repository for normalized relational paper storage and caching."""

    @staticmethod
    async def get_by_canonical_id(db: AsyncSession, canonical_id: str) -> Optional[CanonicalPaper]:
        """Fetch full canonical paper with all relational collections loaded."""
        stmt = (
            select(NormalizedPaperModel)
            .where(NormalizedPaperModel.canonical_id == canonical_id)
            .options(
                selectinload(NormalizedPaperModel.sources),
                selectinload(NormalizedPaperModel.sections),
                selectinload(NormalizedPaperModel.benchmarks),
                selectinload(NormalizedPaperModel.code_repositories),
                selectinload(NormalizedPaperModel.summaries),
                selectinload(NormalizedPaperModel.research_gaps),
            )
        )
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
        if not record:
            return None

        return PaperRepository._to_canonical_entity(record)

    @staticmethod
    async def get_by_doi_or_arxiv(db: AsyncSession, doi: Optional[str] = None, arxiv_id: Optional[str] = None) -> Optional[CanonicalPaper]:
        """Lookup cached paper by DOI or arXiv ID."""
        if not doi and not arxiv_id:
            return None

        stmt = select(NormalizedPaperModel).options(
            selectinload(NormalizedPaperModel.sources),
            selectinload(NormalizedPaperModel.sections),
            selectinload(NormalizedPaperModel.benchmarks),
            selectinload(NormalizedPaperModel.code_repositories),
            selectinload(NormalizedPaperModel.summaries),
            selectinload(NormalizedPaperModel.research_gaps),
        )

        if doi and arxiv_id:
            stmt = stmt.where((NormalizedPaperModel.doi == doi) | (NormalizedPaperModel.arxiv_id == arxiv_id))
        elif doi:
            stmt = stmt.where(NormalizedPaperModel.doi == doi)
        elif arxiv_id:
            stmt = stmt.where(NormalizedPaperModel.arxiv_id == arxiv_id)

        result = await db.execute(stmt)
        record = result.scalars().first()
        if not record:
            return None

        return PaperRepository._to_canonical_entity(record)

    @staticmethod
    async def save_canonical_paper(db: AsyncSession, paper: CanonicalPaper) -> CanonicalPaper:
        """Upsert canonical paper and all its normalized relations cleanly in async mode."""
        stmt = (
            select(NormalizedPaperModel)
            .where(NormalizedPaperModel.canonical_id == paper.canonical_id)
            .options(
                selectinload(NormalizedPaperModel.sources),
                selectinload(NormalizedPaperModel.sections),
                selectinload(NormalizedPaperModel.benchmarks),
                selectinload(NormalizedPaperModel.code_repositories),
                selectinload(NormalizedPaperModel.summaries),
                selectinload(NormalizedPaperModel.research_gaps),
            )
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            existing = NormalizedPaperModel(canonical_id=paper.canonical_id)
            db.add(existing)

        # Update root attributes
        existing.title = paper.title
        existing.abstract = paper.abstract
        existing.doi = paper.doi
        existing.arxiv_id = paper.arxiv_id
        existing.openalex_id = paper.openalex_id
        existing.publication_date = paper.publication_date
        existing.year = paper.year
        existing.venue = paper.venue
        existing.pdf_url = paper.pdf_url
        existing.is_open_access = paper.is_open_access
        existing.citation_count = paper.citation_count
        existing.authors_json = [a.model_dump() for a in paper.authors]

        # Cleanly delete and replace child tables
        await db.execute(delete(PaperSourceModel).where(PaperSourceModel.paper_id == paper.canonical_id))
        await db.execute(delete(PaperSectionModel).where(PaperSectionModel.paper_id == paper.canonical_id))
        await db.execute(delete(BenchmarkModel).where(BenchmarkModel.paper_id == paper.canonical_id))
        await db.execute(delete(CodeRepositoryModel).where(CodeRepositoryModel.paper_id == paper.canonical_id))
        await db.execute(delete(PaperSummaryModel).where(PaperSummaryModel.paper_id == paper.canonical_id))
        await db.execute(delete(ResearchGapModel).where(ResearchGapModel.paper_id == paper.canonical_id))

        for s in paper.sources:
            db.add(PaperSourceModel(
                paper_id=paper.canonical_id,
                source_name=s.source_name,
                external_id=s.external_id,
                url=s.url,
                is_primary=s.is_primary,
                raw_metadata_json=s.raw_metadata
            ))

        for sec in paper.sections:
            db.add(PaperSectionModel(
                paper_id=paper.canonical_id,
                title=sec.title,
                section_type=sec.section_type.value,
                content=sec.content,
                order_index=sec.order_index,
                token_count=sec.token_count
            ))

        for b in paper.benchmarks:
            db.add(BenchmarkModel(
                paper_id=paper.canonical_id,
                source=b.source,
                task=b.task,
                dataset=b.dataset,
                metric=b.metric,
                value=b.value,
                model=b.model,
                split=b.split,
                repository_url=b.repository_url
            ))

        for r in paper.code_repositories:
            db.add(CodeRepositoryModel(
                paper_id=paper.canonical_id,
                url=r.url,
                is_official=r.is_official,
                framework=r.framework,
                stars=r.stars,
                license=r.license
            ))

        if paper.summary:
            db.add(PaperSummaryModel(
                paper_id=paper.canonical_id,
                problem=paper.summary.problem,
                methodology=paper.summary.methodology,
                experiments=paper.summary.experiments,
                contributions_json=paper.summary.contributions,
                limitations_json=paper.summary.limitations,
                open_questions_json=paper.summary.open_questions,
                claims_json=[c.model_dump() for c in paper.summary.claims],
                model_used=paper.summary.model_used
            ))

        for g in paper.research_gaps:
            db.add(ResearchGapModel(
                paper_id=paper.canonical_id,
                category=g.category,
                description=g.description,
                evidence_text=g.evidence_text,
                proposed_direction=g.proposed_direction
            ))

        await db.flush()
        logger.info("[PaperRepository] Persisted canonical paper: '%s' (%s)", paper.title, paper.canonical_id)
        return paper

    @staticmethod
    def _to_canonical_entity(record: NormalizedPaperModel) -> CanonicalPaper:
        """Convert SQLAlchemy NormalizedPaperModel record into Pydantic CanonicalPaper entity."""
        authors = [AuthorEntity(**a) for a in (record.authors_json or [])]
        sources = [
            SourceMetadata(
                source_name=s.source_name,
                external_id=s.external_id,
                url=s.url,
                is_primary=s.is_primary,
                raw_metadata=s.raw_metadata_json or {}
            )
            for s in (record.sources or [])
        ]
        sections = [
            PaperSectionEntity(
                title=sec.title,
                section_type=PaperSectionType(sec.section_type) if sec.section_type in PaperSectionType._value2member_map_ else PaperSectionType.OTHER,
                content=sec.content,
                order_index=sec.order_index,
                token_count=sec.token_count
            )
            for sec in (record.sections or [])
        ]
        benchmarks = [
            BenchmarkEvidence(
                source=b.source,
                task=b.task,
                dataset=b.dataset,
                metric=b.metric,
                value=b.value,
                model=b.model,
                split=b.split,
                paper_title=record.title,
                repository_url=b.repository_url
            )
            for b in (record.benchmarks or [])
        ]
        code_repositories = [
            CodeRepository(
                url=r.url,
                is_official=r.is_official,
                framework=r.framework,
                stars=r.stars,
                license=r.license
            )
            for r in (record.code_repositories or [])
        ]

        summary = None
        if record.summaries:
            s_rec = record.summaries[0]
            claims = [ExtractedClaim(**c) for c in (s_rec.claims_json or [])]
            summary = StructuredPaperSummary(
                problem=s_rec.problem,
                contributions=s_rec.contributions_json or [],
                methodology=s_rec.methodology,
                experiments=s_rec.experiments,
                limitations=s_rec.limitations_json or [],
                open_questions=s_rec.open_questions_json or [],
                claims=claims,
                model_used=s_rec.model_used
            )

        return CanonicalPaper(
            canonical_id=record.canonical_id,
            title=record.title,
            abstract=record.abstract,
            authors=authors,
            doi=record.doi,
            arxiv_id=record.arxiv_id,
            openalex_id=record.openalex_id,
            publication_date=record.publication_date,
            year=record.year,
            venue=record.venue,
            pdf_url=record.pdf_url,
            is_open_access=record.is_open_access,
            citation_count=record.citation_count,
            sources=sources,
            sections=sections,
            benchmarks=benchmarks,
            code_repositories=code_repositories,
            summary=summary
        )
