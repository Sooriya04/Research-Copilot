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
    """Factory to instantiate the configured LLM provider, reading directly from SQLite user settings when not explicitly passed."""
    from src.core.provider_settings import resolve_provider_credentials_sync

    # If model is explicitly a deepseek model and provider is not specified
    if not provider_name and model:
        m_lower = model.lower()
        if "deepseek" in m_lower and "/" not in m_lower:
            creds = resolve_provider_credentials_sync("deepseek", explicit_key=api_key, explicit_model=model, explicit_base_url=base_url)
            return DeepSeekProvider(api_key=creds.get("api_key") or None, model=creds.get("model") or model, base_url=creds.get("base_url") or None)

    name = (provider_name or settings.default_llm_provider or "gemini").lower()
    if not provider_name and model:
        m_lower = model.lower()
        if "gemini" in m_lower:
            name = "gemini"
        elif "deepseek" in m_lower and "/" not in m_lower:
            name = "deepseek"

    # Resolve from SQLite user settings (Settings UI) with fallback to env
    creds = resolve_provider_credentials_sync(name, explicit_key=api_key, explicit_model=model, explicit_base_url=base_url)
    resolved_key = creds.get("api_key") or ""
    resolved_model = creds.get("model") or model or ""
    resolved_base_url = creds.get("base_url") or base_url or ""

    if name == "gemini":
        from src.providers.gemini import GeminiFlashLiteProvider
        return GeminiFlashLiteProvider(api_key=resolved_key or None, model=resolved_model or "gemini-3.5-flash-lite")
    elif name == "ollama":
        return LocalOllamaProvider(model=resolved_model or getattr(settings, "ollama_model", "phi4-mini"), base_url=resolved_base_url or None)
    elif name in ("vllm", "lmstudio", "localai", "local-openai", "local"):
        from src.providers.llm import LocalOpenAIProvider
        return LocalOpenAIProvider(api_key=resolved_key or "local", model=resolved_model or "local-model", base_url=resolved_base_url or None)
    elif name == "nvidia":
        return NvidiaProvider(api_key=resolved_key or None, model=resolved_model or None, base_url=resolved_base_url or None)
    elif name == "groq":
        return GroqProvider(api_key=resolved_key or None, model=resolved_model or None)
    elif name == "deepseek":
        return DeepSeekProvider(api_key=resolved_key or None, model=resolved_model or None, base_url=resolved_base_url or None)
    elif name == "openrouter":
        return OpenRouterProvider(api_key=resolved_key or None, model=resolved_model or None, base_url=resolved_base_url or None)
    elif name == "openai":
        from src.providers.openrouter import OpenRouterProvider
        return OpenRouterProvider(api_key=resolved_key or None, model=resolved_model or "gpt-4o", base_url=resolved_base_url or "https://api.openai.com/v1")
    return LocalOllamaProvider(model=resolved_model or getattr(settings, "ollama_model", "phi4-mini"), base_url=resolved_base_url or None)
