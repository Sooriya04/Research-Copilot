import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.logger import logger
from src.core.models import PaperDocumentModel
from src.providers.factory import get_llm_provider
from src.rag.context_builder import ContextBuilder
from src.rag.graph_retriever import PaperGraphRetriever
from src.rag.ingestion import PaperIngestionService
from src.rag.query_router import QueryRouter
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
    retrieval_strategy: str = "hybrid"
    sqlite_latency_ms: float = 0.0
    redis_latency_ms: float = 0.0
    retrieval_latency_ms: float = 0.0
    graph_latency_ms: float = 0.0
    context_latency_ms: float = 0.0
    llm_latency_ms: float = 0.0
    total_latency_ms: float = 0.0
    graph_entities_found: int = 0
    graph_relationships_found: int = 0
    status: str = "success"


class PaperRAGService:
    """End-to-end RAG orchestrator supporting Hybrid RAG, GraphRAG, and Redis CAG."""

    def __init__(
        self,
        retriever: Optional[HybridRetriever] = None,
        context_builder: Optional[ContextBuilder] = None,
        ingestion_service: Optional[PaperIngestionService] = None,
        graph_retriever: Optional[PaperGraphRetriever] = None,
        query_router: Optional[QueryRouter] = None,
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
        self.graph_retriever = graph_retriever or PaperGraphRetriever(active_cache=self.active_cache)
        self.query_router = query_router or QueryRouter()

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

        # 3. Query Routing (Hybrid vs GraphRAG vs Both)
        strategy = self.query_router.route_query(question)
        graph_evidence: Optional[Dict[str, Any]] = None
        graph_latency = 0.0
        graph_chunks: List[Dict[str, Any]] = []

        if strategy in ("graph", "both"):
            t_graph = time.perf_counter()
            try:
                graph_evidence = await self.graph_retriever.graph_search(paper_id=paper_id, query=question, db=db)
                graph_chunks = graph_evidence.get("evidence", [])
            except Exception as e:
                logger.warning("[PaperRAGService] Graph search note: %s", e)
            graph_latency = round((time.perf_counter() - t_graph) * 1000, 2)

        # 4. Hybrid Retrieval (if strategy requires text retrieval or graph returned no chunks)
        retrieved_chunks = []
        retrieval_latency = 0.0
        retrieval_source = "sqlite"
        cache_hit = False
        sqlite_lat = 0.0
        redis_lat = 0.0

        if strategy in ("hybrid", "both") or not graph_chunks:
            t_retrieval_start = time.perf_counter()
            retrieved_chunks = await self.retriever.retrieve(
                paper_id=paper_id,
                query=question,
                db=db,
                top_k=top_k,
            )
            retrieval_latency = round((time.perf_counter() - t_retrieval_start) * 1000, 2)
            if retrieved_chunks:
                retrieval_source = retrieved_chunks[0].get("retrieval_source", "sqlite")
                fetch_lat = retrieved_chunks[0].get("fetch_latency_ms", 0.0)
                if retrieval_source == "redis":
                    cache_hit = True
                    redis_lat = fetch_lat
                else:
                    sqlite_lat = fetch_lat

        # 5. Merge Evidence
        merged_chunks: List[Dict[str, Any]] = []
        seen_chunk_ids = set()

        for gc in graph_chunks:
            c_id = gc.get("chunk_id")
            if c_id not in seen_chunk_ids:
                seen_chunk_ids.add(c_id)
                merged_chunks.append(gc)

        for rc in retrieved_chunks:
            c_id = rc.get("chunk_id")
            if c_id not in seen_chunk_ids:
                seen_chunk_ids.add(c_id)
                merged_chunks.append(rc)

        if not merged_chunks and not (graph_evidence and graph_evidence.get("relationships")):
            logger.info("[PaperRAGService] No relevant chunks or graph relationships found for '%s'", paper_id)
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer="I couldn't find enough information about this in the paper.",
                citations=[],
                retrieved_chunks_count=0,
                cache_hit=cache_hit,
                retrieval_source=retrieval_source,
                retrieval_strategy=strategy,
                sqlite_latency_ms=sqlite_lat,
                redis_latency_ms=redis_lat,
                retrieval_latency_ms=retrieval_latency,
                graph_latency_ms=graph_latency,
                llm_latency_ms=0.0,
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                graph_entities_found=len(graph_evidence.get("entities", [])) if graph_evidence else 0,
                graph_relationships_found=len(graph_evidence.get("relationships", [])) if graph_evidence else 0,
                status="no_relevant_chunks",
            )

        # 6. Context Construction
        t_ctx_start = time.perf_counter()
        messages = self.context_builder.build_context(
            question=question,
            retrieved_chunks=merged_chunks,
            paper_title=paper_title,
            graph_evidence=graph_evidence,
        )
        context_latency = round((time.perf_counter() - t_ctx_start) * 1000, 2)

        # 7. LLM Synthesis
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
                retrieved_chunks_count=len(merged_chunks),
                cache_hit=cache_hit,
                retrieval_source=retrieval_source,
                retrieval_strategy=strategy,
                sqlite_latency_ms=sqlite_lat,
                redis_latency_ms=redis_lat,
                retrieval_latency_ms=retrieval_latency,
                graph_latency_ms=graph_latency,
                context_latency_ms=context_latency,
                llm_latency_ms=round((time.perf_counter() - t_llm_start) * 1000, 2),
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                graph_entities_found=len(graph_evidence.get("entities", [])) if graph_evidence else 0,
                graph_relationships_found=len(graph_evidence.get("relationships", [])) if graph_evidence else 0,
                status="llm_error",
            )

        # 8. Extract and Verify Citations
        raw_citations = self.context_builder.extract_structured_citations(raw_reply, merged_chunks)
        citations = [CitationItem(**c) for c in raw_citations]

        total_latency = round((time.perf_counter() - overall_start) * 1000, 2)
        logger.info(
            "[PaperRAGService] Completed query for paper '%s': strategy=%s, source=%s, chunks=%d, citations=%d (retrieval=%sms, graph=%sms, llm=%sms, total=%sms)",
            paper_id,
            strategy,
            retrieval_source,
            len(merged_chunks),
            len(citations),
            retrieval_latency,
            graph_latency,
            llm_latency,
            total_latency,
        )

        return PaperRAGResponse(
            paper_id=paper_id,
            paper_title=paper_title,
            question=question,
            answer=raw_reply,
            citations=citations,
            retrieved_chunks_count=len(merged_chunks),
            cache_hit=cache_hit,
            retrieval_source=retrieval_source,
            retrieval_strategy=strategy,
            sqlite_latency_ms=sqlite_lat,
            redis_latency_ms=redis_lat,
            retrieval_latency_ms=retrieval_latency,
            graph_latency_ms=graph_latency,
            context_latency_ms=context_latency,
            llm_latency_ms=llm_latency,
            total_latency_ms=total_latency,
            graph_entities_found=len(graph_evidence.get("entities", [])) if graph_evidence else 0,
            graph_relationships_found=len(graph_evidence.get("relationships", [])) if graph_evidence else 0,
            status="success",
        )
