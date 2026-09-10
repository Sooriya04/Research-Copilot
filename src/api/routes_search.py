import asyncio
import re
import time
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from src.core.logger import logger
from src.core.schemas import Paper, PaperAccessResponse, PaperSection
from src.engines.access_resolver import AccessResolver
from src.engines.multi_provider_search import MultiProviderSearchEngine
from src.engines.pdf_parser import PDFSectionExtractor

router = APIRouter(prefix="/api/v1", tags=["Search & Paper Access"])
resolver = AccessResolver()
multi_search = MultiProviderSearchEngine()
pdf_extractor = PDFSectionExtractor()

class UnifiedSearchRequest(BaseModel):
    query: str
    limit_per_source: int = 10
    sources: Optional[List[str]] = ["openalex", "arxiv", "europepmc", "semanticscholar"]

class UnifiedSearchResponse(BaseModel):
    query: str
    total_unique_papers: int
    sources_searched: List[str]
    source_breakdown: Dict[str, int]
    papers: List[Paper]

@router.get("/paper/{identifier:path}/sections", response_model=List[PaperSection])
async def get_paper_sections(identifier: str):
    """Fetch PDF and extract structured section content for a paper."""
    res = await resolver.resolve_identifier(identifier)
    if not res.paper:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Paper '{identifier}' not found.")
    
    if res.paper.pdf_url:
        sections = await pdf_extractor.fetch_and_parse_pdf(res.paper.pdf_url)
        if sections:
            return sections

    return [
        PaperSection(title="Abstract", content=res.paper.abstract, section_type="abstract")
    ]

@router.get("/paper/{identifier:path}", response_model=PaperAccessResponse)
async def resolve_paper_endpoint(identifier: str, fetch_full_text: bool = Query(default=False)):
    """Resolve a paper identifier (DOI, arXiv, OpenAlex, PMID) and find legal open-access candidates."""
    if not identifier.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier cannot be empty.")
    return await resolver.resolve_identifier(identifier)

@router.get("/search/openalex")
async def search_openalex_endpoint(q: str = Query(..., min_length=1), limit: int = Query(default=25, le=100)):
    """Direct search on OpenAlex index."""
    papers = await resolver.search_openalex(q, limit=limit)
    return {"query": q, "count": len(papers), "papers": papers}

@router.get("/search/arxiv")
async def search_arxiv_endpoint(q: str = Query(..., min_length=1), limit: int = Query(default=25, le=100)):
    """Direct search on arXiv index."""
    papers = await resolver.search_arxiv(q, limit=limit)
    return {"query": q, "count": len(papers), "papers": papers}

@router.get("/search/europepmc")
@router.get("/search/pubmed")
async def search_europepmc_endpoint(q: str = Query(..., min_length=1), limit: int = Query(default=25, le=100)):
    """Direct search on Europe PMC / PubMed index."""
    papers = await multi_search.search_europepmc(q, limit=limit)
    return {"query": q, "count": len(papers), "papers": papers}

@router.get("/search/crossref")
async def search_crossref_endpoint(q: str = Query(..., min_length=1), limit: int = Query(default=25, le=100)):
    """Direct search on Crossref publisher metadata."""
    papers = await multi_search.search_crossref(q, limit=limit)
    return {"query": q, "count": len(papers), "papers": papers}

@router.get("/search/semanticscholar")
async def search_semanticscholar_endpoint(q: str = Query(..., min_length=1), limit: int = Query(default=25, le=100)):
    """Direct search on Semantic Scholar academic graph."""
    papers = await multi_search.search_semanticscholar(q, limit=limit)
    return {"query": q, "count": len(papers), "papers": papers}

@router.get("/search/huggingface")
async def search_huggingface_endpoint(q: str = Query(..., min_length=1), limit: int = Query(default=20, le=50)):
    """Direct search on Hugging Face models and datasets."""
    artifacts = await multi_search.search_huggingface(q, limit=limit)
    return {"query": q, "count": len(artifacts), "artifacts": artifacts}

@router.post("/search/unified", response_model=UnifiedSearchResponse)
async def search_unified_endpoint(req: UnifiedSearchRequest):
    """Parallel multi-source unified search with automated deduplication and detailed logging."""
    start_time = time.time()
    logger.info("==================================================")
    logger.info("[UNIFIED SEARCH] Initiating parallel search for query: '%s'", req.query)
    
    sources = req.sources or ["openalex", "arxiv", "europepmc", "semanticscholar"]
    source_tasks = {}

    if "openalex" in sources:
        source_tasks["openalex"] = resolver.search_openalex(req.query, limit=req.limit_per_source)
    if "arxiv" in sources:
        source_tasks["arxiv"] = resolver.search_arxiv(req.query, limit=req.limit_per_source)
    if "europepmc" in sources or "pubmed" in sources:
        source_tasks["europepmc"] = multi_search.search_europepmc(req.query, limit=req.limit_per_source)
    if "semanticscholar" in sources:
        source_tasks["semanticscholar"] = multi_search.search_semanticscholar(req.query, limit=req.limit_per_source)

    task_keys = list(source_tasks.keys())
    results = await asyncio.gather(*source_tasks.values(), return_exceptions=True)

    pool: Dict[str, Paper] = {}
    source_breakdown = {}

    for source_name, res in zip(task_keys, results):
        if isinstance(res, Exception):
            logger.error("[UNIFIED SEARCH] Source '%s' FAILED with error: %s", source_name, res)
            source_breakdown[source_name] = 0
        elif isinstance(res, list):
            logger.info("[UNIFIED SEARCH] Source '%s' SUCCEEDED -> Found %d papers", source_name, len(res))
            source_breakdown[source_name] = len(res)
            for p in res:
                key = p.doi or p.arxiv_id or re.sub(r"[^\w]", "", p.title.lower())
                if key not in pool:
                    pool[key] = p
                elif not pool[key].pdf_url and p.pdf_url:
                    pool[key].pdf_url = p.pdf_url
        else:
            logger.warning("[UNIFIED SEARCH] Source '%s' returned unexpected format: %s", source_name, type(res))
            source_breakdown[source_name] = 0

    papers = list(pool.values())
    duration_ms = (time.time() - start_time) * 1000.0
    logger.info("[UNIFIED SEARCH] Complete: %d unique papers aggregated in %.1f ms across sources: %s",
                len(papers), duration_ms, source_breakdown)
    logger.info("==================================================")

    return UnifiedSearchResponse(
        query=req.query,
        total_unique_papers=len(papers),
        sources_searched=sources,
        source_breakdown=source_breakdown,
        papers=papers
    )
