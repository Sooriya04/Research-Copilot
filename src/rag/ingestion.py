import time
from typing import Any, Dict, List, Optional
import pymupdf as fitz
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.logger import logger
from src.core.models import PaperChunkModel, PaperDocumentModel, PaperCacheModel
from src.engines.paper_drift_client import PaperDriftClient
from src.rag.chunker import DocumentChunk, PaperChunker
from src.rag.embeddings import BaseEmbeddingProvider, get_embedding_provider


class PaperIngestionService:
    """End-to-end ingestion service: PDF parsing -> chunking -> embeddings -> SQLite persistence.
    
    Supports AST-aware semantic chunking via paper-drift sidecar (:7490) with transparent,
    graceful fallback to PyMuPDF.
    """

    def __init__(
        self,
        chunker: Optional[PaperChunker] = None,
        embedding_provider: Optional[BaseEmbeddingProvider] = None,
        paper_drift_client: Optional[PaperDriftClient] = None,
    ):
        self.chunker = chunker or PaperChunker()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.paper_drift = paper_drift_client or PaperDriftClient()

    async def ingest_pdf_bytes(
        self,
        paper_id: str,
        pdf_bytes: bytes,
        title: Optional[str] = None,
        doi: Optional[str] = None,
        arxiv_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> PaperDocumentModel:
        """Parse raw PDF bytes into chunks, embed them, and persist to SQLite.
        
        Attempts AST-aware semantic chunking via paper-drift (:7490) first;
        transparently falls back to PyMuPDF on any connection refusal or timeout.
        """
        start_time = time.perf_counter()
        if not pdf_bytes or len(pdf_bytes) < 100:
            raise ValueError(f"Invalid or empty PDF bytes provided for paper '{paper_id}'.")

        # 1. High-fidelity semantic chunking via paper-drift sidecar (:7490)
        drift_chunks = None
        if self.paper_drift:
            try:
                drift_chunks = await self.paper_drift.chunk_pdf(pdf_bytes)
            except Exception as ex:
                logger.debug("[PaperIngestion] paper-drift attempt note: %s", ex)

        if drift_chunks:
            try:
                doc_chunks = [
                    DocumentChunk(
                        chunk_id=f"{paper_id}_c{idx}",
                        paper_id=paper_id,
                        chunk_index=idx,
                        content=c["content"],
                        page_number=int(c.get("page") or 1),
                        section=c.get("section") or "General",
                        token_count=len(c["content"].split()),
                        metadata={
                            "has_math": bool(c.get("has_math", False)),
                            "has_table": bool(c.get("has_table", False)),
                            "engine": "paper-drift",
                        },
                    )
                    for idx, c in enumerate(drift_chunks)
                    if c.get("content", "").strip()
                ]

                if doc_chunks:
                    detected_title = title or ""
                    detected_abstract = ""
                    max_page = 1
                    for c in drift_chunks:
                        p_num = int(c.get("page") or 1)
                        if p_num > max_page:
                            max_page = p_num
                        c_text = c.get("content", "")
                        c_sec = (c.get("section") or "").lower()
                        if not detected_title and p_num == 1:
                            first_line = c_text.split("\n")[0].strip()
                            if len(first_line) > 5:
                                detected_title = first_line[:150]
                        if not detected_abstract and ("abstract" in c_sec or "abstract" in c_text.lower()[:200]):
                            detected_abstract = c_text.strip()[:1500]

                    if not detected_title:
                        detected_title = f"Research Paper {paper_id}"

                    doc_record = await self.ingest_chunks(
                        paper_id=paper_id,
                        title=detected_title,
                        chunks=doc_chunks,
                        page_count=max_page,
                        abstract=detected_abstract,
                        doi=doi,
                        arxiv_id=arxiv_id,
                        metadata={"engine": "paper-drift", "total_chunks": len(doc_chunks)},
                        db=db,
                    )
                    latency = round((time.perf_counter() - start_time) * 1000, 2)
                    logger.info(
                        "[PaperIngestion] Ingested paper '%s' via paper-drift (%d chunks) in %sms",
                        paper_id,
                        len(doc_chunks),
                        latency,
                    )
                    return doc_record
            except Exception as e:
                logger.warning(
                    "[PaperIngestion] paper-drift chunk ingestion failed for '%s' (%s). Falling back to pymupdf.",
                    paper_id,
                    e,
                )

        # 2. Resilient local fallback via PyMuPDF (fitz)
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = len(doc)
            pages: List[Dict[str, Any]] = []

            for i in range(total_pages):
                page = doc[i]
                page_text = page.get_text("text") or ""
                pages.append({"page_number": i + 1, "text": page_text})

            # Detect title if not supplied
            detected_title = title or ""
            if not detected_title and pages and pages[0]["text"]:
                first_lines = [l.strip() for l in pages[0]["text"].split("\n") if len(l.strip()) > 3]
                if first_lines:
                    detected_title = first_lines[0][:150]
            if not detected_title:
                detected_title = f"Research Paper {paper_id}"

            # Detect abstract from page 1
            abstract = ""
            if pages and pages[0]["text"]:
                p1 = pages[0]["text"]
                if "abstract" in p1.lower():
                    parts = p1.lower().split("abstract", 1)
                    if len(parts) > 1:
                        abstract = parts[1][:1200].strip()

            doc_record = await self.ingest_document(
                paper_id=paper_id,
                title=detected_title,
                pages=pages,
                abstract=abstract,
                doi=doi,
                arxiv_id=arxiv_id,
                db=db,
            )

            latency = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                "[PaperIngestion] Ingested paper '%s' via pymupdf (%d pages) in %sms",
                paper_id,
                total_pages,
                latency,
            )
            return doc_record
        except Exception as e:
            logger.error("[PaperIngestion] PDF ingestion failed for '%s': %s", paper_id, e)
            raise

    async def ingest_document(
        self,
        paper_id: str,
        title: str,
        pages: List[Dict[str, Any]],
        abstract: str = "",
        authors: Optional[List[str]] = None,
        doi: Optional[str] = None,
        arxiv_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> PaperDocumentModel:
        """Core document ingestion: chunk pages, embed, and store in SQLite."""
        chunks: List[DocumentChunk] = self.chunker.chunk_pages(paper_id=paper_id, pages=pages)
        return await self.ingest_chunks(
            paper_id=paper_id,
            title=title,
            chunks=chunks,
            page_count=len(pages),
            abstract=abstract,
            authors=authors,
            doi=doi,
            arxiv_id=arxiv_id,
            metadata=metadata,
            db=db,
        )

    async def ingest_chunks(
        self,
        paper_id: str,
        title: str,
        chunks: List[DocumentChunk],
        page_count: int = 1,
        abstract: str = "",
        authors: Optional[List[str]] = None,
        doi: Optional[str] = None,
        arxiv_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
    ) -> PaperDocumentModel:
        """Persist structured chunks, generate embeddings, and build graph."""
        if not db:
            raise ValueError("AsyncSession must be provided to persist paper document.")

        t0 = time.perf_counter()

        if not chunks:
            chunks = [
                DocumentChunk(
                    chunk_id=f"{paper_id}_c0",
                    paper_id=paper_id,
                    chunk_index=0,
                    content=title,
                    page_number=1,
                    section="Title",
                    token_count=len(title.split()),
                )
            ]

        # 1. Generate embeddings
        chunk_texts = [c.content for c in chunks]
        embeddings = await self.embedding_provider.embed_batch(chunk_texts)

        # 2. Upsert PaperDocumentModel in SQLite
        doc_stmt = select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id)
        res = await db.execute(doc_stmt)
        existing_doc = res.scalar_one_or_none()

        if existing_doc:
            existing_doc.title = title
            existing_doc.abstract = abstract or existing_doc.abstract
            existing_doc.doi = doi or existing_doc.doi
            existing_doc.arxiv_id = arxiv_id or existing_doc.arxiv_id
            existing_doc.authors_json = authors or existing_doc.authors_json
            existing_doc.page_count = max(page_count, existing_doc.page_count or 1)
            existing_doc.metadata_json = metadata or existing_doc.metadata_json
            paper_doc = existing_doc
        else:
            paper_doc = PaperDocumentModel(
                id=paper_id,
                title=title,
                abstract=abstract,
                authors_json=authors or [],
                doi=doi,
                arxiv_id=arxiv_id,
                page_count=page_count,
                metadata_json=metadata or {},
            )
            db.add(paper_doc)

        # 3. Remove previous chunks for this paper
        await db.execute(delete(PaperChunkModel).where(PaperChunkModel.paper_id == paper_id))

        # 4. Insert new chunk records with embeddings
        for i, c in enumerate(chunks):
            emb = embeddings[i] if i < len(embeddings) else None
            chunk_rec = PaperChunkModel(
                id=c.chunk_id,
                paper_id=paper_id,
                chunk_index=c.chunk_index,
                content=c.content,
                page_number=c.page_number,
                section=c.section,
                token_count=c.token_count,
                embedding_json=emb,
                metadata_json=c.metadata,
            )
            db.add(chunk_rec)

        await db.commit()
        await db.refresh(paper_doc)

        # 5. Extract and persist paper knowledge graph (entities & relationships)
        try:
            from src.rag.graph_extractor import PaperGraphExtractor
            from src.rag.graph_store import PaperGraphStore
            extractor = PaperGraphExtractor()
            store = PaperGraphStore()
            raw_chunks_dict = [
                {
                    "chunk_id": c.chunk_id,
                    "content": c.content,
                    "page_number": c.page_number,
                    "section": c.section,
                }
                for c in chunks
            ]
            entities, relationships = extractor.extract_graph(
                paper_id=paper_id,
                paper_title=title,
                chunks=raw_chunks_dict,
                authors=authors,
            )
            await store.save_graph(paper_id=paper_id, entities=entities, relationships=relationships, db=db)
        except Exception as e:
            logger.warning("[PaperIngestion] Graph extraction note: %s", e)

        # 6. Invalidate active Redis cache to prevent stale context
        try:
            from src.rag.active_cache import get_active_paper_cache
            cache = get_active_paper_cache()
            await cache.invalidate_paper(paper_id)
        except Exception as e:
            logger.warning("[PaperIngestion] Cache invalidation note: %s", e)

        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        logger.info(
            "[PaperIngestion] Ingested paper '%s': %d chunks, %d embeddings in %sms",
            paper_id,
            len(chunks),
            len(embeddings),
            elapsed,
        )
        return paper_doc

    async def ensure_paper_indexed(self, paper_id: str, db: AsyncSession) -> bool:
        """Check if paper is already indexed with chunks; if not, attempt recovery from paper_cache."""
        stmt = select(PaperChunkModel.id).where(PaperChunkModel.paper_id == paper_id).limit(1)
        res = await db.execute(stmt)
        if res.scalar_one_or_none() is not None:
            return True

        # Check paper_cache
        cache_stmt = select(PaperCacheModel).where(PaperCacheModel.id == paper_id)
        cache_res = await db.execute(cache_stmt)
        cached = cache_res.scalar_one_or_none()
        if cached:
            # Construct synthetic pages from cached text/sections
            pages = []
            if cached.sections_json and isinstance(cached.sections_json, list):
                for idx, sec in enumerate(cached.sections_json):
                    sec_name = sec.get("title", f"Section {idx + 1}")
                    sec_text = sec.get("content", "")
                    pages.append({"page_number": idx + 1, "text": f"{sec_name}\n\n{sec_text}"})
            elif cached.full_text:
                # Segment full text across artificial pages
                full_len = len(cached.full_text)
                stride = 3000
                p_idx = 1
                for s in range(0, full_len, stride):
                    pages.append({"page_number": p_idx, "text": cached.full_text[s : s + stride]})
                    p_idx += 1
            else:
                pages.append({"page_number": 1, "text": f"{cached.title}\n\n{cached.abstract}"})

            await self.ingest_document(
                paper_id=paper_id,
                title=cached.title,
                pages=pages,
                abstract=cached.abstract,
                authors_json=cached.authors_json,
                doi=cached.doi,
                arxiv_id=cached.arxiv_id,
                db=db,
            )
            return True

        return False
