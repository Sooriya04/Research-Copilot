import abc
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from src.core.logger import logger
from src.core.schemas import ExecutionStepLog, NodeStatus, ResearchGraphState

class BaseResearchNode(abc.ABC):
    """Abstract base class for all nodes in the Research Graph & Loop Pipeline."""

    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description

    @abc.abstractmethod
    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        """Execute node computation and return the updated state."""
        pass

    async def __call__(self, state: ResearchGraphState) -> ResearchGraphState:
        """Wrapper to log and track step execution history."""
        start_time = time.time()
        step_id = f"{self.name}-{state.iteration}-{int(start_time * 1000)}"
        log_entry = ExecutionStepLog(
            step_id=step_id,
            node_name=self.name,
            iteration=state.iteration,
            started_at=datetime.now(timezone.utc),
            status=NodeStatus.RUNNING,
        )
        logger.info("[%s] Starting execution for session %s (iteration %d)", self.name, state.session_id, state.iteration)
        
        try:
            new_state = await self.execute(state)
            duration_ms = (time.time() - start_time) * 1000.0
            log_entry.status = NodeStatus.COMPLETED
            log_entry.completed_at = datetime.now(timezone.utc)
            log_entry.duration_ms = round(duration_ms, 2)
            log_entry.message = f"Node {self.name} completed successfully."
            new_state.execution_history.append(log_entry)
            return new_state
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000.0
            log_entry.status = NodeStatus.FAILED
            log_entry.completed_at = datetime.now(timezone.utc)
            log_entry.duration_ms = round(duration_ms, 2)
            log_entry.error = str(e)
            state.execution_history.append(log_entry)
            logger.error("[%s] Node execution failed: %s", self.name, e)
            raise
