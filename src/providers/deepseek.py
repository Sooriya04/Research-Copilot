"""
DeepSeek Provider - Native OpenAI-compatible API client for DeepSeek-V3 and DeepSeek-R1.
Supports completions, streaming, connection testing, and model catalog routing.
"""
import json
import os
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

from src.core.config import settings
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage


class DeepSeekProvider(BaseLLMProvider):
    """DeepSeek API client supporting deepseek-chat (V3) and deepseek-reasoner (R1)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        raw_key = (
            api_key
            or getattr(settings, "deepseek_api_key", None)
            or os.getenv("DEEPSEEK_API_KEY", "")
        )
        self.api_key = raw_key.strip() if raw_key else ""
        raw_url = base_url or getattr(settings, "deepseek_base_url", "https://api.deepseek.com") or "https://api.deepseek.com"
        self.base_url = raw_url.rstrip("/")
        self.default_model = model or getattr(settings, "deepseek_model", "deepseek-chat") or "deepseek-chat"

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "ResearchCopilot/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _ensure_credentials(self) -> None:
        """Resolve credentials from SQLite database if not provided at instantiation."""
        if not self.api_key:
            try:
                from src.core.provider_settings import get_saved_provider_config
                cfg = await get_saved_provider_config("deepseek")
                if cfg and cfg.get("api_key"):
                    self.api_key = cfg["api_key"]
                if cfg and cfg.get("base_url") and not self.base_url:
                    self.base_url = cfg["base_url"].rstrip("/")
                if cfg and cfg.get("model") and not self.default_model:
                    self.default_model = cfg["model"]
            except Exception as e:
                logger.debug("[DeepSeekProvider] Failed resolving SQLite credentials: %s", e)

    async def list_models(self) -> List[str]:
        """Fetch available models from DeepSeek API or return curated catalog."""
        await self._ensure_credentials()
        curated = ["deepseek-chat", "deepseek-reasoner"]
        if not self.api_key:
            return curated
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._get_headers())
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    models = [m.get("id") for m in data if m.get("id")]
                    return models or curated
        except Exception as e:
            logger.debug("[DeepSeekProvider] list_models fallback: %s", e)
        return curated

    async def test_connection(self, model: Optional[str] = None) -> Dict[str, Any]:
        """Verify DeepSeek API key validity and test model responsiveness."""
        await self._ensure_credentials()
        target_mdl = (model or self.default_model or "deepseek-chat").strip()
        if not self.api_key:
            return {
                "success": False,
                "latency_ms": 0.0,
                "error": "DeepSeek API key is missing. Configure a valid key (starts with 'sk-') in Settings or SQLite.",
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
                        "message": f"Connected & verified DeepSeek model '{target_mdl}'",
                        "model": target_mdl,
                    }
                elif resp.status_code == 401:
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": "Authentication failed: Invalid DeepSeek API key (HTTP 401).",
                        "model": target_mdl,
                    }
                elif resp.status_code == 402:
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": "Insufficient balance on DeepSeek account (HTTP 402).",
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
                        "error": f"DeepSeek model '{target_mdl}' probe failed: {err_msg}",
                        "model": target_mdl,
                    }
        except Exception as e:
            latency = round((time.perf_counter() - start) * 1000, 2)
            return {
                "success": False,
                "latency_ms": latency,
                "error": f"DeepSeek connection failed: {str(e)}",
                "model": target_mdl,
            }

    async def complete(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
        json_mode: bool = False,
    ) -> str:
        """Generate completion via DeepSeek OpenAI-compatible endpoint."""
        await self._ensure_credentials()
        target_model = (model or self.default_model).strip()
        if not self.api_key:
            logger.warning("[DeepSeekProvider] No API key detected. Returning error payload.")
            return json.dumps({
                "error": "Missing DEEPSEEK_API_KEY. Configure DeepSeek API key in Settings or .env.",
            })

        formatted_messages = [
            {"role": m.role, "content": m.content} for m in messages
        ]
        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": formatted_messages,
            "temperature": temperature,
        }
        # DeepSeek reasoner (R1) doesn't use temperature or json_object, but deepseek-chat does
        if "reasoner" not in target_model.lower():
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
        else:
            # For reasoning models, default max_tokens may need to be higher to allow chain of thought
            payload["max_tokens"] = 4096

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    choice = data["choices"][0]["message"]
                    return choice.get("content") or ""

                # Retry without json_mode if json_object caused an error
                if resp.status_code in (400, 422) and json_mode:
                    logger.info("[DeepSeekProvider] Retrying without json_object response_format...")
                    payload.pop("response_format", None)
                    retry_resp = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=payload,
                    )
                    if retry_resp.status_code == 200:
                        data = retry_resp.json()
                        return data["choices"][0]["message"].get("content") or ""

                logger.error("[DeepSeekProvider] Request failed (%d): %s", resp.status_code, resp.text)
                return json.dumps({"error": f"DeepSeek API error ({resp.status_code}): {resp.text}"})
        except Exception as e:
            logger.error("[DeepSeekProvider] Execution exception: %s", e)
            return json.dumps({"error": f"DeepSeek API exception: {str(e)}"})

    async def stream_chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.3,
    ) -> AsyncGenerator[str, None]:
        """Stream token chunks via Server-Sent Events from DeepSeek."""
        await self._ensure_credentials()
        if not self.api_key:
            yield "DeepSeek streaming unavailable: DEEPSEEK_API_KEY not configured."
            return

        target_model = (model or self.default_model).strip()
        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload,
                ) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield f"DeepSeek error ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}"
                        return

                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.error("[DeepSeekProvider] Streaming exception: %s", e)
            yield f"DeepSeek streaming error: {str(e)}"
