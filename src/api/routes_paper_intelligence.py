import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import PaperSummarizeRequest, PaperSummarizeResponse
from src.core.database import get_db
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine
from src.engines.pdf_extractor import PDFExtractor
from src.engines.pdf_markdown_engine import PDFMarkdownEngine

router = APIRouter(prefix="/api/v1/paper", tags=["Paper Intelligence Engine"])
engine = PaperIntelligenceEngine()
markdown_engine = PDFMarkdownEngine()
pdf_extractor = PDFExtractor()
resolver = CanonicalPaperResolver()


class ImportPaperUrlRequest(BaseModel):
    identifier: str
    topic: Optional[str] = None


@router.post("/summarize", response_model=PaperSummarizeResponse)
async def summarize_paper_endpoint(req: PaperSummarizeRequest, db: AsyncSession = Depends(get_db)):
    """Extract full PDF intelligence, benchmark evidence from Papers With Code, run Gemini Flash-Lite analysis, and verify claims with SQLite caching."""
    if not req.identifier.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier cannot be empty.")

    try:
        response = await engine.summarize_paper(req, db)
        return response
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Paper intelligence failure: {e}")


@router.post("/upload")
async def upload_pdf_endpoint(
    file: UploadFile = File(...),
    topic: Optional[str] = Form(None),
):
    """Upload a research PDF file and extract full publication-grade Markdown, embedded figures, and sections."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are supported.")

    try:
        content_bytes = await file.read()
        if len(content_bytes) < 100:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty or corrupted.")

        parsed = markdown_engine.convert_pdf_to_markdown(content_bytes, filename=file.filename)
        clean_slug = re.sub(r"[^a-z0-9]+", "-", file.filename.lower())[:25]
        paper_id = f"upload-{clean_slug}"

        return {
            "status": "success",
            "paper": {
                "id": paper_id,
                "title": parsed["title"],
                "authors": parsed["authors"],
                "year": parsed["year"],
                "abstract": parsed["abstract"],
                "markdown": parsed["markdown"],
                "sections": parsed["sections"],
                "figures": parsed["figures"],
                "total_pages": parsed["total_pages"],
                "source": "Uploaded File",
                "pdf_url": None,
            }
        }
    except Exception as e:
        logger.error("[PaperUpload] Upload failed: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF parsing error: {e}")


def extract_clean_arxiv_id(s: str) -> Optional[str]:
    if not s:
        return None
    raw = s.strip()
    match = re.search(r"(\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+(?:\.[a-z]{2})?/\d{7})", raw, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


@router.post("/import-url")
async def import_paper_from_url_endpoint(req: ImportPaperUrlRequest):
    """Import research paper via arXiv ID (e.g. '2310.07240'), DOI (e.g. '10.1145/...'), or direct PDF URL, converting into full Markdown."""
    target_ident = req.identifier.strip()
    if not target_ident:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier cannot be empty.")

    try:
        pdf_bytes = None
        pdf_url = None
        title = target_ident
        authors = []
        year = 2024
        abstract = ""

        # 1. Check if an arXiv ID or arXiv URL
        arxiv_id = extract_clean_arxiv_id(target_ident)
        if arxiv_id or "arxiv.org" in target_ident.lower():
            clean_id = arxiv_id or target_ident.split("/abs/")[-1].split("/pdf/")[-1].replace(".pdf", "").strip()
            pdf_url = f"https://arxiv.org/pdf/{clean_id}.pdf"
            pdf_bytes = await pdf_extractor.fetch_pdf_bytes(pdf_url)

            # Try to fetch rich metadata from canonical resolver
            try:
                resolved = await resolver.resolve(clean_id)
                if resolved:
                    title = resolved.title or title
                    authors = [a.name for a in resolved.authors]
                    year = resolved.year or year
                    abstract = resolved.abstract or abstract
            except Exception as e:
                logger.warning("[PaperImport] Resolver metadata fetch error for arXiv ID %s: %s", clean_id, e)

        # 2. Check if direct URL to a PDF
        elif target_ident.lower().startswith("http://") or target_ident.lower().startswith("https://"):
            if target_ident.lower().endswith(".pdf") or "/pdf" in target_ident.lower():
                pdf_url = target_ident
                pdf_bytes = await pdf_extractor.fetch_pdf_bytes(pdf_url)
            else:
                # If generic web link, attempt canonical resolution
                resolved = await resolver.resolve(target_ident)
                if resolved and resolved.pdf_url:
                    pdf_url = resolved.pdf_url
                    pdf_bytes = await pdf_extractor.fetch_pdf_bytes(pdf_url)
                    title = resolved.title or title
                    authors = [a.name for a in resolved.authors]
                    year = resolved.year or year
                    abstract = resolved.abstract or abstract

        # 3. Resolve via generic DOI or title
        else:
            resolved = await resolver.resolve(target_ident)
            if resolved and resolved.pdf_url:
                pdf_url = resolved.pdf_url
                pdf_bytes = await pdf_extractor.fetch_pdf_bytes(pdf_url)
                title = resolved.title or title
                authors = [a.name for a in resolved.authors]
                year = resolved.year or year
                abstract = resolved.abstract or abstract

        if not pdf_bytes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Could not retrieve PDF bytes for '{target_ident}'. Please ensure the link is valid and open access, or upload the file directly."
            )

        parsed = markdown_engine.convert_pdf_to_markdown(pdf_bytes, filename=title)
        clean_slug = re.sub(r"[^a-z0-9]+", "-", (arxiv_id or target_ident).lower())[:25]
        paper_id = f"import-{clean_slug}"

        return {
            "status": "success",
            "paper": {
                "id": paper_id,
                "title": parsed["title"] or title,
                "authors": parsed["authors"] or authors or ["Authors listed in publication"],
                "year": parsed["year"] or year,
                "abstract": parsed["abstract"] or abstract,
                "markdown": parsed["markdown"],
                "sections": parsed["sections"],
                "figures": parsed["figures"],
                "total_pages": parsed["total_pages"],
                "source": "arXiv" if (arxiv_id or "arxiv" in target_ident.lower()) else "Imported URL",
                "pdf_url": pdf_url,
                "arxiv_id": arxiv_id or "",
                "url": target_ident if target_ident.startswith("http") else (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else f"https://doi.org/{target_ident}"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[PaperImport] Import failed: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Import error: {e}")

