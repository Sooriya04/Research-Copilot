import re
import time
import xml.etree.ElementTree as ET
from typing import List, Optional
import requests

from src.ingestion.arxiv.models import ArxivPaper, Author, ArxivSearchResult


class ArxivClient:
    """Client for querying and ingesting literature metadata from the official arXiv API."""

    BASE_URLS = [
        "https://export.arxiv.org/api/query",
        "http://export.arxiv.org/api/query",
    ]
    NAMESPACES = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }

    def __init__(self, timeout: int = 15, retries: int = 3):
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "ResearchCopilot/1.0 (https://github.com/Sooriya04/Research-Copilot; mailto:contact@researchcopilot.org)",
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
        Search arXiv for papers matching a given keyword/phrase query.

        Args:
            query: The search query string (e.g. "attention is all you need")
            max_results: Top K results to retrieve (default: 5)
            start: Offset index for pagination (default: 0)
            sort_by: Sorting field ('relevance', 'lastUpdatedDate', 'submittedDate')
            sort_order: 'descending' or 'ascending'

        Returns:
            ArxivSearchResult containing normalized ArxivPaper instances.
        """
        search_query_str = self._format_search_query(query)
        params = {
            "search_query": search_query_str,
            "start": start,
            "max_results": max_results,
            "sortBy": sort_by,
            "sortOrder": sort_order,
        }

        xml_data = None
        last_exception = None

        for attempt in range(1, self.retries + 1):
            for base_url in self.BASE_URLS:
                try:
                    res = self.session.get(base_url, params=params, timeout=self.timeout)
                    if res.status_code == 200:
                        xml_data = res.text
                        break
                    elif res.status_code == 429:
                        time.sleep(1.5 * attempt)
                except Exception as e:
                    last_exception = e
                    time.sleep(1.0 * attempt)
            if xml_data is not None:
                break

        if xml_data is None:
            raise RuntimeError(f"Failed to fetch from arXiv API after {self.retries} attempts: {last_exception}")

        return self._parse_xml_response(xml_data, query=query)

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
