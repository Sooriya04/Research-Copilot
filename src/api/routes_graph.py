import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import PaperSummarizeRequest
from src.core.database import get_db
from src.core.models import GraphRunModel, SessionModel
from src.core.schemas import GraphRunRequest, GraphRunResponse, PaperIntelligence, ResearchGraphState
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine
from src.graph.builder import GraphBuilder
from src.graph.gap_engine import GapDetectionEngine
from src.graph.pipeline import build_default_research_pipeline
from src.graph.schema import NodeType, ResearchGapNode
from src.graph.state import create_initial_state
from src.graph.store import ResearchGraphStore

router = APIRouter(prefix="/api/v1/graph", tags=["Research Loop & Graph Engine"])

# Shared graph store & gap engine
graph_store = ResearchGraphStore()
gap_detection_engine = GapDetectionEngine(store=graph_store)
intel_engine = PaperIntelligenceEngine()


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


class IngestPaperRequest(BaseModel):
    identifier: Optional[str] = None  # e.g. "2312.00752" or DOI
    paper_data: Optional[PaperIntelligence] = None


class IngestPaperResponse(BaseModel):
    status: str
    paper_id: str
    title: str
    nodes_count: int
    edges_count: int


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


# --- New Graph & Gap Detection API Endpoints ---

@router.post("/ingest-paper", response_model=IngestPaperResponse)
async def ingest_paper_into_graph(req: IngestPaperRequest, db: AsyncSession = Depends(get_db)):
    """Extract full intelligence from a paper and dynamically build graph nodes & edges."""
    builder = GraphBuilder(store=graph_store)

    if req.paper_data:
        paper_intel = req.paper_data
        paper_id = paper_intel.id
        title = paper_intel.title
    elif req.identifier:
        # Live multi-source intelligence extraction
        sum_resp = await intel_engine.summarize_paper(
            PaperSummarizeRequest(identifier=req.identifier), db
        )
        paper_intel = sum_resp.canonical_paper
        paper_id = paper_intel.canonical_id
        title = paper_intel.title
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide either 'identifier' or 'paper_data'.")

    await builder.build_from_paper_intelligence(paper_intel)

    return IngestPaperResponse(
        status="ingested",
        paper_id=paper_id,
        title=title,
        nodes_count=graph_store.graph.number_of_nodes(),
        edges_count=graph_store.graph.number_of_edges(),
    )


@router.get("/summary")
async def get_research_space_summary():
    """Get statistical summary and 2D coverage matrix of methods vs datasets in the graph."""
    return await gap_detection_engine.summarize_research_space()


@router.get("/gaps", response_model=List[ResearchGapNode])
async def get_detected_research_gaps():
    """Return all detected combinatorial research gaps between methods and datasets."""
    return await gap_detection_engine.detect_method_dataset_gaps()


@router.get("/underexplored")
async def get_underexplored_entities():
    """Return methods and datasets evaluated by fewer than 2 papers."""
    underexplored_methods = await gap_detection_engine.get_underexplored_methods()
    underexplored_datasets = await gap_detection_engine.get_underexplored_datasets()
    return {
        "underexplored_methods": underexplored_methods,
        "underexplored_datasets": underexplored_datasets,
    }


@router.get("/nodes")
async def get_graph_nodes(node_type: Optional[str] = Query(None, description="paper, method, dataset, metric, claim, limitation, gap")):
    """Return stored graph nodes, optionally filtered by node type."""
    if node_type:
        try:
            nt = NodeType(node_type.lower())
            return await graph_store.get_all_nodes_by_type(nt)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid node_type '{node_type}'. Valid types: {[t.value for t in NodeType]}")
    
    # Return all nodes
    nodes = []
    for nid in graph_store.graph.nodes:
        n = await graph_store.get_node(nid)
        if n:
            nodes.append(n)
    return nodes
