"""
Domain 1: Literature Discovery MCP Tools.
Tools:
  - search_literature: Unified multi-source scientific search across 8+ databases.
  - resolve_paper: Canonical metadata & open-access resolution.
  - get_paper_citations: Forward and backward citation expansion with PageRank.
"""
import asyncio
import json
import re
from typing import Any, Dict, List, Optional
import httpx
import networkx as nx
from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import Author, Paper
from src.engines.access_resolver import AccessResolver
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.citation_graph import CitationGraphEngine
from src.engines.multi_provider_search import MultiProviderSearchEngine
from src.engines.paper_rank import PaperRankEngine
from src.api.routes_search import deduplicate_papers


# Shared singleton search & resolution engines
_resolver = AccessResolver()
_canonical_resolver = CanonicalPaperResolver()
_citation_engine = CitationGraphEngine()
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
            tasks = await client.search_tasks(query, limit=limit)
            out = []
            for t in tasks:
                task_id = t.get("id") or "task"
                name = t.get("name") or task_id
                desc = t.get("description") or f"Evaluation benchmarks for {name}."
                out.append(Paper(
                    id=f"pwc:{task_id}",
                    title=f"Benchmark Task: {name}",
                    abstract=desc,
                    authors=[],
                    year=None,
                    url=t.get("url") or f"https://paperswithcode.com/task/{task_id}",
                    pdf_url=None,
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


def generate_bibtex(
    canonical_id: str,
    title: str,
    authors: List[str],
    year: Optional[int],
    doi: Optional[str] = None,
    url: Optional[str] = None,
) -> str:
    """Generate clean, publication-ready BibTeX citation."""
    first_author = authors[0].split()[-1].lower() if authors else "anonymous"
    clean_author = re.sub(r"[^a-z0-9]", "", first_author) or "paper"
    cite_year = year or 2024
    clean_id = re.sub(r"[^a-zA-Z0-9]", "", canonical_id.split(":")[-1])[:6]
    cite_key = f"{clean_author}{cite_year}_{clean_id}"

    fields = [
        f"  title = {{{title}}}",
        f"  author = {{{' and '.join(authors) if authors else 'Unknown'}}}",
        f"  year = {{{cite_year}}}",
    ]
    if doi:
        fields.append(f"  doi = {{{doi}}}")
    if url:
        fields.append(f"  url = {{{url}}}")

    return f"@article{{{cite_key},\n" + ",\n".join(fields) + "\n}"


RESOLVE_PAPER_METADATA = {
    "name": "resolve_paper",
    "description": (
        "Resolves any paper identifier (DOI, arXiv ID, PubMed ID, OpenAlex ID, URL, or title) "
        "into a canonical record, verifying open-access PDF availability and generating formatted BibTeX."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "identifier": {
                "type": "string",
                "description": "Paper DOI (e.g. '10.1145/3394486.3403177'), arXiv ID (e.g. '1706.03762'), PMID, or URL",
            },
        },
        "required": ["identifier"],
    },
}


async def handle_resolve_paper(arguments: Dict[str, Any]) -> str:
    """Resolve an identifier into canonical metadata and formatted BibTeX."""
    identifier = arguments.get("identifier", "").strip()
    if not identifier:
        raise ValueError("Field 'identifier' is required and cannot be empty.")

    logger.info("[MCP resolve_paper] Resolving identifier: '%s'", identifier)
    canonical = await _canonical_resolver.resolve(identifier)
    if not canonical:
        return json.dumps({
            "success": False,
            "error": f"Paper identifier '{identifier}' could not be resolved across scientific databases.",
        }, indent=2)

    authors_list = [a.name for a in (canonical.authors or []) if hasattr(a, "name")]
    primary_url = canonical.pdf_url or (
        f"https://doi.org/{canonical.doi}" if canonical.doi
        else (f"https://arxiv.org/abs/{canonical.arxiv_id}" if canonical.arxiv_id else "")
    )

    bibtex = generate_bibtex(
        canonical_id=canonical.canonical_id,
        title=canonical.title,
        authors=authors_list,
        year=canonical.year,
        doi=canonical.doi,
        url=primary_url,
    )

    payload = {
        "success": True,
        "canonical_id": canonical.canonical_id,
        "title": canonical.title,
        "abstract": canonical.abstract or "",
        "authors": authors_list,
        "year": canonical.year,
        "venue": canonical.venue,
        "doi": canonical.doi,
        "arxiv_id": canonical.arxiv_id,
        "openalex_id": canonical.openalex_id,
        "pdf_url": canonical.pdf_url,
        "is_open_access": bool(canonical.is_open_access or canonical.pdf_url),
        "citation_count": canonical.citation_count or 0,
        "bibtex": bibtex,
    }
    return json.dumps(payload, indent=2)


GET_PAPER_CITATIONS_METADATA = {
    "name": "get_paper_citations",
    "description": (
        "Expands the citation network of a paper, retrieving forward citations (papers that cited this work) "
        "and backward references (prior works cited by this paper) with PageRank prestige scores."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "paper_id": {
                "type": "string",
                "description": "Paper identifier (DOI, arXiv ID, OpenAlex ID, or title)",
            },
            "direction": {
                "type": "string",
                "enum": ["forward", "backward", "both"],
                "description": "Direction of citation traversal: 'forward' (citations), 'backward' (references), or 'both'. Default: 'both'.",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of citations to retrieve per direction (default: 15, max: 50).",
            },
        },
        "required": ["paper_id"],
    },
}


async def handle_get_paper_citations(arguments: Dict[str, Any]) -> str:
    """Retrieve forward and backward citation network with PageRank scores."""
    paper_id = arguments.get("paper_id", "").strip()
    if not paper_id:
        raise ValueError("Field 'paper_id' is required and cannot be empty.")

    direction = (arguments.get("direction") or "both").lower()
    limit = max(1, min(int(arguments.get("limit", 15)), 50))

    logger.info("[MCP get_paper_citations] Expanding citations for '%s' (direction=%s, limit=%d)", paper_id, direction, limit)

    canonical = await _canonical_resolver.resolve(paper_id)
    if not canonical:
        return json.dumps({
            "success": False,
            "error": f"Seed paper '{paper_id}' could not be resolved across scientific databases.",
        }, indent=2)

    # Convert to Paper object for citation engine
    author_objs = [Author(name=a.name) for a in (canonical.authors or []) if hasattr(a, "name")]
    seed_paper = Paper(
        id=canonical.canonical_id,
        title=canonical.title,
        abstract=canonical.abstract or "",
        authors=author_objs,
        year=canonical.year,
        doi=canonical.doi,
        arxiv_id=canonical.arxiv_id,
        openalex_id=canonical.openalex_id,
        citation_count=canonical.citation_count or 0,
        is_open_access=canonical.is_open_access,
        pdf_url=canonical.pdf_url,
    )

    references_list: List[Dict[str, Any]] = []
    citations_list: List[Dict[str, Any]] = []

    # Extract referenced_works if already attached to canonical sources
    if hasattr(canonical, "sources") and canonical.sources:
        for s in canonical.sources:
            if hasattr(s, "raw_metadata") and isinstance(s.raw_metadata, dict):
                rw = s.raw_metadata.get("referenced_works")
                if rw:
                    seed_paper.referenced_works = rw
                    break

    # Query OpenAlex for work details if openalex_id or doi available
    oa_id = _citation_engine._extract_openalex_id(seed_paper)
    if not oa_id and seed_paper.doi:
        clean_doi = seed_paper.doi.strip()
        try:
            async with httpx.AsyncClient(timeout=6.0, headers=_citation_engine.headers) as client:
                resp = await client.get(f"{settings.openalex_base_url}/works/https://doi.org/{clean_doi}")
                if resp.status_code == 200:
                    work_data = resp.json()
                    oa_id = _citation_engine.normalize_node_id(work_data.get("id"))
                    seed_paper.referenced_works = work_data.get("referenced_works", [])
                    seed_paper.openalex_id = oa_id
        except Exception as e:
            logger.debug("[MCP get_paper_citations] DOI lookup notice: %s", e)
    elif oa_id and not seed_paper.referenced_works and direction in ("backward", "both"):
        try:
            async with httpx.AsyncClient(timeout=6.0, headers=_citation_engine.headers) as client:
                resp = await client.get(f"{settings.openalex_base_url}/works/{oa_id}")
                if resp.status_code == 200:
                    work_data = resp.json()
                    seed_paper.referenced_works = work_data.get("referenced_works", [])
        except Exception as e:
            logger.debug("[MCP get_paper_citations] Work referenced_works lookup notice: %s", e)

    # Perform directed fetch
    async with httpx.AsyncClient(timeout=8.0, headers=_citation_engine.headers) as client:
        tasks = []
        if direction in ("forward", "both") and oa_id:
            tasks.append(_citation_engine._fetch_citing_works(client, oa_id, limit=limit))
        else:
            tasks.append(asyncio.sleep(0, result=[]))

        if direction in ("backward", "both") and seed_paper.referenced_works:
            tasks.append(_citation_engine._fetch_referenced_works(client, seed_paper.referenced_works[:limit]))
        else:
            tasks.append(asyncio.sleep(0, result=[]))

        res_citing, res_refs = await asyncio.gather(*tasks, return_exceptions=True)

        if isinstance(res_citing, list):
            for item in res_citing:
                p_obj = _citation_engine._parse_openalex_work(item)
                if p_obj:
                    citations_list.append({
                        "id": p_obj.id,
                        "title": p_obj.title,
                        "authors": [a.name for a in p_obj.authors],
                        "year": p_obj.year,
                        "citation_count": p_obj.citation_count,
                        "doi": p_obj.doi,
                        "is_open_access": p_obj.is_open_access,
                    })

        if isinstance(res_refs, list):
            for item in res_refs:
                p_obj = _citation_engine._parse_openalex_work(item)
                if p_obj:
                    references_list.append({
                        "id": p_obj.id,
                        "title": p_obj.title,
                        "authors": [a.name for a in p_obj.authors],
                        "year": p_obj.year,
                        "citation_count": p_obj.citation_count,
                        "doi": p_obj.doi,
                        "is_open_access": p_obj.is_open_access,
                    })

    # Build local graph for PageRank scoring
    g = nx.DiGraph()
    clean_seed_id = _citation_engine.normalize_node_id(seed_paper.id)
    g.add_node(clean_seed_id, title=seed_paper.title, citations=seed_paper.citation_count)

    for c in citations_list:
        cid = _citation_engine.normalize_node_id(c["id"])
        g.add_node(cid, title=c["title"], citations=c["citation_count"])
        g.add_edge(cid, clean_seed_id)  # citing -> seed

    for r in references_list:
        rid = _citation_engine.normalize_node_id(r["id"])
        g.add_node(rid, title=r["title"], citations=r["citation_count"])
        g.add_edge(clean_seed_id, rid)  # seed -> reference

    prestige_map = _citation_engine.calculate_prestige(g)

    # Attach prestige scores
    for c in citations_list:
        cid = _citation_engine.normalize_node_id(c["id"])
        c["prestige_score"] = round(prestige_map.get(cid, 0.0), 2)

    for r in references_list:
        rid = _citation_engine.normalize_node_id(r["id"])
        r["prestige_score"] = round(prestige_map.get(rid, 0.0), 2)

    citations_list.sort(key=lambda x: (x.get("prestige_score", 0), x.get("citation_count", 0)), reverse=True)
    references_list.sort(key=lambda x: (x.get("prestige_score", 0), x.get("citation_count", 0)), reverse=True)

    payload = {
        "success": True,
        "seed_paper": {
            "id": seed_paper.id,
            "title": seed_paper.title,
            "year": seed_paper.year,
            "citation_count": seed_paper.citation_count,
            "prestige_score": round(prestige_map.get(clean_seed_id, 0.0), 2),
        },
        "direction": direction,
        "total_citations_found": len(citations_list),
        "total_references_found": len(references_list),
        "citations": citations_list,
        "references": references_list,
        "graph_topology": {
            "total_nodes": g.number_of_nodes(),
            "total_edges": g.number_of_edges(),
        },
    }
    return json.dumps(payload, indent=2)
