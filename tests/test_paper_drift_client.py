import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from src.engines.paper_drift_client import PaperDriftClient
from src.api.routes_settings import _test_paper_drift_service


@pytest.mark.asyncio
async def test_paper_drift_client_init():
    client = PaperDriftClient(base_url="http://localhost:7490/", timeout=15.0, enabled=True, max_chunk_chars=1200)
    assert client.base_url == "http://localhost:7490"
    assert client.timeout == 15.0
    assert client.enabled is True
    assert client.max_chunk_chars == 1200


@pytest.mark.asyncio
async def test_paper_drift_is_available_disabled():
    client = PaperDriftClient(enabled=False)
    assert await client.is_available() is False


@pytest.mark.asyncio
async def test_paper_drift_is_available_online():
    client = PaperDriftClient(base_url="http://localhost:7490")
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        avail = await client.is_available(force_refresh=True)
        assert avail is True
        mock_get.assert_called_once_with("http://localhost:7490/api/health")


@pytest.mark.asyncio
async def test_paper_drift_is_available_offline():
    client = PaperDriftClient(base_url="http://localhost:7490")
    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Connection refused")):
        avail = await client.is_available(force_refresh=True)
        assert avail is False


@pytest.mark.asyncio
async def test_paper_drift_chunk_pdf_success():
    client = PaperDriftClient(base_url="http://localhost:7490")
    fake_chunks = [
        {"chunk_id": "c1", "section": "1 Introduction", "page": 1, "content": "Transformer model details", "has_math": True, "has_table": False},
        {"chunk_id": "c2", "section": "2 Architecture", "page": 2, "content": "$$E = mc^2$$", "has_math": True, "has_table": True},
    ]
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_chunks

    with patch.object(client, "is_available", new_callable=AsyncMock) as mock_avail:
        mock_avail.return_value = True
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            chunks = await client.chunk_pdf(b"%PDF-1.4 dummy binary content")
            assert chunks == fake_chunks
            assert len(chunks) == 2


@pytest.mark.asyncio
async def test_paper_drift_chunk_pdf_fail_open_on_timeout():
    client = PaperDriftClient(base_url="http://localhost:7490")
    with patch.object(client, "is_available", new_callable=AsyncMock) as mock_avail:
        mock_avail.return_value = True
        with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Timed out")):
            chunks = await client.chunk_pdf(b"%PDF-1.4 dummy binary content")
            assert chunks is None


@pytest.mark.asyncio
async def test_paper_drift_chunk_pdf_fail_open_on_connect_error():
    client = PaperDriftClient(base_url="http://localhost:7490")
    with patch.object(client, "is_available", new_callable=AsyncMock) as mock_avail:
        mock_avail.return_value = True
        with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("Connection refused")):
            chunks = await client.chunk_pdf(b"%PDF-1.4 dummy binary content")
            assert chunks is None


@pytest.mark.asyncio
async def test_paper_drift_convert_markdown():
    client = PaperDriftClient(base_url="http://localhost:7490")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"success": True, "markdown": "# Title\n\nContent", "totalPages": 1}

    with patch.object(client, "is_available", new_callable=AsyncMock) as mock_avail:
        mock_avail.return_value = True
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            res = await client.convert_to_markdown(b"%PDF-1.4 dummy")
            assert res is not None
            assert res["markdown"] == "# Title\n\nContent"


@pytest.mark.asyncio
async def test_paper_drift_extract_figures_and_first_diagram():
    client = PaperDriftClient(base_url="http://localhost:7490")
    fake_bundle = {
        "pages": [
            {
                "pageNumber": 1,
                "figures": [
                    {
                        "type": "figure",
                        "caption": "Figure 1: The Model Architecture",
                        "dataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                        "box": [10, 10, 200, 200],
                    }
                ],
                "dataUrl": "data:image/png;base64,page1overview",
            }
        ]
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_bundle

    with patch.object(client, "is_available", new_callable=AsyncMock) as mock_avail:
        mock_avail.return_value = True
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            figures = await client.extract_figures(b"%PDF-1.4 dummy")
            assert figures is not None
            assert len(figures) == 1
            assert figures[0]["caption"] == "Figure 1: The Model Architecture"
            assert figures[0]["data_url"].startswith("data:image/png;base64")

            # Test extract_first_diagram
            first = await client.extract_first_diagram(b"%PDF-1.4 dummy")
            assert first is not None
            assert first["caption"] == "Figure 1: The Model Architecture"


@pytest.mark.asyncio
async def test_settings_test_paper_drift_service():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"status": "ok", "version": "0.1.6", "uptime": 100}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        res = await _test_paper_drift_service("http://localhost:7490")
        assert res["success"] is True
        assert "v0.1.6" in res["message"]
