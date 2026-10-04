import pytest
from unittest.mock import AsyncMock, patch

from src.graph.novelty_engine import GraphNoveltyEngine
from src.graph.schema import PaperNode
from src.graph.store import ResearchGraphStore
from src.providers.gemini import GeminiFlashLiteProvider


@pytest.mark.asyncio
async def test_graph_novelty_engine_synthesis_and_cache(tmp_path):
    """Verify GraphNoveltyEngine generates proposals, caches in SQLite, and injects candidate nodes."""
    test_db = str(tmp_path / "test_novelty.db")
    store = ResearchGraphStore(db_path=test_db)
    provider_mock = GeminiFlashLiteProvider(api_key="test-key")

    engine = GraphNoveltyEngine(store=store, provider=provider_mock, db_path=test_db)

    # Seed 2 sample papers in store
    paper1 = PaperNode(
        id="paper-dlinear",
        title="Are Transformers Effective for Time Series?",
        year=2023,
        abstract="DLinear shows simple linear models beat complex Transformers on long-term time series.",
        methods=["DLinear", "Trend-Seasonal Decomposition"],
        datasets=["ETT", "Weather"],
    )
    paper2 = PaperNode(
        id="paper-itransformer",
        title="iTransformer: Inverted Transformers Are Effective",
        year=2023,
        abstract="Inverted Transformers tokenize variates instead of time steps to model cross-channel correlation.",
        methods=["Inverted Attention", "Variate Tokens"],
        datasets=["Weather", "Traffic"],
    )
    await store.add_node(paper1)
    await store.add_node(paper2)

    mock_llm_json = """
    {
      "proposals": [
        {
          "id": "novelty-inverted-dlinear",
          "title": "Inverted Linear Operators for Cross-Variate Time Series",
          "mechanism": "recombination",
          "pitch": "Merges DLinear temporal projection with iTransformer cross-variate routing.",
          "novelty_statement": "Eliminates quadratic attention while modeling inter-channel dependencies linearly.",
          "grounded_paper_ids": ["paper-dlinear", "paper-itransformer"],
          "grounded_paper_titles": ["Are Transformers Effective for Time Series?", "iTransformer: Inverted Transformers Are Effective"],
          "mathematical_formulation": "Y = W_time * X * W_variate",
          "testable_hypothesis": "Reduces parameter count by 80% while matching iTransformer accuracy on Weather.",
          "target_datasets": ["Weather", "Traffic"],
          "baselines_to_beat": ["DLinear", "iTransformer"],
          "expected_metrics": ["MSE", "MAE"],
          "confidence_score": 0.92
        }
      ]
    }
    """

    with patch.object(provider_mock, "complete", new_callable=AsyncMock, return_value=mock_llm_json):
        # 1. First run: Cache Miss -> calls LLM and saves to SQLite
        res1 = await engine.synthesize_novelties(
            workspace_id="ws-ts-test",
            topic="Time Series Forecasting",
            paper_ids=["paper-dlinear", "paper-itransformer"],
            force_refresh=False,
        )

        assert res1["status"] == "synthesized"
        assert res1["cached"] is False
        assert res1["llm_called"] is True
        assert len(res1["novelties"]) == 1
        assert res1["novelties"][0]["id"] == "novelty-inverted-dlinear"

        # 2. Second run: Cache Hit -> 0 LLM calls
        res2 = await engine.synthesize_novelties(
            workspace_id="ws-ts-test",
            topic="Time Series Forecasting",
            paper_ids=["paper-dlinear", "paper-itransformer"],
            force_refresh=False,
        )

        assert res2["status"] == "cached"
        assert res2["cached"] is True
        assert res2["llm_called"] is False
        assert len(res2["novelties"]) == 1

        # 3. Inject candidate node into graph canvas
        inject_res = await engine.add_novelty_candidate_node(
            workspace_id="ws-ts-test",
            novelty=res1["novelties"][0],
        )

        assert inject_res["status"] == "injected"
        cand_id = inject_res["candidate_node_id"]
        assert cand_id in store.graph
        cand_node = await store.get_node(cand_id)
        assert cand_node.name == "Inverted Linear Operators for Cross-Variate Time Series"
        assert len(inject_res["edges_added"]) == 2


def test_generate_novelty_api_endpoints():
    """Verify HTTP endpoints for novelty generation and candidate node injection."""
    from fastapi.testclient import TestClient
    from src.api.app import app

    client = TestClient(app)

    # 1. Test generate-novelty with heuristic fallback (or mock)
    res = client.post(
        "/api/v1/graph/generate-novelty",
        json={"workspace_id": "ws-test-api", "topic": "Time Series Forecasting", "force_refresh": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["synthesized", "cached"]
    assert "novelties" in data

    # 2. Test cache status endpoint
    status_res = client.get("/api/v1/graph/novelty-cache-status?workspace_id=ws-test-api")
    assert status_res.status_code == 200
