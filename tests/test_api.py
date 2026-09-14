import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app

@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

@pytest.mark.asyncio
async def test_workbench_projects():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create project
        create_resp = await client.post("/api/v1/workbench/projects", json={"title": "Test Project", "description": "Bioinformatics study"})
        assert create_resp.status_code == 200
        proj = create_resp.json()
        assert proj["title"] == "Test Project"
        
        # List projects
        list_resp = await client.get("/api/v1/workbench/projects")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) >= 1

@pytest.mark.asyncio
async def test_pdf_proxy_invalid_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/pdf/proxy", params={"url": "ftp://not-allowed.com/paper.pdf"})
        assert resp.status_code == 400

@pytest.mark.asyncio
async def test_workbench_workspaces_crud():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create workspace
        create_resp = await client.post(
            "/api/v1/workbench/workspaces",
            json={"title": "Attention Is All You Need", "description": "Transformer self-attention architecture study"}
        )
        assert create_resp.status_code == 200
        ws = create_resp.json()
        assert ws["title"] == "Attention Is All You Need"
        assert "ws-" in ws["id"]

        # List workspaces
        list_resp = await client.get("/api/v1/workbench/workspaces")
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert any(item["id"] == ws["id"] for item in items)

        # Get workspace by ID
        get_resp = await client.get(f"/api/v1/workbench/workspaces/{ws['id']}")
        assert get_resp.status_code == 200
        assert get_resp.json()["title"] == "Attention Is All You Need"

        # Delete workspace
        del_resp = await client.delete(f"/api/v1/workbench/workspaces/{ws['id']}")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "deleted"


