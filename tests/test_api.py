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
async def test_pdf_proxy_ssrf_blocked():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        forbidden_targets = [
            "http://127.0.0.1:8000/paper.pdf",
            "http://localhost:8000/paper.pdf",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.1/internal.pdf",
            "http://172.16.0.1/internal.pdf",
            "http://192.168.1.1/secret.pdf",
            "http://0.0.0.0/paper.pdf",
            "http://[::1]/paper.pdf",
        ]
        for target in forbidden_targets:
            resp = await client.get("/api/v1/pdf/proxy", params={"url": target})
            assert resp.status_code == 403, f"Expected 403 for {target}, got {resp.status_code}"

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


@pytest.mark.asyncio
async def test_graph_benchmarks_sqlite_caching():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Pre-seed through repository or test cache hit
        from src.core.database import get_db_session
        from src.core.paper_repository import PaperRepository
        from src.core.canonical_models import BenchmarkEvidence, CodeRepository

        async with get_db_session() as db:
            await PaperRepository.save_benchmarks_and_repos(
                db=db,
                benchmarks=[
                    BenchmarkEvidence(
                        source="paperswithcode",
                        task="Time Series Forecasting",
                        dataset="Weather",
                        metric="MSE",
                        value="0.174",
                        model="iTransformer",
                    )
                ],
                repositories=[
                    CodeRepository(
                        url="https://github.com/thuml/iTransformer",
                        is_official=True,
                        framework="pytorch",
                    )
                ],
                arxiv_id="2310.06625",
                title="iTransformer",
            )

        resp = await client.get("/api/v1/graph/benchmarks", params={"arxiv_id": "2310.06625"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True
        assert data["source"] == "sqlite"
        assert data["arxiv_id"] == "2310.06625"
        assert len(data["benchmarks"]) == 1
        assert data["benchmarks"][0]["dataset"] == "Weather"
        assert len(data["repositories"]) == 1


@pytest.mark.asyncio
async def test_pdf_preprint_buffer_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/pdf/preprint", params={
            "title": "An Introduction to Neural Information Retrieval",
            "authors": "Bhaskar Mitra, Nick Craswell",
            "doi": "10.1561/1500000061",
            "year": 2018,
            "venue": "Foundations and Trends in Information Retrieval"
        })
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "application/pdf"
        assert resp.content.startswith(b"%PDF-")
        assert len(resp.content) > 1000


@pytest.mark.asyncio
async def test_resolve_paper_guarantees_pdf_url():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/paper/10.1561/1500000061")
        assert resp.status_code == 200
        data = resp.json()
        assert data["paper"] is not None
        assert data["paper"]["title"] is not None
        assert data["paper"]["pdf_url"] is not None
        assert "/api/v1/pdf/preprint" in data["paper"]["pdf_url"]
        assert len(data["candidates"]) >= 1


@pytest.mark.asyncio
async def test_unmatched_api_route_returns_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/nonexistent_route")
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Not Found"}


@pytest.mark.asyncio
async def test_workspace_deletion_cascades_memories():
    from src.core.database import get_db_session
    from src.core.models import WorkspaceMemoryModel
    from sqlalchemy import select

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create workspace
        create_resp = await client.post(
            "/api/v1/workbench/workspaces",
            json={"title": "Cascade Memory Workspace", "description": "Testing memory cascade"}
        )
        assert create_resp.status_code == 200
        ws_id = create_resp.json()["id"]

        # Add memories to workspace
        mem_resp1 = await client.post(
            f"/api/v1/workbench/workspaces/{ws_id}/memories",
            json={"category": "hypothesis", "title": "H1", "content": "Memory 1"}
        )
        assert mem_resp1.status_code == 200

        mem_resp2 = await client.post(
            f"/api/v1/workbench/workspaces/{ws_id}/memories",
            json={"category": "decision", "title": "D1", "content": "Memory 2"}
        )
        assert mem_resp2.status_code == 200

        # Verify memories exist
        async with get_db_session() as db:
            mems = (await db.execute(select(WorkspaceMemoryModel).where(WorkspaceMemoryModel.workspace_id == ws_id))).scalars().all()
            assert len(mems) == 2

        # Delete workspace
        del_resp = await client.delete(f"/api/v1/workbench/workspaces/{ws_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "deleted"

        # Verify memories cascaded and were cleanly deleted from SQLite
        async with get_db_session() as db:
            remaining = (await db.execute(select(WorkspaceMemoryModel).where(WorkspaceMemoryModel.workspace_id == ws_id))).scalars().all()
            assert len(remaining) == 0


@pytest.mark.asyncio
async def test_preprint_citations_no_fabricated_references():
    import pymupdf
    from src.engines.preprint_generator import generate_preprint_pdf_buffer
    from src.core.canonical_models import CanonicalPaper

    # 1. Empty citations -> renders notice without fabricated citations
    pdf_empty = generate_preprint_pdf_buffer(
        title="Astrophysics Black Hole Radiative Transfer",
        authors=["E. Hubble"],
        abstract="Simulations of accretion disk physics.",
    )
    doc_empty = pymupdf.open(stream=pdf_empty, filetype="pdf")
    text_empty = doc_empty[1].get_text()
    assert "No canonical citations were linked" in text_empty
    assert "Attention Is All You Need" not in text_empty
    assert "BERT:" not in text_empty
    assert "ColBERT:" not in text_empty
    assert "SPLADE:" not in text_empty

    # 2. Provided citations -> renders actual citations from paper.citations
    paper = CanonicalPaper(
        canonical_id="doi:10.1000/182",
        title="Astrophysics Black Hole Radiative Transfer",
        citations=[
            {"title": "Relativistic Accretion Disks", "authors": "Novikov & Thorne", "year": 1973},
            "Shakura & Sunyaev (1973). Black holes in binary systems. A&A.",
        ],
    )
    pdf_paper = generate_preprint_pdf_buffer(paper=paper)
    doc_paper = pymupdf.open(stream=pdf_paper, filetype="pdf")
    text_paper = doc_paper[1].get_text()
    assert "Relativistic Accretion Disks" in text_paper
    assert "Shakura & Sunyaev" in text_paper
    assert "No canonical citations were linked" not in text_paper
    assert "Attention Is All You Need" not in text_paper






