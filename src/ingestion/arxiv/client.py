import json
import logging
import re
import time
import urllib.parse
import xml.etree.ElementTree as ET
from typing import List, Optional
import requests

from src.core.database import get_db_connection
from src.ingestion.arxiv.models import ArxivPaper, Author, ArxivSearchResult

logger = logging.getLogger("research_copilot.arxiv")


class ArxivClient:
    """Client for querying literature metadata directly from arXiv API, checking DB caching, and utilizing Go PDF extractor."""

    BASE_URLS = [
        "https://export.arxiv.org/api/query",
        "http://export.arxiv.org/api/query",
    ]
    NAMESPACES = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }
    
    # Go Extractor Microservice Config
    GO_EXTRACTOR_URL = "http://localhost:8001/api/v1"

    # Global request throttle tracker to obey arXiv's 3-second delay rule
    _last_request_time = 0.0
    THROTTLE_DELAY = 15.0  # seconds compliant with arXiv robots.txt Crawl-delay

    def __init__(self, timeout: int = 30, retries: int = 4):
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "ArxivClient/1.0",
            "Accept": "application/atom+xml,application/xml,text/xml",
        })

    def _clean_text(self, text: Optional[str]) -> str:
        if not text:
            return ""
        cleaned = re.sub(r"\s+", " ", text.strip())
        return cleaned

    def _extract_arxiv_id(self, raw_id: str) -> str:
        match = re.search(r"arxiv\.org/abs/([^/]+)$", raw_id)
        if match:
            return match.group(1)
        return raw_id.split("/")[-1]

    def _format_search_query(self, query: str) -> str:
        words = [w.strip() for w in query.split() if w.strip()]
        if not words:
            return "all:all"
        phrase = "+".join(words)
        return f"all:{phrase}"

    def search(
        self,
        query: str,
        max_results: int = 5,
        start: int = 0,
        sort_by: str = "relevance",
        sort_order: str = "descending",
    ) -> ArxivSearchResult:
        """
        Search arXiv. Checks local database first, retrieves missing papers concurrently via Go microservice.
        """
        search_query_str = self._format_search_query(query)
        params = {
            "search_query": search_query_str,
            "start": start,
            "max_results": max_results,
            "sortBy": sort_by,
            "sortOrder": sort_order,
        }

        # 1. Fetch metadata from official arXiv API
        elapsed = time.time() - ArxivClient._last_request_time
        if elapsed < self.THROTTLE_DELAY:
            wait_time = self.THROTTLE_DELAY - elapsed
            logger.info("Throttling request: waiting %.2f seconds before querying arXiv API...", wait_time)
            time.sleep(wait_time)

        xml_data = None
        last_exception = None

        for attempt in range(1, self.retries + 1):
            for base_url in self.BASE_URLS:
                try:
                    logger.debug("Querying arXiv URL: %s (attempt %d/%d)", base_url, attempt, self.retries)
                    ArxivClient._last_request_time = time.time()
                    res = self.session.get(base_url, params=params, timeout=self.timeout)
                    if res.status_code == 200:
                        xml_data = res.text
                        break
                    elif res.status_code == 429:
                        wait_sec = 3.0 * attempt
                        logger.warning("arXiv rate limit (429) hit. Backing off %d seconds...", wait_sec)
                        time.sleep(wait_sec)
                except requests.exceptions.ConnectionError as ce:
                    last_exception = ce
                    logger.error("Connection refused by arXiv server: %s. Aborting retries.", ce)
                    break
                except Exception as e:
                    last_exception = e
                    wait_sec = 3.0 * attempt
                    logger.warning("arXiv API query failed: %s. Retrying in %d seconds...", str(e), wait_sec)
                    time.sleep(wait_sec)
            if xml_data is not None or isinstance(last_exception, requests.exceptions.ConnectionError):
                break

        if xml_data is None:
            logger.error("Failed to retrieve data from arXiv API after %d attempts. Last exception: %s", self.retries, last_exception)
            raise RuntimeError(f"Failed to fetch from arXiv API after {self.retries} attempts: {last_exception}")

        # Parse XML response to get metadata
        result = self._parse_xml_response(xml_data, query=query)
        if not result.papers:
            return result

        # 2. Check which papers exist in local PostgreSQL database (Batch query)
        paper_ids = [p.arxiv_id for p in result.papers]
        existing_papers = {}
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT paper_id, title, abstract, full_text FROM arxiv_papers WHERE paper_id = ANY(%s);",
                    (paper_ids,)
                )
                for row in cur.fetchall():
                    existing_papers[row[0]] = {
                        "title": row[1],
                        "abstract": row[2],
                        "full_text": row[3],
                        "paragraphs": []
                    }
                
                # Fetch paragraphs
                if existing_papers:
                    cur.execute(
                        "SELECT paper_id, text FROM paper_paragraphs WHERE paper_id = ANY(%s) ORDER BY paragraph_index;",
                        (list(existing_papers.keys()),)
                    )
                    for row in cur.fetchall():
                        existing_papers[row[0]]["paragraphs"].append(row[1])

        logger.info("Found %d/%d papers already cached in PostgreSQL database.", len(existing_papers), len(paper_ids))

        # 3. For missing papers: download & extract text using stateless Go microservice
        for paper in result.papers:
            if paper.arxiv_id in existing_papers:
                paper.full_text = existing_papers[paper.arxiv_id]["full_text"]
                paper.paragraphs = existing_papers[paper.arxiv_id]["paragraphs"]
                continue
            
            logger.info("Ingesting new paper: '%s' (ID: %s)", paper.title, paper.arxiv_id)
            try:
                # Call Go /download endpoint
                dl_res = requests.post(
                    f"{self.GO_EXTRACTOR_URL}/download",
                    json={"id": paper.arxiv_id, "pdf_url": paper.pdf_url},
                    timeout=45
                )
                if dl_res.status_code != 200:
                    logger.error("Go download service failed for paper %s: %s", paper.arxiv_id, dl_res.text)
                    continue
                
                local_path = dl_res.json().get("local_path")
                if not local_path:
                    continue

                # Call Go /extract endpoint
                ext_res = requests.post(
                    f"{self.GO_EXTRACTOR_URL}/extract",
                    json={"path": local_path},
                    timeout=90
                )
                if ext_res.status_code != 200:
                    logger.error("Go extraction service failed for paper %s: %s", paper.arxiv_id, ext_res.text)
                    continue
                
                ext_data = ext_res.json()
                paragraphs_list = ext_data.get("paragraphs", [])
                full_text = "\n\n".join([p.get("text", "") for p in paragraphs_list])

                # 4. Save to PostgreSQL database (Batch commit)
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        # Insert into arxiv_papers
                        cur.execute(
                            """
                            INSERT INTO arxiv_papers (
                                paper_id, title, abstract, authors, published_at, pdf_url, 
                                full_text, paragraph_count, page_count, word_count, metadata
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (paper_id) DO NOTHING;
                            """,
                            (
                                paper.arxiv_id,
                                paper.title,
                                paper.abstract,
                                json.dumps([a.dict() for a in paper.authors]),
                                paper.published_date,
                                paper.pdf_url,
                                full_text,
                                len(paragraphs_list),
                                ext_data.get("page_count", 0),
                                ext_data.get("word_count", 0),
                                json.dumps(paper.dict())
                            )
                        )
                        
                        # Batch Insert into paper_paragraphs
                        from psycopg2.extras import execute_batch
                        paragraphs_data = [
                            (
                                paper.arxiv_id,
                                p_idx,
                                p_data.get("page_number", 1),
                                p_data.get("text", "")
                            )
                            for p_idx, p_data in enumerate(paragraphs_list)
                        ]
                        execute_batch(
                            cur,
                            """
                            INSERT INTO paper_paragraphs (
                                paper_id, paragraph_index, page_number, text
                            ) VALUES (%s, %s, %s, %s);
                            """,
                            paragraphs_data
                        )
                    conn.commit()
                paper.full_text = full_text
                paper.paragraphs = [p.get("text", "") for p in paragraphs_list]
                logger.info("Successfully ingested, extracted, and stored paper %s inside database.", paper.arxiv_id)

            except Exception as ex:
                logger.error("Failed to concurrently process paper %s via Go service: %s", paper.arxiv_id, ex, exc_info=True)

        return result

    def _parse_xml_response(self, xml_string: str, query: str) -> ArxivSearchResult:
        root = ET.fromstring(xml_string)

        total_elem = root.find("opensearch:totalResults", {"opensearch": "http://a9.com/-/spec/opensearch/1.1/"})
        total_results = int(total_elem.text) if total_elem is not None and total_elem.text else 0

        entries = root.findall("atom:entry", self.NAMESPACES)
        papers: List[ArxivPaper] = []

        for entry in entries:
            raw_id = entry.findtext("atom:id", "", self.NAMESPACES)
            arxiv_id = self._extract_arxiv_id(raw_id)

            title = self._clean_text(entry.findtext("atom:title", "", self.NAMESPACES))
            abstract = self._clean_text(entry.findtext("atom:summary", "", self.NAMESPACES))
            published_date = entry.findtext("atom:published", "", self.NAMESPACES)
            updated_date = entry.findtext("atom:updated", None, self.NAMESPACES)

            # Authors
            authors: List[Author] = []
            for author_elem in entry.findall("atom:author", self.NAMESPACES):
                name = self._clean_text(author_elem.findtext("atom:name", "", self.NAMESPACES))
                affil = author_elem.findtext("arxiv:affiliation", None, self.NAMESPACES)
                if name:
                    authors.append(Author(name=name, affiliation=self._clean_text(affil) if affil else None))

            # Categories
            categories: List[str] = []
            primary_cat_elem = entry.find("arxiv:primary_category", self.NAMESPACES)
            primary_category = primary_cat_elem.attrib.get("term", "") if primary_cat_elem is not None else ""

            for cat_elem in entry.findall("atom:category", self.NAMESPACES):
                term = cat_elem.attrib.get("term")
                if term and term not in categories:
                    categories.append(term)

            if not primary_category and categories:
                primary_category = categories[0]

            # Links
            pdf_url = ""
            entry_url = raw_id
            for link in entry.findall("atom:link", self.NAMESPACES):
                rel = link.attrib.get("rel")
                href = link.attrib.get("href", "")
                title_attr = link.attrib.get("title", "")
                link_type = link.attrib.get("type", "")

                if title_attr == "pdf" or link_type == "application/pdf":
                    pdf_url = href
                elif rel == "alternate":
                    entry_url = href

            if not pdf_url:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

            # DOI & Journal Ref
            doi = entry.findtext("arxiv:doi", None, self.NAMESPACES)
            journal_ref = entry.findtext("arxiv:journal_ref", None, self.NAMESPACES)

            paper = ArxivPaper(
                arxiv_id=arxiv_id,
                title=title,
                abstract=abstract,
                authors=authors,
                published_date=published_date,
                updated_date=updated_date,
                pdf_url=pdf_url,
                entry_id=entry_url,
                primary_category=primary_category,
                categories=categories,
                doi=self._clean_text(doi) if doi else None,
                journal_ref=self._clean_text(journal_ref) if journal_ref else None,
            )
            papers.append(paper)

        return ArxivSearchResult(
            query=query,
            total_results=total_results,
            returned_count=len(papers),
            papers=papers,
        )
