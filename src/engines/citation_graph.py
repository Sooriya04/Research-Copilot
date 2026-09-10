from typing import Dict, List, Set, Tuple
import networkx as nx
from src.core.logger import logger
from src.core.schemas import Paper

class CitationGraphEngine:
    """Constructs citation subgraphs and calculates graph prestige (PageRank)."""

    def __init__(self, damping: float = 0.85):
        self.damping = damping

    def build_graph(self, papers: List[Paper]) -> nx.DiGraph:
        """Build directed citation graph from a list of papers and their referenced works."""
        graph = nx.DiGraph()
        paper_map = {p.id: p for p in papers}

        # Add nodes
        for p in papers:
            graph.add_node(p.id, title=p.title, year=p.year, citations=p.citation_count)

        # Add directed citation edges: paper A -> cites -> paper B
        for p in papers:
            for ref_id in p.referenced_works:
                # Add edge if referenced work is in our graph
                if ref_id in paper_map or ref_id.startswith("https://openalex.org/"):
                    clean_ref = ref_id.split("/")[-1] if "/" in ref_id else ref_id
                    graph.add_node(clean_ref)
                    clean_pid = p.id.split("/")[-1] if "/" in p.id else p.id
                    graph.add_edge(clean_pid, clean_ref)

        return graph

    def calculate_prestige(self, graph: nx.DiGraph) -> Dict[str, float]:
        """Compute PageRank prestige scores normalized to [0, 100]."""
        if len(graph) == 0:
            return {}
        try:
            raw_scores = nx.pagerank(graph, alpha=self.damping, max_iter=100)
            max_val = max(raw_scores.values()) if raw_scores else 1.0
            if max_val == 0:
                max_val = 1.0
            # Scale to [0, 100]
            normalized = {node: (val / max_val) * 100.0 for node, val in raw_scores.items()}
            return normalized
        except Exception as e:
            logger.warning("PageRank calculation failed: %s", e)
            return {node: 10.0 for node in graph.nodes}

    def get_graph_stats(self, graph: nx.DiGraph) -> Tuple[int, int]:
        """Return (num_nodes, num_edges)."""
        return graph.number_of_nodes(), graph.number_of_edges()
