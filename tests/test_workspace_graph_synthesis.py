import os
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from src.api.app import app
from src.graph.schema import NodeType, Relation
from src.graph.store import ResearchGraphStore
from src.graph.synthesizer import GraphSynthesizer
from src.providers.gemini import GeminiFlashLiteProvider


@pytest.mark.asyncio
async def test_graph_synthesizer_sqlite_cache_and_batch_build(tmp_path):
    """Verify GraphSynthesizer performs batch synthesis, persists in SQLite, and hits cache on subsequent calls."""
    test_db = str(tmp_path / "test_synth.db")
    store = ResearchGraphStore(db_path=test_db)
    provider_mock = GeminiFlashLiteProvider(api_key="test-key")

    mock_llm_response = """
    {
      "cross_paper_relations": [
        {
          "source_id": "2106.09685",
          "target_id": "1706.03762",
          "relation": "extends",
          "explanation": "LoRA freezes Transformer weights and injects low-rank matrices into attention layers.",
          "weight": 2.5
        }
      ],
      "shared_methods": ["Transformer Architecture", "Self-Attention Mechanism"],
      "shared_datasets": ["WMT 2014"],
      "research_gaps": [
        {
          "title": "Low-rank adaptation on IO-aware tiling",
          "description": "Neither paper explores applying low-rank decomposition directly to tiled attention kernels.",
          "method": "LoRA",
          "dataset_or_task": "Long-context sequence modeling",
          "paper_ids": ["2106.09685", "1706.03762"]
        }
      ],
      "synthesis_summary": "LoRA builds directly upon the Transformer architecture by freezing layers and adding low-rank adapters."
    }
    """

    synthesizer = GraphSynthesizer(store=store, provider=provider_mock, db_path=test_db)

    sample_papers = [
        {
            "id": "1706.03762",
            "title": "Attention Is All You Need",
            "year": 2017,
            "abstract": "We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism.",
            "methods": ["Transformer Architecture", "Self-Attention Mechanism"],
            "datasets": ["WMT 2014"],
        },
        {
            "id": "2106.09685",
            "title": "LoRA: Low-Rank Adaptation of Large Language Models",
            "year": 2021,
            "abstract": "LoRA reduces the number of trainable parameters by 10,000 times by freezing Transformer weights and injecting rank decomposition matrices.",
            "methods": ["LoRA", "Low-Rank Decomposition", "Transformer Architecture"],
            "datasets": ["GLUE Benchmark", "WMT 2014"],
            "referenced_works": ["1706.03762"],
        },
    ]

    with patch.object(provider_mock, "complete", new_callable=AsyncMock, return_value=mock_llm_response):
        # ── 1. First build: Cache Miss -> calls LLM, saves to SQLite ────────
        res1 = await synthesizer.synthesize_workspace_graph(
            workspace_id="ws-test-1",
            topic="Efficient Attention",
            papers=sample_papers,
            force_refresh=False,
        )

        assert res1["status"] == "synthesized"
        assert res1["cached"] is False
        assert res1["llm_called"] is True
        assert res1["papers_count"] == 2
        assert res1["cross_paper_relations_count"] >= 1
        assert res1["gaps_count"] >= 1
        assert res1["stats"]["total_nodes"] > 2
        assert res1["stats"]["total_edges"] >= 2
        assert any(e["relation"] == "extends" for e in res1["edges"])

        # ── 2. Second build: Exact same papers -> SQLite Cache Hit (0 LLM calls) ─
        res2 = await synthesizer.synthesize_workspace_graph(
            workspace_id="ws-test-1",
            topic="Efficient Attention",
            papers=sample_papers,
            force_refresh=False,
        )

        assert res2["status"] == "cached"
        assert res2["cached"] is True
        assert res2["llm_called"] is False  # ZERO LLM tokens used!
        assert res2["papers_count"] == 2
        assert res2["cross_paper_relations_count"] >= 1
        assert res2["gaps_count"] >= 1


def test_build_workspace_graph_api_endpoint():
    """Verify POST /api/v1/graph/build-workspace-graph endpoint."""
    client = TestClient(app)

    payload = {
        "workspace_id": "ws-api-test",
        "topic": "Foundation Models",
        "papers": [
            {
                "id": "arxiv:1706.03762",
                "title": "Attention Is All You Need",
                "year": 2017,
                "abstract": "Transformer model based solely on attention mechanisms.",
                "methods": ["Transformer"],
                "datasets": ["WMT"],
            },
            {
                "id": "arxiv:2106.09685",
                "title": "LoRA",
                "year": 2021,
                "abstract": "Parameter-efficient adaptation method.",
                "methods": ["LoRA", "Transformer"],
                "datasets": ["GLUE"],
            }
        ],
        "force_refresh": False,
    }

    res = client.post("/api/v1/graph/build-workspace-graph", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["synthesized", "cached"]
    assert data["papers_count"] == 2
    assert "nodes" in data
    assert "edges" in data
    assert data["stats"]["total_nodes"] >= 2
