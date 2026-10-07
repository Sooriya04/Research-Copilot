import json
from typing import AsyncGenerator, List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage

from src.providers.openrouter import OpenRouterProvider

class LocalOllamaProvider(BaseLLMProvider):
    """Local Ollama instance runner."""

    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None, default_model: Optional[str] = None):
        raw_url = base_url or settings.ollama_base_url or "http://localhost:11434"
        self.base_url = raw_url.rstrip("/")
        self.default_model = model or default_model or getattr(settings, "ollama_model", "phi4-mini")

    async def test_connection(self, model: Optional[str] = None) -> dict:
        """Probe local Ollama daemon for connectivity and verify the particular target model."""
        import time
        target_model = (model or self.default_model or "phi4-mini").strip()
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                tags_resp = await client.get(f"{self.base_url}/api/tags")
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
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
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
    ) -> str:
        target_model = self._resolve_model(model)
        payload = {
            "model": target_model,
            "messages": [m.dict() if hasattr(m, "dict") else dict(m) for m in messages],
            "stream": False,
            "options": {"temperature": temperature},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{self.base_url}/api/chat", json=payload)
                if resp.status_code == 200:
                    return resp.json().get("message", {}).get("content", "")
                return f"Ollama error: {resp.text}"
        except Exception as e:
            return f"Ollama unreachable: {e}"

    async def stream_chat(
        self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        target_model = self._resolve_model(model)
        payload = {
            "model": target_model,
            "messages": [m.dict() if hasattr(m, "dict") else dict(m) for m in messages],
            "stream": True,
            "options": {"temperature": temperature},
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if line:
                            try:
                                chunk = json.loads(line)
                                delta = chunk.get("message", {}).get("content", "")
                                if delta:
                                    yield delta
                            except Exception:
                                continue
        except Exception as e:
            yield f"Ollama streaming failed: {e}"
