import re
import urllib.parse
from typing import Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import Author, Paper, PaperAccessCandidate, PaperAccessResponse

class AccessResolver:
    """Multi-source scientific paper search and legal full-text access resolver."""

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": f"ResearchCopilot/{settings.app_version} (mailto:{settings.openalex_email})"
        }

    @staticmethod
    def detect_identifier_type(identifier: str) -> Tuple[str, str]:
        """Detect identifier type (doi, arxiv, openalex, pmid, pmcid, or query)."""
        raw = identifier.strip()
        lower = raw.lower()
        
        # OpenAlex ID
        if re.match(r"^[wW]\d+$", raw) or "openalex.org/w" in lower:
            match = re.search(r"[wW]\d+", raw)
            return "openalex", match.group(0).upper() if match else raw
            
        # DOI
        if raw.startswith("10.") or "doi.org/10." in lower:
            match = re.search(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", raw)
            return "doi", match.group(0) if match else raw
            
        # arXiv
        if lower.startswith("arxiv:") or "arxiv.org/" in lower or re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", raw) or re.match(r"^[a-z\-]+(\.[A-Z]{2})?/\d{7}$", raw):
            clean_str = re.sub(r"^arxiv:\s*", "", raw, flags=re.IGNORECASE)
            match = re.search(r"(\d{4}\.\d{4,5}|[a-z\-]+/\d{7})", clean_str)
            return "arxiv", match.group(0) if match else clean_str
            
        # PMID / PMCID
        if lower.startswith("pmid:") or re.match(r"^\d{7,9}$", raw):
            return "pmid", re.sub(r"^pmid:\s*", "", raw, flags=re.IGNORECASE).strip()
        if lower.startswith("pmc"):
            return "pmcid", raw.upper()
            
        return "query", raw

    async def search_openalex(self, query: str, limit: int = 25) -> List[Paper]:
        """Search papers on OpenAlex API."""
        url = f"{settings.openalex_base_url}/works"
        params = {
            "search": query,
            "per_page": min(limit, settings.max_rank_limit),
            "mailto": settings.openalex_email,
        }
        papers: List[Paper] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("results", []):
                        paper = self._parse_openalex_item(item)
                        if paper:
                            papers.append(paper)
                    logger.info("[OpenAlex] Fetched %d papers for query: '%s'", len(papers), query)
                else:
                    logger.warning("[OpenAlex] Search failed with status %d: %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("[OpenAlex] Search exception for query '%s': %s", query, e)
        return papers

    async def search_arxiv(self, query: str, limit: int = 25) -> List[Paper]:
        """Search papers on arXiv API."""
        clean_query = urllib.parse.quote(f"all:{query}")
        url = f"{settings.arxiv_base_url}?search_query={clean_query}&start=0&max_results={limit}"
        papers: List[Paper] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    root = ET.fromstring(resp.text)
                    ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
                    
                    for entry in root.findall("atom:entry", ns):
                        id_elem = entry.find("atom:id", ns)
                        title_elem = entry.find("atom:title", ns)
                        summary_elem = entry.find("atom:summary", ns)
                        published_elem = entry.find("atom:published", ns)
                        
                        if title_elem is None or title_elem.text is None:
                            continue
                            
                        raw_id = id_elem.text.strip() if id_elem is not None and id_elem.text else ""
                        arxiv_id = raw_id.split("/abs/")[-1] if "/abs/" in raw_id else raw_id
                        
                        authors: List[Author] = []
                        for author_elem in entry.findall("atom:author", ns):
                            name_elem = author_elem.find("atom:name", ns)
                            if name_elem is not None and name_elem.text:
                                authors.append(Author(name=name_elem.text.strip()))
                                
                        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else None
                        pub_year = None
                        if published_elem is not None and published_elem.text:
                            pub_year = int(published_elem.text[:4])
                            
                        papers.append(Paper(
                            id=f"arxiv:{arxiv_id}" if arxiv_id else f"raw:{hash(title_elem.text)}",
                            title=re.sub(r"\s+", " ", title_elem.text).strip(),
                            abstract=re.sub(r"\s+", " ", summary_elem.text).strip() if summary_elem is not None and summary_elem.text else "",
                            authors=authors,
                            year=pub_year,
                            publication_date=published_elem.text if published_elem is not None else None,
                            arxiv_id=arxiv_id,
                            primary_source="arxiv",
                            url=raw_id,
                            pdf_url=pdf_url,
                            is_open_access=True,
                        ))
                    logger.info("[arXiv] Fetched %d papers for query: '%s'", len(papers), query)
                else:
                    logger.warning("[arXiv] Search failed with status %d", resp.status_code)
        except Exception as e:
            logger.error("[arXiv] Search exception: %s", e)
        return papers

    async def resolve_identifier(self, identifier: str) -> PaperAccessResponse:
        """Resolve a specific paper identifier and determine legal full-text candidates."""
        id_type, clean_id = self.detect_identifier_type(identifier)
        candidates: List[PaperAccessCandidate] = []
        paper: Optional[Paper] = None
        
        async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
            if id_type == "openalex":
                url = f"{settings.openalex_base_url}/works/{clean_id}"
                resp = await client.get(url, params={"mailto": settings.openalex_email})
                if resp.status_code == 200:
                    paper = self._parse_openalex_item(resp.json())
            elif id_type == "doi":
                url = f"{settings.openalex_base_url}/works/https://doi.org/{clean_id}"
                resp = await client.get(url, params={"mailto": settings.openalex_email})
                if resp.status_code == 200:
                    paper = self._parse_openalex_item(resp.json())
            elif id_type == "arxiv":
                papers = await self.search_arxiv(clean_id, limit=1)
                if papers:
                    paper = papers[0]
            else:
                papers = await self.search_openalex(clean_id, limit=1)
                if papers:
                    paper = papers[0]

        if paper:
            # Build access candidates
            if paper.pdf_url:
                candidates.append(PaperAccessCandidate(
                    source=paper.primary_source,
                    url=paper.pdf_url,
                    format="pdf",
                    is_legal_oa=True,
                    priority=1
                ))
            if paper.arxiv_id:
                candidates.append(PaperAccessCandidate(
                    source="arxiv",
                    url=f"https://arxiv.org/pdf/{paper.arxiv_id}.pdf",
                    format="pdf",
                    is_legal_oa=True,
                    priority=2
                ))
                candidates.append(PaperAccessCandidate(
                    source="alphaxiv",
                    url=f"https://www.alphaxiv.org/abs/{paper.arxiv_id}",
                    format="html",
                    is_legal_oa=True,
                    priority=3
                ))
            if paper.pmcid:
                candidates.append(PaperAccessCandidate(
                    source="europe_pmc",
                    url=f"https://www.ncbi.nlm.nih.gov/pmc/articles/{paper.pmcid}/pdf/",
                    format="pdf",
                    is_legal_oa=True,
                    priority=2
                ))

        return PaperAccessResponse(
            identifier=identifier,
            paper=paper,
            candidates=candidates,
            full_text_extracted=bool(paper and paper.sections),
            sections_count=len(paper.sections) if paper else 0
        )

    def _parse_openalex_item(self, item: Dict) -> Optional[Paper]:
        """Convert OpenAlex JSON object to standardized Paper schema."""
        title = item.get("title") or item.get("display_name")
        if not title:
            return None
            
        authors: List[Author] = []
        for authorship in item.get("authorships", []):
            author_obj = authorship.get("author", {})
            inst = authorship.get("institutions", [{}])
            inst_name = inst[0].get("display_name") if inst else None
            authors.append(Author(
                name=author_obj.get("display_name", "Unknown"),
                author_id=author_obj.get("id"),
                orcid=author_obj.get("orcid"),
                affiliation=inst_name
            ))
            
        # Reconstruct abstract from inverted index
        abstract = ""
        inv_index = item.get("abstract_inverted_index")
        if inv_index and isinstance(inv_index, dict):
            words = []
            for word, positions in inv_index.items():
                for pos in positions:
                    words.append((pos, word))
            words.sort(key=lambda x: x[0])
            abstract = " ".join(w[1] for w in words)
            
        ids = item.get("ids", {})
        doi = ids.get("doi") or item.get("doi")
        if doi and "doi.org/" in doi:
            doi = doi.split("doi.org/")[-1]
            
        arxiv_raw = ids.get("arxiv")
        arxiv_id = None
        if arxiv_raw:
            arxiv_id = arxiv_raw.split("arxiv.org/abs/")[-1] if "arxiv.org/abs/" in arxiv_raw else arxiv_raw
            
        pmid = ids.get("pmid")
        pmcid = ids.get("pmcid")
        
        # Primary / Best OA Location
        best_oa = item.get("best_oa_location") or item.get("primary_location") or {}
        pdf_url = best_oa.get("pdf_url")
        url = best_oa.get("landing_page_url") or item.get("id")
        is_oa = item.get("open_access", {}).get("is_oa", False) or bool(pdf_url)
        
        referenced_works = item.get("referenced_works", [])
        topics = [t.get("display_name") for t in item.get("topics", []) if t.get("display_name")]
        
        return Paper(
            id=item.get("id", f"openalex:{hash(title)}"),
            title=title.strip(),
            abstract=abstract.strip(),
            authors=authors,
            year=item.get("publication_year"),
            publication_date=item.get("publication_date"),
            doi=doi,
            arxiv_id=arxiv_id,
            pmid=pmid,
            pmcid=pmcid,
            openalex_id=item.get("id"),
            primary_source="openalex",
            url=url,
            pdf_url=pdf_url,
            is_open_access=is_oa,
            citation_count=item.get("cited_by_count", 0),
            referenced_works=referenced_works,
            topics=topics
        )
