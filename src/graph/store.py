import json
import logging
import os
from typing import Any, Dict, List, Optional, Union
import aiosqlite
import networkx as nx

from src.graph.schema import (
    GraphNode,
    NodeType,
    PaperNode,
    Relation,
    ResearchEdge,
    parse_graph_node,
)

logger = logging.getLogger(__name__)


class ResearchGraphStore:
    """In-memory NetworkX DiGraph store with persistent async SQLite storage."""

    def __init__(self, db_path: str = "./data/research_copilot.db"):
        self.db_path = db_path
        self.graph: nx.DiGraph = nx.DiGraph()
        self._initialized = False

    async def _ensure_initialized(self) -> None:
        """Ensure database tables are created and graph is loaded into memory."""
        if not self._initialized:
            await self._init_db()
            await self.load_from_db()
            self._initialized = True

    async def _init_db(self) -> None:
        """Create graph_nodes and graph_edges tables if they don't exist."""
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS graph_nodes (
                    id TEXT PRIMARY KEY,
                    node_type TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS graph_edges (
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    relation TEXT NOT NULL,
                    weight REAL DEFAULT 1.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (source_id, target_id, relation)
                );
                """
            )
            await db.commit()

    async def add_node(self, node: GraphNode) -> None:
        """Add node to NetworkX graph with model fields as attributes and persist to SQLite."""
        await self._ensure_initialized()

        node_dict = node.model_dump(mode="json")
        node_type = node.node_type.value if hasattr(node.node_type, "value") else str(node.node_type)
        
        # Add to in-memory graph
        self.graph.add_node(node.id, **node_dict, node_obj=node)

        # Persist to SQLite
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO graph_nodes (id, node_type, data_json, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (node.id, node_type, json.dumps(node_dict)),
            )
            await db.commit()

    async def add_edge(self, edge: ResearchEdge) -> None:
        """Add directed edge to NetworkX graph and persist to SQLite."""
        await self._ensure_initialized()

        rel_str = edge.relation.value if hasattr(edge.relation, "value") else str(edge.relation)
        
        # Add to in-memory graph
        self.graph.add_edge(
            edge.source_id,
            edge.target_id,
            relation=rel_str,
            weight=edge.weight,
            edge_obj=edge,
        )

        # Persist to SQLite
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO graph_edges (source_id, target_id, relation, weight, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (edge.source_id, edge.target_id, rel_str, edge.weight),
            )
            await db.commit()

    async def get_node(self, node_id: str) -> Optional[GraphNode]:
        """Return typed node from in-memory graph first, falling back to SQLite."""
        await self._ensure_initialized()

        if node_id in self.graph:
            node_data = dict(self.graph.nodes[node_id])
            if "node_obj" in node_data and node_data["node_obj"] is not None:
                return node_data["node_obj"]
            node_type = node_data.get("node_type")
            if node_type:
                clean_data = {k: v for k, v in node_data.items() if k not in ("node_obj",)}
                node_obj = parse_graph_node(node_type, clean_data)
                self.graph.nodes[node_id]["node_obj"] = node_obj
                return node_obj

        # Fallback to SQLite
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("SELECT node_type, data_json FROM graph_nodes WHERE id = ?", (node_id,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    node_type, data_json = row
                    data = json.loads(data_json)
                    node_obj = parse_graph_node(node_type, data)
                    self.graph.add_node(node_id, **data, node_obj=node_obj)
                    return node_obj

        return None

    async def get_neighbors(self, node_id: str, relation: Optional[Union[str, Relation]] = None) -> List[GraphNode]:
        """Return neighboring target nodes, optionally filtered by edge relation."""
        await self._ensure_initialized()

        if node_id not in self.graph:
            return []

        rel_filter = relation.value if hasattr(relation, "value") else relation
        neighbors: List[GraphNode] = []

        for target_id in self.graph.successors(node_id):
            edge_data = self.graph.get_edge_data(node_id, target_id, default={})
            edge_rel = edge_data.get("relation")
            if rel_filter is None or edge_rel == rel_filter:
                node = await self.get_node(target_id)
                if node:
                    neighbors.append(node)

        return neighbors

    async def find_papers_using(self, method_id: str, dataset_id: str) -> List[PaperNode]:
        """Find all PaperNodes connected to both the given MethodNode and DatasetNode."""
        await self._ensure_initialized()

        papers_using_method: set[str] = set()
        papers_using_dataset: set[str] = set()

        # Check predecessors of method_id (papers pointing to method)
        if method_id in self.graph:
            for pred_id in self.graph.predecessors(method_id):
                edge_data = self.graph.get_edge_data(pred_id, method_id, default={})
                rel = edge_data.get("relation")
                if rel in (Relation.USES_METHOD.value, "uses_method", None):
                    papers_using_method.add(pred_id)

        # Check predecessors of dataset_id (papers pointing to dataset)
        if dataset_id in self.graph:
            for pred_id in self.graph.predecessors(dataset_id):
                edge_data = self.graph.get_edge_data(pred_id, dataset_id, default={})
                rel = edge_data.get("relation")
                if rel in (Relation.EVALUATES_ON.value, "evaluates_on", None):
                    papers_using_dataset.add(pred_id)

        # Intersection of paper IDs
        common_paper_ids = papers_using_method.intersection(papers_using_dataset)
        result: List[PaperNode] = []

        for pid in common_paper_ids:
            node = await self.get_node(pid)
            if isinstance(node, PaperNode):
                result.append(node)

        return result

    async def load_from_db(self) -> None:
        """On startup, load all nodes and edges from SQLite into NetworkX graph."""
        async with aiosqlite.connect(self.db_path) as db:
            # Load nodes
            async with db.execute("SELECT id, node_type, data_json FROM graph_nodes") as cursor:
                async for row in cursor:
                    node_id, node_type, data_json = row
                    try:
                        data = json.loads(data_json)
                        node_obj = parse_graph_node(node_type, data)
                        self.graph.add_node(node_id, **data, node_obj=node_obj)
                    except Exception as e:
                        logger.warning("Failed loading graph node %s: %s", node_id, e)

            # Load edges
            async with db.execute("SELECT source_id, target_id, relation, weight FROM graph_edges") as cursor:
                async for row in cursor:
                    source_id, target_id, relation, weight = row
                    try:
                        rel_enum = Relation(relation) if relation in Relation._value2member_map_ else relation
                        edge_obj = ResearchEdge(
                            source_id=source_id,
                            target_id=target_id,
                            relation=rel_enum,
                            weight=weight or 1.0,
                        )
                        self.graph.add_edge(
                            source_id,
                            target_id,
                            relation=relation,
                            weight=weight or 1.0,
                            edge_obj=edge_obj,
                        )
                    except Exception as e:
                        logger.warning("Failed loading graph edge %s->%s: %s", source_id, target_id, e)

        logger.info("Loaded graph from DB: %d nodes, %d edges", self.graph.number_of_nodes(), self.graph.number_of_edges())

    async def get_all_nodes_by_type(self, node_type: Union[NodeType, str]) -> List[GraphNode]:
        """Return all nodes of a given type."""
        await self._ensure_initialized()
        
        target_type = node_type.value if hasattr(node_type, "value") else str(node_type)
        results: List[GraphNode] = []

        for node_id in self.graph.nodes:
            node_data = self.graph.nodes[node_id]
            nt = node_data.get("node_type")
            if nt == target_type:
                node = await self.get_node(node_id)
                if node:
                    results.append(node)

        return results
