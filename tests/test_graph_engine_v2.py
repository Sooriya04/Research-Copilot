import os
import tempfile
import pytest

from src.core.schemas import PaperIntelligence
from src.graph.builder import GraphBuilder
from src.graph.gap_engine import GapDetectionEngine
from src.graph.schema import (
    ClaimNode,
    DatasetNode,
    LimitationNode,
    MethodNode,
    MetricNode,
    NodeType,
    PaperNode,
    Relation,
    ResearchEdge,
    ResearchGapNode,
    parse_graph_node,
    slugify_id,
)
from src.graph.store import ResearchGraphStore


def test_schema_models_and_slugification():
    assert slugify_id("Sparse Autoencoders (SAE)") == "sparse-autoencoders-sae"
    assert slugify_id("HumanEval-Plus") == "humaneval-plus"

    paper = PaperNode(
        id="2312.00752",
        title="Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
        year=2023,
        venue="arXiv",
        authors=["Albert Gu", "Tri Dao"],
    )
    assert paper.node_type == NodeType.PAPER
    assert paper.id == "2312.00752"

    method = MethodNode(
        id="selective-ssm",
        name="Selective State Space Model",
        category="architecture",
    )
    assert method.node_type == NodeType.METHOD

    claim = ClaimNode(
        id="claim-1",
        text="Mamba outperforms Transformers at 5x throughput",
        verified=True,
        paper_id="2312.00752",
        confidence=0.95,
    )
    assert claim.verified is True
    assert claim.confidence == 0.95

    edge = ResearchEdge(
        source_id=paper.id,
        target_id=method.id,
        relation=Relation.USES_METHOD,
    )
    assert edge.relation == Relation.USES_METHOD
    assert edge.weight == 1.0


def test_parse_graph_node_helper():
    raw_data = {
        "id": "mmlu-dataset",
        "name": "MMLU",
        "domain": "reasoning",
    }
    node = parse_graph_node(NodeType.DATASET, raw_data)
    assert isinstance(node, DatasetNode)
    assert node.name == "MMLU"
    assert node.domain == "reasoning"


@pytest.mark.asyncio
async def test_store_node_and_edge_persistence():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    try:
        store = ResearchGraphStore(db_path=temp_db_path)

        paper = PaperNode(id="paper-1", title="Attention Is All You Need", year=2017, venue="NeurIPS", authors=["Vaswani et al."])
        method = MethodNode(id="multi-head-attention", name="Multi-Head Attention", category="attention")
        dataset = DatasetNode(id="wmt14-en-de", name="WMT 2014 En-De", domain="machine_translation")

        await store.add_node(paper)
        await store.add_node(method)
        await store.add_node(dataset)

        edge1 = ResearchEdge(source_id="paper-1", target_id="multi-head-attention", relation=Relation.USES_METHOD)
        edge2 = ResearchEdge(source_id="paper-1", target_id="wmt14-en-de", relation=Relation.EVALUATES_ON)

        await store.add_edge(edge1)
        await store.add_edge(edge2)

        # Retrieve nodes
        fetched_paper = await store.get_node("paper-1")
        assert fetched_paper is not None
        assert fetched_paper.title == "Attention Is All You Need"
        assert isinstance(fetched_paper, PaperNode)

        # Retrieve neighbors
        neighbors = await store.get_neighbors("paper-1")
        assert len(neighbors) == 2

        filtered_neighbors = await store.get_neighbors("paper-1", relation=Relation.USES_METHOD)
        assert len(filtered_neighbors) == 1
        assert filtered_neighbors[0].id == "multi-head-attention"

        # find_papers_using
        papers_using = await store.find_papers_using("multi-head-attention", "wmt14-en-de")
        assert len(papers_using) == 1
        assert papers_using[0].id == "paper-1"

        # Test reload from DB into new in-memory store
        new_store = ResearchGraphStore(db_path=temp_db_path)
        await new_store.load_from_db()

        assert new_store.graph.number_of_nodes() == 3
        assert new_store.graph.number_of_edges() == 2

        all_methods = await new_store.get_all_nodes_by_type(NodeType.METHOD)
        assert len(all_methods) == 1
        assert all_methods[0].id == "multi-head-attention"

    finally:
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)


@pytest.mark.asyncio
async def test_builder_and_gap_detection_engine():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    try:
        store = ResearchGraphStore(db_path=temp_db_path)
        builder = GraphBuilder(store=store)

        intel1 = PaperIntelligence(
            id="arxiv:1706.03762",
            title="Attention Is All You Need",
            year=2017,
            venue="NeurIPS",
            authors=["Ashish Vaswani", "Noam Shazeer"],
            methods=["Transformer", "Multi-Head Self-Attention"],
            datasets=["WMT 2014 En-De", "WMT 2014 En-Fr"],
            metrics={"BLEU": {"value": "28.4", "unit": "score"}},
            claims=[
                {"claim": "Transformer achieves SOTA BLEU without RNNs", "verified": True, "confidence": 0.98}
            ],
            limitations=["Quadratic computational complexity with sequence length"],
            cited_papers=["arxiv:1508.04025"],
        )

        intel2 = PaperIntelligence(
            id="arxiv:2005.14165",
            title="Language Models are Few-Shot Learners",
            year=2020,
            venue="NeurIPS",
            authors=["Tom Brown", "Benjamin Mann"],
            methods=["Transformer", "Few-Shot In-Context Learning"],
            datasets=["LAMBADA", "TriviaQA", "SuperGLUE"],
            metrics={"Accuracy": "86.4%"},
            claims=[
                {"claim": "Scaling parameters improves few-shot capability", "verified": True, "confidence": 0.95}
            ],
            limitations=["High inference latency and memory consumption"],
            cited_papers=["arxiv:1706.03762"],
        )

        await builder.build_from_paper_intelligence(intel1)
        await builder.build_from_paper_intelligence(intel2)

        # Gap detection
        gap_engine = GapDetectionEngine(store=store)
        gaps = await gap_engine.detect_method_dataset_gaps()

        # Transformer was evaluated on WMT and LAMBADA, but Few-Shot In-Context Learning was not tested on WMT 2014 En-De
        gap_ids = [g.id for g in gaps]
        assert "gap-few-shot-in-context-learning-wmt-2014-en-de" in gap_ids

        # Check underexplored methods
        # "Transformer" is used by 2 papers -> not underexplored.
        # "Multi-Head Self-Attention" and "Few-Shot In-Context Learning" used by 1 paper -> underexplored.
        underexplored_methods = await gap_engine.get_underexplored_methods()
        underexplored_m_ids = [m.id for m in underexplored_methods]
        assert "transformer" not in underexplored_m_ids
        assert "multi-head-self-attention" in underexplored_m_ids
        assert "few-shot-in-context-learning" in underexplored_m_ids

        # Check summary of research space
        summary = await gap_engine.summarize_research_space()
        assert summary["total_papers"] == 2
        assert summary["total_methods"] >= 3
        assert summary["total_datasets"] >= 5
        assert summary["total_gaps"] > 0
        assert "Transformer" in summary["coverage_matrix"]
        assert summary["coverage_matrix"]["Transformer"]["WMT 2014 En-De"] is True
        assert summary["coverage_matrix"]["Few-Shot In-Context Learning"]["WMT 2014 En-De"] is False

    finally:
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)


@pytest.mark.asyncio
async def test_graph_api_endpoints_via_http():
    from fastapi.testclient import TestClient
    from src.api.app import app

    client = TestClient(app)

    # Ingest a paper via API payload
    ingest_payload = {
        "paper_data": {
            "id": "arxiv:2312.00752",
            "title": "Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
            "year": 2023,
            "authors": ["Albert Gu", "Tri Dao"],
            "methods": ["Selective State Space", "FlashAttention"],
            "datasets": ["The Pile", "WikiText-103"],
            "metrics": {"Perplexity": "5.6"},
            "claims": [{"claim": "Mamba scales linearly with sequence length", "verified": True}],
            "limitations": ["Requires specialized hardware kernel implementation"]
        }
    }

    resp = client.post("/api/v1/graph/ingest-paper", json=ingest_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ingested"
    assert data["paper_id"] == "arxiv:2312.00752"
    assert data["nodes_count"] > 0

    # Get summary
    sum_resp = client.get("/api/v1/graph/summary")
    assert sum_resp.status_code == 200
    sum_data = sum_resp.json()
    assert "total_papers" in sum_data
    assert "coverage_matrix" in sum_data

    # Get gaps
    gaps_resp = client.get("/api/v1/graph/gaps")
    assert gaps_resp.status_code == 200
    gaps_data = gaps_resp.json()
    assert isinstance(gaps_data, list)

    # Get underexplored
    under_resp = client.get("/api/v1/graph/underexplored")
    assert under_resp.status_code == 200
    under_data = under_resp.json()
    assert "underexplored_methods" in under_data
    assert "underexplored_datasets" in under_data

    # Get nodes
    nodes_resp = client.get("/api/v1/graph/nodes?node_type=method")
    assert nodes_resp.status_code == 200
    nodes_data = nodes_resp.json()
    assert any(n["id"] == "selective-state-space" for n in nodes_data)

