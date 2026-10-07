import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import PaperSummarizeRequest
from src.core.database import get_db
from src.core.paper_repository import PaperRepository
from src.core.models import GraphRunModel, SessionModel
from src.core.schemas import GraphRunRequest, GraphRunResponse, PaperIntelligence, ResearchGraphState
from src.engines.paper_enricher import PaperEnricher
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine
from src.graph.builder import GraphBuilder
from src.graph.gap_engine import GapDetectionEngine
from src.graph.pipeline import build_default_research_pipeline
from src.graph.schema import NodeType, Relation, ResearchEdge, ResearchGapNode, TopicNode, slugify_id
from src.graph.state import create_initial_state
from src.graph.store import ResearchGraphStore
from src.graph.synthesizer import GraphSynthesizer
from src.graph.novelty_engine import GraphNoveltyEngine

router = APIRouter(prefix="/api/v1/graph", tags=["Research Loop & Graph Engine"])
logger = logging.getLogger(__name__)

# Shared graph store & gap engine
graph_store = ResearchGraphStore()
gap_detection_engine = GapDetectionEngine(store=graph_store)
intel_engine = PaperIntelligenceEngine()
paper_enricher = PaperEnricher()
graph_synthesizer = GraphSynthesizer(store=graph_store, enricher=paper_enricher)
novelty_engine = GraphNoveltyEngine(store=graph_store)


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
    workspace_id: Optional[str] = None


class IngestPaperResponse(BaseModel):
    status: str
    paper_id: str
    title: str
    nodes_count: int
    edges_count: int


class RemovePaperRequest(BaseModel):
    paper_id: str


class BuildWorkspaceGraphRequest(BaseModel):
    workspace_id: Optional[str] = None
    topic: Optional[str] = None
    paper_ids: Optional[List[str]] = None
    papers: Optional[List[Dict[str, Any]]] = None
    force_refresh: bool = False


class BuildWorkspaceGraphResponse(BaseModel):
    status: str
    workspace_id: Optional[str] = None
    cached: bool = False
    llm_called: bool = False
    papers_count: int = 0
    cross_paper_relations_count: int = 0
    gaps_count: int = 0
    synthesis_summary: Optional[str] = None
    cross_paper_relations: List[Dict[str, Any]] = []
    research_gaps: List[Dict[str, Any]] = []
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    stats: Dict[str, Any] = {}


class GenerateNoveltyRequest(BaseModel):
    workspace_id: Optional[str] = None
    topic: Optional[str] = None
    paper_ids: Optional[List[str]] = None
    force_refresh: bool = False


class AddNoveltyNodeRequest(BaseModel):
    workspace_id: Optional[str] = None
    novelty: Dict[str, Any]


@router.post("/clear")
async def clear_graph_endpoint():
    """Clear all stored nodes and edges from the research knowledge graph."""
    await graph_store.clear()
    return {"status": "cleared", "nodes_count": 0, "edges_count": 0}


@router.post("/remove-paper")
async def remove_paper_endpoint(req: RemovePaperRequest):
    """Remove a paper and its associated edges from the knowledge graph."""
    pid = req.paper_id
    await graph_store.remove_node(pid)
    slug = slugify_id(pid)
    if slug != pid:
        await graph_store.remove_node(slug)
    return {"status": "removed", "paper_id": pid}


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

    # Persist session and run in SQLite (deduplicate existing session)
    existing_sess = await db.get(SessionModel, session_id)
    if not existing_sess:
        session_record = SessionModel(
            id=session_id,
            query=req.query,
            status="completed",
            state_json={"total_papers": len(final_state.papers), "iterations": final_state.iteration}
        )
        db.add(session_record)
    else:
        existing_sess.query = req.query
        existing_sess.status = "completed"
        existing_sess.state_json = {"total_papers": len(final_state.papers), "iterations": final_state.iteration}

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
        paper_intel = await paper_enricher.enrich(req.paper_data)
        paper_id = paper_intel.get("id") or "paper-unknown"
        title = paper_intel.get("title", "Untitled Paper")
    elif req.identifier:
        paper_intel = await paper_enricher.enrich_by_identifier(req.identifier)
        paper_id = paper_intel.get("id") or req.identifier
        title = paper_intel.get("title", "Untitled Paper")
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

    # If workspace_id is specified, link workspace -> paper
    if req.workspace_id and req.workspace_id.strip():
        ws_clean = req.workspace_id.strip()
        ws_id = ws_clean if ws_clean.startswith("ws-") else f"ws-{ws_clean}"
        ws_node = await graph_store.get_node(ws_id)
        if not ws_node:
            ws_topic_node = TopicNode(id=ws_id, name=f"Workspace {ws_clean}", query=ws_clean)
            await graph_store.add_node(ws_topic_node)
        ws_edge = ResearchEdge(
            source_id=ws_id,
            target_id=paper_node_id or paper_id,
            relation=Relation.COVERS,
            weight=2.0,
        )
        await graph_store.add_edge(ws_edge)

    return IngestPaperResponse(
        status="ingested",
        paper_id=paper_node_id or paper_id,
        title=title,
        nodes_count=graph_store.graph.number_of_nodes(),
        edges_count=graph_store.graph.number_of_edges(),
    )


@router.post("/build-workspace-graph", response_model=BuildWorkspaceGraphResponse)
async def build_workspace_graph_endpoint(req: BuildWorkspaceGraphRequest):
    """Batch-synthesize knowledge graph for a workspace across added papers using Gemini & SQLite cache."""
    papers_to_use = req.papers or []

    # If papers list is empty but paper_ids provided, resolve or fetch
    if not papers_to_use and req.paper_ids:
        for pid in req.paper_ids:
            # Check if paper already exists in graph_store
            n = await graph_store.get_node(pid) or await graph_store.get_node(slugify_id(pid))
            if n:
                papers_to_use.append(n.model_dump(mode="json"))
            else:
                try:
                    resolved = await paper_enricher.enrich_by_identifier(pid)
                    papers_to_use.append(resolved)
                except Exception:
                    papers_to_use.append({"id": pid, "title": pid})

    res = await graph_synthesizer.synthesize_workspace_graph(
        workspace_id=req.workspace_id,
        topic=req.topic,
        papers=papers_to_use,
        force_refresh=req.force_refresh,
    )
    return BuildWorkspaceGraphResponse(**res)


@router.get("/workspace-cache-status")
async def get_workspace_cache_status(
    workspace_id: str = Query(..., description="Workspace ID"),
    paper_ids: List[str] = Query(default=[], description="Paper IDs currently staged in workspace"),
):
    """Check if the given workspace and paper set has a pre-built synthesis in SQLite cache."""
    cached = await graph_synthesizer.get_cached_synthesis(workspace_id, paper_ids)
    if cached:
        return {
            "workspace_id": workspace_id,
            "cached": True,
            "nodes_count": cached.get("nodes_count", 0),
            "edges_count": cached.get("edges_count", 0),
            "cross_paper_relations_count": len(cached.get("cross_paper_relations", [])),
            "gaps_count": len(cached.get("research_gaps", [])),
            "synthesis_summary": cached.get("synthesis_summary", ""),
        }
    return {
        "workspace_id": workspace_id,
        "cached": False,
        "nodes_count": 0,
        "edges_count": 0,
    }


@router.post("/generate-novelty")
async def generate_graph_novelty_endpoint(req: GenerateNoveltyRequest):
    """Synthesize grounded novel research hypotheses and architectures from the active knowledge graph."""
    res = await novelty_engine.synthesize_novelties(
        workspace_id=req.workspace_id,
        topic=req.topic,
        paper_ids=req.paper_ids,
        force_refresh=req.force_refresh,
    )
    return res


@router.get("/novelty-cache-status")
async def get_novelty_cache_status(
    workspace_id: str = Query(..., description="Workspace ID"),
    paper_ids: List[str] = Query(default=[], description="Paper IDs currently staged in workspace"),
):
    """Check if novelty proposals are cached in SQLite for the given workspace."""
    cached = await novelty_engine.get_cached_novelties(workspace_id, paper_ids)
    return {
        "workspace_id": workspace_id,
        "cached": bool(cached and len(cached) > 0),
        "novelties_count": len(cached) if cached else 0,
    }


@router.post("/add-novelty-to-graph")
async def add_novelty_to_graph_endpoint(req: AddNoveltyNodeRequest):
    """Inject a synthesized novelty proposal directly into the graph canvas as a candidate node."""
    res = await novelty_engine.add_novelty_candidate_node(
        workspace_id=req.workspace_id or "global",
        novelty=req.novelty,
    )
    return res


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
    workspace_id: Optional[str] = Query(None, description="Optional workspace ID to isolate graph"),
    paper_id: Optional[str] = Query(None, description="Optional paper ID to isolate graph"),
    scoped: bool = Query(False, description="If true, return strictly nodes connected to topic or workspace")
):
    """Return complete graph elements (nodes + typed labeled edges) for visual network canvas."""
    await graph_store._ensure_initialized()

    target_topic_id = None
    if topic and topic.strip():
        topic_clean = topic.strip()
        target_topic_id = f"topic-{slugify_id(topic_clean)}"
        existing_topic = await graph_store.get_node(target_topic_id)
        if not existing_topic:
            topic_node = TopicNode(id=target_topic_id, name=topic_clean, query=topic_clean)
            await graph_store.add_node(topic_node)

    target_ws_id = None
    if workspace_id and workspace_id.strip():
        ws_clean = workspace_id.strip()
        target_ws_id = ws_clean if ws_clean.startswith("ws-") else f"ws-{ws_clean}"

    target_paper_id = None
    if paper_id and paper_id.strip():
        target_paper_id = paper_id.strip()

    # Identify anchor nodes for graph scoping
    anchor_ids = set()
    if target_topic_id and target_topic_id in graph_store.graph:
        anchor_ids.add(target_topic_id)
    if target_ws_id and target_ws_id in graph_store.graph:
        anchor_ids.add(target_ws_id)
    if target_paper_id and target_paper_id in graph_store.graph:
        anchor_ids.add(target_paper_id)

    # Scoping logic: if scoped flag is set or topic/workspace_id/paper_id is provided, strictly isolate the graph
    allowed_node_ids = None
    if scoped or topic or workspace_id or paper_id:
        allowed_node_ids = set(anchor_ids)
        for a_id in anchor_ids:
            if a_id in graph_store.graph:
                for p_id in graph_store.graph.successors(a_id):
                    allowed_node_ids.add(p_id)
        # Include all bidirectional neighbors (citations, methods) of scoped papers
        paper_neighbors = set()
        for p_id in list(allowed_node_ids):
            if p_id in graph_store.graph:
                for succ in graph_store.graph.successors(p_id):
                    paper_neighbors.add(succ)
                for pred in graph_store.graph.predecessors(p_id):
                    paper_neighbors.add(pred)
        allowed_node_ids.update(paper_neighbors)

    # Identify paper nodes within allowed scope
    paper_ids = set()
    for nid in graph_store.graph.nodes:
        if allowed_node_ids is not None and nid not in allowed_node_ids:
            continue
        n = await graph_store.get_node(nid)
        if n and getattr(n, "node_type", None) == NodeType.PAPER:
            paper_ids.add(nid)

    # Use scoped edge list to avoid O(global) scan on every request
    if allowed_node_ids is not None:
        edges_raw = graph_store.get_scoped_edges(allowed_node_ids)
    else:
        edges_raw = await graph_store.get_all_edges()

    # Rule: non-topic, non-paper nodes are CONNECTION nodes between papers.
    # If multiple papers exist (>= 2), only include nodes that connect to >= 2 papers (avoids leaf dandelion starbursts).
    # Gaps are always preserved as research opportunities.
    if scoped:
        min_papers = 1
    else:
        min_papers = 2 if len(paper_ids) >= 2 else 1

    # Ensure every scoped paper connects to the primary topic/workspace anchor so none float detached
    primary_anchor = None
    if target_topic_id and target_topic_id in graph_store.graph:
        primary_anchor = target_topic_id
    elif target_ws_id and target_ws_id in graph_store.graph:
        primary_anchor = target_ws_id
    elif anchor_ids:
        primary_anchor = next(iter(anchor_ids))

    if primary_anchor:
        existing_anchor_pairs = {
            (e.source_id, e.target_id) for e in edges_raw
        } | {
            (e.target_id, e.source_id) for e in edges_raw
        }
        for pid in paper_ids:
            if (primary_anchor, pid) not in existing_anchor_pairs:
                edges_raw.append(ResearchEdge(
                    source_id=primary_anchor,
                    target_id=pid,
                    relation=Relation.COVERS,
                    weight=2.0
                ))

    valid_connection_node_ids = set()
    for nid in graph_store.graph.nodes:
        if allowed_node_ids is not None and nid not in allowed_node_ids:
            continue
        n = await graph_store.get_node(nid)
        if not n:
            continue
        ntype = n.node_type.value if hasattr(n.node_type, "value") else str(n.node_type)
        if ntype in ["topic", "paper", "gap"]:
            valid_connection_node_ids.add(nid)
        else:
            connected_papers = set()
            for e in edges_raw:
                if e.source_id == nid and e.target_id in paper_ids:
                    connected_papers.add(e.target_id)
                elif e.target_id == nid and e.source_id in paper_ids:
                    connected_papers.add(e.source_id)
            if len(connected_papers) >= min_papers:
                valid_connection_node_ids.add(nid)

    nodes = []
    node_type_counts = {}
    for nid in graph_store.graph.nodes:
        if allowed_node_ids is not None and nid not in allowed_node_ids:
            continue
        if nid not in valid_connection_node_ids:
            continue
        n = await graph_store.get_node(nid)
        if n:
            ntype = n.node_type.value if hasattr(n.node_type, "value") else str(n.node_type)
            if anchor_ids and ntype == "topic" and nid not in anchor_ids:
                continue
            n_dict = n.model_dump(mode="json")
            node_type_counts[ntype] = node_type_counts.get(ntype, 0) + 1
            label = getattr(n, "name", None) or getattr(n, "title", None) or getattr(n, "text", None) or nid
            nodes.append({
                "id": nid,
                "label": str(label)[:35],
                "node_type": ntype,
                "title": f"[{ntype.upper()}] {label}",
                "data": n_dict,
            })

    node_id_set = {n["id"] for n in nodes}
    edges = []
    for e in edges_raw:
        if allowed_node_ids is not None and (e.source_id not in allowed_node_ids or e.target_id not in allowed_node_ids):
            continue
        if e.source_id not in node_id_set or e.target_id not in node_id_set:
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
    try:
        res = await graph_store.get_node_neighborhood(node_id)
        if not res or not res.get("node"):
            return {
                "node": {"id": node_id, "label": node_id, "node_type": "entity", "data": {}},
                "incoming": [],
                "outgoing": [],
                "total_neighbors": 0,
            }
        return res
    except Exception:
        return {
            "node": {"id": node_id, "label": node_id, "node_type": "entity", "data": {}},
            "incoming": [],
            "outgoing": [],
            "total_neighbors": 0,
        }


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


import asyncio

# ─────────────────────────────────────────────────────────────────────────────
# Papers With Code — Benchmarks & SOTA Leaderboards
# ─────────────────────────────────────────────────────────────────────────────

_pwc_client = None

def _get_pwc():
    global _pwc_client
    if _pwc_client is None:
        from src.engines.paperswithcode import PapersWithCodeClient
        _pwc_client = PapersWithCodeClient()
    return _pwc_client


@router.get("/benchmarks", summary="Get benchmark results & code repos for a paper")
async def get_paper_benchmarks(
    arxiv_id: Optional[str] = Query(None, description="arXiv ID, e.g. 2310.06625"),
    doi: Optional[str] = Query(None, description="Paper DOI, e.g. 10.1145/..."),
    paper_id: Optional[str] = Query(None, description="Paper canonical ID"),
    title: Optional[str] = Query(None, description="Paper title (fallback if no ID)"),
    db: AsyncSession = Depends(get_db),
):
    """Fetches benchmark evaluation tables and linked code repos, cached/persisted in SQLite by arXiv ID (e.g. 2310.06625) or DOI."""
    if not arxiv_id and not doi and not paper_id and not title:
        raise HTTPException(status_code=400, detail="Provide arxiv_id, doi, paper_id, or title.")

    # Normalize arxiv_id to canonical format e.g. 2310.06625
    clean_arxiv = None
    if arxiv_id:
        ar_match = re.search(r"(\d{4}\.\d{4,5})", arxiv_id)
        if ar_match:
            clean_arxiv = ar_match.group(1)
        else:
            clean_arxiv = arxiv_id.strip()
            if clean_arxiv.lower().startswith("arxiv:"):
                clean_arxiv = clean_arxiv[6:].strip()
    elif paper_id:
        ar_match = re.search(r"(\d{4}\.\d{4,5})", paper_id)
        if ar_match:
            clean_arxiv = ar_match.group(1)

    clean_doi = doi.strip() if doi else None

    # 1. Query cached benchmarks & repos from SQLite
    try:
        cached = await PaperRepository.get_benchmarks_and_repos(
            db,
            arxiv_id=clean_arxiv,
            doi=clean_doi,
            paper_id=paper_id or clean_arxiv or clean_doi,
        )
        if cached is not None:
            cached_benchmarks, cached_repos = cached
            if len(cached_benchmarks) > 0:
                all_methods = list(dict.fromkeys([m for b in cached_benchmarks for m in (b.methods or [])]))
                return {
                    "arxiv_id": clean_arxiv or arxiv_id,
                    "doi": clean_doi,
                    "paper_id": paper_id,
                    "title": title,
                    "benchmark_count": len(cached_benchmarks),
                    "repo_count": len(cached_repos),
                    "methods": all_methods,
                    "benchmarks": [b.model_dump() for b in cached_benchmarks],
                    "repositories": [r.model_dump() for r in cached_repos],
                    "cached": True,
                    "source": "sqlite",
                }
    except Exception as exc:
        logger.warning("[Benchmarks] SQLite read error: %s", exc)

    # 2. Fetch live from Papers With Code
    pwc = _get_pwc()
    query_arxiv = clean_arxiv or arxiv_id
    benchmarks, repos = await asyncio.gather(
        pwc.get_paper_benchmarks(arxiv_id=query_arxiv, title=title),
        pwc.get_code_repositories(arxiv_id=query_arxiv, title=title),
    )

    # 3. Save into SQLite keyed by clean arXiv ID (e.g. 2310.06625) or DOI
    try:
        await PaperRepository.save_benchmarks_and_repos(
            db=db,
            benchmarks=benchmarks,
            repositories=repos,
            arxiv_id=clean_arxiv,
            doi=clean_doi,
            paper_id=clean_arxiv or clean_doi or paper_id,
            title=title,
        )
    except Exception as exc:
        logger.warning("[Benchmarks] Failed to save benchmarks to SQLite: %s", exc)

    all_methods = list(dict.fromkeys([m for b in benchmarks for m in (b.methods or [])]))
    return {
        "arxiv_id": clean_arxiv or arxiv_id,
        "doi": clean_doi,
        "paper_id": paper_id,
        "title": title,
        "benchmark_count": len(benchmarks),
        "repo_count": len(repos),
        "methods": all_methods,
        "benchmarks": [b.model_dump() for b in benchmarks],
        "repositories": [r.model_dump() for r in repos],
        "cached": False,
        "source": "paperswithcode",
    }


@router.get("/sota/search-tasks", summary="Search ML tasks on Papers With Code")
async def sota_search_tasks(
    q: str = Query(..., min_length=1, description="Task name, e.g. 'image classification'"),
    limit: int = Query(10, le=50),
):
    """Search for ML tasks by name to get their task IDs for leaderboard queries."""
    pwc = _get_pwc()
    tasks = await pwc.search_tasks(query=q, limit=limit)
    return {"query": q, "count": len(tasks), "tasks": tasks}


@router.get("/sota/task/{task_id}", summary="SOTA leaderboard for an ML task")
async def sota_for_task(
    task_id: str,
    limit: int = Query(20, le=100),
):
    """Returns the SOTA leaderboard for a specific task.
    Example IDs: image-classification, language-modelling, machine-translation, question-answering"""
    pwc = _get_pwc()
    rows = await pwc.get_sota_for_task(task_id=task_id, limit=limit)
    return {"task_id": task_id, "count": len(rows), "leaderboard": rows}


@router.get("/sota/search-datasets", summary="Search benchmark datasets on Papers With Code")
async def sota_search_datasets(
    q: str = Query(..., min_length=1, description="Dataset name, e.g. 'ImageNet', 'SQuAD', 'MMLU'"),
    limit: int = Query(10, le=50),
):
    """Search for benchmark datasets by name to get their dataset IDs."""
    pwc = _get_pwc()
    datasets = await pwc.search_datasets(query=q, limit=limit)
    return {"query": q, "count": len(datasets), "datasets": datasets}


@router.get("/sota/dataset/{dataset_id}", summary="SOTA leaderboard for a benchmark dataset")
async def sota_for_dataset(
    dataset_id: str,
    limit: int = Query(20, le=100),
):
    """Returns the SOTA leaderboard for a specific dataset, grouped by metric.
    Example IDs: imagenet, squad, mmlu, glue, coco"""
    pwc = _get_pwc()
    rows = await pwc.get_sota_for_dataset(dataset_id=dataset_id, limit=limit)
    return {"dataset_id": dataset_id, "count": len(rows), "leaderboard": rows}
