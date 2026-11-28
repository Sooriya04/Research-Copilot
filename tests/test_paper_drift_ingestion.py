import pytest
from unittest.mock import AsyncMock, MagicMock
from src.core.database import AsyncSessionLocal
from src.rag.ingestion import PaperIngestionService
from src.rag.embeddings import BaseEmbeddingProvider
from src.engines.paper_drift_client import PaperDriftClient


class MockEmbeddingProvider(BaseEmbeddingProvider):
    async def embed_text(self, text: str):
        return [0.1] * 768

    async def embed_batch(self, texts):
        return [[0.1] * 768 for _ in texts]


@pytest.mark.asyncio
async def test_paper_ingestion_with_paper_drift_success():
    """Verify that PaperIngestionService uses paper-drift chunks when available."""
    mock_drift = MagicMock(spec=PaperDriftClient)
    mock_drift.chunk_pdf = AsyncMock(return_value=[
        {
            "chunk_id": "chunk-1",
            "section": "1 Introduction",
            "page": 1,
            "content": "Attention is all you need paper introduction and abstract.",
            "has_math": False,
            "has_table": False,
        },
        {
            "chunk_id": "chunk-2",
            "section": "3 Architecture",
            "page": 2,
            "content": "The Transformer uses multi-head attention: $$Attention(Q, K, V) = softmax(QK^T/\\sqrt{d})V$$.",
            "has_math": True,
            "has_table": False,
        },
    ])

    service = PaperIngestionService(
        embedding_provider=MockEmbeddingProvider(),
        paper_drift_client=mock_drift,
    )

    async with AsyncSessionLocal() as db:
        doc = await service.ingest_pdf_bytes(
            paper_id="test-paper-drift-001",
            pdf_bytes=b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF" * 10,
            title="Transformer Architecture Evaluation",
            db=db,
        )

        assert doc.id == "test-paper-drift-001"
        assert doc.title == "Transformer Architecture Evaluation"
        assert doc.page_count == 2
        assert doc.metadata_json.get("engine") == "paper-drift"
        mock_drift.chunk_pdf.assert_awaited_once()


@pytest.mark.asyncio
async def test_paper_ingestion_fallback_to_pymupdf():
    """Verify that PaperIngestionService falls back to PyMuPDF when paper-drift returns None."""
    mock_drift = MagicMock(spec=PaperDriftClient)
    mock_drift.chunk_pdf = AsyncMock(return_value=None)  # Simulates sidecar down

    # Create a real mini valid PDF with fitz
    import pymupdf as fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Fallback Paper Title\n\nAbstract: This is a fallback test.")
    pdf_bytes = doc.tobytes()
    doc.close()

    service = PaperIngestionService(
        embedding_provider=MockEmbeddingProvider(),
        paper_drift_client=mock_drift,
    )

    async with AsyncSessionLocal() as db:
        doc = await service.ingest_pdf_bytes(
            paper_id="test-paper-fallback-002",
            pdf_bytes=pdf_bytes,
            db=db,
        )

        assert doc.id == "test-paper-fallback-002"
        assert "Fallback Paper" in doc.title
        assert doc.page_count == 1
        mock_drift.chunk_pdf.assert_awaited_once()
