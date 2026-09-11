import uuid
from typing import Any, Dict, List, Optional, Union
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
from src.graph.schema import NodeType, Relation, ResearchEdge, ResearchGapNode, TopicNode, slugify_id
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
    paper_data: Optional[Union[PaperIntelligence, Dict[str, Any]]] = None
    topic: Optional[str] = None


class IngestPaperResponse(BaseModel):
    status: str
    paper_id: str
    title: str
    nodes_count: int
    edges_count: int


@router.post("/clear")
async def clear_graph_endpoint():
    """Clear all stored nodes and edges from the research knowledge graph."""
    await graph_store.clear()
    return {"status": "cleared", "nodes_count": 0, "edges_count": 0}


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
        if isinstance(paper_intel, dict):
            paper_id = paper_intel.get("id") or paper_intel.get("canonical_id") or "paper-unknown"
            title = paper_intel.get("title", "Untitled Paper")
        else:
            paper_id = getattr(paper_intel, "id", None) or getattr(paper_intel, "canonical_id", "paper-unknown")
            title = getattr(paper_intel, "title", "Untitled Paper")
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

    paper_node_id = await builder.build_from_paper_intelligence(paper_intel)

    # If topic is specified, link topic -> paper
    if req.topic and req.topic.strip():
        topic_clean = req.topic.strip()
        topic_id = f"topic-{slugify_id(topic_clean)}"
        existing_topic = await graph_store.get_node(topic_id)
        if not existing_topic:
            topic_node = TopicNode(id=topic_id, name=topic_clean, query=topic_clean)
            await graph_store.add_node(topic_node)
        edge = ResearchEdge(
            source_id=topic_id,
            target_id=paper_node_id or paper_id,
            relation=Relation.COVERS,
            weight=2.0,
        )
        await graph_store.add_edge(edge)

    return IngestPaperResponse(
        status="ingested",
        paper_id=paper_node_id or paper_id,
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


@router.get("/elements")
async def get_graph_elements(
    topic: Optional[str] = Query(None, description="Optional topic to link or filter by"),
    scoped: bool = Query(False, description="If true, return strictly nodes connected to topic")
):
    """Return complete graph elements (nodes + typed labeled edges) for visual network canvas."""
    await graph_store._ensure_initialized()

    target_topic_id = None
    # If topic is provided, ensure TopicNode exists and is linked to papers in store
    if topic and topic.strip():
        builder = GraphBuilder(store=graph_store)
        topic_clean = topic.strip()
        target_topic_id = f"topic-{slugify_id(topic_clean)}"
        existing_topic = await graph_store.get_node(target_topic_id)
        if not existing_topic:
            topic_node = TopicNode(id=target_topic_id, name=topic_clean, query=topic_clean)
            await graph_store.add_node(topic_node)

        # Connect to existing paper nodes
        for nid in list(graph_store.graph.nodes):
            n = await graph_store.get_node(nid)
            if n and (n.node_type == NodeType.PAPER or getattr(n, "node_type", "") == "paper"):
                edge = ResearchEdge(
                    source_id=target_topic_id,
                    target_id=nid,
                    relation=Relation.COVERS,
                    weight=2.0,
                )
                await graph_store.add_edge(edge)

    # If scoped to a specific topic, only collect reachable nodes from that topic
    allowed_node_ids = None
    if scoped and target_topic_id and target_topic_id in graph_store.graph:
        allowed_node_ids = {target_topic_id}
        # Get all successors (paper subnodes)
        for p_id in graph_store.graph.successors(target_topic_id):
            allowed_node_ids.add(p_id)
            # Get methods, datasets, gaps connected to each paper
            for child_id in graph_store.graph.successors(p_id):
                allowed_node_ids.add(child_id)
    
    nodes = []
    node_type_counts = {}
    for nid in graph_store.graph.nodes:
        if allowed_node_ids is not None and nid not in allowed_node_ids:
            continue
        n = await graph_store.get_node(nid)
        if n:
            n_dict = n.model_dump(mode="json")
            ntype = n.node_type.value if hasattr(n.node_type, "value") else str(n.node_type)
            node_type_counts[ntype] = node_type_counts.get(ntype, 0) + 1
            label = getattr(n, "name", None) or getattr(n, "title", None) or getattr(n, "text", None) or nid
            nodes.append({
                "id": nid,
                "label": str(label)[:35],
                "node_type": ntype,
                "title": f"[{ntype.upper()}] {label}",
                "data": n_dict,
            })
            
    edges_raw = await graph_store.get_all_edges()
    edges = []
    for e in edges_raw:
        if allowed_node_ids is not None and (e.source_id not in allowed_node_ids or e.target_id not in allowed_node_ids):
            continue
        rel_str = e.relation.value if hasattr(e.relation, "value") else str(e.relation)
        edges.append({
            "source": e.source_id,
            "target": e.target_id,
            "relation": rel_str,
            "label": rel_str.replace("_", " ").upper(),
            "weight": e.weight,
        })
        
    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "node_type_counts": node_type_counts,
        }
    }


@router.get("/node/{node_id:path}/neighborhood")
async def get_node_neighborhood_endpoint(node_id: str):
    """Inspect all incoming and outgoing semantic relationships for a specific node."""
    res = await graph_store.get_node_neighborhood(node_id)
    if not res.get("node"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Node '{node_id}' not found.")
    return res


@router.post("/seed-sample")
async def seed_sample_graph():
    """Seed the research graph with canonical AI/ML literature nodes & cross-cutting semantic relations."""
    builder = GraphBuilder(store=graph_store)

    sample_papers = [
        PaperIntelligence(
            id="1706.03762",
            title="Attention Is All You Need",
            year=2017,
            venue="NeurIPS 2017",
            authors=["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki", "Uszkoreit, Jakob", "Jones, Llion"],
            abstract="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism.",
            methods=["Self-Attention Mechanism", "Multi-Head Attention", "Positional Encoding", "Transformer Architecture"],
            datasets=["WMT 2014 English-to-German", "WMT 2014 English-to-French"],
            metrics={"BLEU Score": {"value": "28.4", "unit": "BLEU"}},
            claims=[{"claim": "Self-attention mechanism allows significantly more parallelization than RNNs", "verified": True}],
            limitations=[{"description": "Quadratic compute and memory complexity O(N^2) with sequence length"}],
            cited_papers=[],
        ),
        PaperIntelligence(
            id="2106.09685",
            title="LoRA: Low-Rank Adaptation of Large Language Models",
            year=2021,
            venue="ICLR 2022",
            authors=["Hu, Edward J.", "Shen, Yelong", "Wallis, Phillip", "Allen-Zhu, Zeyuan"],
            abstract="LoRA reduces the number of trainable parameters by 10,000 times and GPU memory requirement by 3 times while matching full fine-tuning performance.",
            methods=["Low-Rank Decomposition", "Parameter-Efficient Fine-Tuning", "Transformer Architecture"],
            datasets=["GLUE Benchmark", "GSM8k", "WMT 2014 English-to-German"],
            metrics={"Accuracy": {"value": "89.2", "unit": "%"}, "Parameter Reduction": {"value": "99.9", "unit": "%"}},
            claims=[{"claim": "Injects trainable rank decomposition matrices into Transformer layers", "verified": True}],
            limitations=[{"description": "May require careful rank rank hyperparameter tuning per task"}],
            cited_papers=["1706.03762"],
        ),
        PaperIntelligence(
            id="2205.14135",
            title="FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness",
            year=2022,
            venue="NeurIPS 2022",
            authors=["Dao, Tri", "Fu, Daniel Y.", "Ermon, Stefano", "Rudra, Atri", "Re, Christopher"],
            abstract="FlashAttention makes attention exact with IO-awareness, speeding up Transformer training from 2x to 4x while saving GPU SRAM memory.",
            methods=["IO-Aware Tiling", "FlashAttention", "Transformer Architecture", "Self-Attention Mechanism"],
            datasets=["WikiText-103", "Long Range Arena"],
            metrics={"Speedup": {"value": "3.5x", "unit": "x"}, "Memory Footprint": {"value": "O(N)", "unit": "complexity"}},
            claims=[{"claim": "Eliminates memory bottleneck by avoiding materialization of N x N attention matrix in HBM", "verified": True}],
            limitations=[{"description": "Requires specialized GPU kernel implementation in CUDA"}],
            cited_papers=["1706.03762"],
        ),
        PaperIntelligence(
            id="2302.13971",
            title="LLaMA: Open and Efficient Foundation Language Models",
            year=2023,
            venue="arXiv 2023",
            authors=["Touvron, Hugo", "Lavril, Thibaut", "Izacard, Gautier", "Martinet, Xavier"],
            abstract="We introduce LLaMA, a collection of foundation language models ranging from 7B to 65B parameters trained on trillions of tokens.",
            methods=["RoPE Positional Embedding", "SwiGLU Activation", "FlashAttention", "Transformer Architecture"],
            datasets=["MMLU", "GSM8k", "GLUE Benchmark", "WikiText-103"],
            metrics={"MMLU Score": {"value": "68.9", "unit": "%"}},
            claims=[{"claim": "Trained exclusively on publicly available datasets without proprietary data", "verified": True}],
            limitations=[{"description": "Base models exhibit hallucination and require reinforcement learning alignment"}],
            cited_papers=["1706.03762", "2205.14135"],
        ),
    ]

    await builder.build_topic_subgraph(topic="Large Language Models & Efficient Attention", papers=sample_papers)

    return {
        "status": "seeded",
        "total_nodes": graph_store.graph.number_of_nodes(),
        "total_edges": graph_store.graph.number_of_edges(),
    }

