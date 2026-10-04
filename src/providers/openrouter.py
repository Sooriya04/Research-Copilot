"""
OpenRouter Provider - Universal AI routing across frontier models.
Supports streaming, completion, connection validation, and dynamic model discovery.
"""
import json
import time
from typing import AsyncGenerator, List, Optional, Dict, Any
import httpx

from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage


class OpenRouterProvider(BaseLLMProvider):
    """OpenRouter API client supporting multi-model routing, connection verification & streaming."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = (api_key or settings.openrouter_api_key or "").strip()
        raw_url = base_url or "https://openrouter.ai/api/v1"
        self.base_url = raw_url.rstrip("/")
        self.default_model = model or "anthropic/claude-3.5-sonnet"

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "HTTP-Referer": "https://research-copilot.is",
            "X-Title": "Research Copilot",
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        response_format: Optional[dict] = None,
    ) -> str:
        if not self.api_key:
            return "Simulated LLM synthesis: OpenRouter API key not configured."

        target_model = model or self.default_model
        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": [m.dict() if hasattr(m, "dict") else dict(m) for m in messages],
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            )
            if resp.status_code != 200:
                logger.error("OpenRouter request failed (%d): %s", resp.status_code, resp.text)
                return f"LLM error: {resp.text}"
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield "Simulated stream: Please configure OPENROUTER_API_KEY in your settings or .env file."
            return

        payload = {
            "model": model or self.default_model,
            "messages": [m.dict() if hasattr(m, "dict") else dict(m) for m in messages],
            "temperature": temperature,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            ) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        raw = line.replace("data: ", "").strip()
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            continue

    async def test_connection(self) -> Dict[str, Any]:
        """Test API connectivity and validate the OpenRouter API key."""
        if not self.api_key:
            return {
                "success": False,
                "latency_ms": 0.0,
                "error": "OpenRouter API key is missing. Enter a valid key starting with 'sk-or-v1-'.",
            }

        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                # OpenRouter provides /auth/key for direct key validation & usage checks
                resp = await client.get(
                    f"{self.base_url}/auth/key",
                    headers=self._get_headers(),
                )
                latency = round((time.perf_counter() - start) * 1000, 2)
                if resp.status_code == 200:
                    data = resp.json().get("data", {})
                    label = data.get("label") or "OpenRouter Key"
                    limit = data.get("limit")
                    usage = data.get("usage", 0)
                    is_free = data.get("is_free_tier", False)
                    return {
                        "success": True,
                        "latency_ms": latency,
                        "message": f"Connected to OpenRouter ({label})",
                        "label": label,
                        "usage": usage,
                        "limit": limit,
                        "is_free_tier": is_free,
                        "model": self.default_model,
                    }
                elif resp.status_code == 401:
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": "OpenRouter Authentication failed: Invalid API key (HTTP 401).",
                    }
                else:
                    # Fallback check against models endpoint
                    resp_models = await client.get(
                        f"{self.base_url}/models",
                        headers=self._get_headers(),
                    )
                    latency = round((time.perf_counter() - start) * 1000, 2)
                    if resp_models.status_code == 200:
                        return {
                            "success": True,
                            "latency_ms": latency,
                            "message": "Connected to OpenRouter API (Models endpoint verified)",
                            "model": self.default_model,
                        }
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": f"OpenRouter check failed (HTTP {resp.status_code}): {resp.text[:120]}",
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "error": f"Failed reaching OpenRouter at {self.base_url}: {str(e)}",
            }

    async def list_models(self) -> List[str]:
        """Fetch list of available models from OpenRouter."""
        fallback_models = [
            "anthropic/claude-3.5-sonnet",
            "deepseek/deepseek-r1",
            "meta-llama/llama-3.3-70b-instruct",
            "google/gemini-2.0-flash-001",
            "openai/gpt-4o-mini",
        ]
        if not self.api_key:
            return fallback_models

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(
                    f"{self.base_url}/models",
                    headers=self._get_headers(),
                )
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    models = [m.get("id") for m in data if m.get("id")]
                    return models[:50] if models else fallback_models
        except Exception as e:
            logger.warning("[OpenRouter] Failed listing models: %s", e)
        return fallback_models
