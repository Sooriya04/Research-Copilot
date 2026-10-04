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
        model: Optional[str] = None,
    ):
        self.api_key = (
            api_key
            or settings.groq_api_key
            or os.getenv("GROQ_API_KEY", "")
            or os.getenv("grok_API", "")
            or os.getenv("GROK_API", "")
        )
        self.default_model = model or "qwen/qwen3.8-27b"
        self.base_url = "https://api.groq.com/openai/v1"

    async def list_models(self) -> list:
        """Fetch list of available models for this Groq API key."""
        if not self.api_key:
            return ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"]
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    raw_models = [m.get("id") for m in data if m.get("id")]
                    chat_models = [
                        m for m in raw_models
                        if not any(bad in m.lower() for bad in ["whisper", "guard", "audio", "orpheus"])
                    ]
                    return chat_models or raw_models
        except Exception:
            pass
        return ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"]

    async def test_connection(self, model: Optional[str] = None) -> Dict[str, Any]:
        """Verify API key validity and probe the particular target model."""
        target_mdl = (model or self.default_model or "qwen/qwen3.8-27b").strip()
        if not self.api_key:
            return {
                "success": False,
                "latency_ms": 0,
                "error": "No GROQ_API_KEY configured in environment, request, or SQLite DB.",
                "model": target_mdl,
            }

        start_time = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": target_mdl,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
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
                    self.default_model = target_mdl
                    return {
                        "success": True,
                        "latency_ms": latency,
                        "model": target_mdl,
                        "message": f"Connected & verified Groq model '{target_mdl}'",
                    }
                else:
                    err_msg = f"HTTP {resp.status_code}"
                    try:
                        err_json = resp.json()
                        err_msg = err_json.get("error", {}).get("message") or err_msg
                    except Exception:
                        err_msg = resp.text[:150]
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "model": target_mdl,
                        "error": f"Groq model '{target_mdl}' check failed: {err_msg}",
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start_time) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "model": target_mdl,
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
            "max_tokens": 950,
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
