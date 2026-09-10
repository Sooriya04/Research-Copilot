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
