import json
import os
import time
from typing import Any, AsyncGenerator, List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage, ProviderError, ProviderUnavailableException
from src.providers.openrouter import OpenRouterProvider


class LocalOllamaProvider(BaseLLMProvider):
    """Local Ollama instance runner with persistent connection pooling."""

    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None, default_model: Optional[str] = None):
        raw_url = base_url or settings.ollama_base_url or "http://localhost:11434"
        self.base_url = raw_url.rstrip("/")
        self.default_model = model or default_model or getattr(settings, "ollama_model", "phi4-mini")
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self, timeout: float = 120.0) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def test_connection(self, model: Optional[str] = None) -> dict:
        """Probe local Ollama daemon for connectivity and verify the particular target model."""
        target_model = (model or self.default_model or "phi4-mini").strip()
        start = time.perf_counter()
        try:
            client = self._get_client()
            tags_resp = await client.get(f"{self.base_url}/api/tags", timeout=6.0)
            if tags_resp.status_code != 200:
                latency = round((time.perf_counter() - start) * 1000, 2)
                return {
                    "success": False,
                    "latency_ms": latency,
                    "model": target_model,
                    "error": f"Ollama HTTP {tags_resp.status_code}: {tags_resp.text[:120]}",
                }
            raw_models = [m.get("name") for m in tags_resp.json().get("models", []) if m.get("name")]

            # Verify the specific target model via /api/show
            show_resp = await client.post(
                f"{self.base_url}/api/show",
                json={"name": target_model},
                timeout=5.0,
            )
            latency = round((time.perf_counter() - start) * 1000, 2)
            if show_resp.status_code == 200:
                return {
                    "success": True,
                    "latency_ms": latency,
                    "model": target_model,
                    "message": f"Connected & verified local model '{target_model}'",
                    "models": raw_models,
                }
            elif show_resp.status_code == 404:
                return {
                    "success": False,
                    "latency_ms": latency,
                    "model": target_model,
                    "error": f"Model '{target_model}' not found in Ollama. Pull it with: `ollama run {target_model}`",
                }
            else:
                return {
                    "success": False,
                    "latency_ms": latency,
                    "model": target_model,
                    "error": f"Ollama model '{target_model}' check error: {show_resp.text[:120]}",
                }
        except Exception as e:
            latency = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "model": target_model,
                "error": f"Ollama daemon unreachable at {self.base_url}: {str(e)}",
            }

    async def list_models(self) -> list:
        """Return list of locally installed generative model names."""
        try:
            client = self._get_client()
            resp = await client.get(f"{self.base_url}/api/tags", timeout=3.0)
            if resp.status_code == 200:
                raw = [m.get("name") for m in resp.json().get("models", []) if m.get("name")]
                gen = [m for m in raw if "embed" not in m.lower()]
                return gen or raw
        except Exception:
            pass
        return ["phi4-mini", "llama3", "mistral", "qwen2.5", "deepseek-r1"]

    def _resolve_model(self, model: Optional[str] = None) -> str:
        """Resolve model name; map cloud model requests to local model default."""
        if not model:
            return self.default_model
        cloud_prefixes = ("gemini", "gpt", "claude", "openrouter", "deepseek-ai", "meta-llama", "anthropic")
        if any(model.lower().startswith(p) or f"/{p}" in model.lower() for p in cloud_prefixes):
            return self.default_model
        return model

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        json_mode: bool = False,
        **kwargs: Any,
    ) -> str:
        target_model = self._resolve_model(model)
        payload = {
            "model": target_model,
            "messages": [m.model_dump() if hasattr(m, "model_dump") else (m.dict() if hasattr(m, "dict") else dict(m)) for m in messages],
            "stream": False,
            "options": {"temperature": temperature},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            client = self._get_client()
            resp = await client.post(f"{self.base_url}/api/chat", json=payload, timeout=60.0)
            if resp.status_code == 200:
                return resp.json().get("message", {}).get("content", "")
            raise ProviderError(f"Ollama error (HTTP {resp.status_code}): {resp.text}")
        except httpx.HTTPError as e:
            logger.error("[LocalOllamaProvider] HTTP error connecting to Ollama at %s: %s", self.base_url, e)
            raise ProviderUnavailableException(f"Ollama unreachable at {self.base_url}: {e}") from e
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            logger.error("[LocalOllamaProvider] Unexpected error during complete(): %s", e)
            raise ProviderError(f"Ollama completion failed: {e}") from e

    async def stream_chat(
        self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7, **kwargs: Any
    ) -> AsyncGenerator[str, None]:
        target_model = self._resolve_model(model)
        payload = {
            "model": target_model,
            "messages": [m.model_dump() if hasattr(m, "model_dump") else (m.dict() if hasattr(m, "dict") else dict(m)) for m in messages],
            "stream": True,
            "options": {"temperature": temperature},
        }
        try:
            client = self._get_client(timeout=90.0)
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    body_text = body_bytes.decode("utf-8", errors="ignore")
                    raise ProviderError(f"Ollama streaming HTTP error {resp.status_code}: {body_text}")
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            delta = chunk.get("message", {}).get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            continue
        except httpx.HTTPError as e:
            logger.error("[LocalOllamaProvider] HTTP error streaming from Ollama at %s: %s", self.base_url, e)
            raise ProviderUnavailableException(f"Ollama streaming unreachable at {self.base_url}: {e}") from e
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            logger.error("[LocalOllamaProvider] Unexpected error during stream_chat(): %s", e)
            raise ProviderError(f"Ollama streaming failed: {e}") from e


class LocalOpenAIProvider(BaseLLMProvider):
    """Local OpenAI-compatible runner (vLLM, LM Studio, LocalAI, llama.cpp, Jan)."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        default_model: Optional[str] = None,
    ):
        raw_url = base_url or os.getenv("LOCAL_OPENAI_BASE_URL") or "http://localhost:1234/v1"
        self.base_url = raw_url.rstrip("/")
        self.default_model = model or default_model or os.getenv("LOCAL_OPENAI_MODEL") or "local-model"
        self.api_key = api_key or os.getenv("LOCAL_OPENAI_API_KEY") or "local"
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self, timeout: float = 120.0) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def test_connection(self, model: Optional[str] = None) -> dict:
        """Probe local OpenAI endpoint connectivity and available models."""
        target_model = (model or self.default_model).strip()
        start = time.perf_counter()
        try:
            client = self._get_client()
            resp = await client.get(f"{self.base_url}/models", headers=self._headers(), timeout=5.0)
            latency = round((time.perf_counter() - start) * 1000, 2)
            if resp.status_code == 200:
                raw_models = [m.get("id") for m in resp.json().get("data", []) if m.get("id")]
                return {
                    "success": True,
                    "latency_ms": latency,
                    "model": target_model,
                    "message": f"Connected to local OpenAI endpoint at {self.base_url}",
                    "models": raw_models,
                }
            return {
                "success": False,
                "latency_ms": latency,
                "model": target_model,
                "error": f"Endpoint returned HTTP {resp.status_code}: {resp.text[:120]}",
            }
        except Exception as e:
            latency = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "model": target_model,
                "error": f"Local endpoint unreachable at {self.base_url}: {str(e)}",
            }

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        json_mode: bool = False,
        **kwargs: Any,
    ) -> str:
        target_model = (model or self.default_model).strip()
        payload = {
            "model": target_model,
            "messages": [m.model_dump() if hasattr(m, "model_dump") else (m.dict() if hasattr(m, "dict") else dict(m)) for m in messages],
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            client = self._get_client()
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
                timeout=90.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                return ""
            raise ProviderError(f"Local OpenAI endpoint error (HTTP {resp.status_code}): {resp.text[:200]}")
        except httpx.HTTPError as e:
            logger.error("[LocalOpenAIProvider] HTTP error connecting to %s: %s", self.base_url, e)
            raise ProviderUnavailableException(f"Local endpoint unreachable at {self.base_url}: {e}") from e
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            logger.error("[LocalOpenAIProvider] Unexpected error: %s", e)
            raise ProviderError(f"Local completion failed: {e}") from e

    async def stream_chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        target_model = (model or self.default_model).strip()
        payload = {
            "model": target_model,
            "messages": [m.model_dump() if hasattr(m, "model_dump") else (m.dict() if hasattr(m, "dict") else dict(m)) for m in messages],
            "temperature": temperature,
            "stream": True,
        }
        try:
            client = self._get_client(timeout=120.0)
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    body_bytes = await resp.aread()
                    raise ProviderError(f"Streaming HTTP {resp.status_code}: {body_bytes.decode('utf-8', errors='ignore')[:200]}")
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        choices = chunk.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                    except Exception:
                        continue
        except httpx.HTTPError as e:
            logger.error("[LocalOpenAIProvider] HTTP error streaming from %s: %s", self.base_url, e)
            raise ProviderUnavailableException(f"Local streaming unreachable at {self.base_url}: {e}") from e
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            logger.error("[LocalOpenAIProvider] Unexpected streaming error: %s", e)
            raise ProviderError(f"Local streaming failed: {e}") from e
