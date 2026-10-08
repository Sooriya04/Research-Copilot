import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import ASGITransport, AsyncClient
from src.api.app import app
from src.core.database import get_db
from src.engines.searqon_client import SearqonClient, WebSearchResult
from src.rag.context_builder import ContextBuilder
from src.rag.query_router import QueryRouter
from src.rag.service import PaperRAGService, PaperRAGResponse, WebCitationItem


# ─── 1. Searqon Client Unit Tests ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_searqon_client_normalization_and_credibility():
    """Verify Searqon response normalization, domain parsing, and academic credibility boosting."""
    raw_api_payload = {
        "success": True,
        "data": {
            "query": "hallucination detection probabilistic bounds",
            "count": 3,
            "results": [
                {
                    "title": "Random Blog Post on AI",
                    "url": "https://randomtechblog.io/article/123",
                    "snippet": "A short overview of hallucination detection.",
                    "source": "duckduckgo",
                    "score": 0.5,
                },
                {
                    "title": "Advances in Probabilistic LLM Verification",
                    "url": "https://arxiv.org/abs/2403.99999",
                    "snippet": "Formal probabilistic bounds for hallucination detection in LLMs.",
                    "source": "searxng",
                    "score": 0.5,
                },
                {
                    "title": "Nature Machine Intelligence Benchmarks",
                    "url": "https://www.nature.com/articles/s42256-024-001",
                    "snippet": "Comprehensive benchmark evaluation of hallucination detection.",
                    "source": "searxng",
                    "score": 0.45,
                },
            ],
        },
    }

    client = SearqonClient(active_cache=None)

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = raw_api_payload
        mock_post.return_value = mock_resp

        results = await client.search("hallucination detection", limit=5)

        assert len(results) == 3
        # arxiv.org and nature.com should receive credibility boost (1.35x and 1.30x)
        # arxiv: 0.5 * 1.35 = 0.675
        # nature: 0.45 * 1.30 = 0.585
        # blog: 0.5 * 1.0 = 0.500
        assert results[0].domain == "arxiv.org"
        assert results[0].score > results[1].score
        assert results[1].domain == "nature.com"
        assert results[2].domain == "randomtechblog.io"
        assert all(isinstance(r, WebSearchResult) for r in results)


@pytest.mark.asyncio
async def test_searqon_client_offline_graceful_fallback():
    """Verify that Searqon client handles connection error / timeout without raising exceptions."""
    import httpx

    client = SearqonClient(active_cache=None)

    with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("Connection refused")):
        results = await client.search("query when offline")
        assert results == []


# ─── 2. Query Router External Trigger Tests ───────────────────────────────────

def test_query_router_search_triggers():
    """Verify deterministic detection of internal paper questions vs external research questions."""
    router = QueryRouter()

    # Internal paper questions should NOT trigger web search
    internal_queries = [
        "What is the main contribution of this paper?",
        "Explain the methodology and architecture.",
        "What datasets did the authors evaluate on?",
        "What are the limitations mentioned in Section 5?",
        "Explain Equation 3.",
    ]
    for q in internal_queries:
        assert router.should_search_external(q, mode="auto", paper_chunks_found=5) is False
        assert router.should_search_external(q, mode="paper", paper_chunks_found=5) is False

    # External research questions SHOULD trigger web search
    external_queries = [
        "What papers came after this work?",
        "Are there newer approaches than this method?",
        "How does this compare with current 2026 methods?",
        "What is the current SOTA on this benchmark?",
        "Find recent follow-up research related to this.",
    ]
    for q in external_queries:
        assert router.should_search_external(q, mode="auto", paper_chunks_found=5) is True

    # Mode overrides
    # Paper mode strictly disables external search
    assert router.should_search_external("What are newer approaches?", mode="paper", paper_chunks_found=5) is False
    # Research mode always triggers external search
    assert router.should_search_external("Explain the methodology", mode="research", paper_chunks_found=5) is True
    # Auto mode triggers when no paper chunks are found
    assert router.should_search_external("Some specific question", mode="auto", paper_chunks_found=0) is True


def test_query_router_query_generation():
    """Verify generation of focused search queries with paper context."""
    router = QueryRouter()
    paper_context = {
        "title": "BTProp: Belief Propagation for Hallucination Detection in Large Language Models",
        "primary_method": "BTProp",
    }

    # Query with generic comparative phrase
    generated = router.generate_search_query("Are there newer methods than this?", paper_context)
    assert "BTProp" in generated or "Belief Propagation" in generated
    assert len(generated) > 10


# ─── 3. Context Builder & Web Citation Extraction Tests ───────────────────────

def test_context_builder_web_sources_formatting():
    """Verify segregation of paper sources and external web research in context builder."""
    builder = ContextBuilder()

    sample_chunks = [
        {
            "chunk_id": "c1",
            "page_number": 2,
            "section": "Methodology",
            "content": "BTProp constructs belief propagation graphs.",
        }
    ]

    sample_web_sources = [
        WebSearchResult(
            title="Recent Survey on LLM Hallucination Mitigation (2025)",
            url="https://arxiv.org/abs/2501.12345",
            snippet="A comprehensive overview of belief propagation and self-consistency methods.",
            source="searqon",
            domain="arxiv.org",
            score=0.85,
        )
    ]

    messages = builder.build_context(
        question="What follow-up work built on this?",
        retrieved_chunks=sample_chunks,
        paper_title="BTProp Paper",
        web_sources=sample_web_sources,
    )

    user_content = messages[1].content
    assert "--- EXTERNAL WEB RESEARCH (From Searqon) ---" in user_content
    assert "arxiv.org" in user_content
    assert "[Web: domain]" in user_content
    assert "Retrieved Paper Evidence:" in user_content


def test_context_builder_web_citation_extraction():
    """Verify extraction of web citations from LLM response text."""
    builder = ContextBuilder()

    web_sources = [
        WebSearchResult(
            title="Survey on Hallucination Mitigation",
            url="https://arxiv.org/abs/2501.12345",
            snippet="Recent surveys cite BTProp.",
            source="searqon",
            domain="arxiv.org",
            score=0.9,
        ),
        WebSearchResult(
            title="OpenReview Benchmark Submissions",
            url="https://openreview.net/forum?id=abc1234",
            snippet="Evaluations on HaluEval.",
            source="searqon",
            domain="openreview.net",
            score=0.8,
        ),
    ]

    llm_resp = "Subsequent work in [Web: arxiv.org] built directly on BTProp's formulation."
    cits = builder.extract_structured_web_citations(llm_resp, web_sources)

    assert len(cits) >= 1
    assert any(c["domain"] == "arxiv.org" for c in cits)


# ─── 4. PaperRAGService End-to-End Research Integration Tests ──────────────────

@pytest.mark.asyncio
async def test_paper_rag_service_with_searqon_research_mode():
    """Verify PaperRAGService in research mode queries Searqon, populates web_sources, and formats response."""
    mock_retriever = AsyncMock()
    mock_retriever.retrieve.return_value = [
        {
            "chunk_id": "test_c1",
            "page_number": 3,
            "section": "Methodology",
            "content": "BTProp method formulation.",
            "score": 0.95,
            "retrieval_source": "sqlite",
            "fetch_latency_ms": 2.5,
        }
    ]

    mock_ingestion = AsyncMock()
    mock_ingestion.ensure_paper_indexed.return_value = True

    mock_searqon = AsyncMock()
    mock_searqon.search.return_value = [
        WebSearchResult(
            title="Follow-up to BTProp (2025)",
            url="https://arxiv.org/abs/2502.54321",
            snippet="Expanding BTProp to multimodal settings.",
            source="searqon",
            domain="arxiv.org",
            score=0.91,
        )
    ]

    service = PaperRAGService(
        retriever=mock_retriever,
        ingestion_service=mock_ingestion,
        searqon_client=mock_searqon,
        active_cache=None,
    )

    mock_db = AsyncMock()
    with patch("src.rag.service.get_llm_provider") as mock_get_llm:
        mock_provider = AsyncMock()
        mock_provider.complete.return_value = "BTProp was introduced in [p.3]. Subsequent work [Web: arxiv.org] extended it."
        mock_get_llm.return_value = mock_provider

        response: PaperRAGResponse = await service.answer_question(
            paper_id="paper-101",
            question="What follow-up work extended this method?",
            db=mock_db,
            mode="research",
        )

        assert response.status == "success"
        assert response.mode == "research"
        assert response.external_search_used is True
        assert len(response.web_sources) >= 1
        assert response.web_sources[0].domain == "arxiv.org"
        assert len(response.paper_citations) >= 1
        assert response.paper_citations[0].page == 3
        assert response.web_search_latency_ms >= 0.0


@pytest.mark.asyncio
async def test_paper_rag_service_offline_searqon_resilience():
    """Verify PaperRAGService succeeds using paper context even when Searqon is offline/fails."""
    mock_retriever = AsyncMock()
    mock_retriever.retrieve.return_value = [
        {
            "chunk_id": "test_c1",
            "page_number": 1,
            "section": "Abstract",
            "content": "BTProp detects hallucinations.",
            "score": 0.9,
            "retrieval_source": "sqlite",
            "fetch_latency_ms": 1.5,
        }
    ]

    mock_ingestion = AsyncMock()
    mock_ingestion.ensure_paper_indexed.return_value = True

    mock_searqon = AsyncMock()
    mock_searqon.search.side_effect = RuntimeError("Searqon offline")

    service = PaperRAGService(
        retriever=mock_retriever,
        ingestion_service=mock_ingestion,
        searqon_client=mock_searqon,
        active_cache=None,
    )

    mock_db = AsyncMock()
    with patch("src.rag.service.get_llm_provider") as mock_get_llm:
        mock_provider = AsyncMock()
        mock_provider.complete.return_value = "Based on [p.1], the paper addresses hallucinations."
        mock_get_llm.return_value = mock_provider

        response = await service.answer_question(
            paper_id="paper-101",
            question="What came after this?",
            db=mock_db,
            mode="auto",
        )

        # Pipeline must not crash; returns answer from paper evidence
        assert response.status == "success"
        assert response.external_search_used is False
        assert len(response.paper_citations) >= 1


# ─── 5. FastAPI Route Integration Tests ───────────────────────────────────────

@pytest.mark.asyncio
async def test_paper_research_endpoint():
    """Verify POST /api/v1/papers/{paper_id}/research endpoint routing and response structure."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch.object(PaperRAGService, "answer_question") as mock_answer:
            mock_answer.return_value = PaperRAGResponse(
                paper_id="paper-test",
                paper_title="Test Research Paper",
                question="What came after this work?",
                answer="Subsequent work expanded the methodology [Web: arxiv.org].",
                citations=[],
                paper_citations=[],
                web_sources=[
                    WebCitationItem(
                        title="Subsequent paper",
                        url="https://arxiv.org/abs/2501.00001",
                        domain="arxiv.org",
                        source="searqon",
                        snippet="Survey snippet",
                    )
                ],
                external_search_used=True,
                mode="research",
                retrieved_chunks_count=1,
                status="success",
            )

            # Test dedicated research endpoint
            res = await client.post(
                "/api/v1/papers/paper-test/research",
                json={"question": "What came after this work?"},
            )

            assert res.status_code == 200
            data = res.json()
            assert data["mode"] == "research"
            assert data["external_search_used"] is True
            assert len(data["web_sources"]) == 1
            assert data["web_sources"][0]["domain"] == "arxiv.org"
