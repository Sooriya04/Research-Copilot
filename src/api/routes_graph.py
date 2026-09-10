import uuid
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db
from src.core.models import GraphRunModel, SessionModel
from src.core.schemas import GraphRunRequest, GraphRunResponse, ResearchGraphState
from src.graph.pipeline import build_default_research_pipeline
from src.graph.state import create_initial_state

router = APIRouter(prefix="/api/v1/graph", tags=["Research Loop & Graph Engine"])

class GraphNodeVisual(BaseModel):
    id: str
    label: str
    type: str = "paper"
    score: float = 0.0

class GraphEdgeVisual(BaseModel):
    source: str
    target: str

class GraphVisualizationResponse(BaseModel):
    session_id: str
    nodes: List[GraphNodeVisual]
    edges: List[GraphEdgeVisual]

@router.post("/run", response_model=GraphRunResponse)
async def run_research_graph(req: GraphRunRequest, db: AsyncSession = Depends(get_db)):
    """Execute a multi-stage iterative research graph loop."""
    session_id = f"sess-{uuid.uuid4().hex[:8]}"
    initial_state = create_initial_state(
        session_id=session_id,
        query=req.query,
        max_iterations=req.max_iterations
    )

    pipeline = build_default_research_pipeline()
    final_state: ResearchGraphState = await pipeline.run(initial_state)

    # Persist session and run in SQLite
    session_record = SessionModel(
        id=session_id,
        query=req.query,
        status="completed",
        state_json={"total_papers": len(final_state.papers), "iterations": final_state.iteration}
    )
    db.add(session_record)

    run_record = GraphRunModel(
        id=f"run-{uuid.uuid4().hex[:8]}",
        session_id=session_id,
        iteration_count=final_state.iteration,
        status="completed",
        summary=final_state.synthesis_markdown,
        state_snapshot={
            "ranked_count": len(final_state.ranked_paper_ids),
            "graph": final_state.citation_graph
        }
    )
    db.add(run_record)
    await db.commit()

    return GraphRunResponse(
        session_id=session_id,
        status="completed",
        iterations_completed=final_state.iteration,
        total_papers=len(final_state.papers),
        synthesis=final_state.synthesis_markdown,
        artifacts=final_state.artifacts,
        execution_history=final_state.execution_history
    )

@router.get("/visualize/{session_id}", response_model=GraphVisualizationResponse)
async def get_graph_visualization(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get Cytoscape/D3 compatible node-link data for a research session."""
    result = await db.execute(select(GraphRunModel).where(GraphRunModel.session_id == session_id))
    run = result.scalar_one_or_none()
    if not run or not run.state_snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session graph '{session_id}' not found.")

    citation_graph = run.state_snapshot.get("graph", {})
    nodes: List[GraphNodeVisual] = []
    edges: List[GraphEdgeVisual] = []
    seen_nodes = set()

    for src, targets in citation_graph.items():
        if src not in seen_nodes:
            nodes.append(GraphNodeVisual(id=src, label=src[:25]))
            seen_nodes.add(src)
        for tgt in targets:
            if tgt not in seen_nodes:
                nodes.append(GraphNodeVisual(id=tgt, label=tgt[:25]))
                seen_nodes.add(tgt)
            edges.append(GraphEdgeVisual(source=src, target=tgt))

    return GraphVisualizationResponse(
        session_id=session_id,
        nodes=nodes,
        edges=edges
    )
