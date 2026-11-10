import pytest
from httpx import AsyncClient, ASGITransport
from src.api.app import app
from src.core.database import init_db


@pytest.mark.asyncio
async def test_export_endpoint_markdown_json_latex():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest first
        ingest_payload = {
            "paper_id": "test-export-paper-1",
            "title": "Attention Is All You Need",
            "force_refresh": True,
        }
        res = await client.post("/api/v1/evidence/ingest", json=ingest_payload)
        assert res.status_code == 200

        # 1. Export Markdown
        res_md = await client.get("/api/v1/evidence/test-export-paper-1/export?format=markdown")
        assert res_md.status_code == 200
        assert "text/markdown" in res_md.headers.get("content-type", "")
        assert "attachment" in res_md.headers.get("content-disposition", "")
        assert "# Research Evidence Dossier" in res_md.text

        # 2. Export JSON
        res_json = await client.get("/api/v1/evidence/test-export-paper-1/export?format=json")
        assert res_json.status_code == 200
        data = res_json.json()
        assert data["paper_id"] == "test-export-paper-1"

        # 3. Export LaTeX
        res_tex = await client.get("/api/v1/evidence/test-export-paper-1/export?format=latex")
        assert res_tex.status_code == 200
        assert r"\documentclass" in res_tex.text
        assert r"\begin{document}" in res_tex.text
