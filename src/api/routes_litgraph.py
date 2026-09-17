"""
LitGraph — ConnectedPapers-style bibliometric similarity graph engine.
Powered by Semantic Scholar Academic Graph API.
"""

import asyncio
import hashlib
import time
from typing import Any, Dict, List, Optional, Set, Tuple
from functools import lru_cache

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/litgraph", tags=["LitGraph — Bibliometric Similarity"])

# ── In-memory LRU-style cache (ttl = 10 minutes) ─────────────────────────────
_CACHE: Dict[str, Tuple[float, Any]] = {}
_CACHE_TTL = 600  # seconds


def _cache_get(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: Any):
    _CACHE[key] = (time.time(), value)
    # Evict oldest entries if cache grows too large
    if len(_CACHE) > 200:
        oldest = sorted(_CACHE.items(), key=lambda x: x[1][0])[:50]
        for k, _ in oldest:
            del _CACHE[k]


# ── Semantic Scholar API ──────────────────────────────────────────────────────
S2_BASE = "https://api.semanticscholar.org/graph/v1"
S2_FIELDS_PAPER = "title,year,citationCount,authors,abstract,references,externalIds"
S2_FIELDS_SEARCH = "paperId,title,year,authors,citationCount,abstract"
TIMEOUT = 18.0
MAX_CANDIDATES = 45
SIMILARITY_THRESHOLD = 0.08
TOP_K_NEIGHBORS = 4


async def s2_get(client: httpx.AsyncClient, path: str, params: dict) -> dict:
    """Fetch from Semantic Scholar with retry on 429."""
    for attempt in range(3):
        try:
            resp = await client.get(f"{S2_BASE}{path}", params=params, timeout=TIMEOUT)
            if resp.status_code == 429:
                await asyncio.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException:
            if attempt == 2:
                raise
            await asyncio.sleep(1)
    return {}


# ── Pydantic Schemas ──────────────────────────────────────────────────────────
class LitGraphNode(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    citationCount: int = 0
    authors: List[str] = []
    abstract: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    isSeed: bool = False
    references: List[str] = []  # kept for client-side tooltips


class LitGraphLink(BaseModel):
    source: str
    target: str
    weight: float  # Jaccard similarity score [0,1]


class LitGraphResponse(BaseModel):
    seed_id: str
    seed_title: str
    nodes: List[LitGraphNode]
    links: List[LitGraphLink]
    stats: Dict[str, Any] = {}


class SearchResult(BaseModel):
    paperId: str
    title: str
    year: Optional[int] = None
    authors: List[str] = []
    citationCount: int = 0
    abstract: Optional[str] = None


# ── Jaccard Similarity ────────────────────────────────────────────────────────
def jaccard(refs_a: Set[str], refs_b: Set[str]) -> float:
    if not refs_a or not refs_b:
        return 0.0
    inter = len(refs_a & refs_b)
    union = len(refs_a | refs_b)
    return inter / union if union > 0 else 0.0


# ── Fetch enriched paper metadata (with references) ───────────────────────────
async def fetch_paper(client: httpx.AsyncClient, paper_id: str) -> Optional[Dict]:
    cache_key = f"paper:{paper_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        data = await s2_get(
            client,
            f"/paper/{paper_id}",
            {"fields": S2_FIELDS_PAPER, "limit": 1},
        )
        if not data or "paperId" not in data:
            return None

        refs = [
            r["paperId"]
            for r in data.get("references", [])
            if r.get("paperId")
        ][:100]

        result = {
            "id": data["paperId"],
            "title": data.get("title", "Unknown Title"),
            "year": data.get("year"),
            "citationCount": data.get("citationCount", 0) or 0,
            "authors": [a["name"] for a in data.get("authors", [])[:6]],
            "abstract": (data.get("abstract") or "")[:600],
            "doi": (data.get("externalIds") or {}).get("DOI"),
            "arxivId": (data.get("externalIds") or {}).get("ArXiv"),
            "references": refs,
            "isSeed": False,
        }
        _cache_set(cache_key, result)
        return result
    except Exception:
        return None


# ── Fetch 1-hop candidate pool (citations + references of seed) ───────────────
async def fetch_candidate_pool(
    client: httpx.AsyncClient, seed_id: str
) -> List[str]:
    """Return up to MAX_CANDIDATES paper IDs from the seed's neighbourhood."""
    cache_key = f"pool:{seed_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    candidate_ids: Set[str] = set()

    # Fetch seed's references
    try:
        refs_data = await s2_get(
            client,
            f"/paper/{seed_id}/references",
            {"fields": "paperId,citationCount", "limit": 50},
        )
        for r in (refs_data.get("data") or []):
            cp = r.get("citedPaper", {})
            if cp.get("paperId") and cp.get("citationCount", 0) > 0:
                candidate_ids.add(cp["paperId"])
    except Exception:
        pass

    # Fetch papers that cite the seed
    try:
        cites_data = await s2_get(
            client,
            f"/paper/{seed_id}/citations",
            {"fields": "paperId,citationCount", "limit": 50},
        )
        for c in (cites_data.get("data") or []):
            cp = c.get("citingPaper", {})
            if cp.get("paperId") and cp.get("citationCount", 0) > 0:
                candidate_ids.add(cp["paperId"])
    except Exception:
        pass

    candidate_ids.discard(seed_id)
    result = list(candidate_ids)[:MAX_CANDIDATES]
    _cache_set(cache_key, result)
    return result


# ── Build similarity graph ────────────────────────────────────────────────────
async def build_litgraph(seed_id: str) -> LitGraphResponse:
    cache_key = f"graph:{seed_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient() as client:
        # 1. Fetch seed paper
        seed = await fetch_paper(client, seed_id)
        if not seed:
            raise HTTPException(status_code=404, detail=f"Paper '{seed_id}' not found on Semantic Scholar.")
        seed["isSeed"] = True

        # 2. Fetch candidate pool
        candidate_ids = await fetch_candidate_pool(client, seed_id)

        # 3. Enrich all candidates in parallel (batches of 10)
        papers: List[Dict] = [seed]
        batch_size = 10
        for i in range(0, len(candidate_ids), batch_size):
            batch = candidate_ids[i : i + batch_size]
            results = await asyncio.gather(*[fetch_paper(client, pid) for pid in batch])
            papers.extend([r for r in results if r is not None])

    # 4. Build reference sets
    ref_sets: Dict[str, Set[str]] = {p["id"]: set(p["references"]) for p in papers}

    # 5. Compute pairwise Jaccard similarity & build edges
    paper_ids = [p["id"] for p in papers]
    N = len(paper_ids)
    links: List[LitGraphLink] = []

    # For each paper, keep top-K neighbors above threshold
    for i in range(N):
        pid = paper_ids[i]
        scored: List[Tuple[float, str]] = []
        for j in range(N):
            if i == j:
                continue
            qid = paper_ids[j]
            score = jaccard(ref_sets[pid], ref_sets[qid])
            if score >= SIMILARITY_THRESHOLD:
                scored.append((score, qid))

        scored.sort(reverse=True)
        top_neighbors = scored[:TOP_K_NEIGHBORS]

        for score, neighbor_id in top_neighbors:
            # Deduplicate undirected edges
            edge_key = tuple(sorted([pid, neighbor_id]))
            if not any(
                tuple(sorted([l.source, l.target])) == edge_key for l in links
            ):
                links.append(LitGraphLink(source=pid, target=neighbor_id, weight=round(score, 4)))

    # 6. Keep only nodes that are connected OR are the seed
    connected_ids: Set[str] = {seed_id}
    for l in links:
        connected_ids.add(l.source)
        connected_ids.add(l.target)

    connected_papers = [p for p in papers if p["id"] in connected_ids]

    # 7. Build node list (strip large reference arrays from payload — keep ids only for tooltip)
    nodes = [
        LitGraphNode(
            id=p["id"],
            title=p["title"],
            year=p["year"],
            citationCount=p["citationCount"],
            authors=p["authors"],
            abstract=p["abstract"],
            doi=p.get("doi"),
            url=f"https://arxiv.org/abs/{p['arxivId']}" if p.get("arxivId") else (
                f"https://doi.org/{p['doi']}" if p.get("doi") else
                f"https://www.semanticscholar.org/paper/{p['id']}"
            ),
            isSeed=p.get("isSeed", False),
            references=[],  # stripped for bandwidth
        )
        for p in connected_papers
    ]

    response = LitGraphResponse(
        seed_id=seed_id,
        seed_title=seed["title"],
        nodes=nodes,
        links=links,
        stats={
            "total_candidates": len(candidate_ids),
            "connected_nodes": len(nodes),
            "total_edges": len(links),
            "avg_similarity": round(
                sum(l.weight for l in links) / max(len(links), 1), 4
            ),
        },
    )
    _cache_set(cache_key, response)
    return response


# ── API Endpoints ─────────────────────────────────────────────────────────────

@router.get("/search", response_model=List[SearchResult])
async def search_papers(q: str = Query(..., min_length=2, description="Paper title, DOI, or ArXiv ID")):
    """Auto-suggest papers via Semantic Scholar search."""
    cache_key = f"search:{hashlib.md5(q.encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient() as client:
        try:
            data = await s2_get(
                client,
                "/paper/search",
                {"query": q, "fields": S2_FIELDS_SEARCH, "limit": 8},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Semantic Scholar API error: {e}")

    results = []
    for p in (data.get("data") or []):
        if p.get("paperId"):
            results.append(
                SearchResult(
                    paperId=p["paperId"],
                    title=p.get("title", "Unknown"),
                    year=p.get("year"),
                    authors=[a["name"] for a in p.get("authors", [])[:4]],
                    citationCount=p.get("citationCount", 0) or 0,
                    abstract=(p.get("abstract") or "")[:300],
                )
            )

    _cache_set(cache_key, results)
    return results


@router.get("/graph/{paper_id:path}", response_model=LitGraphResponse)
async def get_litgraph(paper_id: str):
    """
    Build a bibliometric similarity graph for a given Semantic Scholar paper ID.
    Returns nodes + weighted edges computed via Jaccard similarity of reference sets.
    """
    paper_id = paper_id.strip()
    if not paper_id:
        raise HTTPException(status_code=400, detail="paper_id is required")
    return await build_litgraph(paper_id)


@router.delete("/cache")
async def clear_litgraph_cache():
    """Clear the in-memory LitGraph cache."""
    _CACHE.clear()
    return {"status": "cleared"}
