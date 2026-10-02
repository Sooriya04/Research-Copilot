import re
from typing import Any, Dict, List, Optional, Union
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.engines.abstract_entity_extractor import AbstractEntityExtractor
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.paperswithcode import PapersWithCodeClient
from src.graph.normalizer import normalize_entity, extract_heuristic_entities

OPENALEX_BASE = "https://api.openalex.org"
HEADERS = {"User-Agent": "ResearchCopilot/2.0 (mailto:team@researchcopilot.ai)"}


class PaperEnricher:
    """Orchestrates lightweight multi-source paper intelligence enrichment prior to GraphBuilder ingestion.
    
    Enrichment Pipeline:
    1. Deterministic OpenAlex metadata (topics, referenced works for citations, publication year, authors)
    2. Deterministic Papers With Code metadata (benchmarks, datasets, tasks, repositories)
    3. Abstract Entity Extraction (Title + Abstract ONLY via Gemini Flash-Lite or Heuristic fallback)
    4. Canonical Entity Normalization (LoRA aliases, stop entity pruning)
    
    Does NOT download full PDFs or pass full PDFs to LLMs.
    """

    def __init__(
        self,
        pwc_client: Optional[PapersWithCodeClient] = None,
        abstract_extractor: Optional[AbstractEntityExtractor] = None,
        resolver: Optional[CanonicalPaperResolver] = None,
        timeout: float = 10.0,
    ):
        self.pwc_client = pwc_client or PapersWithCodeClient(timeout=timeout)
        self.abstract_extractor = abstract_extractor or AbstractEntityExtractor()
        self.resolver = resolver or CanonicalPaperResolver()
        self.timeout = timeout

    @staticmethod
    def _clean_arxiv_id(raw_id: Optional[str]) -> Optional[str]:
        if not raw_id:
            return None
        s = str(raw_id).strip()
        s = re.sub(r"^https?://arxiv\.org/(abs|pdf)/", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^arxiv:\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\.pdf$", "", s, flags=re.IGNORECASE)
        s = re.sub(r"v\d+$", "", s)
        m = re.search(r"(\d{4}\.\d{4,5}|[a-z\-]+/\d{7})", s)
        return m.group(0) if m else (s or None)

    @staticmethod
    def _clean_doi(raw_doi: Optional[str]) -> Optional[str]:
        if not raw_doi:
            return None
        s = str(raw_doi).strip()
        s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^doi:\s*", "", s, flags=re.IGNORECASE)
        m = re.search(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", s)
        return m.group(0) if m else (s or None)

    async def enrich_by_identifier(self, identifier: str) -> Dict[str, Any]:
        """Resolve metadata by identifier (arXiv, DOI, OpenAlex, title) and enrich with entities."""
        paper = await self.resolver.resolve(identifier)
        if not paper:
            # Fallback basic dict from query
            return await self.enrich({
                "id": identifier,
                "title": identifier,
                "abstract": "",
            })

        base_arxiv = self._clean_arxiv_id(paper.arxiv_id)
        paper_dict = {
            "id": paper.canonical_id,
            "title": paper.title,
            "abstract": paper.abstract or "",
            "year": paper.year,
            "authors": [a.name for a in paper.authors if a.name],
            "doi": paper.doi,
            "arxiv_id": base_arxiv,
            "openalex_id": paper.openalex_id,
            "topics": [s.source_name for s in paper.sources if s.source_name] if hasattr(paper, "sources") else [],
            "referenced_works": [],
            "methods": [],
            "datasets": [],
            "tasks": [],
            "metrics": [],
            "benchmarks": [],
            "repositories": [r.url for r in paper.code_repositories] if paper.code_repositories else [],
        }
        return await self.enrich(paper_dict)

    async def enrich(self, paper_input: Union[Dict[str, Any], Any]) -> Dict[str, Any]:
        """Enrich paper with OpenAlex, Papers With Code, and Abstract Entity Extraction."""
        if hasattr(paper_input, "model_dump"):
            data = paper_input.model_dump(mode="python")
        elif isinstance(paper_input, dict):
            data = dict(paper_input)
        else:
            data = {
                "id": str(getattr(paper_input, "id", "unknown-paper")),
                "title": getattr(paper_input, "title", "Untitled Paper"),
                "abstract": getattr(paper_input, "abstract", ""),
                "year": getattr(paper_input, "year", None),
                "authors": getattr(paper_input, "authors", []),
                "doi": getattr(paper_input, "doi", None),
                "arxiv_id": getattr(paper_input, "arxiv_id", None),
                "openalex_id": getattr(paper_input, "openalex_id", None),
                "topics": getattr(paper_input, "topics", []),
                "methods": getattr(paper_input, "methods", []),
                "datasets": getattr(paper_input, "datasets", []),
                "tasks": getattr(paper_input, "tasks", []),
                "metrics": getattr(paper_input, "metrics", []),
                "benchmarks": getattr(paper_input, "benchmarks", []),
                "repositories": getattr(paper_input, "repositories", []),
                "referenced_works": getattr(paper_input, "referenced_works", []),
            }

        title = str(data.get("title") or "").strip()
        abstract = str(data.get("abstract") or "").strip()
        arxiv_id = self._clean_arxiv_id(data.get("arxiv_id"))
        doi = self._clean_doi(data.get("doi"))
        openalex_id = data.get("openalex_id")
        paper_id = data.get("id") or (f"arxiv:{arxiv_id}" if arxiv_id else (f"doi:{doi}" if doi else "paper-unknown"))

        # Extract list fields
        authors = list(data.get("authors") or [])
        clean_authors = []
        for a in authors:
            if isinstance(a, str) and a.strip():
                clean_authors.append(a.strip())
            elif isinstance(a, dict) and a.get("name"):
                clean_authors.append(str(a["name"]).strip())

        topics = [str(t).strip() for t in (data.get("topics") or []) if t]
        referenced_works = [str(r).strip() for r in (data.get("referenced_works") or data.get("cited_papers") or []) if r]
        methods = [str(m).strip() for m in (data.get("methods") or []) if m]
        datasets = [str(d).strip() for d in (data.get("datasets") or []) if d]
        tasks = [str(t).strip() for t in (data.get("tasks") or []) if t]
        metrics = list(data.get("metrics") or [])
        benchmarks = list(data.get("benchmarks") or [])
        repositories = [str(r).strip() for r in (data.get("repositories") or []) if r]
        year = data.get("year")

        # ── 1. Deterministic OpenAlex Metadata ─────────────────────────────────
        # Fill missing topics, referenced works, or publication year
        if not referenced_works or not topics or not year:
            try:
                openalex_work = await self._fetch_openalex_metadata(
                    openalex_id=openalex_id, doi=doi, title=title
                )
                if openalex_work:
                    if not referenced_works:
                        raw_refs = openalex_work.get("referenced_works") or []
                        referenced_works = [str(r).split("/")[-1] for r in raw_refs if r]
                    if not topics:
                        for c in openalex_work.get("concepts", [])[:6]:
                            c_name = c.get("display_name")
                            if c_name and c_name not in topics:
                                topics.append(c_name)
                    if not year:
                        year = openalex_work.get("publication_year")
                    if not abstract and openalex_work.get("abstract_inverted_index"):
                        abstract = self._reconstruct_inverted_abstract(openalex_work["abstract_inverted_index"])
                    if not doi and openalex_work.get("doi"):
                        doi = self._clean_doi(openalex_work.get("doi"))
                    if not openalex_id and openalex_work.get("id"):
                        openalex_id = str(openalex_work["id"]).split("/")[-1]
            except Exception as e:
                logger.debug("[PaperEnricher] OpenAlex enrichment notice: %s", e)

        # ── 2. Deterministic Papers With Code Metadata ─────────────────────────
        # Fetch benchmarks, official datasets, tasks, repositories
        try:
            pwc_benchmarks = await self.pwc_client.get_paper_benchmarks(arxiv_id=arxiv_id, title=title)
            for b in pwc_benchmarks:
                benchmarks.append(b.model_dump() if hasattr(b, "model_dump") else b.__dict__)
                if b.dataset and b.dataset not in datasets:
                    datasets.append(b.dataset)
                if b.task and b.task not in tasks:
                    tasks.append(b.task)
                if b.model and b.model != title and b.model not in methods:
                    methods.append(b.model)
                if b.metric and b.value:
                    metrics.append({"name": b.metric, "value": str(b.value)})

            pwc_repos = await self.pwc_client.get_code_repositories(arxiv_id=arxiv_id, title=title)
            for r in pwc_repos:
                if r.url and r.url not in repositories:
                    repositories.append(r.url)
        except Exception as e:
            logger.debug("[PaperEnricher] PapersWithCode lookup notice: %s", e)

        # ── 3. Abstract Entity Extraction (Title + Abstract ONLY) ───────────────
        # Only invoke if abstract or title is present
        if title or abstract:
            try:
                extracted = await self.abstract_extractor.extract_entities(
                    title=title,
                    abstract=abstract,
                    identifier=arxiv_id or doi or openalex_id or title,
                )
                for m in extracted.get("methods", []):
                    if m not in methods:
                        methods.append(m)
                for d in extracted.get("datasets", []):
                    if d not in datasets:
                        datasets.append(d)
                for t in extracted.get("tasks", []):
                    if t not in tasks:
                        tasks.append(t)
                for met in extracted.get("metrics", []):
                    metrics.append(met)
            except Exception as e:
                logger.info("[PaperEnricher] Abstract extraction fallback to heuristics: %s", e)
                h_res = extract_heuristic_entities(f"{title} {abstract}")
                methods.extend(h_res.get("methods", []))
                datasets.extend(h_res.get("datasets", []))
                tasks.extend(h_res.get("tasks", []))

        # ── 4. Entity Normalization & Canonical Deduplication ───────────────────
        normalized_methods: List[str] = []
        for m in methods:
            norm = normalize_entity(str(m))
            if norm and norm not in normalized_methods:
                normalized_methods.append(norm)

        normalized_datasets: List[str] = []
        for d in datasets:
            norm = normalize_entity(str(d))
            if norm and norm not in normalized_datasets:
                normalized_datasets.append(norm)

        normalized_tasks: List[str] = []
        for t in tasks:
            norm = normalize_entity(str(t))
            if norm and norm not in normalized_tasks:
                normalized_tasks.append(norm)

        return {
            "id": paper_id,
            "title": title or "Untitled Paper",
            "abstract": abstract,
            "year": int(year) if year and str(year).isdigit() else None,
            "authors": clean_authors,
            "doi": doi,
            "arxiv_id": arxiv_id,
            "openalex_id": openalex_id,
            "topics": list(dict.fromkeys(topics)),
            "methods": normalized_methods,
            "datasets": normalized_datasets,
            "tasks": normalized_tasks,
            "metrics": metrics,
            "benchmarks": benchmarks,
            "repositories": list(dict.fromkeys(repositories)),
            "referenced_works": list(dict.fromkeys(referenced_works)),
            "cited_papers": list(dict.fromkeys(referenced_works)),
        }

    async def _fetch_openalex_metadata(
        self,
        openalex_id: Optional[str] = None,
        doi: Optional[str] = None,
        title: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Query OpenAlex for deterministic metadata without downloading PDFs."""
        req_headers = dict(HEADERS)
        if settings.openalex_api_key:
            req_headers["Authorization"] = f"Bearer {settings.openalex_api_key}"

        oa_params: Dict[str, Any] = {}
        if settings.openalex_api_key:
            oa_params["api_key"] = settings.openalex_api_key
        if settings.openalex_email:
            oa_params["mailto"] = settings.openalex_email

        async with httpx.AsyncClient(headers=req_headers, timeout=self.timeout) as client:
            if openalex_id:
                clean_id = openalex_id.split("/")[-1].upper()
                resp = await client.get(f"{OPENALEX_BASE}/works/{clean_id}", params=oa_params)
                if resp.status_code == 200:
                    return resp.json()

            if doi:
                resp = await client.get(f"{OPENALEX_BASE}/works/https://doi.org/{doi}", params=oa_params)
                if resp.status_code == 200:
                    return resp.json()

            if title and len(title.strip()) >= 5:
                clean_title = re.sub(r"[^\w\s-]", " ", title).strip()
                search_params = {**oa_params, "search": clean_title, "per_page": 1}
                resp = await client.get(
                    f"{OPENALEX_BASE}/works",
                    params=search_params,
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        return results[0]

        return None

    @staticmethod
    def _reconstruct_inverted_abstract(inv_index: Dict[str, List[int]]) -> str:
        """Reconstruct plain abstract text from OpenAlex inverted index."""
        if not inv_index or not isinstance(inv_index, dict):
            return ""
        words: List[tuple] = []
        for word, positions in inv_index.items():
            for pos in positions:
                words.append((pos, word))
        words.sort(key=lambda x: x[0])
        return " ".join(w[1] for w in words)
