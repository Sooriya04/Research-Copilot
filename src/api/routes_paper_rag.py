from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db
from src.core.logger import logger
from src.core.models import PaperChunkModel, PaperDocumentModel
from src.rag.active_cache import get_active_paper_cache
from src.rag.ingestion import PaperIngestionService
from src.rag.service import CitationItem, PaperRAGResponse, PaperRAGService

router = APIRouter(tags=["Paper RAG Pipeline"])
rag_service = PaperRAGService()
ingestion_service = PaperIngestionService()
active_cache = get_active_paper_cache()


class PaperChatRequest(BaseModel):
    question: str
    top_k: Optional[int] = None
    model: Optional[str] = None


class PaperIngestPayload(BaseModel):
    title: str
    abstract: Optional[str] = ""
    pages: Optional[List[Dict[str, Any]]] = None  # [{"page_number": 1, "text": "..."}]
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    authors: Optional[List[str]] = None


class PaperStatusResponse(BaseModel):
    paper_id: str
    is_indexed: bool
    title: Optional[str] = None
    page_count: int = 0
    chunk_count: int = 0


@router.post("/api/v1/papers/{paper_id}/chat", response_model=PaperRAGResponse)
@router.post("/papers/{paper_id}/chat", response_model=PaperRAGResponse)
async def paper_rag_chat_endpoint(
    paper_id: str,
    req: PaperChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Answer questions grounded in the paper using hybrid retrieval (Vector + BM25) and local Ollama / Frontier LLM."""
    if not req.question or not req.question.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty.",
        )

    response = await rag_service.answer_question(
        paper_id=paper_id,
        question=req.question.strip(),
        db=db,
        top_k=req.top_k,
        llm_model=req.model,
    )
    return response


@router.post("/api/v1/papers/{paper_id}/ingest")
@router.post("/papers/{paper_id}/ingest")
async def paper_rag_ingest_endpoint(
    paper_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ingest a research paper (PDF or structured text) into SQLite chunks and embeddings."""
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        title = form.get("title")
        if file and hasattr(file, "read"):
            content_bytes = await file.read()
            if len(content_bytes) < 100:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Uploaded PDF file is empty or corrupted.",
                )
            filename = getattr(file, "filename", "document.pdf") or "document.pdf"
            paper_doc = await ingestion_service.ingest_pdf_bytes(
                paper_id=paper_id,
                pdf_bytes=content_bytes,
                title=str(title) if title else filename.replace(".pdf", ""),
                db=db,
            )
            return {
                "status": "success",
                "paper_id": paper_doc.id,
                "title": paper_doc.title,
                "page_count": paper_doc.page_count,
                "message": "PDF successfully ingested, chunked, and embedded.",
            }
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}

        if body and "title" in body:
            payload = PaperIngestPayload(**body)
            pages = payload.pages or [{"page_number": 1, "text": f"{payload.title}\n\n{payload.abstract}"}]
            paper_doc = await ingestion_service.ingest_document(
                paper_id=paper_id,
                title=payload.title,
                pages=pages,
                abstract=payload.abstract or "",
                authors=payload.authors,
                doi=payload.doi,
                arxiv_id=payload.arxiv_id,
                db=db,
            )
            return {
                "status": "success",
                "paper_id": paper_doc.id,
                "title": paper_doc.title,
                "page_count": paper_doc.page_count,
                "message": "Document successfully ingested, chunked, and embedded.",
            }

    # If neither file nor payload, attempt auto-indexing from existing paper_cache
    indexed = await ingestion_service.ensure_paper_indexed(paper_id, db)
    if indexed:
        return {
            "status": "success",
            "paper_id": paper_id,
            "message": "Paper discovered in cache and indexed into RAG chunks.",
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Please provide a PDF file or document payload to ingest.",
    )


@router.get("/api/v1/papers/{paper_id}/status", response_model=PaperStatusResponse)
@router.get("/papers/{paper_id}/status", response_model=PaperStatusResponse)
async def paper_rag_status_endpoint(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Inspect whether a paper is indexed with chunks and embeddings."""
    doc_res = await db.execute(select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id))
    doc = doc_res.scalar_one_or_none()

    chunk_res = await db.execute(select(PaperChunkModel).where(PaperChunkModel.paper_id == paper_id))
    chunks = chunk_res.scalars().all()

    return PaperStatusResponse(
        paper_id=paper_id,
        is_indexed=len(chunks) > 0,
        title=doc.title if doc else None,
        page_count=doc.page_count if doc else (max([c.page_number for c in chunks], default=0)),
        chunk_count=len(chunks),
    )


@router.get("/api/v1/papers/{paper_id}/chunks")
@router.get("/papers/{paper_id}/chunks")
async def paper_rag_get_chunks_endpoint(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Inspect extracted chunks for a paper."""
    chunk_res = await db.execute(
        select(PaperChunkModel)
        .where(PaperChunkModel.paper_id == paper_id)
        .order_by(PaperChunkModel.chunk_index)
    )
    chunks = chunk_res.scalars().all()
    return {
        "paper_id": paper_id,
        "count": len(chunks),
        "chunks": [
            {
                "chunk_id": c.id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "section": c.section,
                "token_count": c.token_count,
                "content_preview": c.content[:200],
                "has_embedding": c.embedding_json is not None,
            }
            for c in chunks
        ],
    }


@router.post("/api/v1/papers/{paper_id}/activate")
@router.post("/papers/{paper_id}/activate")
async def activate_paper_endpoint(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mark a research paper as active and load its context & chunks into Redis."""
    # Ensure paper is indexed in SQLite first
    await ingestion_service.ensure_paper_indexed(paper_id, db)
    loaded = await active_cache.load_paper(paper_id, db)
    if not loaded:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Paper '{paper_id}' not found in SQLite repository.",
        )
    return {
        "paper_id": paper_id,
        "status": "active",
        "cached": True,
        "title": loaded.get("title"),
        "page_count": loaded.get("page_count", 1),
    }


@router.get("/api/v1/papers/{paper_id}/cache")
@router.get("/papers/{paper_id}/cache")
async def get_paper_cache_endpoint(paper_id: str):
    """Inspect active paper cache status and TTL in Redis."""
    status_info = await active_cache.get_cache_status(paper_id)
    return status_info


@router.delete("/api/v1/papers/{paper_id}/cache")
@router.delete("/papers/{paper_id}/cache")
async def invalidate_paper_cache_endpoint(paper_id: str):
    """Evict active paper context and chunks from Redis."""
    evicted = await active_cache.invalidate_paper(paper_id)
    return {
        "paper_id": paper_id,
        "status": "invalidated",
        "evicted": evicted,
    }


@router.get("/api/v1/papers/active")
@router.get("/papers/active")
async def get_active_paper_endpoint():
    """Retrieve currently active paper ID."""
    active_id = await active_cache.get_active_paper_id()
    return {"active_paper_id": active_id}
