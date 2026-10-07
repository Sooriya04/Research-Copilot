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
    retrieval_latency_ms: float
    llm_latency_ms: float
    status: str = "success"


class PaperRAGService:
    """End-to-end RAG orchestrator for paper question answering with verified citations."""

    def __init__(
        self,
        retriever: Optional[HybridRetriever] = None,
        context_builder: Optional[ContextBuilder] = None,
        ingestion_service: Optional[PaperIngestionService] = None,
    ):
        self.retriever = retriever or HybridRetriever()
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

        # 1. Fetch paper metadata
        doc_stmt = select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id)
        res = await db.execute(doc_stmt)
        paper_doc = res.scalar_one_or_none()

        paper_title = paper_doc.title if paper_doc else None

        # 2. Ensure paper is indexed in RAG tables
        is_indexed = await self.ingestion.ensure_paper_indexed(paper_id, db)
        if not is_indexed and not paper_doc:
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer=f"Paper '{paper_id}' not found or has not been ingested yet. Please upload or ingest the paper first.",
                citations=[],
                retrieved_chunks_count=0,
                retrieval_latency_ms=0.0,
                llm_latency_ms=0.0,
                status="paper_not_found",
            )

        # 3. Hybrid Retrieval
        t_retrieval_start = time.perf_counter()
        retrieved_chunks = await self.retriever.retrieve(
            paper_id=paper_id,
            query=question,
            db=db,
            top_k=top_k,
        )
        retrieval_latency = round((time.perf_counter() - t_retrieval_start) * 1000, 2)

        if not retrieved_chunks:
            logger.info("[PaperRAGService] No relevant chunks found for paper '%s', query='%s'", paper_id, question)
            return PaperRAGResponse(
                paper_id=paper_id,
                paper_title=paper_title,
                question=question,
                answer="I couldn't find enough information about this in the paper.",
                citations=[],
                retrieved_chunks_count=0,
                retrieval_latency_ms=retrieval_latency,
                llm_latency_ms=0.0,
                status="no_relevant_chunks",
            )

        # 4. Context Construction
        messages = self.context_builder.build_context(
            question=question,
            retrieved_chunks=retrieved_chunks,
            paper_title=paper_title,
        )

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
                retrieval_latency_ms=retrieval_latency,
                llm_latency_ms=round((time.perf_counter() - t_llm_start) * 1000, 2),
                status="llm_error",
            )

        # 6. Extract and Verify Citations
        raw_citations = self.context_builder.extract_structured_citations(raw_reply, retrieved_chunks)
        citations = [CitationItem(**c) for c in raw_citations]

        logger.info(
            "[PaperRAGService] Completed query for paper '%s': %d chunks retrieved, %d citations identified in %sms",
            paper_id,
            len(retrieved_chunks),
            len(citations),
            round((time.perf_counter() - overall_start) * 1000, 2),
        )

        return PaperRAGResponse(
            paper_id=paper_id,
            paper_title=paper_title,
            question=question,
            answer=raw_reply,
            citations=citations,
            retrieved_chunks_count=len(retrieved_chunks),
            retrieval_latency_ms=retrieval_latency,
            llm_latency_ms=llm_latency,
            status="success",
        )
