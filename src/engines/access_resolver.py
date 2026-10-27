import re
import urllib.parse
from typing import Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import Author, Paper, PaperAccessCandidate, PaperAccessResponse, PaperSection

class AccessResolver:
    """Multi-source scientific paper search and legal full-text access resolver."""

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": f"ResearchCopilot/{settings.app_version} (mailto:{settings.openalex_email})"
        }
        if settings.openalex_api_key:
            self.headers["Authorization"] = f"Bearer {settings.openalex_api_key}"

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
            if clean_str.lower().startswith("s2:") or (len(clean_str) == 40 and bool(re.match(r"^[0-9a-f]{40}$", clean_str.lower()))):
                return "semanticscholar", re.sub(r"^s2:\s*", "", clean_str, flags=re.IGNORECASE)
            if clean_str.startswith("10.") or "doi.org/10." in clean_str.lower():
                match = re.search(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", clean_str)
                return "doi", match.group(0) if match else clean_str
            match = re.search(r"(\d{4}\.\d{4,5}|[a-z\-]+/\d{7})", clean_str)
            return "arxiv", match.group(0) if match else clean_str
            
        # PMID / PMCID
        if lower.startswith("pmid:") or re.match(r"^\d{7,9}$", raw):
            return "pmid", re.sub(r"^pmid:\s*", "", raw, flags=re.IGNORECASE).strip()
        if lower.startswith("pmc"):
            return "pmcid", raw.upper()

        # Semantic Scholar ID
        if lower.startswith("s2:") or (len(raw) == 40 and bool(re.match(r"^[0-9a-f]{40}$", lower))):
            clean_str = re.sub(r"^s2:\s*", "", raw, flags=re.IGNORECASE)
            return "semanticscholar", clean_str
            
        return "query", raw

    async def search_openalex(self, query: str, limit: int = 25) -> List[Paper]:
        """Search papers on OpenAlex API."""
        url = f"{settings.openalex_base_url}/works"
        params = {
            "search": query,
            "per_page": min(limit, settings.max_rank_limit),
            "mailto": settings.openalex_email,
        }
        if settings.openalex_api_key:
            params["api_key"] = settings.openalex_api_key
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
        raw_q = query.strip()
        clean_id = re.sub(r"^arxiv:\s*", "", raw_q, flags=re.IGNORECASE)
        clean_id = re.sub(r"v\d+$", "", clean_id)
        is_arxiv_id = bool(re.match(r"^\d{4}\.\d{4,5}$", clean_id) or re.match(r"^[a-z\-]+(?:\.[A-Z]{2})?/\d{7}$", clean_id))

        if is_arxiv_id:
            url = f"{settings.arxiv_base_url}?id_list={clean_id}"
        else:
            clean_query = urllib.parse.quote(f"all:{raw_q}")
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

        # Resilient fallback if arXiv API timed out for a direct arXiv ID
        if not papers and is_arxiv_id:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    s2_url = f"https://api.semanticscholar.org/graph/v1/paper/arXiv:{clean_id}?fields=title,abstract,authors,year,isOpenAccess,openAccessPdf"
                    resp = await client.get(s2_url)
                    if resp.status_code == 200:
                        data = resp.json()
                        title = data.get("title")
                        if title:
                            papers.append(Paper(
                                id=f"arxiv:{clean_id}",
                                title=title,
                                abstract=data.get("abstract") or "",
                                authors=[Author(name=a.get("name", "Author")) for a in data.get("authors", [])],
                                year=data.get("year"),
                                arxiv_id=clean_id,
                                primary_source="arxiv",
                                url=f"https://arxiv.org/abs/{clean_id}",
                                pdf_url=f"https://arxiv.org/pdf/{clean_id}.pdf",
                                is_open_access=True,
                            ))
            except Exception:
                pass

        return papers

    async def resolve_identifier(self, identifier: str) -> PaperAccessResponse:
        """Resolve a specific paper identifier and determine legal full-text candidates."""
        id_type, clean_id = self.detect_identifier_type(identifier)
        candidates: List[PaperAccessCandidate] = []
        paper: Optional[Paper] = None
        
        oa_params = {"mailto": settings.openalex_email}
        if settings.openalex_api_key:
            oa_params["api_key"] = settings.openalex_api_key

        async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
            if id_type == "openalex":
                url = f"{settings.openalex_base_url}/works/{clean_id}"
                try:
                    resp = await client.get(url, params=oa_params)
                    if resp.status_code == 200:
                        paper = self._parse_openalex_item(resp.json())
                except Exception as e:
                    logger.debug("[AccessResolver] OpenAlex resolution error: %s", e)
            elif id_type == "doi":
                url = f"{settings.openalex_base_url}/works/https://doi.org/{clean_id}"
                try:
                    resp = await client.get(url, params=oa_params)
                    if resp.status_code == 200:
                        paper = self._parse_openalex_item(resp.json())
                except Exception as e:
                    logger.debug("[AccessResolver] OpenAlex DOI resolution error: %s", e)
            elif id_type == "arxiv":
                try:
                    papers = await self.search_arxiv(clean_id, limit=1)
                    if papers:
                        paper = papers[0]
                except Exception as e:
                    logger.debug("[AccessResolver] arXiv resolution error: %s", e)
            elif id_type == "semanticscholar":
                s2_url = f"https://api.semanticscholar.org/graph/v1/paper/{clean_id}?fields=title,abstract,authors,year,externalIds,venue,citationCount,isOpenAccess,openAccessPdf"
                try:
                    s2_resp = await client.get(s2_url)
                    if s2_resp.status_code == 200:
                        s2_data = s2_resp.json()
                        ext_ids = s2_data.get("externalIds", {})
                        arxiv_id = ext_ids.get("ArXiv")
                        doi_val = ext_ids.get("DOI")
                        oa_pdf = s2_data.get("openAccessPdf", {}) or {}
                        pdf_url = oa_pdf.get("url") or (f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else None)
                        paper = Paper(
                            id=f"s2:{clean_id}",
                            title=s2_data.get("title") or "Untitled Paper",
                            abstract=s2_data.get("abstract") or "",
                            authors=[Author(name=a.get("name", "Author")) for a in s2_data.get("authors", [])],
                            year=s2_data.get("year"),
                            doi=doi_val,
                            arxiv_id=arxiv_id,
                            primary_source="semanticscholar",
                            url=f"https://www.semanticscholar.org/paper/{clean_id}",
                            pdf_url=pdf_url,
                            citation_count=s2_data.get("citationCount") or 0,
                            is_open_access=bool(s2_data.get("isOpenAccess") or pdf_url),
                        )
                except Exception as e:
                    logger.debug("[AccessResolver] S2 API resolution failed: %s", e)
            else:
                try:
                    papers = await self.search_openalex(clean_id, limit=1)
                    if papers:
                        paper = papers[0]
                except Exception as e:
                    logger.debug("[AccessResolver] OpenAlex query search error: %s", e)

            # CrossRef fallback if DOI provided and paper is missing or lacks abstract
            if id_type == "doi" and (not paper or not paper.abstract):
                try:
                    cr_resp = await client.get(
                        f"https://api.crossref.org/works/{clean_id}",
                        headers={"User-Agent": "ResearchCopilot/2.0 (mailto:scholar@researchcopilot.org)"}
                    )
                    if cr_resp.status_code == 200:
                        cr_msg = cr_resp.json().get("message", {})
                        if not paper:
                            authors_list = []
                            for a in cr_msg.get("author", []):
                                g = a.get("given", "").strip()
                                f = a.get("family", "").strip()
                                authors_list.append(Author(name=f"{g} {f}".strip() or "Author"))
                            pub_parts = (cr_msg.get("published-print") or cr_msg.get("published-online") or {}).get("date-parts", [[]])[0]
                            year_val = pub_parts[0] if pub_parts else None
                            container = cr_msg.get("container-title", [""])[0] if cr_msg.get("container-title") else None
                            paper = Paper(
                                id=f"doi:{clean_id}",
                                title=(cr_msg.get("title") or ["Untitled Paper"])[0],
                                authors=authors_list,
                                year=year_val,
                                doi=clean_id,
                                primary_source="crossref",
                                url=f"https://doi.org/{clean_id}",
                                journal=container,
                            )
                        if not paper.abstract and cr_msg.get("abstract"):
                            raw_abs = cr_msg.get("abstract")
                            clean_abs = re.sub(r"<[^>]+>", "", raw_abs).strip()
                            paper.abstract = clean_abs
                except Exception as e:
                    logger.debug("[AccessResolver] CrossRef lookup failed: %s", e)

        if not paper:
            # Fallback paper object created from identifier when external metadata APIs are unreachable
            paper = Paper(
                id=f"{id_type}:{clean_id}" if id_type != "query" else f"raw:{hash(identifier)}",
                title=clean_id if id_type != "query" else identifier,
                abstract="",
                doi=clean_id if id_type == "doi" else None,
                primary_source=id_type,
                url=f"https://doi.org/{clean_id}" if id_type == "doi" else identifier,
            )

        if paper:
            # Multi-source fallback candidate resolution if PDF or arXiv ID is missing
            if not paper.pdf_url and not paper.arxiv_id:
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers) as client:
                    # 1. Check Unpaywall for open-access PDF
                    if paper.doi:
                        try:
                            upw_resp = await client.get(
                                f"https://api.unpaywall.org/v2/{paper.doi}?email={settings.openalex_email or 'scholar@researchcopilot.org'}"
                            )
                            if upw_resp.status_code == 200:
                                upw_data = upw_resp.json()
                                if upw_data.get("is_oa"):
                                    best_oa = upw_data.get("best_oa_location") or {}
                                    pdf_cand = best_oa.get("url_for_pdf") or best_oa.get("url")
                                    if pdf_cand:
                                        paper.pdf_url = pdf_cand
                                        paper.is_open_access = True
                        except Exception as e:
                            logger.debug("[AccessResolver] Unpaywall lookup failed: %s", e)

                    # 2. Resolve DOI via Semantic Scholar to check for open access PDF or linked arXiv ID
                    if not paper.pdf_url and paper.doi:
                        try:
                            s2_url = f"https://api.semanticscholar.org/graph/v1/paper/{paper.doi}?fields=title,abstract,externalIds,openAccessPdf,tldr"
                            s2_resp = await client.get(s2_url)
                            if s2_resp.status_code == 200:
                                s2_data = s2_resp.json()
                                ext_ids = s2_data.get("externalIds", {})
                                if ext_ids.get("ArXiv"):
                                    paper.arxiv_id = ext_ids["ArXiv"]
                                    paper.pdf_url = f"https://arxiv.org/pdf/{paper.arxiv_id}.pdf"
                                elif s2_data.get("openAccessPdf", {}).get("url"):
                                    paper.pdf_url = s2_data["openAccessPdf"]["url"]
                                if not paper.abstract:
                                    paper.abstract = s2_data.get("abstract") or s2_data.get("tldr", {}).get("text") or ""
                        except Exception as e:
                            logger.debug("[AccessResolver] S2 DOI fallback failed: %s", e)

                    # 3. If still missing, try title search on arXiv
                    if not paper.pdf_url and not paper.arxiv_id and paper.title:
                        try:
                            clean_title = re.sub(r"[^a-zA-Z0-9\s]", " ", paper.title.split(":")[0]).strip()
                            if len(clean_title) >= 4:
                                arxiv_matches = await self.search_arxiv(clean_title, limit=3)
                                for am in arxiv_matches:
                                    t1 = re.sub(r"\W+", "", am.title.lower())
                                    t2 = re.sub(r"\W+", "", paper.title.lower())
                                    if t1 in t2 or t2 in t1 or am.title.lower().startswith(clean_title.lower()):
                                        paper.arxiv_id = am.arxiv_id
                                        paper.pdf_url = am.pdf_url or f"https://arxiv.org/pdf/{am.arxiv_id}.pdf"
                                        break
                        except Exception as e:
                            logger.debug("[AccessResolver] arXiv title fallback search failed: %s", e)

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

            # If no open-access PDF stream exists, generate publication preprint buffer from metadata
            if not paper.pdf_url:
                clean_ref = paper.doi or paper.arxiv_id or paper.id or identifier
                encoded_id = urllib.parse.quote(str(clean_ref))
                preprint_url = f"/api/v1/pdf/preprint?identifier={encoded_id}"
                paper.pdf_url = preprint_url
                candidates.append(PaperAccessCandidate(
                    source="preprint_buffer",
                    url=preprint_url,
                    format="pdf",
                    is_legal_oa=True,
                    priority=1
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
            if "/pdf/" in arxiv_id:
                arxiv_id = arxiv_id.split("/pdf/")[-1]
            arxiv_id = arxiv_id.replace(".pdf", "").replace("arxiv:", "").strip()
            
        pmid = ids.get("pmid")
        pmcid = ids.get("pmcid")
        
        # Primary / Best OA Location
        best_oa = item.get("best_oa_location") or item.get("primary_location") or {}
        pdf_url = best_oa.get("pdf_url")
        if not pdf_url:
            for loc in item.get("locations", []):
                if loc and loc.get("pdf_url"):
                    pdf_url = loc.get("pdf_url")
                    break
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
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

    # ── Europe PMC Full-Text JATS XML Ingestion ──────────────────────────────

    SECTION_CLASSIFIERS = [
        ("limitations", re.compile(r"\b(limitations?|failure modes?)\b", re.IGNORECASE)),
        ("methods", re.compile(r"\b(methods?|methodology|materials and methods|materials & methods|experimental procedures?|model architecture|proposed approach)\b", re.IGNORECASE)),
        ("experiments", re.compile(r"\b(experiments?|experimental setup|evaluations?|benchmarks?|datasets?)\b", re.IGNORECASE)),
        ("results", re.compile(r"\b(results?|findings|empirical analysis)\b", re.IGNORECASE)),
        ("discussion", re.compile(r"\b(discussion)\b", re.IGNORECASE)),
        ("intro", re.compile(r"\b(introduction|background|overview)\b", re.IGNORECASE)),
        ("conclusion", re.compile(r"\b(conclusions?|future work|summary)\b", re.IGNORECASE)),
    ]

    async def fetch_europepmc_xml(self, pmcid: str) -> List[PaperSection]:
        """
        Fetch and parse full-text JATS XML from Europe PMC REST API.
        Endpoint: https://www.ebi.ac.uk/europepmc/webservices/rest/{PMCID}/fullTextXML
        Extracts Abstract, Introduction, Methods, Experiments, Results, Discussion, Limitations.
        """
        if not pmcid:
            return []

        raw = str(pmcid).strip()
        clean_num = re.sub(r"^pmc:?", "", raw, flags=re.IGNORECASE).strip()
        if not clean_num:
            return []
        normalized_pmcid = f"PMC{clean_num}"

        url = f"{settings.europepmc_base_url}/{normalized_pmcid}/fullTextXML"
        logger.info("[AccessResolver] Fetching Europe PMC full-text XML for %s", normalized_pmcid)

        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code == 404:
                    logger.debug("[AccessResolver] Europe PMC full-text XML not available (404) for %s", normalized_pmcid)
                    return []
                if resp.status_code != 200:
                    logger.warning("[AccessResolver] Europe PMC XML request returned status %d for %s", resp.status_code, normalized_pmcid)
                    return []
                if not resp.content or len(resp.content) < 100:
                    return []

                return self.parse_jats_xml(resp.content)
        except httpx.TimeoutException:
            logger.warning("[AccessResolver] Europe PMC XML request timed out for %s", normalized_pmcid)
            return []
        except Exception as e:
            logger.warning("[AccessResolver] Europe PMC XML fetch exception for %s: %s", normalized_pmcid, e)
            return []

    def parse_jats_xml(self, xml_bytes: bytes) -> List[PaperSection]:
        """
        Parse raw JATS XML bytes into structured PaperSection entities.
        Handles XML namespaces, nested sub-sections, and classifies sections into canonical types.
        """
        sections: List[PaperSection] = []
        try:
            root = ET.fromstring(xml_bytes)
        except ET.ParseError as pe:
            logger.warning("[AccessResolver] JATS XML parse error: %s", pe)
            return []
        except Exception as e:
            logger.warning("[AccessResolver] Unexpected XML parsing error: %s", e)
            return []

        def _clean_tag(elem) -> str:
            return elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        def _get_text(elem) -> str:
            return " ".join("".join(elem.itertext()).split()).strip()

        # 1. Abstract extraction (<front>//<abstract>)
        abstract_elem = root.find(".//abstract")
        if abstract_elem is not None:
            p_elems = [p for p in abstract_elem.iter() if _clean_tag(p) == "p"]
            if p_elems:
                p_texts = [_get_text(p) for p in p_elems if _get_text(p)]
                abs_content = "\n\n".join(p_texts)
            else:
                abs_content = _get_text(abstract_elem)

            if abs_content:
                sections.append(PaperSection(
                    title="Abstract",
                    content=abs_content,
                    section_type="abstract",
                ))

        # 2. Body sections extraction (<body//sec>)
        body_elem = root.find(".//body")
        if body_elem is not None:
            self._extract_jats_body_sections(body_elem, sections)

        return sections

    def _classify_section(self, title: str, sec_type_attr: str = "") -> str:
        """Classify a section title and JATS sec-type attribute into a canonical section_type."""
        attr_lower = sec_type_attr.lower().strip()
        title_lower = title.lower().strip()

        # Attribute-based checks
        if "limit" in attr_lower:
            return "limitations"
        if attr_lower in ("intro", "introduction"):
            return "intro"
        if any(m in attr_lower for m in ("method", "material")):
            return "methods"
        if any(r in attr_lower for r in ("result", "experiment")):
            return "results"
        if "discussion" in attr_lower:
            # Check if title explicitly specifies limitations
            if "limitation" in title_lower:
                return "limitations"
            return "discussion"
        if any(c in attr_lower for c in ("conclusion", "conclusions")):
            return "conclusion"

        # Title-based checks (regex order matters: limitations before discussion)
        for sec_name, pattern in self.SECTION_CLASSIFIERS:
            if pattern.search(title_lower):
                return sec_name

        return "other"

    def _extract_jats_body_sections(self, body_elem: ET.Element, sections: List[PaperSection]) -> None:
        """Traverse JATS XML body sections, handling nested subsections without losing content."""
        def _clean_tag(elem) -> str:
            return elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

        def _get_text(elem) -> str:
            return " ".join("".join(elem.itertext()).split()).strip()

        # Process top-level sections
        top_secs = [child for child in body_elem if _clean_tag(child) == "sec"]
        if not top_secs:
            # Fallback: find all sec elements anywhere in body
            top_secs = body_elem.findall(".//sec")

        for sec in top_secs:
            sec_type_attr = sec.attrib.get("sec-type", "")
            title_elem = sec.find("title")
            title_text = _get_text(title_elem) if title_elem is not None else ""

            # Check for direct paragraphs
            direct_p = [child for child in sec if _clean_tag(child) == "p"]
            child_secs = [child for child in sec if _clean_tag(child) == "sec"]

            if direct_p:
                p_texts = [_get_text(p) for p in direct_p if _get_text(p)]
                content = "\n\n".join(p_texts)
                if content:
                    sec_type = self._classify_section(title_text or "Section", sec_type_attr)
                    sections.append(PaperSection(
                        title=title_text or "Section",
                        content=content,
                        section_type=sec_type,
                    ))

            # Process nested subsections if present
            for sub_sec in child_secs:
                sub_attr = sub_sec.attrib.get("sec-type", "") or sec_type_attr
                sub_title_elem = sub_sec.find("title")
                sub_title_text = _get_text(sub_title_elem) if sub_title_elem is not None else ""
                combined_title = f"{title_text} - {sub_title_text}".strip(" - ")

                sub_p = [p for p in sub_sec.iter() if _clean_tag(p) == "p"]
                if sub_p:
                    sub_texts = [_get_text(p) for p in sub_p if _get_text(p)]
                    sub_content = "\n\n".join(sub_texts)
                    if sub_content:
                        sub_sec_type = self._classify_section(combined_title, sub_attr)
                        sections.append(PaperSection(
                            title=combined_title or "Subsection",
                            content=sub_content,
                            section_type=sub_sec_type,
                        ))

