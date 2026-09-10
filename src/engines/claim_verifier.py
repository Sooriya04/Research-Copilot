import re
from typing import List
from src.core.canonical_models import CanonicalPaper, ExtractedClaim, VerificationStatus
from src.core.logger import logger

class ClaimVerifier:
    """Verifies LLM-extracted claims against ground-truth paper text and benchmark records."""

    def verify_claims(self, paper: CanonicalPaper, claims: List[ExtractedClaim]) -> List[ExtractedClaim]:
        """Verify each claim against paper text and benchmark tables, updating verification_status."""
        full_corpus = (paper.abstract or "").lower() + " "
        for sec in paper.sections:
            full_corpus += (sec.content or "").lower() + " "

        benchmark_map = {
            b.metric.lower(): b.value.lower()
            for b in paper.benchmarks
            if b.metric and b.value
        }

        verified_claims: List[ExtractedClaim] = []

        for c in claims:
            status = VerificationStatus.UNVERIFIED
            notes = []

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
                evidence_tokens = self._tokenize(c.evidence) if c.evidence else []

                # Check if evidence snippet exists in corpus
                if c.evidence and len(c.evidence) > 15 and c.evidence.lower() in full_corpus:
                    status = VerificationStatus.VERIFIED
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
            c.verification_notes = " ".join(notes)
            verified_claims.append(c)

        logger.info("[ClaimVerifier] Verified %d claims: %s", len(verified_claims),
                    {s.value: sum(1 for c in verified_claims if c.verification_status == s) for s in VerificationStatus})
        return verified_claims

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[A-Za-z0-9_-]{3,}\b", text.lower())
        stop_words = {"the", "and", "for", "with", "that", "this", "from", "model", "paper", "method"}
        return [w for w in words if w not in stop_words]
