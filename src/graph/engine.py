from typing import Callable, Dict, List, Optional, Union
from src.core.logger import logger
from src.core.schemas import ResearchGraphState
from src.graph.node import BaseResearchNode

END = "__END__"

class ResearchStateGraph:
    """A flexible, loop + graph execution engine for multi-stage scientific research."""

    def __init__(self, entry_point: str):
        self.entry_point = entry_point
        self.nodes: Dict[str, BaseResearchNode] = {}
        self.edges: Dict[str, str] = {}
        self.conditional_edges: Dict[str, Callable[[ResearchGraphState], str]] = {}

    def add_node(self, name: str, node: BaseResearchNode) -> "ResearchStateGraph":
        """Register a node with the graph."""
        self.nodes[name] = node
        return self

    def add_edge(self, source: str, target: str) -> "ResearchStateGraph":
        """Add a static direct transition edge."""
        self.edges[source] = target
        return self

    def add_conditional_edge(
        self, source: str, router: Callable[[ResearchGraphState], str]
    ) -> "ResearchStateGraph":
        """Add a dynamic conditional routing edge for research loops."""
        self.conditional_edges[source] = router
        return self

    async def run(self, initial_state: ResearchGraphState) -> ResearchGraphState:
        """Execute the research state graph from the entry point to completion."""
        current_node_name = self.entry_point
        state = initial_state
        logger.info("Starting Research State Graph execution from '%s'", current_node_name)

        while current_node_name != END and not state.is_finished:
            if current_node_name not in self.nodes:
                raise ValueError(f"Node '{current_node_name}' not found in state graph.")

            node = self.nodes[current_node_name]
            state = await node(state)

            # Determine next node via conditional router or direct edge
            if current_node_name in self.conditional_edges:
                router = self.conditional_edges[current_node_name]
                next_node = router(state)
            elif current_node_name in self.edges:
                next_node = self.edges[current_node_name]
            else:
                next_node = END

            logger.info("Graph transition: '%s' -> '%s'", current_node_name, next_node)
            current_node_name = next_node

        state.is_finished = True
        logger.info("Research State Graph execution completed for session %s", state.session_id)
        return state
