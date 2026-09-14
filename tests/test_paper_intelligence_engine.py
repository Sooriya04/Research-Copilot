import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app
from src.core.canonical_models import (
    CanonicalPaper, ExtractedClaim, PaperSummarizeRequest,
    StructuredPaperSummary, VerificationStatus
)
from src.core.database import get_db_session
from src.engines.claim_verifier import ClaimVerifier
from src.engines.paper_analyzer import PaperAnalyzer
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine
from src.providers.gemini import GeminiFlashLiteProvider

def test_gemini_flash_lite_offline_fallback():
    provider = GeminiFlashLiteProvider(api_key=None)
    analyzer = PaperAnalyzer(provider=provider)
    
    paper = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
    )
    
    pkg = analyzer.build_evidence_package(paper)
    assert "PAPER TITLE: Attention Is All You Need" in pkg
    assert "ABSTRACT:" in pkg

def test_claim_verifier_logic():
    verifier = ClaimVerifier()
    paper = CanonicalPaper(
        canonical_id="test:1",
        title="Scaling Laws for Neural Models",
        abstract="We observe cross-entropy loss scales as a power-law with model size and dataset size.",
    )
    
    claims = [
        ExtractedClaim(
            claim="Cross-entropy loss scales as a power-law with model size and dataset size.",
            evidence="cross-entropy loss scales as a power-law with model size and dataset size.",
            confidence=0.99
        ),
        ExtractedClaim(
            claim="The model achieves quantum supremacy in polynomial time.",
            evidence="Completely fabricated unsupported sentence.",
            confidence=0.10
        )
    ]
    
    verified = verifier.verify_claims(paper, claims)
    assert len(verified) == 2
    assert verified[0].verification_status in [VerificationStatus.VERIFIED, VerificationStatus.INFERRED]
    assert verified[1].verification_status == VerificationStatus.UNVERIFIED

@pytest.mark.asyncio
async def test_summarize_paper_endpoint_end_to_end_and_caching():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Force Refresh Request (Ensures full execution pipeline runs and caches)
        resp1 = await client.post("/api/v1/paper/summarize", json={"identifier": "1706.03762", "force_refresh": True})
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["cached"] is False
        assert "canonical_paper" in data1
        assert "Attention" in data1["canonical_paper"]["title"]
        assert data1["canonical_paper"]["summary"] is not None
        assert len(data1["canonical_paper"]["summary"]["claims"]) >= 1

        # 2. Second Request (Must hit SQLite Cache immediately)
        resp2 = await client.post("/api/v1/paper/summarize", json={"identifier": "1706.03762", "force_refresh": False})
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["cached"] is True
        assert data2["canonical_paper"]["canonical_id"] == data1["canonical_paper"]["canonical_id"]


@pytest.mark.asyncio
async def test_pdf_upload_and_markdown_conversion():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a simple synthetic PDF bytes in-memory with PyMuPDF
        import pymupdf as fitz
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 72), "Attention Is All You Need\nAshish Vaswani, Noam Shazeer\nAbstract: We propose Transformer.")
        page.insert_text((50, 150), "1. Introduction\nRecurrent neural networks have long been the state of the art.")
        page.insert_text((50, 250), "2. Methodology\nScaled dot-product attention computes Attention(Q,K,V) = softmax(QK^T / sqrt(d_k))V.")
        pdf_bytes = doc.tobytes()

        files = {"file": ("attention.pdf", pdf_bytes, "application/pdf")}
        resp = await client.post("/api/v1/paper/upload", files=files)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "paper" in data
        assert "markdown" in data["paper"]
        assert "Attention" in data["paper"]["title"] or "attention" in data["paper"]["id"]


@pytest.mark.asyncio
async def test_research_chat_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "messages": [
                {"role": "user", "content": "Explain the attention mechanism in Transformers."}
            ],
            "paper_title": "Attention Is All You Need",
            "workspace_topic": "Transformers",
        }
        resp = await client.post("/api/v1/chat/message", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "response" in data
        assert len(data["response"]) > 10
        assert data["status"] in ["success", "fallback"]

