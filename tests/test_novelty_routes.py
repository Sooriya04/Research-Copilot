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
    assert "openrouter" in data["providers"]
    assert "nvidia" in data["providers"]
    assert data["providers"]["gemini"]["name"] == "Google Gemini"
    assert data["providers"]["groq"]["name"] == "Groq LPU"
    assert data["providers"]["ollama"]["name"] == "Local Ollama"
    assert data["providers"]["nvidia"]["name"] == "NVIDIA NIM"


def test_provider_test_connection_nvidia(client):
    """Verify /api/v1/novelty/test-connection probes NVIDIA NIM endpoint."""
    with patch("src.providers.nvidia.NvidiaProvider.test_connection", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = {
            "success": True,
            "latency_ms": 95.2,
            "message": "Connected & verified NVIDIA NIM model 'meta/llama-3.3-70b-instruct'",
            "model": "meta/llama-3.3-70b-instruct",
        }
        resp = client.post("/api/v1/novelty/test-connection", json={"provider": "nvidia", "api_key": "nvapi-test12345"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["provider"] == "nvidia"
        assert data["latency_ms"] == 95.2


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


def test_save_and_remove_provider_key_sqlite(client):
    """Verify storing, checking, and deleting provider credentials in SQLite DB."""
    # 1. Save test key into SQLite
    save_resp = client.post(
        "/api/v1/novelty/save-provider-key",
        json={
            "provider": "groq",
            "api_key": "gsk_test1234567890abcdef",
            "model": "qwen/qwen3.8-27b",
        },
    )
    assert save_resp.status_code == 200
    save_data = save_resp.json()
    assert save_data["success"] is True
    assert save_data["stored_in_db"] is True
    assert "gsk_te...cdef" == save_data["api_key_masked"]

    # 2. Check providers-status reflects SQLite persistence
    status_resp = client.get("/api/v1/novelty/providers-status")
    assert status_resp.status_code == 200
    st_data = status_resp.json()
    assert st_data["providers"]["groq"]["stored_in_db"] is True
    assert st_data["providers"]["groq"]["key_source"] == "sqlite"

    # 3. Clean up by deleting key from SQLite
    del_resp = client.delete("/api/v1/novelty/remove-provider-key/groq")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True


def test_saved_proposals_persistence_and_custom_creation(client):
    """Verify creating custom proposals, listing saved proposals, and deleting proposals."""
    # 1. Create a custom proposal
    custom_body = {
        "title": "Quantum-Inspired Attentive Diffusion",
        "mechanism": "recombination",
        "pitch": "Recombines diffusion state space with quantum harmonic priors.",
        "novelty_statement": "Novel continuous formulation with closed-form attention.",
        "mathematical_formulation": "Psi(x) = exp(-x^2 / 2)",
        "testable_hypothesis": "Reduces sampling steps by 4x.",
        "target_datasets": ["ETT", "Weather"],
        "baselines_to_beat": ["PatchTST"],
        "expected_metrics": ["MSE"],
        "confidence_score": 0.92,
    }
    create_resp = client.post("/api/v1/novelty/custom", json=custom_body)
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["title"] == "Quantum-Inspired Attentive Diffusion"
    assert created["is_custom"] is True
    assert "id" in created
    p_id = created["id"]

    # 2. Get saved proposals
    list_resp = client.get("/api/v1/novelty/proposals")
    assert list_resp.status_code == 200
    props = list_resp.json()["proposals"]
    assert any(p["id"] == p_id for p in props)

    # 3. Delete proposal
    del_p_resp = client.delete(f"/api/v1/novelty/proposals/{p_id}")
    assert del_p_resp.status_code == 200
    assert del_p_resp.json()["status"] == "deleted"

    # 4. Verify gone
    list_resp2 = client.get("/api/v1/novelty/proposals")
    assert not any(p["id"] == p_id for p in list_resp2.json()["proposals"])

