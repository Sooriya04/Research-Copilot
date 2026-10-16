"""
Unit and integration tests for Evidence-Grounded Studio Foundational Prerequisites.
Verifies:
1. Page-Indexed PDF Ingestion & Coordinate Engine
2. Deterministic Substring Excerpt Verifier & Locator
3. PDF Figure & Table Visual Extraction Engine
4. Unified Evidence & Audit Schemas (Pydantic & SQLite)
5. Multi-Pass Structured Extraction Pipeline
6. Evidence Studio API Endpoints
"""

import io
import pytest
from httpx import AsyncClient, ASGITransport
import pymupdf as fitz
from src.api.app import app
from src.core.database import init_db, AsyncSessionLocal
from src.core.evidence_schemas import (
    ClaimItem,
    ClaimKind,
    ClaimConfidence,
    SourceReference,
    PageIndexedDocument,
    PageData,
    WordBox,
)
from src.engines.pdf_coordinate_engine import PDFCoordinateEngine
from src.engines.excerpt_verifier import DeterministicExcerptVerifier
from src.engines.pdf_visual_extractor import PDFVisualExtractor
from src.engines.multi_pass_extractor import MultiPassEvidenceExtractor

def create_synthetic_pdf() -> bytes:
    """Generate a clean 2-page in-memory PDF with known text and coordinates."""
    doc = fitz.open()
    # Page 1: Introduction and proposed method
    p1 = doc.new_page(width=600, height=800)
    p1.insert_text((50, 50), "Attention Is All You Need", fontsize=16)
    p1.insert_text((50, 100), "Abstract", fontsize=12)
    p1.insert_text(
        (50, 130),
        "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
        fontsize=10
    )
    p1.insert_text(
        (50, 180),
        "The dominant sequence transduction models are based on complex recurrent networks.",
        fontsize=10
    )
    p1.insert_text(
        (50, 300),
        "Figure 1: The Transformer model architecture.",
        fontsize=10
    )

    # Page 2: Results and Limitations
    p2 = doc.new_page(width=600, height=800)
    p2.insert_text((50, 50), "Experimental Results", fontsize=14)
    p2.insert_text(
        (50, 90),
        "On the WMT 2014 English-to-German translation task, the model achieved a BLEU score of 28.4.",
        fontsize=10
    )
    p2.insert_text(
        (50, 150),
        "Table 1: Comparison of Transformer against standard baselines.",
        fontsize=10
    )
    p2.insert_text(
        (50, 300),
        "Limitation: The compute budget required 3.5 days of training on 8 P100 GPUs.",
        fontsize=10
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.mark.asyncio
async def test_pdf_coordinate_engine():
    """Verify coordinate engine parses page-indexed structures and words with coordinates."""
    pdf_bytes = create_synthetic_pdf()
    engine = PDFCoordinateEngine()
    doc = engine.parse_pdf(pdf_bytes, paper_id="test-doc-1")

    assert doc.page_count == 2
    assert len(doc.pages) == 2

    # Check page 1 structure
    p1 = doc.pages[0]
    assert p1.page_number == 1
    assert p1.width == 600.0
    assert p1.height == 800.0
    assert "Transformer" in p1.text
    assert len(p1.words) > 10

    # Test excerpt coordinate location
    excerpt = "We propose a new simple network architecture"
    rects = engine.locate_excerpt_rects(p1, excerpt)
    assert len(rects) >= 1
    r = rects[0]
    # Check normalized bounds [0.0 - 1.0]
    assert 0.0 <= r.x <= 1.0
    assert 0.0 <= r.y <= 1.0
    assert 0.0 < r.width <= 1.0
    assert 0.0 < r.height <= 1.0


@pytest.mark.asyncio
async def test_deterministic_excerpt_verifier():
    """Verify deterministic quote authenticity, ligature handling, and hallucination downgrades."""
    pdf_bytes = create_synthetic_pdf()
    engine = PDFCoordinateEngine()
    doc = engine.parse_pdf(pdf_bytes, paper_id="test-doc-2")
    verifier = DeterministicExcerptVerifier()

    # 1. Exact match on cited page
    ref_valid = SourceReference(
        source_id="paper",
        page=1,
        excerpt="We propose a new simple network architecture, the Transformer"
    )
    verified_ref = verifier.locate_and_verify_reference(ref_valid, doc)
    assert verified_ref.exact_match is True
    assert verified_ref.page == 1
    assert len(verified_ref.highlight_rects) >= 1

    # 2. Adjacent page auto-resolution (quote on page 2, user passed page 1)
    ref_page_split = SourceReference(
        source_id="paper",
        page=1,
        excerpt="achieved a BLEU score of 28.4"
    )
    resolved_ref = verifier.locate_and_verify_reference(ref_page_split, doc)
    assert resolved_ref.exact_match is True
    assert resolved_ref.page == 2  # Relocated to page 2

    # 3. Hallucinated / fabricated claim test (must be downgraded)
    claims = [
        ClaimItem(
            id="c1",
            statement="Transformer uses attention mechanisms.",
            confidence=ClaimConfidence.VERIFIED,
            source_refs=[SourceReference(source_id="paper", page=1, excerpt="based solely on attention mechanisms")]
        ),
        ClaimItem(
            id="c2",
            statement="Fabricated statement never written in the paper.",
            confidence=ClaimConfidence.VERIFIED,
            source_refs=[SourceReference(source_id="paper", page=1, excerpt="This completely fabricated sentence does not exist anywhere in the text.")]
        )
    ]

    verified_claims, audit = verifier.audit_and_verify_claims(claims, doc)
    # c1 must remain verified
    assert verified_claims[0].confidence == ClaimConfidence.VERIFIED
    # c2 must be downgraded to needs-review
    assert verified_claims[1].confidence == ClaimConfidence.NEEDS_REVIEW
    assert "could not be mechanically located" in verified_claims[1].reviewer_note

    # Verify audit health
    assert audit.total_claims == 2
    assert audit.verified_claims == 1
    assert audit.needs_review_claims == 1
    assert audit.quote_match_rate == 0.5


@pytest.mark.asyncio
async def test_pdf_visual_extractor():
    """Verify figure and table caption extraction and vector graphics cropping."""
    pdf_bytes = create_synthetic_pdf()
    extractor = PDFVisualExtractor()
    assets = extractor.extract_visual_assets(pdf_bytes, paper_id="test-doc-3")

    assert len(assets) >= 1
    labels = [a.label for a in assets]
    assert any("Figure 1" in l or "Table 1" in l for l in labels)

    for a in assets:
        assert a.image_data_url.startswith("data:image/png;base64,")
        assert a.page in [1, 2]
        assert len(a.bbox) == 4


@pytest.mark.asyncio
async def test_multi_pass_extractor():
    """Verify 4-pass extraction pipeline assembling overview, metrics, glossary, and timeline."""
    pdf_bytes = create_synthetic_pdf()
    engine = PDFCoordinateEngine()
    doc = engine.parse_pdf(pdf_bytes, paper_id="test-doc-4")

    extractor = MultiPassEvidenceExtractor()
    pkg = await extractor.extract_evidence_package(doc=doc, pdf_bytes=pdf_bytes)

    assert pkg.paper_id == "test-doc-4"
    assert len(pkg.claims) >= 1
    assert len(pkg.metrics) >= 1
    assert len(pkg.timeline) == 6
    assert pkg.audit is not None


@pytest.mark.asyncio
async def test_evidence_api_endpoints():
    """Verify full end-to-end evidence ingestion and audit API endpoints."""
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Ingest evidence
        ingest_payload = {
            "paper_id": "test-paper-api-1",
            "title": "Synthetic Attention Paper",
            "force_refresh": True,
        }
        res = await client.post("/api/v1/evidence/ingest", json=ingest_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["paper_id"] == "test-paper-api-1"
        assert "claims" in data
        assert "metrics" in data

        # 2. Get evidence
        get_res = await client.get("/api/v1/evidence/test-paper-api-1")
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["title"] == "Synthetic Attention Paper"

        # 3. Verify excerpt with coordinates
        verify_res = await client.post("/api/v1/evidence/verify-excerpt", json={
            "paper_id": "test-paper-api-1",
            "page": 1,
            "excerpt": "Evaluation primarily targets standardized benchmark distributions"
        })
        assert verify_res.status_code == 200
        v_data = verify_res.json()
        assert "exact_match" in v_data
        assert "highlight_rects" in v_data

        # 4. Audit endpoint
        audit_res = await client.get("/api/v1/evidence/test-paper-api-1/audit")
        assert audit_res.status_code == 200
        a_data = audit_res.json()
        assert "total_claims" in a_data

        # 5. Claim review sign-off
        claims = get_data.get("claims", [])
        if claims:
            claim_id = claims[0]["id"]
            review_res = await client.post(
                "/api/v1/evidence/test-paper-api-1/claims/review",
                json={
                    "claim_id": claim_id,
                    "reviewer_status": "accepted",
                    "note": "Verified by reviewer"
                }
            )
            assert review_res.status_code == 200
            r_data = review_res.json()
            assert r_data["review_status"] == "accepted"
