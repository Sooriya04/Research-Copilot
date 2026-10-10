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

