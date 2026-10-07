import abc
import hashlib
import math
from typing import List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger


class BaseEmbeddingProvider(abc.ABC):
    """Abstract interface for text embedding models."""

    @abc.abstractmethod
    async def embed_text(self, text: str) -> List[float]:
        """Generate vector embedding for a single text."""
        pass

    @abc.abstractmethod
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate vector embeddings for a batch of texts."""
        pass


class OllamaEmbeddingProvider(BaseEmbeddingProvider):
    """Ollama local embedding client (defaults to nomic-embed-text)."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        dim: Optional[int] = None,
    ):
        raw_url = base_url or settings.ollama_base_url or "http://localhost:11434"
        self.base_url = raw_url.rstrip("/")
        self.model = model or getattr(settings, "embedding_model", "nomic-embed-text")
        self.dim = dim or getattr(settings, "embedding_dim", 768)

    async def embed_text(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.dim

        clean_text = text.strip()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": clean_text[:4000]},
                )
                if resp.status_code == 200:
                    emb = resp.json().get("embedding")
                    if emb and isinstance(emb, list):
                        return [float(x) for x in emb]
                    
                logger.warning(
                    "[OllamaEmbeddingProvider] HTTP %s from /api/embeddings: %s",
                    resp.status_code,
                    resp.text[:120],
                )
        except Exception as e:
            logger.warning("[OllamaEmbeddingProvider] Connection error (%s), falling back to deterministic embedding", e)

        return self._fallback_embedding(clean_text)

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        results: List[List[float]] = []
        for text in texts:
            emb = await self.embed_text(text)
            results.append(emb)
        return results

    def _fallback_embedding(self, text: str) -> List[float]:
        """Deterministic pseudo-embedding for resilience when embedding daemon is unreachable."""
        vec = [0.0] * self.dim
        words = text.lower().split()
        if not words:
            return vec
        for i, word in enumerate(words):
            h = int(hashlib.sha256(word.encode()).hexdigest(), 16)
            idx = h % self.dim
            vec[idx] += 1.0 / (1.0 + math.log(1 + i))
        # Normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec


def get_embedding_provider() -> BaseEmbeddingProvider:
    """Factory for embedding provider based on configuration."""
    provider = getattr(settings, "embedding_provider", "ollama").lower()
    if provider == "ollama":
        return OllamaEmbeddingProvider()
    return OllamaEmbeddingProvider()
