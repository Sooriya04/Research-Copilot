import pytest
from src.core.canonical_models import CanonicalPaper, ExtractedClaim, VerificationStatus
from src.engines.claim_verifier import ClaimVerifier

def test_claim_verifier_normalization():
    verifier = ClaimVerifier()
    
    # Ligatures and broken hyphenated words across linebreaks
    raw_text = "The multi-\nhead attention mechanism uses efﬁcient feed-\nforward networks."
    norm = verifier.normalize_text(raw_text)
    
    assert "multihead attention" in norm
    assert "efficient" in norm
    assert "feedforward networks" in norm

def test_verify_excerpt_on_page_exact():
    verifier = ClaimVerifier()
    page_text = "We propose the Transformer, a model architecture eschewing recurrence and relying entirely on an attention mechanism."
    excerpt = "architecture eschewing recurrence and relying entirely on an attention mechanism"
    
    is_mech, cov, matched = verifier.verify_excerpt_on_page(page_text, excerpt)
    assert is_mech is True
    assert cov == 1.0
    assert matched is not None

def test_verify_excerpt_on_page_fuzzy():
    verifier = ClaimVerifier()
    page_text = "The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality."
    excerpt = "Transformer enables parallelization reaching state of the art in translation"
    
    is_mech, cov, matched = verifier.verify_excerpt_on_page(page_text, excerpt)
    assert is_mech is False
    assert cov >= 0.70

def test_verify_claims_against_pages():
    verifier = ClaimVerifier()
    claims = [
        ExtractedClaim(
            claim="Transformer uses multi-head attention",
            evidence="eschewing recurrence and relying entirely on an attention mechanism",
            page=None
        ),
        ExtractedClaim(
            claim="Bleu score on WMT 2014 was 28.4",
            evidence="achieving 28.4 BLEU on the WMT 2014 English-to-German task",
            page=4
        )
    ]
    pages_text = {
        1: "Title: Attention Is All You Need. Abstract: eschewing recurrence and relying entirely on an attention mechanism.",
        4: "Experiments: achieving 28.4 BLEU on the WMT 2014 English-to-German task."
    }

    verified = verifier.verify_claims_against_pages(claims, pages_text)
    assert len(verified) == 2
    assert verified[0].mechanically_verified is True
    assert verified[0].page == 1
    assert verified[1].mechanically_verified is True
    assert verified[1].page == 4
