import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.config import settings
from src.core.logger import logger
from src.core.models import PaperDocumentModel
from src.engines.searqon_client import SearqonClient, WebSearchResult
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


class WebCitationItem(BaseModel):
    title: str
    url: str
    domain: str = ""
    source: str = "searqon"
    snippet: Optional[str] = None
    published_at: Optional[str] = None
    query: Optional[str] = None


class PaperRAGResponse(BaseModel):
    paper_id: str
    paper_title: Optional[str] = None
    question: str
    answer: str
    citations: List[CitationItem]
    paper_citations: List[CitationItem] = []
    web_sources: List[WebCitationItem] = []
    external_search_used: bool = False
    mode: str = "auto"
    retrieved_chunks_count: int
    cache_hit: bool = False
    retrieval_source: str = "sqlite"
    retrieval_strategy: str = "hybrid"
    sqlite_latency_ms: float = 0.0
    redis_latency_ms: float = 0.0
    retrieval_latency_ms: float = 0.0
    graph_latency_ms: float = 0.0
    web_search_latency_ms: float = 0.0
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
        searqon_client: Optional[SearqonClient] = None,
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
        self.searqon_client = searqon_client or SearqonClient(active_cache=self.active_cache)

    async def answer_question(
        self,
        paper_id: str,
        question: str,
        db: AsyncSession,
        top_k: Optional[int] = None,
        llm_model: Optional[str] = None,
        mode: str = "auto",
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
            try:
                doc_stmt = select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id)
                res = await db.execute(doc_stmt)
                if hasattr(res, "scalar_one_or_none"):
                    paper_doc = res.scalar_one_or_none()
                    if hasattr(paper_doc, "__await__"):
                        paper_doc = await paper_doc
                    if paper_doc and hasattr(paper_doc, "title") and isinstance(paper_doc.title, str):
                        paper_title = paper_doc.title
            except Exception:
                pass

        # 2. Ensure paper is indexed in RAG tables
        is_indexed = await self.ingestion.ensure_paper_indexed(paper_id, db)
        if not is_indexed and not paper_title:
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer=f"Paper '{paper_id}' not found or has not been ingested yet. Please upload or ingest the paper first.",
                citations=[],
                paper_citations=[],
                web_sources=[],
                external_search_used=False,
                mode=mode,
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

        # 6. Searqon External Web Research (Triggered based on query intent & mode)
        should_search_web = self.query_router.should_search_external(
            query=question,
            mode=mode,
            paper_chunks_found=len(merged_chunks),
        )
        web_results: List[WebSearchResult] = []
        web_search_latency = 0.0
        generated_query = None

        if should_search_web:
            paper_context = {"title": paper_title}
            if self.active_cache:
                try:
                    c_data = await self.active_cache.get_paper(paper_id)
                    if c_data:
                        paper_context = c_data
                except Exception:
                    pass

            generated_query = self.query_router.generate_search_query(question, paper_context=paper_context)
            t_web = time.perf_counter()
            try:
                web_results = await self.searqon_client.search(
                    query=generated_query,
                    paper_id=paper_id,
                    limit=getattr(settings, "web_search_top_k", 5),
                )
            except Exception as e:
                logger.warning("[PaperRAGService] Searqon search failed or timed out: %s", e)
            web_search_latency = round((time.perf_counter() - t_web) * 1000, 2)

        if not merged_chunks and not (graph_evidence and graph_evidence.get("relationships")) and not web_results:
            logger.info("[PaperRAGService] No relevant chunks, graph relationships, or web results found for '%s'", paper_id)
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer="I couldn't find enough information about this in the paper or external search.",
                citations=[],
                paper_citations=[],
                web_sources=[],
                external_search_used=False,
                mode=mode,
                retrieved_chunks_count=0,
                cache_hit=cache_hit,
                retrieval_source=retrieval_source,
                retrieval_strategy=strategy,
                sqlite_latency_ms=sqlite_lat,
                redis_latency_ms=redis_lat,
                retrieval_latency_ms=retrieval_latency,
                graph_latency_ms=graph_latency,
                web_search_latency_ms=web_search_latency,
                llm_latency_ms=0.0,
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                graph_entities_found=len(graph_evidence.get("entities", [])) if graph_evidence else 0,
                graph_relationships_found=len(graph_evidence.get("relationships", [])) if graph_evidence else 0,
                status="no_relevant_information",
            )

        # 7. Context Construction
        t_ctx_start = time.perf_counter()
        messages = self.context_builder.build_context(
            question=question,
            retrieved_chunks=merged_chunks,
            paper_title=paper_title,
            graph_evidence=graph_evidence,
            web_sources=web_results,
        )
        context_latency = round((time.perf_counter() - t_ctx_start) * 1000, 2)

        # 8. LLM Synthesis
        t_llm_start = time.perf_counter()
        provider = get_llm_provider(model=llm_model or "")
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
                paper_citations=[],
                web_sources=[],
                external_search_used=bool(web_results),
                mode=mode,
                retrieved_chunks_count=len(merged_chunks),
                cache_hit=cache_hit,
                retrieval_source=retrieval_source,
                retrieval_strategy=strategy,
                sqlite_latency_ms=sqlite_lat,
                redis_latency_ms=redis_lat,
                retrieval_latency_ms=retrieval_latency,
                graph_latency_ms=graph_latency,
                web_search_latency_ms=web_search_latency,
                context_latency_ms=context_latency,
                llm_latency_ms=round((time.perf_counter() - t_llm_start) * 1000, 2),
                total_latency_ms=round((time.perf_counter() - overall_start) * 1000, 2),
                graph_entities_found=len(graph_evidence.get("entities", [])) if graph_evidence else 0,
                graph_relationships_found=len(graph_evidence.get("relationships", [])) if graph_evidence else 0,
                status="llm_error",
            )

        # 9. Extract and Verify Citations
        raw_citations = self.context_builder.extract_structured_citations(raw_reply, merged_chunks)
        citations = [CitationItem(**c) for c in raw_citations]

        raw_web_cits = self.context_builder.extract_structured_web_citations(raw_reply, web_results)
        web_sources = [
            WebCitationItem(
                title=w.get("title", ""),
                url=w.get("url", ""),
                domain=w.get("domain", ""),
                source=w.get("source", "searqon"),
                snippet=w.get("snippet"),
                published_at=w.get("published_at"),
                query=generated_query,
            )
            for w in raw_web_cits
        ]

        total_latency = round((time.perf_counter() - overall_start) * 1000, 2)
        logger.info(
            "[PaperRAGService] Completed query for paper '%s': mode=%s, strategy=%s, source=%s, chunks=%d, paper_cits=%d, web_cits=%d (retrieval=%sms, graph=%sms, web=%sms, llm=%sms, total=%sms)",
            paper_id,
            mode,
            strategy,
            retrieval_source,
            len(merged_chunks),
            len(citations),
            len(web_sources),
            retrieval_latency,
            graph_latency,
            web_search_latency,
            llm_latency,
            total_latency,
        )

        return PaperRAGResponse(
            paper_id=paper_id,
            paper_title=paper_title,
            question=question,
            answer=raw_reply,
            citations=citations,
            paper_citations=citations,
            web_sources=web_sources,
            external_search_used=bool(web_results),
            mode=mode,
            retrieved_chunks_count=len(merged_chunks),
            cache_hit=cache_hit,
            retrieval_source=retrieval_source,
            retrieval_strategy=strategy,
            sqlite_latency_ms=sqlite_lat,
            redis_latency_ms=redis_lat,
            retrieval_latency_ms=retrieval_latency,
            graph_latency_ms=graph_latency,
            web_search_latency_ms=web_search_latency,
            context_latency_ms=context_latency,
            llm_latency_ms=llm_latency,
            total_latency_ms=total_latency,
            graph_entities_found=len(graph_evidence.get("entities", [])) if graph_evidence else 0,
            graph_relationships_found=len(graph_evidence.get("relationships", [])) if graph_evidence else 0,
            status="success",
        )
