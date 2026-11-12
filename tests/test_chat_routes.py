import json
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from src.api.app import app
from src.providers.base import ChatMessage
from src.providers.gemini import GeminiFlashLiteProvider


@pytest.mark.asyncio
async def test_gemini_provider_freeform_text_by_default():
    """Verify Gemini provider does NOT set JSON mime type by default and returns freeform text."""
    prov = GeminiFlashLiteProvider(api_key="")
    messages = [ChatMessage(role="user", content="Explain diffusion models")]
    
    # 1. Default should NOT be JSON, but freeform text/markdown
    res = await prov.complete(messages)
    assert not res.strip().startswith("{")
    assert len(res) > 20

    # 2. Explicit json_mode=True should produce JSON
    json_res = await prov.complete(messages, json_mode=True)
    assert json_res.startswith("{")
    parsed = json.loads(json_res)
    assert "problem" in parsed

    # 3. Explicit response_mime_type="application/json" should produce JSON
    mime_res = await prov.complete(messages, response_mime_type="application/json")
    assert mime_res.startswith("{")


@pytest.mark.asyncio
async def test_chat_stream_accepts_model_in_json_body():
    """Verify /api/v1/chat/stream honors model field in JSON request body and resolves credentials."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "messages": [
                {"role": "user", "content": "What is attention mechanism?"}
            ],
            "model": "gemini-2.0-flash",
            "provider": "gemini",
        }
        resp = await client.post("/api/v1/chat/stream", json=payload)
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        body = resp.text
        assert "event: delta" in body or "event: done" in body


@pytest.mark.asyncio
async def test_chat_stream_backward_compatible_list_body():
    """Verify /api/v1/chat/stream still accepts legacy list of messages in request body."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = [
            {"role": "user", "content": "Hello!"}
        ]
        resp = await client.post("/api/v1/chat/stream", json=payload)
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
