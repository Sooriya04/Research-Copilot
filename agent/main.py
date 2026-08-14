"""
Research Copilot - Repair Agent v2.0
Port: 8101

Search chain:
  1. SearxNG (localhost:7080) - with JSON content-type validation (Bug 4 fix)
  2. arXiv API title search   - guaranteed real PDF links (Bug 3 fix)
  3. Semantic Scholar API     - open-access PDF fallback
"""

import json
import logging
import os
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional

from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="[REPAIR-AGENT] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Research Copilot - Repair Agent", version="2.0.0")

SEARXNG_URL = "http://localhost:7080"
ARXIV_API_URL = "https://export.arxiv.org/api/query"
S2_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search"


def _load_env():
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"\''))


_load_env()


class RepairRequest(BaseModel):
    paper_id: str
    title: str
    content_type: str
    failure_reason: str
    existing_urls: List[str] = []
    authors: List[str] = []


class RankedSource(BaseModel):
    url: str
    source_type: str
    rank: int
    score: float


class RepairResponse(BaseModel):
    paper_id: str
    selected_source: Optional[RankedSource]


def classify_url(url: str) -> str:
    if "arxiv.org" in url:
        return "arxiv"
    elif "github.com" in url:
        return "github"
    elif any(d in url for d in ["acm.org", "ieee.org", "springer.com", "nature.com",
                                  "sciencedirect.com", "semanticscholar.org", "aclanthology.org"]):
        return "publisher"
    elif ".edu" in url:
        return "institutional_repository"
    return "other"


def search_searxng(title: str, authors: List[str]) -> List[Dict]:
    """Bug 4 fix: validate Content-Type is JSON before parsing."""
    query = title + (" " + authors[0] if authors else "") + " pdf"
    url = f"{SEARXNG_URL}/search?q={urllib.parse.quote_plus(query)}&format=json&categories=science"
    candidates = []
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ResearchCopilot/2.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "json" not in content_type:
                logger.warning(f"SearxNG returned non-JSON ({content_type}). Enable JSON in SearxNG settings.yml.")
                return []
            data = json.loads(resp.read().decode("utf-8"))
            for res in data.get("results", [])[:6]:
                r_url = res.get("url", "")
                if r_url:
                    candidates.append({"url": r_url, "type": classify_url(r_url)})
    except urllib.error.URLError as e:
        logger.warning(f"SearxNG unreachable: {e}")
    except Exception as e:
        logger.error(f"SearxNG error: {e}")
    return candidates


def search_arxiv_api(title: str, authors: List[str]) -> List[Dict]:
    """Bug 3 fix: use real arXiv API with title search — no more fake IDs."""
    query_parts = [f'ti:"{title}"']
    if authors:
        query_parts.append(f'au:{authors[0].split()[-1]}')
    query = " AND ".join(query_parts)
    url = f"{ARXIV_API_URL}?search_query={urllib.parse.quote(query)}&max_results=3&sortBy=relevance"
    candidates = []
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ResearchCopilot/2.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            xml_data = resp.read().decode("utf-8")
        root = ET.fromstring(xml_data)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("atom:entry", ns):
            for link in entry.findall("atom:link", ns):
                if link.attrib.get("type") == "application/pdf":
                    pdf_url = link.attrib.get("href", "")
                    if pdf_url:
                        candidates.append({"url": pdf_url, "type": "arxiv"})
                        break
    except Exception as e:
        logger.warning(f"arXiv API error: {e}")
    return candidates


def search_semantic_scholar(title: str) -> List[Dict]:
    """Tertiary fallback: Semantic Scholar open-access PDF."""
    params = urllib.parse.urlencode({"query": title, "fields": "openAccessPdf,title", "limit": 3})
    url = f"{S2_API_URL}?{params}"
    headers = {"User-Agent": "ResearchCopilot/2.0"}
    s2_key = os.environ.get("S2_API_KEY", "")
    if s2_key:
        headers["x-api-key"] = s2_key
    candidates = []
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for paper in data.get("data", []):
            oa_pdf = paper.get("openAccessPdf")
            if oa_pdf and oa_pdf.get("url"):
                candidates.append({"url": oa_pdf["url"], "type": classify_url(oa_pdf["url"])})
    except Exception as e:
        logger.warning(f"Semantic Scholar error: {e}")
    return candidates


SCORE_TABLE = {
    "arxiv": 100.0,
    "publisher": 90.0,
    "institutional_repository": 80.0,
    "author_repository": 70.0,
    "github": 60.0,
    "other": 10.0,
}


def rank_sources(candidates: List[Dict]) -> List[RankedSource]:
    seen = set()
    ranked = []
    for c in candidates:
        url = c.get("url", "")
        if not url or url in seen:
            continue
        seen.add(url)
        stype = c.get("type", "other")
        score = SCORE_TABLE.get(stype, 10.0)
        if url.endswith(".pdf"):
            score += 5.0
        ranked.append({"url": url, "source_type": stype, "score": score})
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return [
        RankedSource(url=r["url"], source_type=r["source_type"], score=r["score"], rank=i + 1)
        for i, r in enumerate(ranked)
    ]


@app.post("/discover-repair-source", response_model=RepairResponse)
async def discover_repair_source(req: RepairRequest):
    logger.info(f"Repair: paper={req.paper_id} title='{req.title}' reason={req.failure_reason}")
    candidates: List[Dict] = []

    searxng_results = search_searxng(req.title, req.authors)
    candidates.extend(searxng_results)
    logger.info(f"SearxNG: {len(searxng_results)} candidates")

    arxiv_results = search_arxiv_api(req.title, req.authors)
    candidates.extend(arxiv_results)
    logger.info(f"arXiv API: {len(arxiv_results)} candidates")

    if not candidates:
        s2_results = search_semantic_scholar(req.title)
        candidates.extend(s2_results)
        logger.info(f"S2: {len(s2_results)} candidates")

    for url in req.existing_urls:
        if url:
            candidates.append({"url": url, "type": "other"})

    ranked = rank_sources(candidates)
    top = ranked[0] if ranked else None

    if top:
        logger.info(f"Selected: {top.url} (type={top.source_type}, score={top.score})")
    else:
        logger.warning(f"No sources found for paper {req.paper_id}")

    return RepairResponse(paper_id=req.paper_id, selected_source=top)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8101, log_level="info")
