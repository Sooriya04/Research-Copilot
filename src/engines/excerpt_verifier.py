"""
Deterministic Substring Excerpt Verifier & Locator for Research-Copilot.
Mathematically scans LLM-extracted excerpts against normalized page text,
verifies quote authenticity, flags hallucinations, and produces bounding boxes.
"""

from datetime import datetime, timezone
import re
from typing import Dict, List, Optional, Tuple, Any
from src.core.logger import logger
from src.core.evidence_schemas import (
    HighlightRect,
    SourceReference,
    ClaimItem,
    ClaimConfidence,
    EvidenceAuditResult,
    PageIndexedDocument,
    PageData,
)
from src.engines.pdf_coordinate_engine import PDFCoordinateEngine

class DeterministicExcerptVerifier:
    """Verifies scientific excerpts against per-page PDF text layers and computes bounding boxes."""

    def __init__(self):
        self.coord_engine = PDFCoordinateEngine()

    def normalize(self, text: str) -> str:
        """Strip ligatures, dehyphenate, and collapse whitespace."""
        return self.coord_engine.normalize_for_match(text)

    def letters_only(self, text: str) -> str:
        """Alphanumeric projection for resilient column/linebreak matching."""
        return self.coord_engine.letters_only(text)

    def verify_excerpt_on_page_text(self, page_text: str, excerpt: str) -> Tuple[bool, float]:
        """
        Check excerpt against a single page text string.
        Returns (is_exact_or_substring_match, token_overlap_ratio).
        """
        if not page_text or not excerpt:
            return False, 0.0

        norm_page = self.normalize(page_text)
        norm_excerpt = self.normalize(excerpt)
        if not norm_excerpt:
            return False, 0.0

        # Exact substring check
        if norm_excerpt in norm_page:
            return True, 1.0

        # Compact alphanumeric check
        comp_page = self.letters_only(norm_page)
        comp_excerpt = self.letters_only(norm_excerpt)
        if comp_excerpt and len(comp_excerpt) >= 8 and comp_excerpt in comp_page:
            return True, 1.0

        # Fragment checking across ellipses ("...", "…")
        fragments = [
            self.letters_only(f)
            for f in re.split(r"\s*(?:\.{3}|…|\[\.{3}\])\s*", norm_excerpt)
            if len(self.letters_only(f)) >= 10
        ]
        if fragments and all(f in comp_page for f in fragments):
            return True, 1.0

        # Token overlap ratio
        words_excerpt = [w for w in re.split(r"\W+", norm_excerpt) if len(w) >= 3]
        if not words_excerpt:
            return False, 0.0
        words_page = set(re.split(r"\W+", norm_page))
        matched = [w for w in words_excerpt if w in words_page]
        ratio = len(matched) / max(len(words_excerpt), 1)

        # High-confidence token match threshold
        return ratio >= 0.85, round(ratio, 3)

    def locate_and_verify_reference(
        self,
        ref: SourceReference,
        doc: PageIndexedDocument,
    ) -> SourceReference:
        """
        Verify a SourceReference against a PageIndexedDocument.
        Updates page (if found on neighbor), exact_match, and highlight_rects.
        """
        if not doc.pages or not ref.excerpt:
            ref.exact_match = False
            return ref

        page_map: Dict[int, PageData] = {p.page_number: p for p in doc.pages}
        target_page = ref.page or 1
        matched_page = None
        exact_match = False

        # 1. Check target page
        if target_page in page_map:
            p_data = page_map[target_page]
            is_match, ratio = self.verify_excerpt_on_page_text(p_data.text, ref.excerpt)
            if is_match:
                matched_page = target_page
                exact_match = True

        # 2. Check adjacent pages (window [-1, +1]) in case of page split
        if not exact_match:
            for neighbor in [target_page - 1, target_page + 1]:
                if neighbor in page_map:
                    is_match, _ = self.verify_excerpt_on_page_text(page_map[neighbor].text, ref.excerpt)
                    if is_match:
                        matched_page = neighbor
                        exact_match = True
                        break

        # 3. Check all other pages if not located in local window
        if not exact_match:
            for p_num, p_data in page_map.items():
                if p_num not in [target_page, target_page - 1, target_page + 1]:
                    is_match, _ = self.verify_excerpt_on_page_text(p_data.text, ref.excerpt)
                    if is_match:
                        matched_page = p_num
                        exact_match = True
                        break

        ref.exact_match = exact_match
        if matched_page is not None:
            ref.page = matched_page
            # Generate visual highlight bounding boxes
            ref.highlight_rects = self.coord_engine.locate_excerpt_rects(page_map[matched_page], ref.excerpt)
        else:
            ref.highlight_rects = []

        return ref

    def audit_and_verify_claims(
        self,
        claims: List[ClaimItem],
        doc: PageIndexedDocument,
    ) -> Tuple[List[ClaimItem], EvidenceAuditResult]:
        """
        Verify every claim against the document. Downgrades claims with unlocated quotes
        from verified to needs-review, and builds full EvidenceAuditResult.
        """
        page_count = max(doc.page_count, 1)
        cited_pages_set = set()
        unlocated: List[Dict[str, Any]] = []

        verified_count = 0
        needs_review_count = 0
        total_references = 0
        matched_references = 0

        verified_claims: List[ClaimItem] = []
        for claim in claims:
            any_ref_verified = False
            for ref in claim.source_refs:
                total_references += 1
                self.locate_and_verify_reference(ref, doc)
                if ref.exact_match:
                    matched_references += 1
                    any_ref_verified = True
                    if ref.page:
                        cited_pages_set.add(ref.page)
                else:
                    unlocated.append({
                        "claim_id": claim.id,
                        "statement": claim.statement[:80],
                        "cited_page": ref.page,
                        "excerpt": ref.excerpt[:80],
                    })

            # Mechanical rule: A claim cannot be "verified" if none of its citations were located
            if claim.confidence == ClaimConfidence.VERIFIED and not any_ref_verified:
                claim.confidence = ClaimConfidence.NEEDS_REVIEW
                claim.reviewer_note = "Quote excerpt could not be mechanically located on cited page."

            if claim.confidence == ClaimConfidence.VERIFIED:
                verified_count += 1
            else:
                needs_review_count += 1

            verified_claims.append(claim)

        # Calculate coverage metrics
        all_pages = set(range(1, page_count + 1))
        unreached_pages = sorted(list(all_pages - cited_pages_set))
        cited_pages = sorted(list(cited_pages_set))

        page_coverage_rate = round(len(cited_pages) / page_count, 3)
        quote_match_rate = round(matched_references / max(total_references, 1), 3)

        # Detect thin sections (< 2 claims covering major paper ranges)
        thin_sections = []
        if len(unreached_pages) > max(2, int(page_count * 0.4)):
            thin_sections.append(f"Uncovered page intervals: {unreached_pages[:6]}")
        if total_references < 4:
            thin_sections.append("Document has sparse evidence density (less than 4 citations extracted).")

        audit_result = EvidenceAuditResult(
            checked_at=datetime.now(timezone.utc).isoformat(),
            paper_id=doc.paper_id,
            page_count=page_count,
            total_claims=len(claims),
            verified_claims=verified_count,
            needs_review_claims=needs_review_count,
            quote_match_rate=quote_match_rate,
            page_coverage_rate=page_coverage_rate,
            cited_pages=cited_pages,
            unreached_pages=unreached_pages,
            thin_sections=thin_sections,
            unlocated_items=unlocated[:50]
        )

        return verified_claims, audit_result
