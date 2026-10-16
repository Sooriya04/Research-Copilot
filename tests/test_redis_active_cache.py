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


@pytest.mark.asyncio
async def test_active_paper_cache_evidence_and_json():
    """Verify evidence package and comparison matrix caching and invalidation in Redis."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    paper_id = "test-evidence-redis-1"

    # 1. Evidence package caching
    evidence_payload = {
        "paper_id": paper_id,
        "title": "Attention Is All You Need",
        "claims": [{"id": "c-1", "claim_text": "Transformer architecture outperforms RNNs."}],
        "metrics": [{"id": "m-1", "name": "BLEU", "value": 28.4}],
    }
    assert await cache.get_evidence(paper_id) is None
    set_ok = await cache.set_evidence(paper_id, evidence_payload)
    assert set_ok is True

    cached_ev = await cache.get_evidence(paper_id)
    assert cached_ev is not None
    assert cached_ev["title"] == "Attention Is All You Need"
    assert cached_ev["claims"][0]["id"] == "c-1"

    # 2. Evidence invalidation
    assert await cache.invalidate_evidence(paper_id) is True
    assert await cache.get_evidence(paper_id) is None

    # 3. Arbitrary JSON / comparison matrix caching
    matrix_key = "compare_matrix:abcdef123456"
    matrix_data = {
        "papers_count": 2,
        "synthesis_summary": "Compared 2 papers.",
        "matrix": [{"id": "p1", "title": "Paper 1"}],
    }
    assert await cache.get_json(matrix_key) is None
    await cache.set_json(matrix_key, matrix_data, ttl=300)
    cached_matrix = await cache.get_json(matrix_key)
    assert cached_matrix is not None
    assert cached_matrix["papers_count"] == 2

    await cache.delete_key(matrix_key)
    assert await cache.get_json(matrix_key) is None

    # 4. Verify invalidate_paper also purges evidence
    await cache.set_evidence(paper_id, evidence_payload)
    assert await cache.get_evidence(paper_id) is not None
    await cache.invalidate_paper(paper_id)
    assert await cache.get_evidence(paper_id) is None


@pytest.mark.asyncio
async def test_redis_html_pages_cache_and_endpoints():
    """Verify storing, retrieving, and invalidating converted HTML pages in Redis and via HTTP endpoints."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    paper_id = "arxiv:2503.04615"

    sample_pages = [
        {
            "pageNumber": 1,
            "width": 612.0,
            "height": 792.0,
            "bgDataUrl": "data:image/png;base64,samplepage1data",
            "textItems": [
                {"str": "HalluCounter: Towards Holistic Hallucination Evaluation", "left": 54, "top": 100, "fontSize": 18}
            ],
            "html": "<div class=\"pdf-page\">Page 1 Content</div>",
            "fullText": "HalluCounter: Towards Holistic Hallucination Evaluation",
        },
        {
            "pageNumber": 2,
            "width": 612.0,
            "height": 792.0,
            "bgDataUrl": "data:image/png;base64,samplepage2data",
            "textItems": [
                {"str": "2. Methodology", "left": 54, "top": 80, "fontSize": 14}
            ],
            "html": "<div class=\"pdf-page\">Page 2 Content</div>",
            "fullText": "2. Methodology",
        },
    ]

    # 1. Direct ActivePaperCache check
    assert await cache.get_html_pages(paper_id) is None
    set_res = await cache.set_html_pages(paper_id, {"numPages": 2, "pages": sample_pages, "docTitle": "HalluCounter"})
    assert set_res is True

    # 2. Key normalization: arxiv_2503.04615 or 2503.04615 should hit the exact same cache
    cached_pages_1 = await cache.get_html_pages("2503.04615")
    assert cached_pages_1 is not None
    assert cached_pages_1["numPages"] == 2
    assert len(cached_pages_1["pages"]) == 2
    assert cached_pages_1["pages"][0]["textItems"][0]["str"].startswith("HalluCounter")

    # Invalidate
    await cache.invalidate_html_pages("2503.04615")
    assert await cache.get_html_pages(paper_id) is None

    # 3. HTTP Endpoints
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Cache miss
        miss_res = await client.get("/api/v1/pdf/html-cache/2503.04615")
        assert miss_res.status_code == 200
        assert miss_res.json()["status"] == "miss"

        # POST / save into Redis cache
        post_res = await client.post(
            "/api/v1/pdf/html-cache/2503.04615",
            json={
                "numPages": 2,
                "docTitle": "HalluCounter",
                "pages": sample_pages,
            },
        )
        assert post_res.status_code == 200
        assert post_res.json()["status"] == "saved"
        assert post_res.json()["numPages"] == 2

        # Cache hit
        hit_res = await client.get("/api/v1/pdf/html-cache/arxiv:2503.04615")
        assert hit_res.status_code == 200
        hit_data = hit_res.json()
        assert hit_data["status"] == "hit"
        assert hit_data["numPages"] == 2
        assert len(hit_data["pages"]) == 2
        assert hit_data["pages"][0]["pageNumber"] == 1

        # DELETE / invalidate
        del_res = await client.delete("/api/v1/pdf/html-cache/2503.04615")
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "invalidated"

        # Confirm miss after delete
        miss_res2 = await client.get("/api/v1/pdf/html-cache/2503.04615")
        assert miss_res2.status_code == 200
        assert miss_res2.json()["status"] == "miss"
