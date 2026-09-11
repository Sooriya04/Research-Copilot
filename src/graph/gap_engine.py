import logging
from typing import Any, Dict, List

from src.graph.schema import (
    DatasetNode,
    MethodNode,
    NodeType,
    PaperNode,
    Relation,
    ResearchGapNode,
)
from src.graph.store import ResearchGraphStore

logger = logging.getLogger(__name__)


class GapDetectionEngine:
    """Queries ResearchGraphStore to detect real combinatorial research gaps and underexplored methodologies."""

    def __init__(self, store: ResearchGraphStore):
        self.store = store

    async def detect_method_dataset_gaps(self) -> List[ResearchGapNode]:
        """Identify unexplored combinatorial pairs between known methods and datasets."""
        methods: List[MethodNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.METHOD) if isinstance(n, MethodNode)
        ]
        datasets: List[DatasetNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.DATASET) if isinstance(n, DatasetNode)
        ]

        gaps: List[ResearchGapNode] = []

        for method in methods:
            for dataset in datasets:
                papers = await self.store.find_papers_using(method.id, dataset.id)
                if not papers:
                    gap_id = f"gap-{method.id}-{dataset.id}"
                    gap_node = ResearchGapNode(
                        id=gap_id,
                        description=f"No papers found applying {method.name} on {dataset.name}",
                        method_id=method.id,
                        dataset_id=dataset.id,
                        confidence=0.8,
                    )
                    gaps.append(gap_node)

        # Sort by confidence descending
        gaps.sort(key=lambda g: g.confidence, reverse=True)
        return gaps

    async def get_underexplored_methods(self) -> List[MethodNode]:
        """Return methods used by fewer than 2 papers in the graph."""
        methods: List[MethodNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.METHOD) if isinstance(n, MethodNode)
        ]
        underexplored: List[MethodNode] = []

        for method in methods:
            paper_count = 0
            if method.id in self.store.graph:
                for pred_id in self.store.graph.predecessors(method.id):
                    edge_data = self.store.graph.get_edge_data(pred_id, method.id, default={})
                    rel = edge_data.get("relation")
                    if rel in (Relation.USES_METHOD.value, "uses_method", None):
                        pred_node = await self.store.get_node(pred_id)
                        if isinstance(pred_node, PaperNode):
                            paper_count += 1

            if paper_count < 2:
                underexplored.append(method)

        return underexplored

    async def get_underexplored_datasets(self) -> List[DatasetNode]:
        """Return datasets evaluated on by fewer than 2 papers."""
        datasets: List[DatasetNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.DATASET) if isinstance(n, DatasetNode)
        ]
        underexplored: List[DatasetNode] = []

        for dataset in datasets:
            paper_count = 0
            if dataset.id in self.store.graph:
                for pred_id in self.store.graph.predecessors(dataset.id):
                    edge_data = self.store.graph.get_edge_data(pred_id, dataset.id, default={})
                    rel = edge_data.get("relation")
                    if rel in (Relation.EVALUATES_ON.value, "evaluates_on", None):
                        pred_node = await self.store.get_node(pred_id)
                        if isinstance(pred_node, PaperNode):
                            paper_count += 1

            if paper_count < 2:
                underexplored.append(dataset)

        return underexplored

    async def summarize_research_space(self) -> Dict[str, Any]:
        """Generate structured statistical summary and 2D coverage matrix of methods vs datasets."""
        papers: List[PaperNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.PAPER) if isinstance(n, PaperNode)
        ]
        methods: List[MethodNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.METHOD) if isinstance(n, MethodNode)
        ]
        datasets: List[DatasetNode] = [
            n for n in await self.store.get_all_nodes_by_type(NodeType.DATASET) if isinstance(n, DatasetNode)
        ]
        gaps = await self.detect_method_dataset_gaps()

        coverage_matrix: Dict[str, Dict[str, bool]] = {}

        for method in methods:
            coverage_matrix[method.name] = {}
            for dataset in datasets:
                matching_papers = await self.store.find_papers_using(method.id, dataset.id)
                coverage_matrix[method.name][dataset.name] = len(matching_papers) > 0

        return {
            "total_papers": len(papers),
            "total_methods": len(methods),
            "total_datasets": len(datasets),
            "total_gaps": len(gaps),
            "coverage_matrix": coverage_matrix,
        }
