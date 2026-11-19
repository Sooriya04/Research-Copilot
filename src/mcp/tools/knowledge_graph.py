"""
MCP Tools for Domain 6: Knowledge Graph & Synthesis Service.
Implements:
- Tool 16: query_knowledge_graph
- Tool 17: compare_papers_matrix
- Tool 18: export_research_dossier
"""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Set
import networkx as nx

from src.core.logger import logger
from src.graph.store import ResearchGraphStore
from src.engines.citation_graph import CitationGraphEngine

_graph_store = ResearchGraphStore()
_citation_engine = CitationGraphEngine()

QUERY_KNOWLEDGE_GRAPH_METADATA = {
    "name": "query_knowledge_graph",
    "description": (
        "Traverses the multi-paper knowledge graph, executing semantic path searches across interconnected "
        "nodes: Papers, Authors, Architectures, Methods, Datasets, and Benchmarks."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Entity name, concept, paper ID, or relationship to investigate.",
            },
            "depth": {
                "type": "integer",
                "description": "Maximum graph traversal hops (1 to 5).",
                "default": 2,
            },
            "entity_types": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Filter for node types (e.g. ['dataset', 'architecture', 'paper', 'method', 'author']).",
            },
        },
        "required": ["query"],
    },
}


def _extract_node_info(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert graph node attributes into a clean standardized dict."""
    node_obj = data.get("node_obj")
    node_type = "entity"
    label = data.get("label") or node_id

    if node_obj is not None:
        if hasattr(node_obj, "node_type"):
            nt = getattr(node_obj, "node_type")
            node_type = getattr(nt, "value", str(nt))
        if hasattr(node_obj, "label") and node_obj.label:
            label = node_obj.label
        elif hasattr(node_obj, "title") and node_obj.title:
            label = node_obj.title
        elif hasattr(node_obj, "name") and node_obj.name:
            label = node_obj.name
    elif "node_type" in data:
        nt = data["node_type"]
        node_type = getattr(nt, "value", str(nt))

    clean_data = {k: v for k, v in data.items() if k not in ("node_obj", "label", "node_type")}
    return {
        "id": node_id,
        "type": str(node_type).lower(),
        "label": str(label),
        "data": clean_data,
    }


async def handle_query_knowledge_graph(arguments: Dict[str, Any]) -> str:
    """
    Handle query_knowledge_graph MCP tool call.
    Traverses multi-hop entities (papers, tasks, methods, datasets, authors).
    Returns JSON serialized string.
    """
    try:
        query = arguments.get("query", "")
        if not isinstance(query, str) or not query.strip():
            return json.dumps({
                "success": False,
                "error": "query parameter is required and must be a non-empty string",
            })

        query = query.strip()
        depth = max(1, min(int(arguments.get("depth", 2)), 5))
        entity_types_filter = arguments.get("entity_types")
        if entity_types_filter:
            entity_types_filter = [str(t).lower().strip() for t in entity_types_filter]

        await _graph_store._ensure_initialized()
        g: nx.DiGraph = _graph_store.graph

        # 1. Match seed nodes
        seed_nodes: Set[str] = set()
        q_lower = query.lower()

        for node_id, data in g.nodes(data=True):
            nid_lower = str(node_id).lower()
            label_lower = str(data.get("label", "")).lower()
            title_lower = str(data.get("title", "")).lower()
            name_lower = str(data.get("name", "")).lower()

            if (
                q_lower in nid_lower
                or q_lower in label_lower
                or q_lower in title_lower
                or q_lower in name_lower
                or nid_lower in q_lower
            ):
                seed_nodes.add(node_id)

        # If no direct match in memory and looks like a paper ID, seed fallback
        if not seed_nodes and ("." in query or "/" in query or query.isalnum()):
            seed_nodes.add(query)

        # 2. Multi-hop traversal using BFS (considering both directions)
        visited_nodes: Set[str] = set()
        collected_edges: List[Dict[str, Any]] = []
        seen_edge_keys: Set[str] = set()

        current_frontier = set(seed_nodes)
        visited_nodes.update(seed_nodes)

        for _ in range(depth):
            next_frontier: Set[str] = set()
            for curr in current_frontier:
                if curr not in g:
                    continue

                # Outgoing edges
                for succ in g.successors(curr):
                    edge_data = g.get_edge_data(curr, succ, default={})
                    rel = edge_data.get("relation", "relates_to")
                    rel_str = getattr(rel, "value", str(rel))
                    edge_key = f"{curr}->{succ}:{rel_str}"
                    if edge_key not in seen_edge_keys:
                        seen_edge_keys.add(edge_key)
                        collected_edges.append({
                            "source": curr,
                            "target": succ,
                            "relation": rel_str,
                            "weight": edge_data.get("weight", 1.0),
                        })
                    if succ not in visited_nodes:
                        visited_nodes.add(succ)
                        next_frontier.add(succ)

                # Incoming edges
                for pred in g.predecessors(curr):
                    edge_data = g.get_edge_data(pred, curr, default={})
                    rel = edge_data.get("relation", "relates_to")
                    rel_str = getattr(rel, "value", str(rel))
                    edge_key = f"{pred}->{curr}:{rel_str}"
                    if edge_key not in seen_edge_keys:
                        seen_edge_keys.add(edge_key)
                        collected_edges.append({
                            "source": pred,
                            "target": curr,
                            "relation": rel_str,
                            "weight": edge_data.get("weight", 1.0),
                        })
                    if pred not in visited_nodes:
                        visited_nodes.add(pred)
                        next_frontier.add(pred)

            current_frontier = next_frontier
            if not current_frontier:
                break

        # 3. Format nodes
        formatted_nodes: List[Dict[str, Any]] = []
        for node_id in visited_nodes:
            node_data = g.nodes.get(node_id, {})
            n_info = _extract_node_info(node_id, node_data)
            
            # Apply entity_types filter if provided
            if entity_types_filter and n_info["type"] not in entity_types_filter:
                continue
            formatted_nodes.append(n_info)

        # Filter edges if node filtering removed endpoints
        valid_node_ids = {n["id"] for n in formatted_nodes}
        final_edges = [
            e for e in collected_edges
            if e["source"] in valid_node_ids and e["target"] in valid_node_ids
        ] if entity_types_filter else collected_edges

        return json.dumps({
            "success": True,
            "query": query,
            "depth": depth,
            "total_nodes": len(formatted_nodes),
            "total_edges": len(final_edges),
            "nodes": formatted_nodes,
            "edges": final_edges,
        })
    except Exception as e:
        logger.error("[query_knowledge_graph] Error querying knowledge graph: %s", e, exc_info=True)
        return json.dumps({
            "success": False,
            "error": f"Failed querying knowledge graph: {str(e)}",
        })
