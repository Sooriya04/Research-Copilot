"""
Domain 1: Literature Discovery MCP Tools.
Tools:
  - search_literature: Unified multi-source scientific search across 8+ databases.
  - resolve_paper: (Coming next) Canonical metadata & open-access resolution.
  - get_paper_citations: (Coming next) Forward and backward citation expansion.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.core.schemas import Paper
from src.engines.access_resolver import AccessResolver
from src.engines.multi_provider_search import MultiProviderSearchEngine
from src.engines.paper_rank import PaperRankEngine
from src.api.routes_search import deduplicate_papers


# Shared singleton search engines
_resolver = AccessResolver()
_multi_search = MultiProviderSearchEngine()
_rank_engine = PaperRankEngine()


SEARCH_LITERATURE_METADATA = {
    "name": "search_literature",
    "description": (
        "Search scientific literature across arXiv, OpenAlex, Semantic Scholar, CrossRef, Europe PMC, "
        "and Hugging Face. Deduplicates across sources, applies relevance filtering, and ranks "
        "results using PaperRank."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Scientific search query or research topic (e.g. 'sparse mixture of experts routing stability')",
            },
            "sources": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Databases to query. Supported: 'arxiv', 'openalex', 'semanticscholar', "
                    "'crossref', 'europepmc', 'pubmed', 'huggingface', 'paperswithcode'. "
                    "Defaults to ['arxiv', 'openalex', 'semanticscholar']."
                ),
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of ranked papers to return (default: 10, max: 50).",
            },
            "year_start": {
                "type": "integer",
                "description": "Filter by minimum publication year (optional).",
            },
            "year_end": {
                "type": "integer",
                "description": "Filter by maximum publication year (optional).",
            },
        },
        "required": ["query"],
    },
}


async def handle_search_literature(arguments: Dict[str, Any]) -> str:
    """Execute federated multi-source search and return structured JSON."""
    query = arguments.get("query", "").strip()
    if not query:
        raise ValueError("Field 'query' is required and cannot be empty.")

    requested_sources = arguments.get("sources") or ["arxiv", "openalex", "semanticscholar"]
    limit = max(1, min(int(arguments.get("limit", 10)), 50))
    year_start = arguments.get("year_start")
    year_end = arguments.get("year_end")

    logger.info("[MCP search_literature] Executing query='%s' sources=%s limit=%d", query, requested_sources, limit)

    source_tasks = {}
    if "openalex" in requested_sources:
        source_tasks["openalex"] = asyncio.wait_for(_resolver.search_openalex(query, limit=limit), timeout=8.0)
    if "arxiv" in requested_sources:
        source_tasks["arxiv"] = asyncio.wait_for(_resolver.search_arxiv(query, limit=limit), timeout=8.0)
    if "europepmc" in requested_sources or "pubmed" in requested_sources:
        source_tasks["europepmc"] = asyncio.wait_for(_multi_search.search_europepmc(query, limit=limit), timeout=8.0)
    if "semanticscholar" in requested_sources:
        source_tasks["semanticscholar"] = asyncio.wait_for(_multi_search.search_semanticscholar(query, limit=limit), timeout=8.0)
    if "crossref" in requested_sources:
        source_tasks["crossref"] = asyncio.wait_for(_multi_search.search_crossref(query, limit=limit), timeout=8.0)
    if "huggingface" in requested_sources:
        async def _hf_wrapper():
            hf_items = await _multi_search.search_huggingface(query, limit=limit)
            out = []
            for item in hf_items:
                out.append(Paper(
                    id=f"hf:{item.get('id')}",
                    title=f"HuggingFace: {item.get('id')}",
                    abstract=f"Hugging Face repository ({item.get('pipeline_tag') or 'ML model'}). Likes: {item.get('likes', 0)}.",
                    authors=[],
                    primary_source="huggingface",
                    url=item.get("url"),
                    is_open_access=True,
                ))
            return out
        source_tasks["huggingface"] = asyncio.wait_for(_hf_wrapper(), timeout=8.0)
    if "paperswithcode" in requested_sources:
        async def _pwc_wrapper():
            from src.engines.paperswithcode import PapersWithCodeClient
            client = PapersWithCodeClient()
            pwc_papers = await client.search_papers(query, limit=limit)
            out = []
            for p in pwc_papers:
                out.append(Paper(
                    id=f"pwc:{p.id}",
                    title=p.title,
                    abstract=p.abstract or "Papers with Code benchmark entry.",
                    authors=[],
                    year=p.published_year,
                    url=p.url,
                    pdf_url=p.pdf_url,
                    primary_source="paperswithcode",
                    is_open_access=True,
                ))
            return out
        source_tasks["paperswithcode"] = asyncio.wait_for(_pwc_wrapper(), timeout=8.0)

    results = await asyncio.gather(*source_tasks.values(), return_exceptions=True)

    all_papers: List[Paper] = []
    source_stats = {}
    for source_name, res in zip(source_tasks.keys(), results):
        if isinstance(res, Exception):
            logger.warning("[MCP search_literature] Source '%s' error: %s", source_name, res)
            source_stats[source_name] = 0
        elif isinstance(res, list):
            source_stats[source_name] = len(res)
            all_papers.extend(res)
        else:
            source_stats[source_name] = 0

    # Deduplicate across sources
    unique_papers = deduplicate_papers(all_papers)

    # Filter by publication year if requested
    if year_start is not None:
        unique_papers = [p for p in unique_papers if p.year is None or p.year >= int(year_start)]
    if year_end is not None:
        unique_papers = [p for p in unique_papers if p.year is None or p.year <= int(year_end)]

    # Score with PaperRank
    try:
        ranked_papers = _rank_engine.score_paper_list(unique_papers, query)
    except Exception as e:
        logger.warning("[MCP search_literature] PaperRank scoring fallback: %s", e)
        ranked_papers = unique_papers

    top_papers = ranked_papers[:limit]

    formatted_papers = []
    for p in top_papers:
        author_names = [a.name for a in (p.authors or []) if hasattr(a, "name")]
        formatted_papers.append({
            "id": p.id,
            "title": p.title,
            "abstract": p.abstract or "",
            "authors": author_names,
            "year": p.year,
            "venue": p.venue,
            "citation_count": p.citation_count or 0,
            "doi": p.doi,
            "arxiv_id": p.arxiv_id,
            "pdf_url": p.pdf_url,
            "is_open_access": bool(p.is_open_access or p.pdf_url),
            "primary_source": p.primary_source,
            "rank_score": getattr(p, "rank_score", 0.0),
        })

    payload = {
        "query": query,
        "total_results": len(formatted_papers),
        "source_breakdown": source_stats,
        "papers": formatted_papers,
    }
    return json.dumps(payload, indent=2)
