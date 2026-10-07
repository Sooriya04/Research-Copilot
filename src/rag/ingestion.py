import time
from typing import Any, Dict, List, Optional
import pymupdf as fitz
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.logger import logger
from src.core.models import PaperChunkModel, PaperDocumentModel, PaperCacheModel
from src.rag.chunker import DocumentChunk, PaperChunker
from src.rag.embeddings import BaseEmbeddingProvider, get_embedding_provider


class PaperIngestionService:
    """End-to-end ingestion service: PDF parsing -> chunking -> embeddings -> SQLite persistence."""

    def __init__(
        self,
        chunker: Optional[PaperChunker] = None,
        embedding_provider: Optional[BaseEmbeddingProvider] = None,
    ):
        self.chunker = chunker or PaperChunker()
        self.embedding_provider = embedding_provider or get_embedding_provider()

    async def ingest_pdf_bytes(
        self,
        paper_id: str,
        pdf_bytes: bytes,
        title: Optional[str] = None,
        doi: Optional[str] = None,
        arxiv_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> PaperDocumentModel:
        """Parse raw PDF bytes into pages, chunk them, embed them, and persist to SQLite."""
        start_time = time.perf_counter()
        if not pdf_bytes or len(pdf_bytes) < 100:
            raise ValueError(f"Invalid or empty PDF bytes provided for paper '{paper_id}'.")

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
                "[PaperIngestion] Successfully ingested paper '%s' (%d pages) in %sms",
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
        if not db:
            raise ValueError("AsyncSession must be provided to persist paper document.")

        t0 = time.perf_counter()

        # 1. Chunk pages preserving page boundaries and sections
        chunks: List[DocumentChunk] = self.chunker.chunk_pages(paper_id=paper_id, pages=pages)
        if not chunks:
            # Fallback single chunk if text was very short
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

        # 2. Generate embeddings
        chunk_texts = [c.content for c in chunks]
        embeddings = await self.embedding_provider.embed_batch(chunk_texts)

        # 3. Upsert PaperDocumentModel in SQLite
        doc_stmt = select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id)
        res = await db.execute(doc_stmt)
        existing_doc = res.scalar_one_or_none()

        if existing_doc:
            existing_doc.title = title
            existing_doc.abstract = abstract
            existing_doc.doi = doi or existing_doc.doi
            existing_doc.arxiv_id = arxiv_id or existing_doc.arxiv_id
            existing_doc.authors_json = authors or existing_doc.authors_json
            existing_doc.page_count = len(pages)
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
                page_count=len(pages),
                metadata_json=metadata or {},
            )
            db.add(paper_doc)

        # 4. Remove previous chunks for this paper
        await db.execute(delete(PaperChunkModel).where(PaperChunkModel.paper_id == paper_id))

        # 5. Insert new chunk records with embeddings
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
