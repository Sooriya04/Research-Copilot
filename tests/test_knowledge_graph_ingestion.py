import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from src.api.app import app
from src.core.canonical_models import BenchmarkEvidence, CodeRepository
from src.engines.abstract_entity_extractor import AbstractEntityExtractor
from src.engines.paper_enricher import PaperEnricher
from src.engines.paperswithcode import PapersWithCodeClient
from src.graph.builder import GraphBuilder
from src.graph.normalizer import normalize_entity
from src.graph.schema import NodeType, Relation, ResearchEdge
from src.graph.store import ResearchGraphStore


# ── Case 1: Paper with PWC metadata ──────────────────────────────────────────
@pytest.mark.asyncio
async def test_case_1_paper_with_pwc_metadata():
    """Case 1: When Papers With Code metadata exists, methods and datasets must be populated."""
    pwc_mock = PapersWithCodeClient()
    mock_benchmarks = [
        BenchmarkEvidence(
            source="paperswithcode",
            task="Mathematical Reasoning",
            dataset="GSM8K",
            metric="Accuracy",
            value="82.4%",
            model="LoRA",
            split="test",
            paper_title="LoRA Paper",
        ),
        BenchmarkEvidence(
            source="paperswithcode",
            task="Language Modeling",
            dataset="MMLU Benchmark",
            metric="Accuracy",
            value="75.1%",
            model="LoRA",
            split="test",
            paper_title="LoRA Paper",
        ),
    ]
    mock_repos = [CodeRepository(url="https://github.com/microsoft/LoRA", is_official=True, stars=15000)]

    enricher = PaperEnricher(pwc_client=pwc_mock)
    with patch.object(pwc_mock, "get_paper_benchmarks", new_callable=AsyncMock, return_value=mock_benchmarks), \
         patch.object(pwc_mock, "get_code_repositories", new_callable=AsyncMock, return_value=mock_repos):

        raw_paper = {
            "id": "arxiv:2106.09685",
            "title": "LoRA: Low-Rank Adaptation of Large Language Models",
            "abstract": "We freeze the pre-trained model weights and inject trainable rank decomposition matrices.",
            "arxiv_id": "2106.09685",
            "methods": [],
            "datasets": [],
            "tasks": [],
        }
        enriched = await enricher.enrich(raw_paper)

        assert len(enriched["methods"]) > 0
        assert len(enriched["datasets"]) > 0
        assert "GSM8K" in enriched["datasets"]
        assert "LoRA" in enriched["methods"]
        assert len(enriched["repositories"]) > 0
        assert "https://github.com/microsoft/LoRA" in enriched["repositories"]


# ── Case 2: Paper without PWC metadata ────────────────────────────────────────
@pytest.mark.asyncio
async def test_case_2_paper_without_pwc_metadata():
    """Case 2: When PWC metadata is absent, abstract entity extraction populates entities."""
    pwc_mock = PapersWithCodeClient()
    enricher = PaperEnricher(pwc_client=pwc_mock)

    with patch.object(pwc_mock, "get_paper_benchmarks", new_callable=AsyncMock, return_value=[]), \
         patch.object(pwc_mock, "get_code_repositories", new_callable=AsyncMock, return_value=[]):

        raw_paper = {
            "id": "arxiv:2205.14135",
            "title": "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness",
            "abstract": "We introduce FlashAttention, a fast and memory-efficient exact attention algorithm. We evaluate on ImageNet classification and GLUE benchmark language modeling.",
            "arxiv_id": "2205.14135",
            "methods": [],
            "datasets": [],
            "tasks": [],
        }
        enriched = await enricher.enrich(raw_paper)

        assert len(enriched["methods"]) > 0
        assert len(enriched["datasets"]) > 0
        assert "FlashAttention" in enriched["methods"]
        assert any("ImageNet" in d or "GLUE" in d for d in enriched["datasets"])


# ── Case 3: LLM unavailable (Heuristic fallback) ──────────────────────────────
@pytest.mark.asyncio
async def test_case_3_llm_unavailable_heuristic_fallback():
    """Case 3: If LLM is unavailable or raises error, deterministic heuristic fallback populates entities."""
    extractor = AbstractEntityExtractor()
    with patch.object(extractor.provider, "complete", side_effect=RuntimeError("API quota exceeded or network down")):
        enricher = PaperEnricher(abstract_extractor=extractor)
        raw_paper = {
            "id": "arxiv:2305.14314",
            "title": "QLoRA: Efficient Finetuning of Quantized LLMs",
            "abstract": "We present QLoRA, an efficient finetuning approach that reduces memory usage without performance tradeoffs. Evaluated on MMLU benchmark.",
            "arxiv_id": "2305.14314",
            "methods": [],
            "datasets": [],
        }
        # Ingestion/enrichment must not fail!
        enriched = await enricher.enrich(raw_paper)

        assert len(enriched["methods"]) > 0
        assert "QLoRA" in enriched["methods"]
        assert "MMLU Benchmark" in enriched["datasets"]


# ── Case 4: Single paper graph (Scoped pruning fix) ───────────────────────────
def test_case_4_single_paper_graph():
    """Case 4: In a single-paper graph, methods and datasets connected to only 1 paper must remain visible."""
    client = TestClient(app)
    client.post("/api/v1/graph/clear")

    ingest_payload = {
        "workspace_id": "ws-case-4",
        "paper_data": {
            "id": "paper-single-1",
            "title": "LoRA: Low-Rank Adaptation of Large Language Models",
            "abstract": "We freeze pre-trained weights and inject trainable low-rank adaptation matrices. Evaluated on GSM8K.",
            "methods": ["LoRA", "Parameter-Efficient Fine-Tuning"],
            "datasets": ["GSM8K"],
        }
    }
    ingest_res = client.post("/api/v1/graph/ingest-paper", json=ingest_payload)
    assert ingest_res.status_code == 200

    # 1. Test elements with scoped=true & workspace_id
    scoped_res = client.get("/api/v1/graph/elements?scoped=true&workspace_id=ws-case-4")
    assert scoped_res.status_code == 200
    scoped_data = scoped_res.json()

    scoped_node_types = {n["node_type"] for n in scoped_data["nodes"]}
    assert "paper" in scoped_node_types
    assert "method" in scoped_node_types
    assert "dataset" in scoped_node_types

    # 2. Test global elements when only 1 paper exists in the system
    global_res = client.get("/api/v1/graph/elements")
    assert global_res.status_code == 200
    global_data = global_res.json()
    global_node_types = {n["node_type"] for n in global_data["nodes"]}
    assert "method" in global_node_types
    assert "dataset" in global_node_types


# ── Case 5: Multiple papers (Global pruning retains >= 2) ─────────────────────
def test_case_5_multiple_papers_global_pruning():
    """Case 5: In global unscoped multi-paper mode, orphan connection nodes connected to only 1 paper are pruned."""
    client = TestClient(app)
    client.post("/api/v1/graph/clear")

    # Ingest Paper 1 with UniqueMethodA and SharedMethodX
    client.post("/api/v1/graph/ingest-paper", json={
        "workspace_id": "ws-multi",
        "paper_data": {
            "id": "paper-multi-1",
            "title": "Paper 1 on Attention",
            "methods": ["FlashAttention", "Prefix Tuning"],
            "datasets": ["SQuAD"],
        }
    })

    # Ingest Paper 2 with UniqueMethodB and SharedMethodX
    client.post("/api/v1/graph/ingest-paper", json={
        "workspace_id": "ws-multi",
        "paper_data": {
            "id": "paper-multi-2",
            "title": "Paper 2 on Attention",
            "methods": ["FlashAttention", "Adapter Layers"],
            "datasets": ["SQuAD"],
        }
    })

    # Global unscoped request: multiple papers exist -> min_papers = 2
    global_res = client.get("/api/v1/graph/elements")
    assert global_res.status_code == 200
    global_data = global_res.json()

    method_nodes = [n["id"] for n in global_data["nodes"] if n["node_type"] == "method"]
    # FlashAttention is shared by both papers (>= 2) -> retained
    assert "flashattention" in method_nodes
    # Prefix Tuning and Adapter Layers are single-paper orphans in global view -> pruned
    assert "prefix-tuning" not in method_nodes
    assert "adapter-layers" not in method_nodes

    # Scoped request for workspace: all workspace methods remain visible
    scoped_res = client.get("/api/v1/graph/elements?scoped=true&workspace_id=ws-multi")
    assert scoped_res.status_code == 200
    scoped_data = scoped_res.json()
    scoped_methods = [n["id"] for n in scoped_data["nodes"] if n["node_type"] == "method"]
    assert "flashattention" in scoped_methods
    assert "prefix-tuning" in scoped_methods
    assert "adapter-layers" in scoped_methods


# ── Case 6: No abstract ───────────────────────────────────────────────────────
def test_case_6_no_abstract():
    """Case 6: Ingesting a paper with no abstract succeeds smoothly without errors."""
    client = TestClient(app)
    client.post("/api/v1/graph/clear")

    payload = {
        "paper_data": {
            "id": "paper-no-abstract",
            "title": "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
            "abstract": "",
            "methods": ["Direct Preference Optimization"],
            "datasets": [],
        }
    }
    res = client.post("/api/v1/graph/ingest-paper", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ingested"
    assert data["paper_id"] == "paper-no-abstract"

    elem_res = client.get("/api/v1/graph/elements")
    assert elem_res.status_code == 200
    node_ids = [n["id"] for n in elem_res.json()["nodes"]]
    assert "paper-no-abstract" in node_ids


# ── Case 7: Duplicate entities normalization ──────────────────────────────────
def test_case_7_duplicate_entities_normalization():
    """Case 7: Equivalent method names resolve to one canonical normalized node in the knowledge graph."""
    client = TestClient(app)
    client.post("/api/v1/graph/clear")

    # Paper A uses "Low-Rank Adaptation"
    client.post("/api/v1/graph/ingest-paper", json={
        "workspace_id": "ws-norm",
        "paper_data": {
            "id": "paper-a",
            "title": "Paper A",
            "methods": ["Low-Rank Adaptation"],
        }
    })

    # Paper B uses "LoRA"
    client.post("/api/v1/graph/ingest-paper", json={
        "workspace_id": "ws-norm",
        "paper_data": {
            "id": "paper-b",
            "title": "Paper B",
            "methods": ["LoRA"],
        }
    })

    elem_res = client.get("/api/v1/graph/elements?scoped=true&workspace_id=ws-norm")
    assert elem_res.status_code == 200
    data = elem_res.json()

    method_nodes = [n for n in data["nodes"] if n["node_type"] == "method"]
    lora_nodes = [n for n in method_nodes if n["id"] == "lora"]
    # Must resolve to exactly ONE canonical method node
    assert len(lora_nodes) == 1
    assert lora_nodes[0]["label"] == "LoRA"

    # Both Paper A and Paper B must connect to this same LoRA node
    lora_edges = [e for e in data["edges"] if e["target"] == "lora" and e["relation"] == "uses_method"]
    source_ids = {e["source"] for e in lora_edges}
    assert "paper-a" in source_ids
    assert "paper-b" in source_ids
