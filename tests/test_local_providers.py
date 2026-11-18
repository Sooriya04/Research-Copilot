import json
import pytest
import httpx
from src.providers.base import ChatMessage, ProviderError, ProviderUnavailableException
from src.providers.factory import get_llm_provider
from src.providers.llm import LocalOllamaProvider, LocalOpenAIProvider


@pytest.mark.asyncio
async def test_ollama_provider_init_and_model_resolution():
    provider = LocalOllamaProvider(base_url="http://localhost:11434", model="mistral")
    assert provider.base_url == "http://localhost:11434"
    assert provider.default_model == "mistral"

    # Cloud prefixes should map back to default local model
    assert provider._resolve_model("gemini-2.0-flash") == "mistral"
    assert provider._resolve_model("claude-3-opus") == "mistral"
    # Local model name should pass through
    assert provider._resolve_model("qwen2.5-coder") == "qwen2.5-coder"


@pytest.mark.asyncio
async def test_ollama_provider_complete_mock(monkeypatch):
    provider = LocalOllamaProvider(base_url="http://mock-ollama:11434", model="phi4-mini")

    async def mock_post(url, json=None, **kwargs):
        assert "/api/chat" in str(url)
        assert json["model"] == "phi4-mini"
        assert json["options"]["temperature"] == 0.5
        assert json["format"] == "json"
        response = httpx.Response(
            status_code=200,
            json={"message": {"role": "assistant", "content": '{"summary": "offline test"}'}},
            request=httpx.Request("POST", str(url)),
        )
        return response

    client = provider._get_client()
    monkeypatch.setattr(client, "post", mock_post)

    messages = [ChatMessage(role="user", content="hello")]
    res = await provider.complete(messages, temperature=0.5, json_mode=True)
    assert res == '{"summary": "offline test"}'
    await provider.aclose()


@pytest.mark.asyncio
async def test_local_openai_provider_complete_and_streaming(monkeypatch):
    provider = LocalOpenAIProvider(
        base_url="http://localhost:1234/v1",
        model="qwen2.5-7b-instruct",
        api_key="secret-local-key",
    )
    assert provider.base_url == "http://localhost:1234/v1"
    assert provider.default_model == "qwen2.5-7b-instruct"

    # Test complete
    async def mock_post(url, headers=None, json=None, **kwargs):
        assert headers["Authorization"] == "Bearer secret-local-key"
        assert json["model"] == "qwen2.5-7b-instruct"
        assert json["response_format"] == {"type": "json_object"}
        return httpx.Response(
            status_code=200,
            json={"choices": [{"message": {"content": '{"local": true}'}}]},
            request=httpx.Request("POST", str(url)),
        )

    client = provider._get_client()
    monkeypatch.setattr(client, "post", mock_post)

    messages = [ChatMessage(role="user", content="Analyze local paper")]
    out = await provider.complete(messages, json_mode=True)
    assert out == '{"local": true}'

    # Test stream_chat
    class DummyStreamContext:
        async def __aenter__(self):
            class DummyStreamResponse:
                status_code = 200
                async def aiter_lines(self):
                    lines = [
                        'data: {"choices": [{"delta": {"content": "Hello"}}]}',
                        'data: {"choices": [{"delta": {"content": " world"}}]}',
                        'data: [DONE]',
                    ]
                    for line in lines:
                        yield line
            return DummyStreamResponse()

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    def mock_stream(method, url, **kwargs):
        assert "/chat/completions" in str(url)
        return DummyStreamContext()

    monkeypatch.setattr(client, "stream", mock_stream)

    streamed_tokens = []
    async for token in provider.stream_chat([ChatMessage(role="user", content="hi")]):
        streamed_tokens.append(token)
    assert "".join(streamed_tokens) == "Hello world"
    await provider.aclose()


@pytest.mark.asyncio
async def test_local_openai_provider_test_connection(monkeypatch):
    provider = LocalOpenAIProvider(base_url="http://localhost:1234/v1", model="my-model")

    async def mock_get(url, **kwargs):
        assert "/models" in str(url)
        return httpx.Response(
            status_code=200,
            json={"data": [{"id": "my-model"}, {"id": "second-model"}]},
            request=httpx.Request("GET", str(url)),
        )

    client = provider._get_client()
    monkeypatch.setattr(client, "get", mock_get)

    result = await provider.test_connection()
    assert result["success"] is True
    assert "my-model" in result["models"]
    await provider.aclose()


def test_factory_local_provider_resolution():
    # Ollama
    p1 = get_llm_provider("ollama")
    assert isinstance(p1, LocalOllamaProvider)

    # vLLM
    p2 = get_llm_provider("vllm", model="meta-llama/Llama-3.1-8B-Instruct")
    assert isinstance(p2, LocalOpenAIProvider)
    assert p2.default_model == "meta-llama/Llama-3.1-8B-Instruct"

    # LM Studio
    p3 = get_llm_provider("lmstudio", base_url="http://127.0.0.1:1234/v1")
    assert isinstance(p3, LocalOpenAIProvider)
    assert p3.base_url == "http://127.0.0.1:1234/v1"

    # Generic local
    p4 = get_llm_provider("local")
    assert isinstance(p4, LocalOpenAIProvider)
