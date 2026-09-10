import json
from typing import AsyncGenerator, List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage

class OpenRouterProvider(BaseLLMProvider):
    """OpenRouter API client supporting multi-model routing & streaming."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.openrouter_api_key or ""
        self.base_url = "https://openrouter.ai/api/v1"
        self.default_model = "anthropic/claude-3.5-sonnet"

    async def complete(self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7) -> str:
        if not self.api_key:
            return "Simulated LLM synthesis: API key not set in environment."
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://research-copilot.is",
            "X-Title": "Research Copilot",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model or self.default_model,
            "messages": [m.dict() for m in messages],
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            if resp.status_code != 200:
                logger.error("OpenRouter request failed (%d): %s", resp.status_code, resp.text)
                return f"LLM error: {resp.text}"
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_chat(
        self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            yield "Simulated stream: Please configure OPENROUTER_API_KEY in your .env file."
            return

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://research-copilot.is",
            "X-Title": "Research Copilot",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model or self.default_model,
            "messages": [m.dict() for m in messages],
            "temperature": temperature,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload) as response:
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

class LocalOllamaProvider(BaseLLMProvider):
    """Local Ollama instance runner."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.ollama_base_url
        self.default_model = "llama3"

    async def complete(self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7) -> str:
        payload = {
            "model": model or self.default_model,
            "messages": [m.dict() for m in messages],
            "stream": False,
            "options": {"temperature": temperature},
        }
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
