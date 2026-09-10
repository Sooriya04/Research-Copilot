from typing import Any, Dict, Optional
from pydantic import BaseModel
from src.core.schemas import ResearchGraphState

def create_initial_state(session_id: str, query: str, max_iterations: int = 5) -> ResearchGraphState:
    """Create a new initialized ResearchGraphState."""
    return ResearchGraphState(
        session_id=session_id,
        query=query,
        iteration=0,
        max_iterations=max_iterations,
        papers={},
        ranked_paper_ids=[],
        citation_graph={},
        entities=[],
        artifacts=[],
        synthesis_markdown=None,
        is_finished=False,
        execution_history=[],
        custom_context={},
    )
