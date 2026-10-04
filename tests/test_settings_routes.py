import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from src.api.app import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_get_settings_providers(client):
    """Verify /api/v1/settings/providers returns all known providers including openrouter."""
    resp = client.get("/api/v1/settings/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    provider_ids = [p["provider_id"] for p in data["providers"]]
    for expected in ["openai", "gemini", "nvidia", "groq", "ollama", "openrouter"]:
        assert expected in provider_ids


def test_settings_test_connection_openrouter_success(client):
    """Verify test-connection with OpenRouter validates and returns success."""
    with patch("src.providers.openrouter.OpenRouterProvider.test_connection", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = {
            "success": True,
            "latency_ms": 115.4,
            "message": "Connected to OpenRouter (My Claude Key)",
            "usage": 0.05,
            "model": "anthropic/claude-3.5-sonnet",
        }
        resp = client.post(
            "/api/v1/settings/test-connection",
            json={
                "provider_id": "openrouter",
                "api_key": "sk-or-v1-testkey123456",
                "model": "anthropic/claude-3.5-sonnet",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["provider_id"] == "openrouter"
        assert data["latency_ms"] == 115.4
        assert "OpenRouter" in data["message"]


def test_settings_test_connection_openrouter_missing_key(client):
    """Verify test-connection with OpenRouter without a key fails gracefully."""
    resp = client.post(
        "/api/v1/settings/test-connection",
        json={"provider_id": "openrouter", "api_key": ""},
    )
    assert resp.status_code == 200
    data = resp.json()
    # If no key in request, env, or DB, it returns error
    if not data.get("success"):
        assert "error" in data or "OpenRouter" in data.get("message", "")


def test_settings_test_connection_gemini(client):
    """Verify test-connection with Gemini."""
    with patch("src.providers.gemini.GeminiFlashLiteProvider.test_connection", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = {
            "success": True,
            "latency_ms": 95.2,
            "message": "Connected to Google Gemini successfully",
        }
        resp = client.post(
            "/api/v1/settings/test-connection",
            json={"provider_id": "gemini", "api_key": "AIzaSyTestKey"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["provider_id"] == "gemini"
        assert data["latency_ms"] == 95.2


def test_settings_save_and_delete_openrouter(client):
    """Verify saving OpenRouter config to SQLite and retrieving it."""
    save_resp = client.post(
        "/api/v1/settings/providers",
        json={
            "provider_id": "openrouter",
            "api_key": "sk-or-v1-unit-test-key-xyz",
            "model": "deepseek/deepseek-r1",
        },
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["ok"] is True

    # Check key endpoint
    key_resp = client.get("/api/v1/settings/providers/openrouter/key")
    assert key_resp.status_code == 200
    assert key_resp.json()["api_key"] == "sk-or-v1-unit-test-key-xyz"
    assert key_resp.json()["model"] == "deepseek/deepseek-r1"

    # Cleanup
    del_resp = client.delete("/api/v1/settings/providers/openrouter")
    assert del_resp.status_code == 200
