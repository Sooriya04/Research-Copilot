import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.logger import logger
from src.core.models import PaperDocumentModel
from src.providers.factory import get_llm_provider
from src.rag.context_builder import ContextBuilder
from src.rag.ingestion import PaperIngestionService
from src.rag.retriever import HybridRetriever


class CitationItem(BaseModel):
    chunk_id: str
    page: int
    section: str
    score: float = 0.0
    excerpt: Optional[str] = None


class PaperRAGResponse(BaseModel):
    paper_id: str
    paper_title: Optional[str] = None
    question: str
    answer: str
    citations: List[CitationItem]
    retrieved_chunks_count: int
    cache_hit: bool = False
    retrieval_source: str = "sqlite"
    sqlite_latency_ms: float = 0.0
    redis_latency_ms: float = 0.0
    retrieval_latency_ms: float = 0.0
    context_latency_ms: float = 0.0
    llm_latency_ms: float = 0.0
    total_latency_ms: float = 0.0
    status: str = "success"


class PaperRAGService:
    """End-to-end RAG orchestrator for paper question answering with verified citations & Redis CAG."""

    def __init__(
        self,
        retriever: Optional[HybridRetriever] = None,
        context_builder: Optional[ContextBuilder] = None,
        ingestion_service: Optional[PaperIngestionService] = None,
        active_cache: Optional[Any] = None,
    ):
        if active_cache is not None:
            self.active_cache = active_cache
        else:
            from src.rag.active_cache import get_active_paper_cache
            self.active_cache = get_active_paper_cache()

        self.retriever = retriever or HybridRetriever(active_cache=self.active_cache)
        self.context_builder = context_builder or ContextBuilder()
        self.ingestion = ingestion_service or PaperIngestionService()

    async def answer_question(
        self,
        paper_id: str,
        question: str,
        db: AsyncSession,
        top_k: Optional[int] = None,
        llm_model: Optional[str] = None,
    ) -> PaperRAGResponse:
        """Executes hybrid retrieval, builds grounded context, queries LLM, and formats structured citations."""
        overall_start = time.perf_counter()

        # 1. Fetch paper metadata (from active Redis cache or SQLite)
        paper_title = None
        if self.active_cache:
            try:
                cached_paper = await self.active_cache.get_paper(paper_id)
                if cached_paper:
                    paper_title = cached_paper.get("title")
            except Exception:
                pass

        if not paper_title:
            doc_stmt = select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id)
            res = await db.execute(doc_stmt)
            paper_doc = res.scalar_one_or_none()
            if paper_doc:
                paper_title = paper_doc.title

        # 2. Ensure paper is indexed in RAG tables
        is_indexed = await self.ingestion.ensure_paper_indexed(paper_id, db)
        if not is_indexed and not paper_title:
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer=f"Paper '{paper_id}' not found or has not been ingested yet. Please upload or ingest the paper first.",
                citations=[],
                retrieved_chunks_count=0,
                retrieval_latency_ms=0.0,
                llm_latency_ms=0.0,
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                status="paper_not_found",
            )

        # Warm up active cache if not cached yet
        if self.active_cache:
            try:
                if not await self.active_cache.is_cached(paper_id):
                    await self.active_cache.load_paper(paper_id, db)
            except Exception:
                pass

        # 3. Hybrid Retrieval (Redis first, fallback SQLite)
        t_retrieval_start = time.perf_counter()
        retrieved_chunks = await self.retriever.retrieve(
            paper_id=paper_id,
            query=question,
            db=db,
            top_k=top_k,
        )
        retrieval_latency = round((time.perf_counter() - t_retrieval_start) * 1000, 2)

        retrieval_source = "sqlite"
        cache_hit = False
        sqlite_lat = 0.0
        redis_lat = 0.0
        if retrieved_chunks:
            retrieval_source = retrieved_chunks[0].get("retrieval_source", "sqlite")
            fetch_lat = retrieved_chunks[0].get("fetch_latency_ms", 0.0)
            if retrieval_source == "redis":
                cache_hit = True
                redis_lat = fetch_lat
            else:
                sqlite_lat = fetch_lat

        if not retrieved_chunks:
            logger.info("[PaperRAGService] No relevant chunks found for paper '%s', query='%s'", paper_id, question)
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer="I couldn't find enough information about this in the paper.",
                citations=[],
                retrieved_chunks_count=0,
                cache_hit=cache_hit,
                retrieval_source=retrieval_source,
                sqlite_latency_ms=sqlite_lat,
                redis_latency_ms=redis_lat,
                retrieval_latency_ms=retrieval_latency,
                llm_latency_ms=0.0,
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                status="no_relevant_chunks",
            )

        # 4. Context Construction
        t_ctx_start = time.perf_counter()
        messages = self.context_builder.build_context(
            question=question,
            retrieved_chunks=retrieved_chunks,
            paper_title=paper_title,
        )
        context_latency = round((time.perf_counter() - t_ctx_start) * 1000, 2)

        # 5. LLM Synthesis
        t_llm_start = time.perf_counter()
        provider = get_llm_provider()
        try:
            raw_reply = await provider.complete(messages, model=llm_model)
            llm_latency = round((time.perf_counter() - t_llm_start) * 1000, 2)
        except Exception as e:
            logger.error("[PaperRAGService] LLM provider failed: %s", e)
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer="Failed to synthesize response from LLM provider.",
                citations=[],
                retrieved_chunks_count=len(retrieved_chunks),
                cache_hit=cache_hit,
                retrieval_source=retrieval_source,
                sqlite_latency_ms=sqlite_lat,
                redis_latency_ms=redis_lat,
                retrieval_latency_ms=retrieval_latency,
                context_latency_ms=context_latency,
                llm_latency_ms=round((time.perf_counter() - t_llm_start) * 1000, 2),
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                status="llm_error",
            )

        # 6. Extract and Verify Citations
        raw_citations = self.context_builder.extract_structured_citations(raw_reply, retrieved_chunks)
        citations = [CitationItem(**c) for c in raw_citations]

        total_latency = round((time.perf_counter() - overall_start) * 1000, 2)
        logger.info(
            "[PaperRAGService] Completed query for paper '%s': source=%s, chunks=%d, citations=%d (retrieval=%sms, llm=%sms, total=%sms)",
            paper_id,
            retrieval_source,
            len(retrieved_chunks),
            len(citations),
            retrieval_latency,
            llm_latency,
            total_latency,
        )

        return PaperRAGResponse(
            paper_id=paper_id,
            paper_title=paper_title,
            question=question,
            answer=raw_reply,
            citations=citations,
            retrieved_chunks_count=len(retrieved_chunks),
            cache_hit=cache_hit,
            retrieval_source=retrieval_source,
            sqlite_latency_ms=sqlite_lat,
            redis_latency_ms=redis_lat,
            retrieval_latency_ms=retrieval_latency,
            context_latency_ms=context_latency,
            llm_latency_ms=llm_latency,
            total_latency_ms=total_latency,
            status="success",
        )
