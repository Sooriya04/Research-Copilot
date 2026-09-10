import pytest
from src.core.schemas import ResearchGraphState
from src.graph.engine import END, ResearchStateGraph
from src.graph.node import BaseResearchNode
from src.graph.state import create_initial_state

class MockDiscoveryNode(BaseResearchNode):
    def __init__(self):
        super().__init__("mock_discovery")

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        state.custom_context["discovered"] = True
        return state

class MockLoopNode(BaseResearchNode):
    def __init__(self):
        super().__init__("mock_loop")

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        state.iteration += 1
        return state

def loop_router(state: ResearchGraphState) -> str:
    if state.iteration >= 3:
        return END
    return "mock_loop"

@pytest.mark.asyncio
async def test_state_graph_loop_execution():
    graph = ResearchStateGraph(entry_point="mock_discovery")
    graph.add_node("mock_discovery", MockDiscoveryNode())
    graph.add_node("mock_loop", MockLoopNode())
    graph.add_edge("mock_discovery", "mock_loop")
    graph.add_conditional_edge("mock_loop", loop_router)

    initial_state = create_initial_state(session_id="test-sess", query="test query", max_iterations=5)
    final_state = await graph.run(initial_state)

    assert final_state.is_finished is True
    assert final_state.custom_context.get("discovered") is True
    assert final_state.iteration == 3
    assert len(final_state.execution_history) == 4
