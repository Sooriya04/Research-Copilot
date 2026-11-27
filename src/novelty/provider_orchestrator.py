"""
Module: src/novelty/provider_orchestrator.py

What this file does:
Handles LLM provider resolution, credential lookup, request timeouts, cancellation,
and safe invocation with structured error reporting for the novelty pipeline.

Classes & Functions:
- ProviderOrchestrator: Resolves provider instances (Gemini, Groq, Ollama, OpenRouter,
  NVIDIA NIM, DeepSeek) and executes bounded async completions with timeout handling.
"""
import asyncio
from typing import List, Optional, Tuple

from src.core.config import settings
from src.core.logger import logger
from src.core.provider_settings import resolve_provider_credentials
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.deepseek import DeepSeekProvider
from src.providers.gemini import GeminiFlashLiteProvider
from src.providers.groq import GroqProvider
from src.providers.llm import LocalOllamaProvider
from src.providers.nvidia import NvidiaProvider
from src.providers.openrouter import OpenRouterProvider


class ProviderOrchestrator:
    """Resolves configured LLM backends and executes bounded async completions."""

    DEFAULT_TIMEOUT_S = 60.0

    def __init__(self, default_provider: Optional[BaseLLMProvider] = None):
        self.default_provider = default_provider

    async def resolve(
        self,
        provider_name: str = "gemini",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> Tuple[BaseLLMProvider, str, str]:
        """Resolve an instantiated LLM provider, normalized engine name, and target model."""
        p_name = (provider_name or "gemini").lower().strip()
        creds = await resolve_provider_credentials(
            provider_id=p_name,
            explicit_key=api_key,
            explicit_model=model,
            explicit_base_url=base_url,
        )
        eff_key = creds.get("api_key") or ""
        eff_model = model or creds.get("model") or ""
        eff_url = creds.get("base_url") or ""

        if p_name == "groq":
            m = eff_model or "qwen/qwen3.8-27b"
            return GroqProvider(api_key=eff_key, model=m), "groq", m
        if p_name == "ollama":
            m = eff_model or "phi4-mini"
            u = eff_url or settings.ollama_base_url
            return LocalOllamaProvider(base_url=u, model=m), "ollama", m
        if p_name == "openrouter":
            m = eff_model or "anthropic/claude-3.5-sonnet"
            u = eff_url or "https://openrouter.ai/api/v1"
            return OpenRouterProvider(api_key=eff_key, model=m, base_url=u), "openrouter", m
        if p_name == "nvidia":
            m = eff_model or "meta/llama-3.3-70b-instruct"
            u = eff_url or "https://integrate.api.nvidia.com/v1"
            return NvidiaProvider(api_key=eff_key, model=m, base_url=u), "nvidia", m
        if p_name == "deepseek":
            m = eff_model or "deepseek-chat"
            u = eff_url or "https://api.deepseek.com"
            return DeepSeekProvider(api_key=eff_key, model=m, base_url=u), "deepseek", m

        # Default: Gemini (or injected mock provider when no explicit credentials requested)
        m = eff_model or "gemini-2.0-flash"
        if self.default_provider and not api_key and not model and p_name == "gemini":
            return self.default_provider, "gemini", getattr(self.default_provider, "model", "") or m
        return GeminiFlashLiteProvider(api_key=eff_key, model=m), "gemini", m

    async def complete(
        self,
        provider: BaseLLMProvider,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.25,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> str:
        """Execute LLM completion with strict timeout and cancellation handling."""
        try:
            return await asyncio.wait_for(
                provider.complete(messages, model=model, temperature=temperature),
                timeout=timeout_s,
            )
        except asyncio.TimeoutError:
            logger.warning("[ProviderOrchestrator] Completion timed out after %.1fs (model=%s)", timeout_s, model)
            raise TimeoutError(f"Provider completion timed out after {timeout_s}s")
        except asyncio.CancelledError:
            logger.info("[ProviderOrchestrator] Completion cancelled by caller.")
            raise
