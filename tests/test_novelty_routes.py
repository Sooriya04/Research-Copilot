import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from src.api.app import create_app
from src.graph.novelty_engine import GraphNoveltyEngine
from src.graph.schema import PaperNode
from src.graph.store import ResearchGraphStore


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_get_providers_status(client):
    """Verify /api/v1/novelty/providers-status returns live status for Gemini, Groq, Ollama."""
    resp = client.get("/api/v1/novelty/providers-status")
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert "gemini" in data["providers"]
    assert "groq" in data["providers"]
    assert "ollama" in data["providers"]
    assert data["providers"]["gemini"]["name"] == "Google Gemini"
    assert data["providers"]["groq"]["name"] == "Groq LPU"
    assert data["providers"]["ollama"]["name"] == "Local Ollama"


def test_provider_test_connection_gemini(client):
    """Verify /api/v1/novelty/test-connection probes Gemini endpoint."""
    with patch("src.providers.gemini.GeminiFlashLiteProvider.test_connection", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = {
            "success": True,
            "latency_ms": 120.5,
            "message": "Connected to Google Gemini successfully",
        }
        resp = client.post("/api/v1/novelty/test-connection", json={"provider": "gemini"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["provider"] == "gemini"
        assert data["latency_ms"] == 120.5


def test_novelty_synthesize_endpoint_with_telemetry(client):
    """Verify /api/v1/novelty/synthesize returns proposals and complete telemetry payload."""
    mock_response = {
        "status": "synthesized",
        "workspace_id": "ws-test",
        "topic": "Time Series Forecasting",
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "cached": False,
        "llm_called": True,
        "papers_count": 2,
        "gaps_count": 1,
        "novelties": [
            {
                "id": "novelty-test-cand",
                "title": "Dual Stream Variate Patching",
                "mechanism": "recombination",
                "engine": "gemini",
                "model_name": "gemini-3.5-flash-lite",
                "pitch": "Fuses temporal and channel tokenization.",
                "novelty_statement": "Novel cross-stream representation.",
                "grounded_paper_ids": ["p1", "p2"],
                "grounded_paper_titles": ["Paper 1", "Paper 2"],
                "mathematical_formulation": "Y = f(X)",
                "testable_hypothesis": "Reduces MSE by 5%.",
                "target_datasets": ["ETT"],
                "baselines_to_beat": ["DLinear"],
                "expected_metrics": ["MSE"],
                "confidence_score": 0.9,
            }
        ],
    }

    with patch("src.graph.novelty_engine.GraphNoveltyEngine.synthesize_novelties", new_callable=AsyncMock) as mock_syn:
        mock_syn.return_value = mock_response

        resp = client.post(
            "/api/v1/novelty/synthesize",
            json={
                "topic": "Time Series Forecasting",
                "paper_ids": ["p1", "p2"],
                "provider": "gemini",
                "force_refresh": False,
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "synthesized"
        assert len(data["novelties"]) == 1
        assert "telemetry" in data
        assert data["telemetry"]["status"] == "OK"
        assert data["telemetry"]["provider_used"] == "gemini"
        assert "duration_ms" in data["telemetry"]
        assert data["telemetry"]["papers_processed"] == 2
