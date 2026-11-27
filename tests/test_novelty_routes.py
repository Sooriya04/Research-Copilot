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


def test_workspace_novelty_strict_isolation(client):
    """Verify novelty proposals are strictly scoped and never bleed across workspaces."""
    ws_a = "ws-isolation-test-alpha"
    ws_b = "ws-isolation-test-beta"

    # 1. Create a proposal for Workspace Alpha
    body_a = {
        "workspace_id": ws_a,
        "topic": "Sparse Autoencoders",
        "title": "Alpha Exclusive SAE Proposal",
        "mechanism": "recombination",
        "pitch": "Unique to Workspace Alpha",
        "novelty_statement": "Novelty for Alpha only",
        "testable_hypothesis": "Improves Alpha performance",
    }
    resp_a = client.post("/api/v1/novelty/custom", json=body_a)
    assert resp_a.status_code == 200
    p_a = resp_a.json()

    # 2. Query proposals for Workspace Alpha -> Should contain p_a
    list_a = client.get(f"/api/v1/novelty/proposals?workspace_id={ws_a}")
    assert list_a.status_code == 200
    props_a = list_a.json()["proposals"]
    assert any(p["id"] == p_a["id"] for p in props_a)

    # 3. Query proposals for Workspace Beta -> Must NOT contain p_a
    list_b = client.get(f"/api/v1/novelty/proposals?workspace_id={ws_b}")
    assert list_b.status_code == 200
    props_b = list_b.json()["proposals"]
    assert not any(p["id"] == p_a["id"] for p in props_b)

    # 4. Clean up
    client.delete(f"/api/v1/novelty/proposals/{p_a['id']}")


def test_delete_proposal_endpoint(client):
    """Verify DELETE /api/v1/novelty/proposals/{id} removes proposal and handles 404."""
    create_resp = client.post(
        "/api/v1/novelty/custom",
        json={
            "workspace_id": "ws-del-test",
            "title": "Temporary Proposal to Delete",
            "mechanism": "recombination",
            "pitch": "Will be deleted immediately",
        },
    )
    assert create_resp.status_code == 200
    prop_id = create_resp.json()["id"]

    # Delete proposal
    del_resp = client.delete(f"/api/v1/novelty/proposals/{prop_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"
    assert del_resp.json()["id"] == prop_id

    # Verify not found on second delete
    del_again = client.delete(f"/api/v1/novelty/proposals/{prop_id}")
    assert del_again.status_code == 404


def test_clear_proposals_endpoint(client):
    """Verify DELETE /api/v1/novelty/proposals clears proposals for a workspace."""
    ws = "ws-clear-endpoint-test"
    for i in range(2):
        client.post(
            "/api/v1/novelty/custom",
            json={
                "workspace_id": ws,
                "title": f"Clearable Proposal {i}",
                "mechanism": "recombination",
                "pitch": f"Pitch {i}",
            },
        )

    list_resp = client.get(f"/api/v1/novelty/proposals?workspace_id={ws}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["proposals"]) >= 2

    # Clear proposals for this workspace
    clear_resp = client.delete(f"/api/v1/novelty/proposals?workspace_id={ws}")
    assert clear_resp.status_code == 200
    data = clear_resp.json()
    assert data["status"] == "cleared"
    assert data["deleted_count"] >= 2

    # Verify list is empty
    empty_resp = client.get(f"/api/v1/novelty/proposals?workspace_id={ws}")
    assert empty_resp.status_code == 200
    assert len(empty_resp.json()["proposals"]) == 0


def test_add_novelty_to_graph_endpoint(client):
    """Verify POST /api/v1/novelty/add-to-graph injects a candidate node into the graph."""
    body = {
        "workspace_id": "ws-inject-test",
        "topic": "Graph Neural Networks",
        "novelty": {
            "id": "novelty-injected-cand-1",
            "title": "Spectral Diffusion Graph Convolution",
            "mechanism": "recombination",
            "pitch": "Fuses spectral graph filters with continuous diffusion dynamics.",
            "grounded_paper_ids": [],
        },
    }
    resp = client.post("/api/v1/novelty/add-to-graph", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "injected"
    assert "cand-novelty-injected-cand-1" in data["node_id"]


def test_multi_model_synthesis_resilience(client):
    """Verify multi-model synthesis produces guaranteed proposals even if no papers are staged."""
    body = {
        "workspace_id": "ws-multi-test-resilience",
        "topic": "Diffusion State Spaces",
        "paper_ids": [],
        "providers": ["gemini", "groq", "nvidia"],
        "force_refresh": True,
    }
    resp = client.post("/api/v1/novelty/synthesize", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "multi_synthesized"
    assert len(data["novelties"]) > 0
    assert any("title" in n for n in data["novelties"])


