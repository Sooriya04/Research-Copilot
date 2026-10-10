import re
from typing import Dict, List, Optional, Tuple
from src.core.canonical_models import CanonicalPaper, ExtractedClaim, VerificationStatus
from src.core.logger import logger

class ClaimVerifier:
    """Verifies LLM-extracted claims against ground-truth paper text and benchmark records."""

    LIGATURE_MAP = {
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬀ": "ff",
        "ﬃ": "ffi",
        "ﬄ": "ffl",
        "–": "-",
        "—": "-",
        "“": "\"",
        "”": "\"",
        "‘": "'",
        "’": "'",
    }

    def normalize_text(self, text: str) -> str:
        """Strip ligatures, de-hyphenate linebreaks, and collapse whitespace."""
        if not text:
            return ""
        for lig, repl in self.LIGATURE_MAP.items():
            text = text.replace(lig, repl)
        # De-hyphenate broken words across linebreaks, e.g. "multi-\nhead" -> "multihead"
        text = re.sub(r"(\b[A-Za-z0-9]+)-\s*\n\s*([A-Za-z0-9]+\b)", r"\1\2", text)
        # Replace remaining newlines/tabs with space
        text = re.sub(r"[\r\n\t]+", " ", text)
        # Collapse whitespace and lowercase
        return re.sub(r"\s+", " ", text).strip().lower()

    def verify_excerpt_on_page(self, page_text: str, excerpt: str) -> Tuple[bool, float, Optional[str]]:
        """
        Check excerpt against single page text.
        Returns:
            (is_mechanically_verified, token_coverage, matched_substring)
        """
        if not page_text or not excerpt:
            return False, 0.0, None

        norm_page = self.normalize_text(page_text)
        norm_excerpt = self.normalize_text(excerpt)

        if not norm_excerpt:
            return False, 0.0, None

        # 1. Exact substring check (mechanical verification)
        if norm_excerpt in norm_page:
            return True, 1.0, excerpt.strip()

        # 2. Fuzzy token overlap check
        excerpt_tokens = self._tokenize(norm_excerpt)
        if not excerpt_tokens:
            return False, 0.0, None

        page_tokens = set(self._tokenize(norm_page))
        matched = [t for t in excerpt_tokens if t in page_tokens]
        coverage = len(matched) / len(excerpt_tokens)

        return False, round(coverage, 3), None

    def verify_claims_against_pages(self, claims: List[ExtractedClaim], pages_text: Dict[int, str]) -> List[ExtractedClaim]:
        """Verify extracted claims against per-page text layers extracted by PDF parser."""
        for c in claims:
            target_text = c.evidence if c.evidence and len(c.evidence.strip()) > 5 else c.claim
            if not target_text:
                continue

            verified_page = None
            # Check specified page first
            if c.page is not None and c.page in pages_text:
                is_mech, cov, _ = self.verify_excerpt_on_page(pages_text[c.page], target_text)
                if is_mech:
                    verified_page = c.page

            # If not verified on specified page, search all pages
            if verified_page is None:
                for page_num, p_text in pages_text.items():
                    is_mech, cov, _ = self.verify_excerpt_on_page(p_text, target_text)
                    if is_mech:
                        verified_page = page_num
                        break

            if verified_page is not None:
                c.page = verified_page
                c.mechanically_verified = True
                c.verification_status = VerificationStatus.VERIFIED
                c.verification_notes = f"Mechanically verified exact quote on page {verified_page}."
            else:
                # Evaluate best fuzzy coverage across pages
                best_page = None
                best_cov = 0.0
                for page_num, p_text in pages_text.items():
                    _, cov, _ = self.verify_excerpt_on_page(p_text, target_text)
                    if cov > best_cov:
                        best_cov = cov
                        best_page = page_num

                if best_cov >= 0.85:
                    c.page = c.page or best_page
                    c.verification_status = VerificationStatus.INFERRED
                    c.verification_notes = f"Strong semantic coverage ({int(best_cov * 100)}%) on page {best_page or 1}."

        return claims

    def verify_claims(self, paper: CanonicalPaper, claims: List[ExtractedClaim]) -> List[ExtractedClaim]:
        """Verify each claim against paper text and benchmark tables, updating verification_status."""
        full_corpus = (paper.abstract or "").lower() + " "
        for sec in paper.sections:
            full_corpus += (sec.content or "").lower() + " "
        norm_corpus = self.normalize_text(full_corpus)

        benchmark_map = {
            b.metric.lower(): b.value.lower()
            for b in paper.benchmarks
            if b.metric and b.value
        }

        verified_claims: List[ExtractedClaim] = []

        for c in claims:
            status = VerificationStatus.UNVERIFIED
            notes = []
            is_mech = False

            # 1. Verification via Benchmark Evidence (Papers With Code)
            if c.metric and c.value:
                metric_key = c.metric.lower()
                val_str = str(c.value).lower().strip()
                if metric_key in benchmark_map and val_str in benchmark_map[metric_key]:
                    status = VerificationStatus.VERIFIED
                    notes.append(f"Direct match in Papers With Code benchmark table ({c.metric}={c.value}).")

            # 2. Verification via Full-Text Corpus Search
            if status != VerificationStatus.VERIFIED:
                claim_tokens = self._tokenize(c.claim)
                norm_evidence = self.normalize_text(c.evidence) if c.evidence else ""

                # Check if evidence snippet exists verbatim in normalized corpus
                if norm_evidence and len(norm_evidence) > 15 and norm_evidence in norm_corpus:
                    status = VerificationStatus.VERIFIED
                    is_mech = True
                    notes.append("Evidence quote confirmed verbatim in paper full text.")
                elif c.evidence and len(c.evidence) > 15 and c.evidence.lower() in full_corpus:
                    status = VerificationStatus.VERIFIED
                    is_mech = True
                    notes.append("Evidence quote confirmed verbatim in paper full text.")
                else:
                    # Token coverage check
                    matched_claim_tokens = [t for t in claim_tokens if t in full_corpus]
                    coverage = len(matched_claim_tokens) / len(claim_tokens) if claim_tokens else 0.0

                    if coverage > 0.75:
                        status = VerificationStatus.INFERRED
                        notes.append(f"Strong semantic coverage ({int(coverage * 100)}%) in text sections.")
                    elif coverage > 0.45:
                        status = VerificationStatus.INFERRED
                        notes.append(f"Partial text coverage ({int(coverage * 100)}%).")
                    else:
                        status = VerificationStatus.UNVERIFIED
                        notes.append("Insufficient textual grounding detected.")

            c.verification_status = status
            c.mechanically_verified = is_mech
            c.verification_notes = " ".join(notes)
            verified_claims.append(c)

        logger.info("[ClaimVerifier] Verified %d claims: %s", len(verified_claims),
                    {s.value: sum(1 for c in verified_claims if c.verification_status == s) for s in VerificationStatus})
        return verified_claims

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[A-Za-z0-9_-]{3,}\b", text.lower())
        stop_words = {"the", "and", "for", "with", "that", "this", "from", "model", "paper", "method"}
        return [w for w in words if w not in stop_words]
