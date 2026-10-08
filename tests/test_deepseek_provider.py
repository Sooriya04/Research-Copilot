import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.providers.deepseek import DeepSeekProvider
from src.providers.factory import get_llm_provider
from src.providers.base import ChatMessage
from src.core.provider_settings import (
    save_provider_config,
    get_saved_provider_config,
    delete_provider_config,
    resolve_provider_credentials,
)


@pytest.mark.asyncio
async def test_deepseek_provider_factory_routing():
    # Route by provider name
    p1 = get_llm_provider("deepseek")
    assert isinstance(p1, DeepSeekProvider)

    # Route by deepseek model name
    p2 = get_llm_provider(model="deepseek-chat")
    assert isinstance(p2, DeepSeekProvider)
    assert p2.default_model == "deepseek-chat"

    p3 = get_llm_provider(model="deepseek-reasoner")
    assert isinstance(p3, DeepSeekProvider)
    assert p3.default_model == "deepseek-reasoner"


@pytest.mark.asyncio
async def test_deepseek_sqlite_persistence():
    test_key = "sk-test-deepseek-key-1234567890"
    test_model = "deepseek-reasoner"

    # Save to SQLite DB
    res = await save_provider_config("deepseek", api_key=test_key, model=test_model)
    assert res["success"] is True
    assert res["has_key"] is True
    assert "sk-tes" in res["api_key_masked"]

    # Verify retrieval
    saved = await get_saved_provider_config("deepseek")
    assert saved is not None
    assert saved["api_key"] == test_key
    assert saved["model"] == test_model

    # Verify resolve credentials
    resolved = await resolve_provider_credentials("deepseek")
    assert resolved["has_key"] is True
    assert resolved["api_key"] == test_key
    assert resolved["model"] == test_model

    # Instantiate provider without key and verify fallback from SQLite
    provider = DeepSeekProvider()
    await provider._ensure_credentials()
    assert provider.api_key == test_key

    # Clean up
    await delete_provider_config("deepseek")
    saved_after = await get_saved_provider_config("deepseek")
    assert saved_after is None


@pytest.mark.asyncio
async def test_deepseek_test_connection_mock():
    provider = DeepSeekProvider(api_key="sk-test-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "pong"}}]
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await provider.test_connection(model="deepseek-chat")
        assert res["success"] is True
        assert res["model"] == "deepseek-chat"


@pytest.mark.asyncio
async def test_deepseek_complete_mock():
    provider = DeepSeekProvider(api_key="sk-test-key", model="deepseek-chat")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "Hello from DeepSeek"}}]
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        reply = await provider.complete([ChatMessage(role="user", content="Hi")])
        assert reply == "Hello from DeepSeek"
