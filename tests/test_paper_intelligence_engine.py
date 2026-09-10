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
