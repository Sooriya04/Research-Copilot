import time
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import (
    CanonicalPaper, PaperSummarizeRequest, PaperSummarizeResponse,
    StructuredPaperSummary
)
from src.core.logger import logger
from src.core.paper_repository import PaperRepository
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.claim_verifier import ClaimVerifier
from src.engines.paper_analyzer import PaperAnalyzer
from src.engines.paperswithcode import PapersWithCodeClient
from src.engines.pdf_extractor import PDFExtractor
from src.engines.section_extractor import SectionExtractor

class PaperIntelligenceEngine:
    """Master orchestrator for multi-source ingestion, PDF extraction, SQLite caching, Gemini Flash-Lite analysis, and claim verification."""

    def __init__(self):
        self.resolver = CanonicalPaperResolver()
        self.pwc_client = PapersWithCodeClient()
        self.pdf_extractor = PDFExtractor()
        self.section_extractor = SectionExtractor()
        self.analyzer = PaperAnalyzer()
        self.verifier = ClaimVerifier()

    async def summarize_paper(self, req: PaperSummarizeRequest, db: AsyncSession) -> PaperSummarizeResponse:
        """End-to-end execution of the Paper Intelligence pipeline."""
        start_time = time.time()
        logger.info("[PaperIntelligence] Processing paper summary request for: '%s' (force_refresh=%s)", req.identifier, req.force_refresh)

        # 1. Check SQLite Cache (if not force_refresh)
        if not req.force_refresh:
            id_type, clean_id = self.resolver.normalize_identifier(req.identifier)
            cached_paper = None

            if id_type == "doi":
                cached_paper = await PaperRepository.get_by_doi_or_arxiv(db, doi=clean_id)
            elif id_type == "arxiv":
                cached_paper = await PaperRepository.get_by_doi_or_arxiv(db, arxiv_id=clean_id)
            else:
                cached_paper = await PaperRepository.get_by_canonical_id(db, req.identifier)

            if cached_paper and cached_paper.summary:
                exec_ms = (time.time() - start_time) * 1000.0
                logger.info("[PaperIntelligence] Cache HIT in SQLite for '%s' (%.1f ms)", req.identifier, exec_ms)
                return PaperSummarizeResponse(
                    canonical_paper=cached_paper,
                    cached=True,
                    execution_time_ms=round(exec_ms, 2)
                )

        # 2. Canonical Resolution
        paper = await self.resolver.resolve(req.identifier)
        if not paper:
            raise ValueError(f"Could not resolve scientific paper for identifier: '{req.identifier}'")

        # 3. Multi-Source Ingestion: Papers With Code (Benchmarks & Repos)
        pwc_benchmarks = await self.pwc_client.get_paper_benchmarks(arxiv_id=paper.arxiv_id, title=paper.title)
        pwc_repos = await self.pwc_client.get_code_repositories(arxiv_id=paper.arxiv_id, title=paper.title)

        if pwc_benchmarks:
            paper.benchmarks.extend(pwc_benchmarks)
        if pwc_repos:
            paper.code_repositories.extend(pwc_repos)

        # 4. PDF Intelligence: Extraction, Cleaning & Semantic Sectioning
        if paper.pdf_url and not paper.sections:
            pdf_bytes = await self.pdf_extractor.fetch_pdf_bytes(paper.pdf_url)
            if pdf_bytes:
                pages = self.pdf_extractor.extract_pages(pdf_bytes)
                if pages:
                    sections = self.section_extractor.extract_sections(pages)
                    paper.sections = sections

        # 5. Gemini Flash-Lite Structured Analysis
        summary = await self.analyzer.analyze(paper)

        # 6. Evidence Verification Layer
        verified_claims = self.verifier.verify_claims(paper, summary.claims)
        summary.claims = verified_claims
        paper.summary = summary

        # 7. Persist to Normalized SQLite Database
        await PaperRepository.save_canonical_paper(db, paper)
        await db.commit()

        exec_ms = (time.time() - start_time) * 1000.0
        logger.info("[PaperIntelligence] Successfully analyzed & persisted '%s' in %.1f ms", paper.title, exec_ms)

        return PaperSummarizeResponse(
            canonical_paper=paper,
            cached=False,
            execution_time_ms=round(exec_ms, 2)
        )
