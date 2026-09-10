import re
import urllib.parse
from typing import Dict, List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import Author, Paper

class MultiProviderSearchEngine:
    """Aggregates searches across Europe PMC, Crossref, Semantic Scholar, Hugging Face, and PubMed."""

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": f"ResearchCopilot/{settings.app_version} (mailto:{settings.openalex_email})"
        }

    async def search_europepmc(self, query: str, limit: int = 25) -> List[Paper]:
        """Search Europe PMC / PubMed API for biomedical and life sciences literature."""
        url = f"{settings.europepmc_base_url}/search"
        params = {
            "query": query,
            "format": "json",
            "pageSize": min(limit, settings.max_rank_limit),
            "resultType": "core",
        }
        papers: List[Paper] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("resultList", {}).get("result", [])
                    for item in results:
                        title = item.get("title", "").strip()
                        if not title:
                            continue
                        authors = [Author(name=a.get("fullName", "Unknown")) for a in item.get("authorList", {}).get("author", [])]
                        pmid = item.get("pmid")
                        pmcid = item.get("pmcid")
                        doi = item.get("doi")
                        pdf_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/pdf/" if pmcid else None
                        
                        papers.append(Paper(
                            id=f"pmc:{pmcid}" if pmcid else (f"pmid:{pmid}" if pmid else f"epmc:{item.get('id')}"),
                            title=title,
                            abstract=item.get("abstractText", ""),
                            authors=authors,
                            year=int(item.get("pubYear")) if item.get("pubYear") and item.get("pubYear").isdigit() else None,
                            doi=doi,
                            pmid=pmid,
                            pmcid=pmcid,
                            primary_source="europe_pmc",
                            url=f"https://europepmc.org/article/{item.get('source', 'MED')}/{item.get('id')}",
                            pdf_url=pdf_url,
                            is_open_access=item.get("isOpenAccess") == "Y" or bool(pmcid),
                            citation_count=item.get("citedByCount", 0),
                        ))
                    logger.info("[Europe PMC] Fetched %d papers for query: '%s'", len(papers), query)
                else:
                    logger.warning("[Europe PMC] Failed with status %d: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("[Europe PMC] Search error: %s", e)
        return papers

    async def search_crossref(self, query: str, limit: int = 25) -> List[Paper]:
        """Search Crossref API for registered publisher metadata and DOIs."""
        url = f"{settings.crossref_base_url}/works"
        params = {
            "query": query,
            "rows": min(limit, settings.max_rank_limit),
            "mailto": settings.openalex_email,
        }
        papers: List[Paper] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("message", {}).get("items", [])
                    for item in items:
                        title_list = item.get("title", [])
                        if not title_list:
                            continue
                        title = title_list[0]
                        authors = [
                            Author(name=f"{a.get('given', '')} {a.get('family', '')}".strip())
                            for a in item.get("author", [])
                        ]
                        doi = item.get("DOI")
                        year = None
                        created = item.get("created", {}).get("date-parts", [[]])
                        if created and created[0]:
                            year = created[0][0]

                        papers.append(Paper(
                            id=f"doi:{doi}" if doi else f"crossref:{hash(title)}",
                            title=title,
                            abstract=item.get("abstract", ""),
                            authors=authors,
                            year=year,
                            doi=doi,
                            primary_source="crossref",
                            url=item.get("URL", f"https://doi.org/{doi}" if doi else ""),
                            citation_count=item.get("is-referenced-by-count", 0),
                        ))
                    logger.info("[Crossref] Fetched %d papers for query: '%s'", len(papers), query)
                else:
                    logger.warning("[Crossref] Failed with status %d", resp.status_code)
        except Exception as e:
            logger.error("[Crossref] Search error: %s", e)
        return papers

    async def search_huggingface(self, query: str, limit: int = 25) -> List[Dict]:
        """Search Hugging Face models and datasets."""
        models_url = f"https://huggingface.co/api/models?search={urllib.parse.quote(query)}&limit={min(limit, 20)}"
        datasets_url = f"https://huggingface.co/api/datasets?search={urllib.parse.quote(query)}&limit={min(limit, 20)}"
        artifacts = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                m_resp, d_resp = await client.get(models_url), await client.get(datasets_url)
                if m_resp.status_code == 200:
                    for m in m_resp.json():
                        artifacts.append({
                            "id": m.get("id"),
                            "type": "model",
                            "downloads": m.get("downloads", 0),
                            "likes": m.get("likes", 0),
                            "pipeline_tag": m.get("pipeline_tag"),
                            "url": f"https://huggingface.co/{m.get('id')}"
                        })
                if d_resp.status_code == 200:
                    for d in d_resp.json():
                        artifacts.append({
                            "id": d.get("id"),
                            "type": "dataset",
                            "downloads": d.get("downloads", 0),
                            "likes": d.get("likes", 0),
                            "url": f"https://huggingface.co/datasets/{d.get('id')}"
                        })
            logger.info("[Hugging Face] Fetched %d models/datasets for query: '%s'", len(artifacts), query)
        except Exception as e:
            logger.error("[Hugging Face] Search error: %s", e)
        return artifacts

    async def search_semanticscholar(self, query: str, limit: int = 25) -> List[Paper]:
        """Search Semantic Scholar academic graph."""
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": query,
            "limit": min(limit, settings.max_rank_limit),
            "fields": "title,abstract,authors,year,citationCount,isOpenAccess,openAccessPdf,externalIds,url",
        }
        papers: List[Paper] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("data", []):
                        title = item.get("title")
                        if not title:
                            continue
                        authors = [Author(name=a.get("name", "Unknown"), author_id=a.get("authorId")) for a in item.get("authors", [])]
                        ext_ids = item.get("externalIds", {}) or {}
                        pdf_info = item.get("openAccessPdf") or {}
                        papers.append(Paper(
                            id=f"s2:{item.get('paperId')}",
                            title=title,
                            abstract=item.get("abstract") or "",
                            authors=authors,
                            year=item.get("year"),
                            doi=ext_ids.get("DOI"),
                            arxiv_id=ext_ids.get("ArXiv"),
                            pmid=ext_ids.get("PubMed"),
                            primary_source="semanticscholar",
                            url=item.get("url"),
                            pdf_url=pdf_info.get("url"),
                            is_open_access=item.get("isOpenAccess", False),
                            citation_count=item.get("citationCount", 0),
                        ))
                    logger.info("[Semantic Scholar] Fetched %d papers for query: '%s'", len(papers), query)
                elif resp.status_code == 429:
                    logger.warning("[Semantic Scholar] Rate limited (429 Too Many Requests) without API key. Falling back to OpenAlex/arXiv/EuropePMC.")
                else:
                    logger.warning("[Semantic Scholar] Returned status %d: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("[Semantic Scholar] Search error: %s", e)
        return papers
