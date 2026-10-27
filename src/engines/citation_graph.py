"""
Citation Graph Engine for Research Copilot / PaperRank.
Constructs directed citation graphs, executes bounded multi-hop expansion via OpenAlex,
and computes damping-factored PageRank (alpha = 0.85) to surface research prestige.
"""

import asyncio
import re
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx
import networkx as nx

from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import Author, Paper


class CitationGraphEngine:
    """
    Constructs citation networks and calculates graph prestige (PageRank).
    
    Graph Topology & Direction:
    - Directed edge convention: A -> B represents 'Paper A cites Paper B'.
    - PageRank flow: Probability mass flows along citations into the cited paper.
      Consequently, papers that are heavily cited (and cited by other high-prestige works)
      accumulate higher PageRank scores.
    """

    def __init__(self, damping: float = 0.85, timeout: float = 8.0):
        self.damping = damping
        self.timeout = timeout
        self.headers = {
            "User-Agent": f"ResearchCopilot/{settings.app_version} (mailto:{settings.openalex_email})"
        }
        if settings.openalex_api_key:
            self.headers["Authorization"] = f"Bearer {settings.openalex_api_key}"
        # In-memory API cache to prevent redundant HTTP lookups
        self._work_cache: Dict[str, Dict[str, Any]] = {}
        self._cites_cache: Dict[str, List[Dict[str, Any]]] = {}

    @staticmethod
    def normalize_node_id(identifier: str) -> str:
        """Extract clean canonical node identifier (e.g. 'W2741809807', '10.1038/...', or clean ID)."""
        if not identifier:
            return ""
        s = str(identifier).strip()
        if "openalex.org/" in s.lower():
            match = re.search(r"[wW][0-9A-Za-z_]+", s)
            if match:
                return match.group(0).upper()
        if s.lower().startswith("openalex:"):
            return s.split(":", 1)[-1].strip()
        if "/" in s and not s.startswith("10."):
            return s.split("/")[-1].strip()
        return s

    def build_graph(self, papers: List[Paper]) -> nx.DiGraph:
        """
        Build baseline directed citation graph from candidate papers and their referenced works.
        Preserves original 1-hop behavior when citation expansion is disabled.
        """
        graph = nx.DiGraph()
        paper_map = {self.normalize_node_id(p.id): p for p in papers}

        # Add candidate nodes
        for p in papers:
            clean_id = self.normalize_node_id(p.id)
            graph.add_node(clean_id, title=p.title, year=p.year, citations=p.citation_count)

        # Add directed citation edges: citing paper -> cites -> cited paper
        for p in papers:
            clean_pid = self.normalize_node_id(p.id)
            for ref_id in p.referenced_works:
                clean_ref = self.normalize_node_id(ref_id)
                if clean_ref:
                    if clean_ref not in graph:
                        graph.add_node(clean_ref, title="Referenced Prior Art")
                    graph.add_edge(clean_pid, clean_ref)

        return graph

    def calculate_prestige(self, graph: nx.DiGraph) -> Dict[str, float]:
        """
        Compute PageRank prestige scores normalized to [0, 100].
        A higher score reflects greater graph centrality and incoming citation authority.
        """
        if len(graph) == 0:
            return {}
        try:
            raw_scores = nx.pagerank(graph, alpha=self.damping, max_iter=100)
            max_val = max(raw_scores.values()) if raw_scores else 1.0
            if max_val <= 0.0:
                max_val = 1.0
            # Scale to [0, 100]
            normalized = {node: (val / max_val) * 100.0 for node, val in raw_scores.items()}
            return normalized
        except Exception as e:
            logger.warning("[CitationGraphEngine] PageRank calculation note: %s", e)
            return {node: 10.0 for node in graph.nodes}

    def get_graph_stats(self, graph: nx.DiGraph) -> Tuple[int, int]:
        """Return (num_nodes, num_edges)."""
        return graph.number_of_nodes(), graph.number_of_edges()

    # =========================================================================
    # Multi-Hop Bounded Expansion via OpenAlex API
    # =========================================================================

    async def expand_graph(
        self,
        seed_papers: List[Paper],
        depth: int = 1,
        max_expansion_per_node: int = 10,
        max_total_nodes: int = 80,
        timeout: Optional[float] = None,
    ) -> Tuple[nx.DiGraph, Dict[str, float], List[Paper]]:
        """
        Perform bounded multi-hop citation graph expansion:
        1. Queries OpenAlex for works citing the seeds (`filter=cites:{openalex_id}`).
        2. Queries OpenAlex for works referenced by the seeds (`referenced_works`).
        3. Constructs the directed NetworkX graph (citing -> cited).
        4. Calculates damping-factored PageRank (alpha = 0.85).
        5. Returns (graph, prestige_scores, discovered_papers).
        """
        if depth <= 0 or not seed_papers:
            base_graph = self.build_graph(seed_papers)
            prestige = self.calculate_prestige(base_graph)
            return base_graph, prestige, []

        req_timeout = timeout or self.timeout
        graph = nx.DiGraph()
        known_nodes: Set[str] = set()
        discovered_papers: Dict[str, Paper] = {}

        # 1. Initialize graph with seed papers
        for p in seed_papers:
            clean_id = self.normalize_node_id(p.id)
            known_nodes.add(clean_id)
            graph.add_node(
                clean_id,
                title=p.title,
                year=p.year,
                citations=p.citation_count,
                is_seed=True,
            )

        # 2. Identify candidate OpenAlex seeds to expand (limit to top 6 to respect rate limits)
        seeds_to_expand: List[Tuple[str, Paper]] = []
        for p in seed_papers[:8]:
            oa_id = self._extract_openalex_id(p)
            if oa_id:
                seeds_to_expand.append((oa_id, p))

        # 3. Traversal Loop
        async with httpx.AsyncClient(timeout=req_timeout, headers=self.headers) as client:
            current_layer_seeds = seeds_to_expand
            for hop in range(min(depth, 2)):
                if len(graph) >= max_total_nodes or not current_layer_seeds:
                    break

                next_layer_seeds: List[Tuple[str, Paper]] = []

                # Expand citing works and referenced works in parallel
                tasks = []
                for oa_id, p in current_layer_seeds:
                    tasks.append(self._fetch_citing_works(client, oa_id, max_expansion_per_node))
                    tasks.append(self._fetch_referenced_works(client, p.referenced_works[:max_expansion_per_node]))

                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Process results in pairs (citing, referenced)
                for idx in range(0, len(results), 2):
                    citing_res = results[idx]
                    ref_res = results[idx + 1] if idx + 1 < len(results) else []
                    seed_idx = idx // 2
                    if seed_idx < len(current_layer_seeds):
                        seed_oa_id, seed_paper = current_layer_seeds[seed_idx]
                        seed_node_id = self.normalize_node_id(seed_paper.id)

                        # Process Citing Works: Citing -> Seed
                        if isinstance(citing_res, list):
                            for work in citing_res:
                                if len(graph) >= max_total_nodes:
                                    break
                                paper_obj = self._parse_openalex_work(work)
                                if paper_obj:
                                    c_id = self.normalize_node_id(paper_obj.id)
                                    if c_id not in known_nodes:
                                        known_nodes.add(c_id)
                                        discovered_papers[c_id] = paper_obj
                                        graph.add_node(c_id, title=paper_obj.title, year=paper_obj.year, citations=paper_obj.citation_count, is_seed=False)
                                        c_oa = self._extract_openalex_id(paper_obj)
                                        if c_oa and hop < depth - 1:
                                            next_layer_seeds.append((c_oa, paper_obj))
                                    graph.add_edge(c_id, seed_node_id)

                        # Process Referenced Works: Seed -> Referenced
                        if isinstance(ref_res, list):
                            for work in ref_res:
                                if len(graph) >= max_total_nodes:
                                    break
                                paper_obj = self._parse_openalex_work(work)
                                if paper_obj:
                                    r_id = self.normalize_node_id(paper_obj.id)
                                    if r_id not in known_nodes:
                                        known_nodes.add(r_id)
                                        discovered_papers[r_id] = paper_obj
                                        graph.add_node(r_id, title=paper_obj.title, year=paper_obj.year, citations=paper_obj.citation_count, is_seed=False)
                                        r_oa = self._extract_openalex_id(paper_obj)
                                        if r_oa and hop < depth - 1:
                                            next_layer_seeds.append((r_oa, paper_obj))
                                    graph.add_edge(seed_node_id, r_id)

                current_layer_seeds = next_layer_seeds[:4]

        # 4. Calculate PageRank prestige over expanded graph
        prestige_scores = self.calculate_prestige(graph)
        n_nodes, n_edges = self.get_graph_stats(graph)
        logger.info(
            "[CitationGraphEngine] Expanded graph to %d nodes, %d edges. Discovered %d new papers.",
            n_nodes,
            n_edges,
            len(discovered_papers),
        )

        return graph, prestige_scores, list(discovered_papers.values())

    def _extract_openalex_id(self, paper: Paper) -> Optional[str]:
        """Extract OpenAlex ID (e.g. 'W2741809807') from paper fields."""
        for field in (paper.openalex_id, paper.id):
            if not field:
                continue
            s = str(field).strip()
            # Standard W followed by digits or alphanumeric
            m = re.search(r"\b[wW][0-9A-Za-z_]+\b", s)
            if m and m.group(0).upper().startswith("W"):
                return m.group(0).upper()
        return None

    async def _fetch_citing_works(
        self,
        client: httpx.AsyncClient,
        openalex_id: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Fetch papers citing the specified OpenAlex ID."""
        clean_id = re.sub(r"^[wW]", "W", openalex_id.strip())
        if clean_id in self._cites_cache:
            return self._cites_cache[clean_id]

        url = f"{settings.openalex_base_url}/works"
        params = {
            "filter": f"cites:{clean_id}",
            "per_page": min(limit, 25),
            "sort": "cited_by_count:desc",
            "mailto": settings.openalex_email,
        }
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                self._cites_cache[clean_id] = results
                return results
            else:
                logger.debug("[CitationGraphEngine] Citing query status %d for %s", resp.status_code, clean_id)
        except Exception as e:
            logger.debug("[CitationGraphEngine] Citing query failed for %s: %s", clean_id, e)
        return []

    async def _fetch_referenced_works(
        self,
        client: httpx.AsyncClient,
        referenced_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """Fetch metadata for referenced works by OpenAlex ID list."""
        if not referenced_ids:
            return []

        clean_ids = []
        for rid in referenced_ids:
            norm = self.normalize_node_id(rid)
            if norm.startswith("W"):
                clean_ids.append(norm)

        if not clean_ids:
            return []

        # Batch lookup via OpenAlex openalex_id filter
        filter_str = "|".join(clean_ids[:15])
        url = f"{settings.openalex_base_url}/works"
        params = {
            "filter": f"openalex_id:{filter_str}",
            "per_page": min(len(clean_ids), 25),
            "mailto": settings.openalex_email,
        }
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                for item in results:
                    wid = item.get("id", "").split("/")[-1]
                    if wid:
                        self._work_cache[wid] = item
                return results
        except Exception as e:
            logger.debug("[CitationGraphEngine] Referenced works query failed: %s", e)
        return []

    def _parse_openalex_work(self, item: Dict[str, Any]) -> Optional[Paper]:
        """Convert OpenAlex JSON work into canonical Paper model."""
        title = item.get("title") or item.get("display_name")
        if not title:
            return None

        clean_wid = item.get("id", "").split("/")[-1]
        ids = item.get("ids", {})
        doi = ids.get("doi") or item.get("doi")
        if doi and "doi.org/" in doi:
            doi = doi.split("doi.org/")[-1]

        arxiv_raw = ids.get("arxiv")
        arxiv_id = None
        if arxiv_raw:
            arxiv_id = arxiv_raw.split("abs/")[-1].replace(".pdf", "")

        authors: List[Author] = []
        for authorship in item.get("authorships", []):
            auth = authorship.get("author", {})
            name = auth.get("display_name")
            if name:
                authors.append(Author(name=name))

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

        best_oa = item.get("best_oa_location") or item.get("primary_location") or {}
        pdf_url = best_oa.get("pdf_url")
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

        return Paper(
            id=clean_wid or f"openalex:{hash(title)}",
            title=title.strip(),
            abstract=abstract.strip(),
            authors=authors,
            year=item.get("publication_year"),
            doi=doi,
            arxiv_id=arxiv_id,
            openalex_id=clean_wid,
            primary_source="openalex_citation_graph",
            url=best_oa.get("landing_page_url") or item.get("id"),
            pdf_url=pdf_url,
            is_open_access=bool(pdf_url or item.get("open_access", {}).get("is_oa")),
            citation_count=item.get("cited_by_count", 0),
            referenced_works=[ref.split("/")[-1] for ref in item.get("referenced_works", [])],
        )
