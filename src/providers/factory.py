from src.core.config import settings
from src.providers.base import BaseLLMProvider
from src.providers.llm import LocalOllamaProvider, OpenRouterProvider

def get_llm_provider(provider_name: str = "") -> BaseLLMProvider:
    """Factory to instantiate the configured LLM provider."""
    name = (provider_name or settings.default_llm_provider).lower()
    if name == "ollama":
        return LocalOllamaProvider()
    return OpenRouterProvider()
