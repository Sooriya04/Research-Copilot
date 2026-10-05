"""
NVIDIA NIM Provider - High-throughput GPU inference for frontier models.
Supports streaming, completion, connection validation, and dynamic model routing on build.nvidia.com.
"""
import json
import os
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage


class NvidiaProvider(BaseLLMProvider):
    """NVIDIA NIM API client supporting Meta Llama 3.3, Nemotron, DeepSeek, and Mixtral on NVIDIA DGX Cloud."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = (
            api_key
            or getattr(settings, "nvidia_api_key", None)
            or os.getenv("NVIDIA_API_KEY", "")
        ).strip()
        raw_url = base_url or "https://integrate.api.nvidia.com/v1"
        self.base_url = raw_url.rstrip("/")
        self.default_model = model or "meta/llama-3.3-70b-instruct"

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "ResearchCopilot/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def list_models(self) -> List[str]:
        """Fetch available models from NVIDIA NIM or return curated high-performing catalog."""
        curated = [
            "meta/llama-3.3-70b-instruct",
            "nvidia/llama-3.1-nemotron-70b-instruct",
            "deepseek-ai/deepseek-r1",
            "mistralai/mixtral-8x22b-instruct-v0.1",
            "meta/llama-3.1-405b-instruct",
            "meta/llama-3.1-8b-instruct",
        ]
        if not self.api_key:
            return curated
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._get_headers())
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    models = [m.get("id") for m in data if m.get("id")]
                    chat_models = [
                        m for m in models
                        if not any(bad in m.lower() for bad in ["embed", "rerank", "whisper", "guard", "vision"])
                    ]
                    return chat_models or models
        except Exception as e:
            logger.debug("[NvidiaProvider] list_models fallback: %s", e)
        return curated

    async def test_connection(self, model: Optional[str] = None) -> Dict[str, Any]:
        """Verify API key validity and probe the particular target model."""
        target_mdl = (model or self.default_model or "meta/llama-3.3-70b-instruct").strip()
        if not self.api_key:
            return {
                "success": False,
                "latency_ms": 0.0,
                "error": "NVIDIA API key is missing. Enter a valid key from build.nvidia.com (starts with 'nvapi-').",
                "model": target_mdl,
            }

        start = time.perf_counter()
        probe_payload = {
            "model": target_mdl,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "temperature": 0.1,
        }
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=probe_payload,
                )
                latency = round((time.perf_counter() - start) * 1000, 2)
                if resp.status_code == 200:
                    self.default_model = target_mdl
                    return {
                        "success": True,
                        "latency_ms": latency,
                        "message": f"Connected & verified NVIDIA NIM model '{target_mdl}'",
                        "model": target_mdl,
                    }
                elif resp.status_code == 401:
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": "Authentication failed: Invalid NVIDIA API key (HTTP 401).",
                        "model": target_mdl,
                    }
                else:
                    err_msg = f"HTTP {resp.status_code}"
                    try:
                        err_json = resp.json()
                        err_msg = err_json.get("error", {}).get("message") or err_msg
                    except Exception:
                        err_msg = resp.text[:120]
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": f"NVIDIA model '{target_mdl}' check failed: {err_msg}",
                        "model": target_mdl,
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "error": f"NVIDIA NIM connection failed: {str(e)}",
                "model": target_mdl,
            }

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        json_mode: bool = True,
    ) -> str:
        """Generate completion via NVIDIA NIM OpenAI-compatible endpoint."""
        target_model = (model or self.default_model).strip()
        if not self.api_key:
            logger.warning("[NvidiaProvider] No API key detected. Returning error payload.")
            return json.dumps({
                "error": "Missing NVIDIA_API_KEY. Configure NVIDIA API key in Novelty Studio or .env.",
                "proposals": [],
            })

        formatted_messages = [
            {"role": m.role, "content": m.content} for m in messages
        ]
        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": formatted_messages,
            "temperature": temperature,
            "max_tokens": 1024,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient(timeout=75.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
                
                # If json_object response_format caused an error, retry once without it
                if resp.status_code in (400, 422) and json_mode:
                    logger.info("[NvidiaProvider] Retrying without response_format json_object...")
                    payload.pop("response_format", None)
                    retry_resp = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=payload,
                    )
                    if retry_resp.status_code == 200:
                        data = retry_resp.json()
                        return data["choices"][0]["message"]["content"]

                logger.error("[NvidiaProvider] Request failed (%d): %s", resp.status_code, resp.text)
                return json.dumps({"error": f"NVIDIA NIM error ({resp.status_code}): {resp.text}"})
        except Exception as e:
            logger.error("[NvidiaProvider] Execution exception: %s", e)
            return json.dumps({"error": f"NVIDIA NIM exception: {str(e)}"})

    async def stream_chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        """Stream token chunks via Server-Sent Events."""
        if not self.api_key:
            yield "NVIDIA NIM streaming unavailable: NVIDIA_API_KEY not configured."
            return

        payload = {
            "model": model or self.default_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions", headers=self._get_headers(), json=payload
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
            yield f"NVIDIA NIM streaming error: {str(e)}"
