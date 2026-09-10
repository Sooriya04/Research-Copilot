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
