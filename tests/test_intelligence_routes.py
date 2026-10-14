import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app

@pytest.mark.asyncio
async def test_hypothesis_generation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/hypothesis/generate", json={"topic": "sparse autoencoders", "seed_papers_limit": 2})
        assert resp.status_code == 200
        data = resp.json()
        assert data["topic"] == "sparse autoencoders"
        assert len(data["hypotheses"]) >= 1
        assert "identified_gap" in data["hypotheses"][0]

@pytest.mark.asyncio
async def test_paper_critique():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/papers/critique", json={"identifier": "1706.03762"})
        assert resp.status_code == 200
        data = resp.json()
        assert "strengths" in data
        assert "concerns_and_limitations" in data
        assert "follow_up_questions" in data
        assert "score" in data
        assert data["score"] is not None
        assert "score_breakdown" in data
        assert data["score_breakdown"] is not None
        assert "claims" in data
        assert len(data["claims"]) >= 1
        assert data["claims"][0]["claim"] is not None

@pytest.mark.asyncio
async def test_paper_compare():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/papers/compare", json={"identifiers": ["1706.03762"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_count"] >= 1
        assert len(data["matrix"]) >= 1
        assert "has_ablation" in data["matrix"][0]

@pytest.mark.asyncio
async def test_workbench_sessions_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/workbench/sessions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

@pytest.mark.asyncio
async def test_claim_review_and_list_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Submit approval review
        review_payload = {
            "claim_id": "claim-test-101",
            "paper_id": "test-paper-42",
            "reviewer_status": "approved",
            "note": "Mechanically verified and vetted by reviewer.",
            "reviewer": "dr_alice"
        }
        resp = await client.post("/api/v1/papers/claims/review", json=review_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["claim_id"] == "claim-test-101"
        assert data["reviewer_status"] == "approved"

        # 2. List reviews
        list_resp = await client.get("/api/v1/papers/claims/reviews?claim_id=claim-test-101")
        assert list_resp.status_code == 200
        reviews = list_resp.json()
        assert len(reviews) >= 1
        assert reviews[0]["reviewer_status"] == "approved"

@pytest.mark.asyncio
async def test_verify_quote_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "excerpt": "self-attention mechanism reduces path length",
            "page_text": "In this paper, our self-attention mechanism reduces path length across representations.",
            "page": 2
        }
        resp = await client.post("/api/v1/papers/claims/verify-quote", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["mechanically_verified"] is True
        assert data["status"] == "VERIFIED"
        assert data["page"] == 2


@pytest.mark.asyncio
async def test_paper_synthesis_sqlite_persistence():
    """Test that generated paper synthesis is persisted into SQLite and returned instantly on subsequent calls."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        identifier = "test-synthesis-persistence-123"
        post_resp = await client.post(
            "/api/v1/papers/critique",
            json={
                "identifier": identifier,
                "title": "Persistent Rigor Audit Paper",
                "abstract": "We introduce a verified audit methodology. Our framework outperforms baseline benchmarks by 14%.",
                "full_text": "We introduce a verified audit methodology. Our framework outperforms baseline benchmarks by 14%. We release code at https://github.com/example/audit.",
            },
        )
        assert post_resp.status_code == 200
        post_data = post_resp.json()
        assert post_data["title"] == "Persistent Rigor Audit Paper"
        assert len(post_data["strengths"]) > 0
        assert len(post_data["claims"]) > 0

        # Retrieve from SQLite endpoint
        get_resp = await client.get(f"/api/v1/papers/synthesis/{identifier}")
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data["title"] == "Persistent Rigor Audit Paper"
        assert get_data["rubric_score"] == post_data["rubric_score"]
        assert len(get_data["claims"]) == len(post_data["claims"])

@pytest.mark.asyncio
async def test_paper_compare_with_research_gaps():
    """Test side-by-side comparison matrix with grounded research gaps, database verification, and cross-paper synthesis."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/papers/compare",
            json={"identifiers": ["arxiv:1706.03762", "arxiv:2312.00752"]}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_count"] == 2
        assert len(data["matrix"]) == 2

        # Check research gaps in first paper
        item1 = data["matrix"][0]
        assert "research_gaps" in item1
        assert item1["gaps_count"] >= 1
        assert len(item1["research_gaps"]) >= 1
        assert item1["research_gaps"][0]["category"] is not None
        assert item1["research_gaps"][0]["title"] is not None
        assert item1["research_gaps"][0]["description"] is not None
        assert item1["gaps_source"] in ["database_verified", "graph_engine", "extracted_fallback", "ai_inferred"]

        # Check cross-paper combinatorial gaps
        assert "cross_paper_gaps" in data
        assert len(data["cross_paper_gaps"]) >= 1
        cross_gap = data["cross_paper_gaps"][0]
        assert "title" in cross_gap
        assert "description" in cross_gap
        assert len(cross_gap["paper_ids"]) >= 2

@pytest.mark.asyncio
async def test_extract_paper_gaps_endpoint():
    """Test extracting or retrieving research gaps for a specific paper and persisting to SQLite."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/papers/extract-gaps",
            json={
                "identifier": "test-gap-paper-999",
                "title": "Quantum Error Mitigation for NISQ Devices",
                "abstract": "We investigate quantum error mitigation on NISQ devices. However, hardware scaling bottlenecks and sample complexity remain significant challenges under deep circuits.",
                "force_refresh": True
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["paper_id"] == "test-gap-paper-999"
        assert len(data["gaps"]) >= 1
        assert any(g["category"] in ["compute_bottleneck", "methodology_gap", "scaling_limit", "evaluation_gap"] for g in data["gaps"])
        assert data["saved_to_db"] is True



