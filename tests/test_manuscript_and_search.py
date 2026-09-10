import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app

@pytest.mark.asyncio
async def test_draft_latex_manuscript():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "title": "Empirical Scaling of Sparse Autoencoders",
            "topic": "mechanistic interpretability",
            "seed_paper_ids": ["arxiv:1706.03762"],
            "author_name": "Antigravity Research Engineer"
        }
        resp = await client.post("/api/v1/manuscript/draft", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "full_latex_document" in data
        assert "\\documentclass{article}" in data["full_latex_document"]
        assert "\\section{Introduction}" in data["full_latex_document"]
        assert "bibtex_references" in data

@pytest.mark.asyncio
async def test_code_paper_audit():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "paper_identifier": "1706.03762",
            "github_url": "https://github.com/tensorflow/tensor2tensor"
        }
        resp = await client.post("/api/v1/audit/paper-code", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["reproducibility_rating"] == "High"
        assert len(data["checked_items"]) >= 4

@pytest.mark.asyncio
async def test_compute_dispatch():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "task_name": "alphafold2_folding",
            "backend": "modal",
            "hardware": "A100"
        }
        resp = await client.post("/api/v1/compute/dispatch", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "queued"
        assert "job_id" in data
