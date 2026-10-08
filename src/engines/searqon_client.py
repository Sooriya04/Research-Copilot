import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.rag.active_cache import ActivePaperCache, get_active_paper_cache


@dataclass
class WebSearchResult:
    """Normalized external research finding from Searqon."""
    title: str
    url: str
    snippet: str
    source: str = "web"
    domain: str = ""
    score: float = 0.0
    published_at: Optional[str] = None
    query: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


class SearqonClient:
    """Client for Searqon external research engine (SearXNG + DuckDuckGo)."""

    ACADEMIC_DOMAINS = {
        "arxiv.org": 1.5,
        "openreview.net": 1.5,
        "paperswithcode.com": 1.4,
        "huggingface.co": 1.3,
        "aclanthology.org": 1.4,
        "nature.com": 1.4,
        "science.org": 1.4,
        "ieee.org": 1.3,
        "acm.org": 1.3,
        "semanticscholar.org": 1.3,
        "github.com": 1.2,
        "wikipedia.org": 1.0,
    }

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        active_cache: Optional[ActivePaperCache] = None,
        enabled: Optional[bool] = None,
    ):
        raw_url = base_url or getattr(settings, "searqon_base_url", "http://localhost:7493")
        self.base_url = raw_url.rstrip("/")
        self.timeout = timeout or getattr(settings, "searqon_timeout", 10.0)
        self.active_cache = active_cache or get_active_paper_cache()
        self.enabled = enabled if enabled is not None else getattr(settings, "web_search_enabled", True)
        self.cache_ttl = getattr(settings, "web_search_cache_ttl", 900)

    def _extract_domain(self, url: str) -> str:
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            return domain.replace("www.", "")
        except Exception:
            return "web"

    def _query_cache_key(self, paper_id: str, query: str) -> str:
        q_hash = hashlib.sha256(query.strip().lower().encode()).hexdigest()[:16]
        return f"paper:{paper_id}:web_search:{q_hash}"

    async def search(
        self,
        query: str,
        limit: int = 5,
        paper_id: Optional[str] = None,
        scrape: bool = False,
    ) -> List[WebSearchResult]:
        """Query Searqon web search service and normalize results.
        
        Gracefully returns [] if Searqon is unreachable or disabled.
        """
        if not self.enabled or not query or not query.strip():
            return []

        clean_query = query.strip()
        top_k = limit or getattr(settings, "web_search_top_k", 5)

        # 1. Check Redis cache if paper_id is provided
        if paper_id and self.active_cache:
            try:
                client = await self.active_cache.get_client()
                if client:
                    cache_key = self._query_cache_key(paper_id, clean_query)
                    cached_raw = await client.get(cache_key)
                    if cached_raw:
                        cached_items = json.loads(cached_raw)
                        logger.debug("[SearqonClient] Cache hit for query '%s' on paper '%s'", clean_query, paper_id)
                        return [WebSearchResult(**item) for item in cached_items]
            except Exception as ex:
                logger.debug("[SearqonClient] Redis cache read note: %s", ex)

        # 2. Call Searqon API
        payload = {
            "query": clean_query,
            "limit": max(top_k * 2, 6),  # Fetch extra so source selection can pick best
            "scrape": scrape,
            "bypass_cache": False,
        }

        raw_results = []
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http_client:
                resp = await http_client.post(f"{self.base_url}/search", json=payload)
                if resp.status_code == 200:
                    resp_data = resp.json()
                    data = resp_data.get("data", {}) if resp_data.get("success") else {}
                    raw_results = data.get("results", [])
                else:
                    logger.warning("[SearqonClient] Searqon HTTP %d: %s", resp.status_code, resp.text[:100])
                    return []
        except httpx.ConnectError:
            logger.warning("[SearqonClient] Searqon offline/unreachable at %s. Continuing with paper RAG.", self.base_url)
            return []
        except httpx.TimeoutException:
            logger.warning("[SearqonClient] Searqon request timed out after %.1fs for query '%s'", self.timeout, clean_query)
            return []
        except Exception as e:
            logger.warning("[SearqonClient] Searqon external search error: %s", e)
            return []

        search_latency = round((time.perf_counter() - t0) * 1000, 2)
        logger.info("[SearqonClient] Retrieved %d raw results in %.1fms for query '%s'", len(raw_results), search_latency, clean_query)

        # 3. Normalize & Prioritize Sources
        normalized: List[WebSearchResult] = []
        seen_urls = set()

        for r in raw_results:
            url = r.get("url", "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            domain = self._extract_domain(url)
            title = r.get("title", "").strip() or domain
            snippet = r.get("snippet", "").strip()
            raw_score = float(r.get("score") or 0.5)

            # Domain credibility multiplier
            credibility = 1.0
            for d_pattern, boost in self.ACADEMIC_DOMAINS.items():
                if d_pattern in domain:
                    credibility = boost
                    break

            combined_score = round(raw_score * credibility, 3)

            # Extract publication year/date if detectable in snippet or metadata
            meta = r.get("metadata") or {}
            pub_date = meta.get("published_at")
            if not pub_date:
                m_year = re.search(r"\b(202[0-9]|199[0-9])\b", snippet[:100])
                if m_year:
                    pub_date = m_year.group(1)

            normalized.append(
                WebSearchResult(
                    title=title,
                    url=url,
                    snippet=snippet,
                    source=r.get("source", "searxng/ddg"),
                    domain=domain,
                    score=combined_score,
                    published_at=pub_date,
                    query=clean_query,
                    metadata=meta,
                )
            )

        # Rank by combined score descending
        normalized.sort(key=lambda x: x.score, reverse=True)
        top_results = normalized[:top_k]

        # 4. Cache in Redis
        if paper_id and top_results and self.active_cache:
            try:
                client = await self.active_cache.get_client()
                if client:
                    cache_key = self._query_cache_key(paper_id, clean_query)
                    serialized = [
                        {
                            "title": item.title,
                            "url": item.url,
                            "snippet": item.snippet,
                            "source": item.source,
                            "domain": item.domain,
                            "score": item.score,
                            "published_at": item.published_at,
                            "query": item.query,
                            "metadata": item.metadata,
                        }
                        for item in top_results
                    ]
                    await client.set(cache_key, json.dumps(serialized), ex=self.cache_ttl)
            except Exception as ex:
                logger.debug("[SearqonClient] Redis cache write note: %s", ex)

        return top_results
