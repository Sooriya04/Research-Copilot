import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from src.api.app import app
from src.core.database import init_db
from src.engines.grounded_qa import GroundedQAEngine


@pytest.mark.asyncio
async def test_grounded_qa_api_endpoint():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest paper
        ingest_payload = {
            "paper_id": "test-qa-api-1",
            "title": "Attention Is All You Need",
            "force_refresh": True,
        }
        res = await client.post("/api/v1/evidence/ingest", json=ingest_payload)
        assert res.status_code == 200

        # Ask question
        with patch.object(GroundedQAEngine, "_resolve_provider", new_callable=AsyncMock, return_value=(None, "heuristic", "deterministic-rules")):
            qa_payload = {
                "paper_id": "test-qa-api-1",
                "question": "What architecture is proposed in this paper?",
            }
            res_qa = await client.post("/api/v1/evidence/test-qa-api-1/qa", json=qa_payload)
            assert res_qa.status_code == 200
            data = res_qa.json()
            assert data["paper_id"] == "test-qa-api-1"
            assert "answer" in data
            assert "citations" in data
            assert isinstance(data["citations"], list)
