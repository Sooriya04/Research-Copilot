from src.core.config import settings
from src.providers.base import BaseLLMProvider
from src.providers.llm import LocalOllamaProvider, OpenRouterProvider
from src.providers.nvidia import NvidiaProvider
from src.providers.groq import GroqProvider
from src.providers.deepseek import DeepSeekProvider


def get_llm_provider(
    provider_name: str = "",
    model: str = "",
    api_key: str = "",
    base_url: str = "",
) -> BaseLLMProvider:
    """Factory to instantiate the configured LLM provider."""
    # If model is explicitly a deepseek model and provider is not specified
    if not provider_name and model:
        m_lower = model.lower()
        if "deepseek" in m_lower and "/" not in m_lower:
            return DeepSeekProvider(api_key=api_key or None, model=model, base_url=base_url or None)

    name = (provider_name or settings.default_llm_provider or "ollama").lower()
    if not provider_name and model:
        m_lower = model.lower()
        if "gemini" in m_lower:
            name = "gemini"
        elif "deepseek" in m_lower and "/" not in m_lower:
            name = "deepseek"

    if name == "gemini":
        from src.providers.gemini import GeminiFlashLiteProvider
        return GeminiFlashLiteProvider(api_key=api_key or None, model=model or "gemini-2.0-flash-lite")
    elif name == "ollama":
        return LocalOllamaProvider(model=model or getattr(settings, "ollama_model", "phi4-mini"), base_url=base_url or None)
    elif name == "nvidia":
        return NvidiaProvider(api_key=api_key or None, model=model or None, base_url=base_url or None)
    elif name == "groq":
        return GroqProvider(api_key=api_key or None, model=model or None, base_url=base_url or None)
    elif name == "deepseek":
        return DeepSeekProvider(api_key=api_key or None, model=model or None, base_url=base_url or None)
    elif name == "openrouter":
        if api_key or settings.openrouter_api_key:
            return OpenRouterProvider(api_key=api_key or None, model=model or None)
        return LocalOllamaProvider(model=model or getattr(settings, "ollama_model", "phi4-mini"), base_url=base_url or None)
    elif name == "openai":
        from src.providers.openrouter import OpenRouterProvider
        return OpenRouterProvider(api_key=api_key or None, model=model or "gpt-4o", base_url=base_url or "https://api.openai.com/v1")
    return LocalOllamaProvider(model=model or getattr(settings, "ollama_model", "phi4-mini"), base_url=base_url or None)
