import asyncio
import re
import time
import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db
from src.core.logger import logger
from src.core.models import SessionModel
from src.core.schemas import Paper, PaperAccessResponse, PaperSection
from src.engines.access_resolver import AccessResolver
from src.engines.multi_provider_search import MultiProviderSearchEngine
from src.engines.pdf_parser import PDFSectionExtractor

router = APIRouter(prefix="/api/v1", tags=["Search & Paper Access"])
resolver = AccessResolver()
multi_search = MultiProviderSearchEngine()
pdf_extractor = PDFSectionExtractor()


def normalize_doi(doi: Optional[str]) -> Optional[str]:
    if not doi:
        return None
    d = str(doi).lower().strip()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    d = re.sub(r"^doi:\s*", "", d)
    return d.strip() or None


def normalize_arxiv_id(arxiv_id: Optional[str]) -> Optional[str]:
    if not arxiv_id:
        return None
    a = str(arxiv_id).lower().strip()
    a = re.sub(r"^arxiv:\s*", "", a)
    a = re.sub(r"v\d+$", "", a)  # remove version suffix
    return a.strip() or None


def normalize_title(title: Optional[str]) -> str:
    if not title:
        return ""
    t = str(title).lower()
    t = re.sub(r"[^\w\s]", "", t)
    return " ".join(t.split())


def deduplicate_papers(raw_papers: List[Paper]) -> List[Paper]:
    """Smartly merge duplicate records across multiple scientific repositories."""
    merged_pool: Dict[str, Paper] = {}
    doi_map: Dict[str, str] = {}
    arxiv_map: Dict[str, str] = {}
    title_map: Dict[str, str] = {}

    for p in raw_papers:
        clean_doi = normalize_doi(p.doi)
        clean_arxiv = normalize_arxiv_id(p.arxiv_id)
        clean_title = normalize_title(p.title)

        existing_key = None
        if clean_doi and clean_doi in doi_map:
            existing_key = doi_map[clean_doi]
        elif clean_arxiv and clean_arxiv in arxiv_map:
            existing_key = arxiv_map[clean_arxiv]
        elif clean_title and len(clean_title) > 10 and clean_title in title_map:
            existing_key = title_map[clean_title]

        if existing_key and existing_key in merged_pool:
            target = merged_pool[existing_key]
            # Merge fields cleanly
            if not target.pdf_url and p.pdf_url:
                target.pdf_url = p.pdf_url
            if not target.abstract and p.abstract:
                target.abstract = p.abstract
            elif p.abstract and len(p.abstract) > len(target.abstract or ""):
                target.abstract = p.abstract
            if (p.citation_count or 0) > (target.citation_count or 0):
                target.citation_count = p.citation_count
            if not target.doi and clean_doi:
                target.doi = clean_doi
            if not target.arxiv_id and clean_arxiv:
                target.arxiv_id = clean_arxiv
            if p.topics:
                combined_topics = list(set((target.topics or []) + p.topics))
                target.topics = combined_topics
            if not target.year and p.year:
                target.year = p.year
            # Register aliases
            if clean_doi:
                doi_map[clean_doi] = existing_key
            if clean_arxiv:
                arxiv_map[clean_arxiv] = existing_key
            if clean_title:
                title_map[clean_title] = existing_key
        else:
            primary_key = clean_doi or clean_arxiv or clean_title or p.id
            p.doi = clean_doi or p.doi
            p.arxiv_id = clean_arxiv or p.arxiv_id
            merged_pool[primary_key] = p
            if clean_doi:
                doi_map[clean_doi] = primary_key
            if clean_arxiv:
                arxiv_map[clean_arxiv] = primary_key
            if clean_title:
                title_map[clean_title] = primary_key

    return list(merged_pool.values())


class UnifiedSearchRequest(BaseModel):
    query: str
    limit_per_source: int = 10
    sources: Optional[List[str]] = ["openalex", "arxiv", "europepmc", "semanticscholar"]
    session_id: Optional[str] = None


class UnifiedSearchResponse(BaseModel):
    session_id: str
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
async def search_unified_endpoint(req: UnifiedSearchRequest, db: AsyncSession = Depends(get_db)):
    """Parallel multi-source unified search with automated deduplication and detailed session tracking."""
    start_time = time.time()
    logger.info("==================================================")
    logger.info("[UNIFIED SEARCH] Initiating parallel search for query: '%s'", req.query)
    
    session_id = req.session_id or f"sess-{uuid.uuid4().hex[:8]}"
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

    all_raw_papers: List[Paper] = []
    source_breakdown = {}

    for source_name, res in zip(task_keys, results):
        if isinstance(res, Exception):
            logger.error("[UNIFIED SEARCH] Source '%s' FAILED with error: %s", source_name, res)
            source_breakdown[source_name] = 0
        elif isinstance(res, list):
            logger.info("[UNIFIED SEARCH] Source '%s' SUCCEEDED -> Found %d papers", source_name, len(res))
            source_breakdown[source_name] = len(res)
            all_raw_papers.extend(res)
        else:
            logger.warning("[UNIFIED SEARCH] Source '%s' returned unexpected format: %s", source_name, type(res))
            source_breakdown[source_name] = 0

    # Strict multi-key deduplication
    unique_papers = deduplicate_papers(all_raw_papers)
    duration_ms = (time.time() - start_time) * 1000.0
    logger.info("[UNIFIED SEARCH] Complete: %d raw -> %d unique papers in %.1f ms across sources: %s",
                len(all_raw_papers), len(unique_papers), duration_ms, source_breakdown)
    logger.info("==================================================")

    # Automatically populate the research graph with search results and hierarchical topic head node
    try:
        from src.api.routes_graph import graph_store
        from src.graph.builder import GraphBuilder
        builder = GraphBuilder(store=graph_store)
        await builder.build_topic_subgraph(topic=req.query, papers=unique_papers[:15], clear_existing=True)
    except Exception as graph_err:
        logger.warning("Could not auto-ingest papers into graph store: %s", graph_err)

    # Persist or update session in SQLite
    try:
        existing_sess = await db.get(SessionModel, session_id)
        if not existing_sess:
            new_session = SessionModel(
                id=session_id,
                query=req.query,
                status="completed",
                state_json={"total_papers": len(unique_papers), "sources": sources, "duration_ms": duration_ms}
            )
            db.add(new_session)
        else:
            existing_sess.query = req.query
            existing_sess.status = "completed"
            existing_sess.state_json = {"total_papers": len(unique_papers), "sources": sources, "duration_ms": duration_ms}
        await db.commit()
    except Exception as db_err:
        logger.warning("Could not persist session record: %s", db_err)

    return UnifiedSearchResponse(
        session_id=session_id,
        query=req.query,
        total_unique_papers=len(unique_papers),
        sources_searched=sources,
        source_breakdown=source_breakdown,
        papers=unique_papers
    )


