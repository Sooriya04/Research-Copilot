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

    async def test_connection(self) -> dict:
        """Probe local Ollama daemon for connectivity and installed models."""
        import time
        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                latency = round((time.perf_counter() - start) * 1000, 2)
                if resp.status_code == 200:
                    raw_models = [m.get("name") for m in resp.json().get("models", []) if m.get("name")]
                    # Prioritize generative LLMs and filter out pure embedding models
                    models = [m for m in raw_models if "embed" not in m.lower()] or raw_models
                    return {
                        "success": True,
                        "latency_ms": latency,
                        "models": models,
                        "message": f"Ollama online ({len(models)} generative models available)",
                    }
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": f"Ollama HTTP {resp.status_code}: {resp.text[:120]}",
                }
        except Exception as e:
            latency = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
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

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        json_mode: bool = True,
    ) -> str:
        payload = {
            "model": model or self.default_model,
            "messages": [m.dict() for m in messages],
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
        payload = {
            "model": model or self.default_model,
            "messages": [m.dict() for m in messages],
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
