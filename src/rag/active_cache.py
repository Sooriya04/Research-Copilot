import json
import time
from typing import Any, Dict, List, Optional
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.config import settings
from src.core.logger import logger
from src.core.models import PaperChunkModel, PaperDocumentModel


class ActivePaperCache:
    """Redis-backed active paper context and CAG cache layer.
    
    Provides high-speed in-memory retrieval of active paper context while SQLite
    remains the permanent source of truth. Gracefully falls back to SQLite if Redis
    is disabled or unavailable.
    """

    def __init__(
        self,
        redis_client: Optional[Any] = None,
        ttl_seconds: Optional[int] = None,
        enabled: Optional[bool] = None,
    ):
        self.enabled = getattr(settings, "redis_enabled", True) if enabled is None else enabled
        self.ttl = ttl_seconds or getattr(settings, "redis_active_paper_ttl", 3600)
        self._custom_client = redis_client
        self._client: Optional[Any] = None
        self._connection_failed: bool = False

    async def get_client(self) -> Optional[Any]:
        """Obtain or lazily establish Redis async connection."""
        if not self.enabled:
            return None
        if self._custom_client is not None:
            return self._custom_client
        if self._client is not None:
            return self._client
        if self._connection_failed:
            return None

        try:
            url = getattr(settings, "redis_url", "redis://localhost:6379")
            client = aioredis.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=1.5,
                socket_connect_timeout=1.5,
            )
            # Probe connection
            await client.ping()
            self._client = client
            logger.info("[ActivePaperCache] Connected to Redis at %s", url)
            return self._client
        except Exception as e:
            self._connection_failed = True
            logger.warning("[ActivePaperCache] Redis unavailable (%s). Falling back seamlessly to SQLite.", e)
            return None

    def _meta_key(self, paper_id: str) -> str:
        return f"paper:{paper_id}:metadata"

    def _chunks_key(self, paper_id: str) -> str:
        return f"paper:{paper_id}:chunks"

    def _context_key(self, paper_id: str) -> str:
        return f"paper:{paper_id}:context"

    def _active_key(self) -> str:
        return "active_paper:current"

    async def is_available(self) -> bool:
        """Check if Redis cache backend is online and responding."""
        client = await self.get_client()
        if not client:
            return False
        try:
            await client.ping()
            return True
        except Exception:
            return False

    async def is_cached(self, paper_id: str) -> bool:
        """Check whether paper metadata exists in Redis."""
        client = await self.get_client()
        if not client:
            return False
        try:
            return bool(await client.exists(self._meta_key(paper_id)))
        except Exception as e:
            logger.warning("[ActivePaperCache] is_cached check failed for '%s': %s", paper_id, e)
            return False

    async def get_paper(self, paper_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached paper metadata from Redis."""
        client = await self.get_client()
        if not client:
            return None
        try:
            raw = await client.get(self._meta_key(paper_id))
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning("[ActivePaperCache] Error getting paper '%s': %s", paper_id, e)
        return None

    async def get_chunks(self, paper_id: str) -> Optional[List[Dict[str, Any]]]:
        """Retrieve cached chunk list from Redis for zero-DB hybrid retrieval."""
        client = await self.get_client()
        if not client:
            return None
        try:
            raw = await client.get(self._chunks_key(paper_id))
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning("[ActivePaperCache] Error getting chunks for '%s': %s", paper_id, e)
        return None

    async def get_context(self, paper_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve CAG overview context from Redis."""
        client = await self.get_client()
        if not client:
            return None
        try:
            raw = await client.get(self._context_key(paper_id))
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning("[ActivePaperCache] Error getting context for '%s': %s", paper_id, e)
        return None

    async def get_active_paper_id(self) -> Optional[str]:
        """Get ID of the currently active paper session."""
        client = await self.get_client()
        if not client:
            return None
        try:
            return await client.get(self._active_key())
        except Exception:
            return None

    async def set_active_paper(self, paper_id: str) -> bool:
        """Mark paper as the active session in Redis."""
        client = await self.get_client()
        if not client:
            return False
        try:
            await client.set(self._active_key(), paper_id, ex=self.ttl)
            return True
        except Exception as e:
            logger.warning("[ActivePaperCache] Error setting active paper '%s': %s", paper_id, e)
            return False

    async def load_paper(
        self,
        paper_id: str,
        db: AsyncSession,
        extend_ttl: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """Load paper context and chunks into Redis from SQLite on cache miss."""
        client = await self.get_client()

        # 1. Check if already cached
        if client:
            try:
                cached_meta = await self.get_paper(paper_id)
                if cached_meta:
                    if extend_ttl:
                        await client.expire(self._meta_key(paper_id), self.ttl)
                        await client.expire(self._chunks_key(paper_id), self.ttl)
                        await client.expire(self._context_key(paper_id), self.ttl)
                    await self.set_active_paper(paper_id)
                    return cached_meta
            except Exception as e:
                logger.warning("[ActivePaperCache] Cache check exception for '%s': %s", paper_id, e)

        # 2. Query persistent SQLite source of truth
        doc_stmt = select(PaperDocumentModel).where(PaperDocumentModel.id == paper_id)
        doc_res = await db.execute(doc_stmt)
        paper_doc = doc_res.scalar_one_or_none()

        if not paper_doc:
            logger.info("[ActivePaperCache] Paper '%s' not found in SQLite.", paper_id)
            return None

        chunk_stmt = (
            select(PaperChunkModel)
            .where(PaperChunkModel.paper_id == paper_id)
            .order_by(PaperChunkModel.chunk_index)
        )
        chunk_res = await db.execute(chunk_stmt)
        chunks = chunk_res.scalars().all()

        meta_data = {
            "id": paper_doc.id,
            "title": paper_doc.title,
            "authors": paper_doc.authors_json or [],
            "abstract": paper_doc.abstract or "",
            "doi": paper_doc.doi,
            "arxiv_id": paper_doc.arxiv_id,
            "page_count": paper_doc.page_count,
            "metadata": paper_doc.metadata_json or {},
            "cached_at": time.time(),
        }

        chunks_data = [
            {
                "chunk_id": c.id,
                "paper_id": c.paper_id,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "page_number": c.page_number,
                "section": c.section,
                "token_count": c.token_count,
                "embedding_json": c.embedding_json,
                "metadata": c.metadata_json or {},
            }
            for c in chunks
        ]

        sections_set = list(dict.fromkeys(c.section for c in chunks if c.section))
        context_data = {
            "paper_id": paper_doc.id,
            "title": paper_doc.title,
            "abstract": paper_doc.abstract,
            "sections": sections_set,
            "chunk_count": len(chunks_data),
            "page_count": paper_doc.page_count,
        }

        # 3. Write into Redis cache
        if client:
            try:
                pipe = client.pipeline()
                pipe.set(self._meta_key(paper_id), json.dumps(meta_data), ex=self.ttl)
                pipe.set(self._chunks_key(paper_id), json.dumps(chunks_data), ex=self.ttl)
                pipe.set(self._context_key(paper_id), json.dumps(context_data), ex=self.ttl)
                pipe.set(self._active_key(), paper_id, ex=self.ttl)
                await pipe.execute()
                logger.info(
                    "[ActivePaperCache] Loaded paper '%s' into Redis (%d chunks, TTL=%ds)",
                    paper_id,
                    len(chunks_data),
                    self.ttl,
                )
            except Exception as e:
                logger.warning("[ActivePaperCache] Failed writing to Redis for '%s': %s", paper_id, e)

        return meta_data

    async def invalidate_paper(self, paper_id: str) -> bool:
        """Evict paper keys from Redis cache to prevent stale context."""
        client = await self.get_client()
        if not client:
            return False
        try:
            keys = [
                self._meta_key(paper_id),
                self._chunks_key(paper_id),
                self._context_key(paper_id),
            ]
            await client.delete(*keys)

            active = await self.get_active_paper_id()
            if active == paper_id:
                await client.delete(self._active_key())

            logger.info("[ActivePaperCache] Evicted Redis cache for paper '%s'", paper_id)
            return True
        except Exception as e:
            logger.warning("[ActivePaperCache] Failed invalidating '%s': %s", paper_id, e)
            return False

    async def get_cache_status(self, paper_id: str) -> Dict[str, Any]:
        """Inspect development cache status, TTL, and active state."""
        client = await self.get_client()
        if not client:
            return {
                "paper_id": paper_id,
                "active": False,
                "cached": False,
                "ttl": -1,
                "redis_online": False,
            }
        try:
            cached = bool(await client.exists(self._meta_key(paper_id)))
            ttl = await client.ttl(self._meta_key(paper_id)) if cached else -1
            active_id = await client.get(self._active_key())
            return {
                "paper_id": paper_id,
                "active": active_id == paper_id,
                "cached": cached,
                "ttl": ttl,
                "redis_online": True,
            }
        except Exception as e:
            return {
                "paper_id": paper_id,
                "active": False,
                "cached": False,
                "ttl": -1,
                "redis_online": False,
                "error": str(e),
            }


_active_paper_cache_singleton: Optional[ActivePaperCache] = None


def get_active_paper_cache() -> ActivePaperCache:
    """Singleton getter for active paper cache."""
    global _active_paper_cache_singleton
    if _active_paper_cache_singleton is None:
        _active_paper_cache_singleton = ActivePaperCache()
    return _active_paper_cache_singleton
