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

router = APIRouter(prefix="/api/v1/paper", tags=["Paper Intelligence Engine"])
engine = PaperIntelligenceEngine()
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
    """Upload a research PDF file for native browser viewing and research analysis."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are supported.")

    try:
        content_bytes = await file.read()
        if len(content_bytes) < 100:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty or corrupted.")

        title = file.filename.replace(".pdf", "").replace("_", " ").title()
        total_pages = 1
        abstract = ""
        full_text = []
        try:
            import pymupdf as fitz
            doc = fitz.open(stream=content_bytes, filetype="pdf")
            total_pages = len(doc)
            meta_title = doc.metadata.get("title")
            if meta_title and len(meta_title.strip()) > 3:
                title = meta_title.strip()
            for page in doc:
                full_text.append(page.get_text("text"))
            if total_pages > 0:
                p0 = full_text[0] if full_text else ""
                if "Abstract" in p0:
                    abs_match = re.search(r"Abstract[:\s\n]+([\s\S]{100,1200}?)(?=\n\s*(?:1\.?|I\.?|Introduction|Index Terms|Keywords))", p0, re.IGNORECASE)
                    if abs_match:
                        abstract = re.sub(r"\s+", " ", abs_match.group(1).strip())
        except Exception as doc_err:
            logger.warning("[PaperUpload] Fast metadata extraction note: %s", doc_err)

        clean_slug = re.sub(r"[^a-z0-9]+", "-", file.filename.lower())[:25]
        paper_id = f"upload-{clean_slug}"
        markdown_content = "\n\n".join(full_text)

        return {
            "status": "success",
            "paper": {
                "id": paper_id,
                "title": title,
                "authors": ["Uploaded File Author(s)"],
                "affiliations": [],
                "year": 2024,
                "abstract": abstract,
                "total_pages": total_pages,
                "source": "Uploaded File",
                "pdf_url": None,
                "markdown": markdown_content,
            }
        }
    except Exception as e:
        logger.error("[PaperUpload] Upload failed: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF upload error: {e}")


def extract_clean_arxiv_id(s: str) -> Optional[str]:
    if not s:
        return None
    raw = s.strip()
    if raw.startswith("import-"):
        raw = raw[len("import-"):]
    raw = re.sub(r"(\d{4})-(\d{4,5})", r"\1.\2", raw)
    match = re.search(r"(\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+(?:\.[a-z]{2})?/\d{7})", raw, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


@router.post("/import-url")
async def import_paper_from_url_endpoint(req: ImportPaperUrlRequest):
    """Import research paper via arXiv ID (e.g. '2310.07240'), DOI (e.g. '10.1145/...'), or direct PDF URL for native PDF reading."""
    target_ident = req.identifier.strip()
    if not target_ident:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier cannot be empty.")

    try:
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

            try:
                resolved = await resolver.resolve(clean_id)
                if resolved:
                    title = resolved.title or title
                    authors = [a.name for a in resolved.authors]
                    year = resolved.year or year
                    abstract = resolved.abstract or abstract
                    if resolved.pdf_url:
                        pdf_url = resolved.pdf_url
            except Exception as e:
                logger.warning("[PaperImport] Resolver metadata fetch error for arXiv ID %s: %s", clean_id, e)

        # 2. Check if direct URL to a PDF
        elif target_ident.lower().startswith("http://") or target_ident.lower().startswith("https://"):
            if target_ident.lower().endswith(".pdf") or "/pdf" in target_ident.lower():
                pdf_url = target_ident
            try:
                resolved = await resolver.resolve(target_ident)
                if resolved:
                    title = resolved.title or title
                    authors = [a.name for a in resolved.authors]
                    year = resolved.year or year
                    abstract = resolved.abstract or abstract
                    if resolved.pdf_url:
                        pdf_url = resolved.pdf_url
            except Exception as e:
                logger.warning("[PaperImport] Resolver metadata fetch error: %s", e)

        # 3. Resolve via generic DOI or title
        else:
            try:
                resolved = await resolver.resolve(target_ident)
                if resolved:
                    title = resolved.title or title
                    authors = [a.name for a in resolved.authors]
                    year = resolved.year or year
                    abstract = resolved.abstract or abstract
                    if resolved.pdf_url:
                        pdf_url = resolved.pdf_url
            except Exception as e:
                logger.warning("[PaperImport] Resolver metadata fetch error: %s", e)

        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

        clean_slug = re.sub(r"[^a-z0-9]+", "-", (arxiv_id or target_ident).lower())[:25]
        paper_id = f"import-{clean_slug}"

        return {
            "status": "success",
            "paper": {
                "id": paper_id,
                "title": title,
                "authors": authors or ["Authors listed in publication"],
                "affiliations": [],
                "year": year,
                "abstract": abstract,
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


@router.get("/artifacts/{identifier:path}")
async def get_paper_artifacts_endpoint(identifier: str):
    """Fetch linked benchmarks (Papers with Code), code repositories (GitHub/CatalyzeX), and ML models/datasets (Hugging Face)."""
    clean_target = identifier.strip()
    if not clean_target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier cannot be empty.")

    clean_arxiv = extract_clean_arxiv_id(clean_target)
    title = clean_target if not clean_arxiv else None

    from src.engines.paperswithcode import PapersWithCodeClient
    pwc_client = PapersWithCodeClient()

    benchmarks_raw = await pwc_client.get_paper_benchmarks(arxiv_id=clean_arxiv, title=title)
    repos_raw = await pwc_client.get_code_repositories(arxiv_id=clean_arxiv, title=title)

    import httpx
    hf_models = []
    hf_datasets = []

    hf_headers = {"User-Agent": "ResearchCopilot/2.0"}
    async with httpx.AsyncClient(timeout=8.0, headers=hf_headers) as client:
        # A. ArXiv direct mapping if arXiv ID is available
        if clean_arxiv:
            try:
                hf_arxiv_url = f"https://huggingface.co/api/arxiv/{clean_arxiv}/repos"
                r = await client.get(hf_arxiv_url)
                if r.status_code == 200:
                    d = r.json()
                    for m in d.get("models", [])[:6]:
                        hf_models.append({
                            "id": m.get("id"),
                            "name": m.get("id"),
                            "pipeline_tag": m.get("pipeline_tag") or "Model",
                            "downloads": m.get("downloads", 0),
                            "likes": m.get("likes", 0),
                            "url": f"https://huggingface.co/{m.get('id')}",
                        })
                    for ds in d.get("datasets", [])[:6]:
                        hf_datasets.append({
                            "id": ds.get("id"),
                            "name": ds.get("id"),
                            "downloads": ds.get("downloads", 0),
                            "likes": ds.get("likes", 0),
                            "url": f"https://huggingface.co/datasets/{ds.get('id')}",
                        })
            except Exception as e:
                logger.debug("[HF] Direct arXiv lookup notice: %s", e)

        # B. If no direct models/datasets found, search HF by title/keyword
        if not hf_models and not hf_datasets:
            search_query = clean_arxiv or (clean_target[:40] if len(clean_target) > 5 else None)
            if search_query:
                try:
                    m_resp = await client.get("https://huggingface.co/api/models", params={"search": search_query, "limit": 4})
                    if m_resp.status_code == 200:
                        for m in m_resp.json():
                            hf_models.append({
                                "id": m.get("id"),
                                "name": m.get("id"),
                                "pipeline_tag": m.get("pipeline_tag") or "Model",
                                "downloads": m.get("downloads", 0),
                                "likes": m.get("likes", 0),
                                "url": f"https://huggingface.co/{m.get('id')}",
                            })
                    d_resp = await client.get("https://huggingface.co/api/datasets", params={"search": search_query, "limit": 4})
                    if d_resp.status_code == 200:
                        for ds in d_resp.json():
                            hf_datasets.append({
                                "id": ds.get("id"),
                                "name": ds.get("id"),
                                "downloads": ds.get("downloads", 0),
                                "likes": ds.get("likes", 0),
                                "url": f"https://huggingface.co/datasets/{ds.get('id')}",
                            })
                except Exception as e:
                    logger.debug("[HF] Search lookup notice: %s", e)

    benchmarks_out = []
    for b in benchmarks_raw:
        benchmarks_out.append({
            "task": b.task,
            "dataset": b.dataset,
            "metric": b.metric,
            "value": b.value,
            "model": b.model,
            "source": b.source,
            "repository_url": b.repository_url,
        })

    repos_out = []
    for r in repos_raw:
        repos_out.append({
            "url": r.url,
            "is_official": r.is_official,
            "framework": r.framework or "PyTorch",
            "stars": r.stars or 0,
        })

    return {
        "identifier": clean_target,
        "arxiv_id": clean_arxiv,
        "benchmarks": benchmarks_out,
        "code_repositories": repos_out,
        "hf_models": hf_models,
        "hf_datasets": hf_datasets,
        "total_artifacts": len(benchmarks_out) + len(repos_out) + len(hf_models) + len(hf_datasets),
    }

