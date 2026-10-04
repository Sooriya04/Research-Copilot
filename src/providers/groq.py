import json
import os
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage


class GroqProvider(BaseLLMProvider):
    """Groq API client supporting fast inference on Llama-3.3-70b, DeepSeek-R1, and Mixtral."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "llama-3.3-70b-versatile",
    ):
        self.api_key = api_key or settings.groq_api_key or os.getenv("GROQ_API_KEY", "")
        self.default_model = model
        self.base_url = "https://api.groq.com/openai/v1"

    async def test_connection(self) -> Dict[str, Any]:
        """Verify API key validity and probe endpoint latency."""
        if not self.api_key:
            return {
                "success": False,
                "latency_ms": 0,
                "error": "No GROQ_API_KEY configured in environment or request.",
            }

        start_time = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.default_model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                latency = round((time.perf_counter() - start_time) * 1000, 2)
                if resp.status_code == 200:
                    return {
                        "success": True,
                        "latency_ms": latency,
                        "model": self.default_model,
                        "message": "Connected to Groq successfully",
                    }
                else:
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": f"Groq HTTP {resp.status_code}: {resp.text[:200]}",
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start_time) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "error": f"Groq connection failed: {str(e)}",
            }

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        json_mode: bool = True,
    ) -> str:
        """Generate structured completion via Groq REST API."""
        target_model = model or self.default_model

        if not self.api_key:
            logger.warning("[GroqProvider] No API key detected. Returning simulated error.")
            return json.dumps({
                "error": "Missing GROQ_API_KEY. Configure GROQ_API_KEY in .env or provide it in the Novelty Studio.",
                "proposals": [],
            })

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        formatted_messages = [
            {"role": m.role, "content": m.content} for m in messages
        ]

        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": formatted_messages,
            "temperature": temperature,
        }

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
                logger.error("[GroqProvider] Request failed (%d): %s", resp.status_code, resp.text)
                return json.dumps({"error": f"Groq API error ({resp.status_code}): {resp.text}"})
        except Exception as e:
            logger.error("[GroqProvider] Execution exception: %s", e)
            return json.dumps({"error": f"Groq request exception: {str(e)}"})

    async def stream_chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        """Stream token chunks via Server-Sent Events."""
        if not self.api_key:
            yield "Groq streaming unavailable: GROQ_API_KEY not configured."
            return

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model or self.default_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions", headers=headers, json=payload
                ) as resp:
                    async for line in resp.aiter_lines():
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
        except Exception as e:
            yield f"Groq streaming error: {str(e)}"
