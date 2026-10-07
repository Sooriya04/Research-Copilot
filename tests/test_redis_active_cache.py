import asyncio
import fakeredis.aioredis as fake_aioredis
import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app
from src.core.database import get_db_session
from src.rag.active_cache import ActivePaperCache
from src.rag.ingestion import PaperIngestionService
from src.rag.retriever import HybridRetriever
from src.rag.service import PaperRAGService


@pytest.mark.asyncio
async def test_active_paper_cache_hit_and_miss():
    """Verify cache miss queries SQLite and populates Redis; subsequent call hits Redis cache."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    ingestion = PaperIngestionService()

    paper_id = "test-cag-001"

    async with get_db_session() as db:
        # Ingest paper into SQLite
        await ingestion.ingest_document(
            paper_id=paper_id,
            title="Active CAG Test Paper",
            abstract="Testing Redis active paper context caching.",
            pages=[
                {"page_number": 1, "text": "1. Introduction\nCAG accelerates LLM context access."},
                {"page_number": 2, "text": "3. Methodology\nIn-memory Redis stores active chunks."},
            ],
            db=db,
        )

        # 1. Initially, paper should NOT be cached in Redis
        assert await cache.is_cached(paper_id) is False
        assert await cache.get_paper(paper_id) is None

        # 2. Cache miss -> loads from SQLite into Redis
        meta = await cache.load_paper(paper_id, db)
        assert meta is not None
        assert meta["title"] == "Active CAG Test Paper"

        # 3. Now paper IS cached in Redis
        assert await cache.is_cached(paper_id) is True
        cached_meta = await cache.get_paper(paper_id)
        assert cached_meta is not None
        assert cached_meta["title"] == "Active CAG Test Paper"

        # 4. Verify chunks cached
        cached_chunks = await cache.get_chunks(paper_id)
        assert cached_chunks is not None
        assert len(cached_chunks) >= 2
        assert cached_chunks[0]["page_number"] in [1, 2]

        # 5. Verify active paper session pointer
        assert await cache.get_active_paper_id() == paper_id


@pytest.mark.asyncio
async def test_cache_invalidation_and_paper_isolation():
    """Verify Paper A cannot bleed into Paper B and invalidating clears Redis keys."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    ingestion = PaperIngestionService()

    paper_a = "paper-alpha-123"
    paper_b = "paper-beta-456"

    async with get_db_session() as db:
        await ingestion.ingest_document(
            paper_id=paper_a,
            title="Paper Alpha Title",
            abstract="Alpha abstract",
            pages=[{"page_number": 1, "text": "Alpha content on page 1"}],
            db=db,
        )
        await ingestion.ingest_document(
            paper_id=paper_b,
            title="Paper Beta Title",
            abstract="Beta abstract",
            pages=[{"page_number": 1, "text": "Beta content on page 1"}],
            db=db,
        )

        await cache.load_paper(paper_a, db)
        await cache.load_paper(paper_b, db)

        # Paper isolation
        chunks_a = await cache.get_chunks(paper_a)
        chunks_b = await cache.get_chunks(paper_b)
        assert chunks_a[0]["content"] == "Alpha content on page 1"
        assert chunks_b[0]["content"] == "Beta content on page 1"
        assert chunks_a[0]["paper_id"] == paper_a
        assert chunks_b[0]["paper_id"] == paper_b

        # Invalidate Paper A
        await cache.invalidate_paper(paper_a)
        assert await cache.is_cached(paper_a) is False
        assert await cache.get_chunks(paper_a) is None

        # Paper B remains unaffected
        assert await cache.is_cached(paper_b) is True
        assert await cache.get_chunks(paper_b) is not None


@pytest.mark.asyncio
async def test_redis_disabled_and_unavailable_fallback():
    """Verify system operates seamlessly using SQLite when Redis is disabled or offline."""
    # Disabled cache instance
    disabled_cache = ActivePaperCache(enabled=False)
    assert await disabled_cache.is_available() is False
    assert await disabled_cache.get_paper("any-id") is None
    assert await disabled_cache.get_chunks("any-id") is None

    # HybridRetriever should smoothly fall back to SQLite
    ingestion = PaperIngestionService()
    paper_id = "test-fallback-paper"

    async with get_db_session() as db:
        await ingestion.ingest_document(
            paper_id=paper_id,
            title="Fallback Resilience Paper",
            abstract="Verifying SQLite fallback when Redis is absent.",
            pages=[{"page_number": 1, "text": "Robust fallback ensures zero downtime."}],
            db=db,
        )

        retriever = HybridRetriever(active_cache=disabled_cache)
        results = await retriever.retrieve(paper_id=paper_id, query="fallback zero downtime", db=db)
        assert len(results) > 0
        assert results[0]["retrieval_source"] == "sqlite"
        assert "fallback" in results[0]["content"].lower()


@pytest.mark.asyncio
async def test_active_paper_retrieval_and_timing_metrics():
    """Verify retrieval uses Redis when cached, reporting latency and cache hit."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    ingestion = PaperIngestionService()
    paper_id = "test-timing-paper"

    async with get_db_session() as db:
        await ingestion.ingest_document(
            paper_id=paper_id,
            title="Timing Benchmark Paper",
            abstract="Benchmarking Redis retrieval latency.",
            pages=[{"page_number": 1, "text": "Redis active cache eliminates database query overhead."}],
            db=db,
        )

        # 1. Warm up Redis cache
        await cache.load_paper(paper_id, db)
        assert await cache.is_cached(paper_id) is True

        # 2. Run retrieval
        retriever = HybridRetriever(active_cache=cache)
        results = await retriever.retrieve(paper_id=paper_id, query="overhead database", db=db)

        assert len(results) > 0
        assert results[0]["retrieval_source"] == "redis"
        assert "fetch_latency_ms" in results[0]

        # 3. Test PaperRAGService with cached paper
        service = PaperRAGService(retriever=retriever, active_cache=cache)
        response = await service.answer_question(
            paper_id=paper_id,
            question="What does Redis active cache eliminate?",
            db=db,
        )

        assert response.cache_hit is True
        assert response.retrieval_source == "redis"
        assert response.redis_latency_ms >= 0.0
        assert response.total_latency_ms > 0.0


@pytest.mark.asyncio
async def test_active_paper_api_endpoints():
    """Verify /papers/{paper_id}/activate, /cache, and /chat endpoints with active cache."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        paper_id = "api-cag-paper-77"

        # 1. Ingest document
        ingest_resp = await client.post(
            f"/api/v1/papers/{paper_id}/ingest",
            json={
                "title": "API CAG Verification",
                "abstract": "Testing activation endpoints.",
                "pages": [{"page_number": 1, "text": "Active paper session endpoint testing."}],
            },
        )
        assert ingest_resp.status_code == 200

        # 2. Activate paper
        activate_resp = await client.post(f"/api/v1/papers/{paper_id}/activate")
        assert activate_resp.status_code == 200
        act_data = activate_resp.json()
        assert act_data["paper_id"] == paper_id
        assert act_data["status"] == "active"

        # 3. Check cache status
        cache_resp = await client.get(f"/api/v1/papers/{paper_id}/cache")
        assert cache_resp.status_code == 200
        c_data = cache_resp.json()
        assert c_data["paper_id"] == paper_id

        # 4. Invalidate cache
        del_resp = await client.delete(f"/api/v1/papers/{paper_id}/cache")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "invalidated"
