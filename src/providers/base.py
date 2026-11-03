import abc
from typing import AsyncGenerator, Dict, List, Optional
from pydantic import BaseModel

class ChatMessage(BaseModel):
    role: str  # system, user, assistant
    content: str


class ProviderError(Exception):
    """Base exception for LLM provider errors."""
    pass


class ProviderUnavailableException(ProviderError):
    """Raised when the LLM provider is unreachable or down."""
    pass


class ProviderAuthenticationError(ProviderError):
    """Raised when API key or authentication fails."""
    pass


class RateLimitError(ProviderError):
    """Raised when provider rate limit is exceeded."""
    pass

class BaseLLMProvider(abc.ABC):
    """Abstract interface for LLM chat completion & streaming."""

    @abc.abstractmethod
    async def complete(self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7) -> str:
        """Generate non-streaming text completion."""
        pass

    @abc.abstractmethod
    async def stream_chat(
        self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """Stream completion tokens as Server-Sent Events."""
        pass
