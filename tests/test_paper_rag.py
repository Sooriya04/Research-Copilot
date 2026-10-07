import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app
from src.rag.chunker import PaperChunker
from src.rag.context_builder import ContextBuilder
from src.rag.retriever import BM25Ranker, cosine_similarity


def test_chunker_section_and_page_preservation():
    """Verify that PaperChunker preserves page numbers, sections, and chunk sequence."""
    chunker = PaperChunker(chunk_size=300, chunk_overlap=50)

    pages = [
        {
            "page_number": 1,
            "text": "1. Introduction\nLarge language models suffer from hallucinations in complex tasks.",
        },
        {
            "page_number": 2,
            "text": "3. Methodology\nWe propose BTProp, a probabilistic belief propagation graph over claims.\nThe uncertainty is parameterized via Bayesian entropy bounds.",
        },
        {
            "page_number": 3,
            "text": "4. Experiments\nWe evaluate on GSM8K and TruthfulQA across 10,000 question pairs.\nEmpirical accuracy improves by 14.2% over baselines.",
        },
    ]

    chunks = chunker.chunk_pages(paper_id="paper-xyz", pages=pages)

    assert len(chunks) >= 3
    # Verify page preservation
    pages_found = [c.page_number for c in chunks]
    assert 1 in pages_found
    assert 2 in pages_found
    assert 3 in pages_found

    # Verify section preservation
    sections_found = [c.section.lower() for c in chunks]
    assert any("methodology" in s or "method" in s for s in sections_found)
    assert any("experiments" in s or "experiment" in s for s in sections_found)

    # Verify chunk structure
    assert chunks[0].chunk_id == "paper-xyz_c0"
    assert chunks[0].token_count > 0


def test_bm25_ranking_and_cosine_similarity():
    """Test keyword ranking with BM25 and vector cosine similarity."""
    ranker = BM25Ranker()
    corpus = [
        "Transformers rely entirely on self-attention mechanisms without recurrence.",
        "Convolutional neural networks extract local spatial visual representations.",
        "Reinforcement learning optimizes policy parameters using reward signals.",
    ]

    scores = ranker.score_corpus("self-attention transformer recurrence", corpus)
    assert scores[0] > scores[1]
    assert scores[0] > scores[2]

    # Test cosine similarity
    vec1 = [1.0, 0.0, 0.0]
    vec2 = [1.0, 0.0, 0.0]
    vec3 = [0.0, 1.0, 0.0]
    assert cosine_similarity(vec1, vec2) == 1.0
    assert cosine_similarity(vec1, vec3) == 0.0


def test_context_builder_and_citation_extraction():
    """Verify context prompt formatting and structured citation extraction."""
    builder = ContextBuilder()

    sample_chunks = [
        {
            "chunk_id": "c1",
            "page_number": 4,
            "section": "Methodology",
            "content": "BTProp computes marginal distributions across claim nodes.",
            "score": 0.92,
        },
        {
            "chunk_id": "c2",
            "page_number": 7,
            "section": "Experiments",
            "content": "Ablation shows removing belief propagation drops accuracy by 9%.",
            "score": 0.81,
        },
    ]

    messages = builder.build_context(
        question="What does ablation show?",
        retrieved_chunks=sample_chunks,
        paper_title="BTProp Paper",
    )
    assert len(messages) == 2
    assert "Page: 4" in messages[1].content
    assert "Page: 7" in messages[1].content
    assert "SOURCE 1" in messages[1].content

    # Extract citations from response
    response_text = "The ablation indicates that omitting belief propagation reduces performance by 9% [p.7]."
    citations = builder.extract_structured_citations(response_text, sample_chunks)
    assert len(citations) >= 1
    assert citations[0]["page"] == 7
    assert citations[0]["chunk_id"] == "c2"


@pytest.mark.asyncio
async def test_paper_rag_api_endpoints():
    """End-to-end test of ingestion, status, chunks, and chat endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        paper_id = "test-rag-paper-001"

        # 1. Ingest structured document
        ingest_payload = {
            "title": "Holistic Hallucination Detection via Probabilistic Beliefs",
            "abstract": "We introduce a Bayesian probabilistic framework for identifying hallucinations.",
            "pages": [
                {
                    "page_number": 1,
                    "text": "1. Introduction\nLarge models hallucinate. This work introduces an uncertainty framework.",
                },
                {
                    "page_number": 2,
                    "text": "3. Methodology\nThe core algorithm is BTProp, calculating marginal entropy over graph claims [p.2].",
                },
                {
                    "page_number": 3,
                    "text": "4. Results\nEmpirical accuracy reaches 91.4% on GSM8K with 3x compute efficiency.",
                },
            ],
            "authors": ["Test Author"],
        }
        ingest_resp = await client.post(f"/api/v1/papers/{paper_id}/ingest", json=ingest_payload)
        assert ingest_resp.status_code == 200
        assert ingest_resp.json()["status"] == "success"

        # 2. Check paper status
        status_resp = await client.get(f"/api/v1/papers/{paper_id}/status")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["is_indexed"] is True
        assert status_data["chunk_count"] >= 3

        # 3. Check chunk inspection endpoint
        chunks_resp = await client.get(f"/api/v1/papers/{paper_id}/chunks")
        assert chunks_resp.status_code == 200
        assert len(chunks_resp.json()["chunks"]) >= 3

        # 4. Ask a question via /api/v1/papers/{paper_id}/chat
        chat_resp = await client.post(
            f"/api/v1/papers/{paper_id}/chat",
            json={"question": "What is the core algorithm introduced in the methodology?"},
        )
        assert chat_resp.status_code == 200
        chat_data = chat_resp.json()
        assert chat_data["paper_id"] == paper_id
        assert "answer" in chat_data
        assert chat_data["retrieved_chunks_count"] > 0
        assert len(chat_data["citations"]) > 0

        # 5. Non-existent paper behavior
        missing_resp = await client.post(
            "/api/v1/papers/nonexistent-paper-999/chat",
            json={"question": "What is this?"},
        )
        assert missing_resp.status_code == 200
        assert missing_resp.json()["status"] == "paper_not_found"
