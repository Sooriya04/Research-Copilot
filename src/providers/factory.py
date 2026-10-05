from src.core.config import settings
from src.providers.base import BaseLLMProvider
from src.providers.llm import LocalOllamaProvider, OpenRouterProvider
from src.providers.nvidia import NvidiaProvider
from src.providers.groq import GroqProvider

def get_llm_provider(provider_name: str = "") -> BaseLLMProvider:
    """Factory to instantiate the configured LLM provider."""
    name = (provider_name or settings.default_llm_provider).lower()
    if name == "ollama":
        return LocalOllamaProvider()
    elif name == "nvidia":
        return NvidiaProvider()
    elif name == "groq":
        return GroqProvider()
    return OpenRouterProvider()
