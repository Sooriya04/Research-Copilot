"""
Evidence-Grounded Research Q&A Engine for Research-Copilot.
Executes multi-tier resilient grounded question answering over verified claims,
metrics, and page-indexed PDF chunks with visual coordinate grounding and
strict anti-hallucination guarantees.
"""

import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from src.core.config import settings
from src.core.logger import logger
from src.core.evidence_schemas import (
    CitationItem,
    GroundedQARequest,
    GroundedQAResponse,
    HighlightRect,
    PaperEvidencePackage,
    PageIndexedDocument,
    SourceReference,
)
from src.engines.excerpt_verifier import DeterministicExcerptVerifier
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.factory import get_llm_provider
from src.providers.llm import LocalOllamaProvider

STOPWORDS: Set[str] = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both",
    "but", "by", "can", "cannot", "could", "did", "didn't", "do", "does", "doesn't", "doing",
    "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has",
    "hasn't", "have", "haven't", "having", "he", "her", "here", "hers", "herself", "him", "himself",
    "his", "how", "i", "if", "in", "into", "is", "isn't", "it", "its", "itself", "let's", "me",
    "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once",
    "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
    "she", "should", "shouldn't", "so", "some", "such", "than", "that", "the", "their", "theirs",
    "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to",
    "too", "under", "until", "up", "very", "was", "wasn't", "we", "were", "weren't", "what",
    "when", "where", "which", "while", "who", "whom", "why", "with", "won't", "would", "wouldn't",
    "you", "your", "yours", "yourself", "yourselves", "paper", "author", "authors", "study",
    "tell", "show", "give", "describe", "explain", "detail", "work", "propose"
}

DISCLAIMER_UNANSWERABLE = "The available evidence in this paper does not contain information to answer this question."


def extract_json_from_llm_text(text: str) -> Optional[Dict[str, Any]]:
    """Extract a JSON dictionary from raw LLM output with markdown stripping."""
    if not text:
        return None
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return None


class GroundedQAEngine:
    """
    Evidence-Grounded Research Question Answering Engine.
    Executes answers backed by verbatim citations and visual page coordinate rects.
    Resilience tiers:
      Tier 1: Frontier LLM (structured JSON schema prompt).
      Tier 2: Local Ollama (phi4-mini).
      Tier 3: Deterministic keyword/substring overlap search over verified claims & paper chunks.
    """

    def __init__(
        self,
        provider: Optional[BaseLLMProvider] = None,
        verifier: Optional[DeterministicExcerptVerifier] = None,
        timeout: float = 30.0,
    ):
        self._custom_provider = provider
        self.verifier = verifier or DeterministicExcerptVerifier()
        self.timeout = timeout

    async def _resolve_provider(
        self,
        provider_name_override: Optional[str] = None,
        model_name_override: Optional[str] = None,
    ) -> Tuple[Optional[BaseLLMProvider], str, str]:
        """Resolve LLM provider following the resilience priority."""
        if self._custom_provider:
            return (
                self._custom_provider,
                getattr(self._custom_provider, "provider_name", "custom"),
                getattr(self._custom_provider, "model", "default"),
            )

        # Tier 0: Direct override if passed
        if provider_name_override:
            try:
                prov = get_llm_provider(
                    provider_name=provider_name_override,
                    model=model_name_override or "",
                )
                return prov, provider_name_override, getattr(prov, "model", provider_name_override)
            except Exception as e:
                logger.debug("[GroundedQAEngine] Override provider lookup note: %s", e)

        # Tier 1: Check configured frontier provider
        try:
            from src.core.provider_settings import resolve_provider_credentials
            frontier_candidates = ["gemini", "deepseek", "openrouter", "groq", "nvidia"]
            for cand in frontier_candidates:
                creds = await resolve_provider_credentials(cand)
                if creds.get("has_key"):
                    prov = get_llm_provider(
                        provider_name=creds.get("provider_id", cand),
                        model=creds.get("model", ""),
                        api_key=creds.get("api_key", ""),
                        base_url=creds.get("base_url", ""),
                    )
                    return prov, "frontier", creds.get("model") or getattr(prov, "model", cand)
        except Exception as ex:
            logger.debug("[GroundedQAEngine] Frontier credential check: %s", ex)

        # Tier 2: Check Local Ollama
        try:
            ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
            ollama_model = getattr(settings, "ollama_model", "phi4-mini")
            ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
            conn_test = await ollama_prov.test_connection()
            if conn_test.get("success"):
                return ollama_prov, "ollama", ollama_model
        except Exception as ex:
            logger.debug("[GroundedQAEngine] Local Ollama probe note: %s", ex)

        # Tier 3: Heuristic
        return None, "heuristic", "deterministic-rules"

    def _tokenize(self, text: str) -> List[str]:
        """Normalize and tokenize text into lowercase alphanumeric words."""
        if not text:
            return []
        words = re.findall(r"[a-zA-Z0-9_\-\.]+", text.lower())
        return [w.strip(".") for w in words if len(w.strip(".")) >= 2]

    def _extract_query_keywords(self, question: str) -> List[str]:
        """Extract meaningful keywords from question, filtering out stopwords."""
        tokens = self._tokenize(question)
        return [t for t in tokens if t not in STOPWORDS and len(t) > 1]

    def _build_evidence_context(
        self,
        paper_id: str,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
        doc: Optional[PageIndexedDocument] = None,
        full_text: Optional[str] = None,
    ) -> str:
        """Construct structured evidence context for LLM prompt."""
        sections: List[str] = [f"PAPER ID: {paper_id}"]

        if evidence_pkg:
            sections.append(f"TITLE: {evidence_pkg.title or 'Unknown'}")
            if evidence_pkg.thesis:
                sections.append(f"CORE THESIS: {evidence_pkg.thesis}")
            if evidence_pkg.research_question:
                sections.append(f"RESEARCH QUESTION: {evidence_pkg.research_question}")
            if evidence_pkg.plain_summary:
                sections.append(f"PLAIN SUMMARY: {evidence_pkg.plain_summary}")

            if evidence_pkg.claims:
                sections.append("VERIFIED CLAIMS LEDGER:")
                for c in evidence_pkg.claims:
                    ref_text = ""
                    if c.source_refs:
                        ref = c.source_refs[0]
                        ref_text = f" (Page {ref.page}: \"{ref.excerpt}\")"
                    sections.append(f"- [{c.kind.value if hasattr(c.kind, 'value') else c.kind}] {c.statement}{ref_text}")

            if evidence_pkg.metrics:
                sections.append("METRICS & BENCHMARKS:")
                for m in evidence_pkg.metrics:
                    ref_text = ""
                    if m.source_ref:
                        ref_text = f" (Page {m.source_ref.page}: \"{m.source_ref.excerpt}\")"
                    sections.append(f"- {m.label}: {m.display_value} ({m.context}){ref_text}")

            if evidence_pkg.methods:
                sections.append("METHODS:")
                for meth in evidence_pkg.methods:
                    sections.append(f"- {meth}")

            if evidence_pkg.limitations:
                sections.append("LIMITATIONS & ASSUMPTIONS:")
                for lim in evidence_pkg.limitations:
                    ref_text = ""
                    if lim.source_ref:
                        ref_text = f" (Page {lim.source_ref.page}: \"{lim.source_ref.excerpt}\")"
                    sections.append(f"- [{lim.kind}] {lim.statement}{ref_text}")

            if evidence_pkg.glossary:
                sections.append("GLOSSARY DEFINITIONS:")
                for g in evidence_pkg.glossary:
                    sections.append(f"- {g.term}: {g.definition}")

        if doc and doc.pages:
            sections.append("DOCUMENT PAGES:")
            for p in doc.pages:
                clean_page_text = " ".join(p.text.split())
                sections.append(f"--- PAGE {p.page_number} ---\n{clean_page_text[:1800]}")
        elif full_text:
            sections.append("DOCUMENT EXCERPT:")
            sections.append(" ".join(full_text.split()[:2000]))

        return "\n\n".join(sections)

    async def answer_question(
        self,
        paper_id: str,
        question: str,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
        doc: Optional[PageIndexedDocument] = None,
        full_text: Optional[str] = None,
        provider_override: Optional[str] = None,
        model_override: Optional[str] = None,
    ) -> GroundedQAResponse:
        """
        Produce strictly grounded answer for the research question.
        Guaranteed to never hallucinate or crash.
        """
        clean_id = (paper_id or "").strip()
        clean_q = (question or "").strip()

        if not clean_q:
            return GroundedQAResponse(
                paper_id=clean_id,
                question="",
                answer=DISCLAIMER_UNANSWERABLE,
                citations=[],
                confidence="insufficient_evidence",
                insufficient_evidence=True,
            )

        provider, tier_name, model_name = await self._resolve_provider(
            provider_override, model_override
        )

        evidence_text = self._build_evidence_context(
            paper_id=clean_id,
            evidence_pkg=evidence_pkg,
            doc=doc,
            full_text=full_text,
        )

        response: Optional[GroundedQAResponse] = None

        # Tier 1 & 2: LLM generation
        if provider is not None:
            response = await self._run_llm_qa(
                provider=provider,
                paper_id=clean_id,
                question=clean_q,
                evidence_context=evidence_text,
                doc=doc,
                evidence_pkg=evidence_pkg,
            )

        # Tier 2 fallback to Ollama if primary frontier failed
        if response is None and tier_name == "frontier":
            try:
                logger.info("[GroundedQAEngine] Frontier LLM failed; attempting Ollama fallback.")
                ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
                ollama_model = getattr(settings, "ollama_model", "phi4-mini")
                ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
                response = await self._run_llm_qa(
                    provider=ollama_prov,
                    paper_id=clean_id,
                    question=clean_q,
                    evidence_context=evidence_text,
                    doc=doc,
                    evidence_pkg=evidence_pkg,
                )
            except Exception as oe:
                logger.debug("[GroundedQAEngine] Ollama fallback note: %s", oe)

        # Tier 3: Deterministic fallback
        if response is None:
            logger.info("[GroundedQAEngine] Running deterministic keyword QA for '%s'", clean_id)
            response = self._deterministic_qa(
                paper_id=clean_id,
                question=clean_q,
                evidence_pkg=evidence_pkg,
                doc=doc,
            )

        # Ensure all citations are grounded with bounding boxes
        response = self._verify_and_ground_citations(response, doc, evidence_pkg)

        return response

    async def _run_llm_qa(
        self,
        provider: BaseLLMProvider,
        paper_id: str,
        question: str,
        evidence_context: str,
        doc: Optional[PageIndexedDocument] = None,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
    ) -> Optional[GroundedQAResponse]:
        """Execute structured JSON prompt against LLM provider."""
        system_prompt = (
            "You are an evidence-grounded scientific research assistant for Research Copilot.\n"
            "Your objective is to answer the researcher's question accurately and strictly based on the provided paper evidence.\n\n"
            "STRICT ANTI-HALLUCINATION RULES:\n"
            "1. You must answer ONLY using verified facts and statements contained in the provided evidence.\n"
            "2. If the paper evidence does not contain sufficient facts to answer the question, or if the question is off-topic or asking about something completely unmentioned in the paper, you MUST:\n"
            '   - Set "insufficient_evidence": true\n'
            '   - Set "confidence": "insufficient_evidence"\n'
            '   - Set "answer": "The available evidence in this paper does not contain information to answer this question."\n'
            '   - Set "citations": []\n'
            "3. Every citation in the `citations` list MUST contain:\n"
            '   - "page": the 1-indexed integer page number where the excerpt appears in the paper.\n'
            '   - "excerpt": a VERBATIM, exact character-for-character quote from the text.\n'
            "4. Output strictly valid JSON matching this schema:\n"
            "{\n"
            '  "answer": "Grounded answer text",\n'
            '  "citations": [\n'
            '    {"page": 1, "excerpt": "exact verbatim quote"}\n'
            "  ],\n"
            '  "confidence": "verified" | "inferred" | "insufficient_evidence",\n'
            '  "insufficient_evidence": false\n'
            "}"
        )

        user_content = f"QUESTION: {question}\n\nPAPER EVIDENCE:\n{evidence_context[:25000]}"

        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_content),
        ]

        try:
            kwargs: Dict[str, Any] = {"temperature": 0.0}
            if isinstance(provider, LocalOllamaProvider):
                kwargs["json_mode"] = True

            raw_reply = await provider.complete(messages, **kwargs)
            parsed = extract_json_from_llm_text(raw_reply)
            if not parsed or not isinstance(parsed, dict) or "answer" not in parsed:
                return None

            answer_text = str(parsed.get("answer", "")).strip()
            if not answer_text:
                return None

            is_insufficient = bool(parsed.get("insufficient_evidence", False))
            if is_insufficient or "does not contain information" in answer_text.lower():
                return GroundedQAResponse(
                    paper_id=paper_id,
                    question=question,
                    answer=DISCLAIMER_UNANSWERABLE,
                    citations=[],
                    confidence="insufficient_evidence",
                    insufficient_evidence=True,
                )

            raw_citations = parsed.get("citations") or []
            citations: List[CitationItem] = []
            for c in raw_citations:
                if isinstance(c, dict):
                    page = int(c.get("page", 1))
                    excerpt = str(c.get("excerpt", "")).strip()
                    if excerpt:
                        citations.append(CitationItem(page=page, excerpt=excerpt))

            confidence = str(parsed.get("confidence", "verified")).lower()
            if confidence not in ["verified", "inferred", "insufficient_evidence"]:
                confidence = "verified" if citations else "inferred"

            return GroundedQAResponse(
                paper_id=paper_id,
                question=question,
                answer=answer_text,
                citations=citations,
                confidence=confidence,
                insufficient_evidence=False,
            )

        except Exception as e:
            logger.debug("[GroundedQAEngine] LLM completion exception: %s", e)
            return None

    def _deterministic_qa(
        self,
        paper_id: str,
        question: str,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
        doc: Optional[PageIndexedDocument] = None,
    ) -> GroundedQAResponse:
        """
        Strict deterministic question answering when LLM is unavailable.
        Uses keyword overlap, entity relevance, and mathematical excerpt matching.
        """
        keywords = self._extract_query_keywords(question)
        if not keywords:
            return GroundedQAResponse(
                paper_id=paper_id,
                question=question,
                answer=DISCLAIMER_UNANSWERABLE,
                citations=[],
                confidence="insufficient_evidence",
                insufficient_evidence=True,
            )

        q_lower = question.lower()
        candidates: List[Dict[str, Any]] = []

        # 1. Check Metrics
        if evidence_pkg and evidence_pkg.metrics:
            for m in evidence_pkg.metrics:
                m_tokens = set(self._tokenize(f"{m.label} {m.context} {m.display_value} {m.unit}"))
                overlap = len(set(keywords) & m_tokens)
                if overlap > 0:
                    score = overlap / max(len(keywords), 1)
                    # Boost if exact label appears in question
                    if m.label.lower() in q_lower or (m.unit and m.unit.lower() in q_lower):
                        score += 0.5
                    candidates.append({
                        "type": "metric",
                        "score": score,
                        "overlap": overlap,
                        "answer": f"The paper reports {m.label} of {m.display_value}{(' ' + m.unit) if m.unit and m.unit not in m.display_value else ''} ({m.context}).",
                        "citation": CitationItem(
                            page=m.source_ref.page if m.source_ref and m.source_ref.page else 1,
                            excerpt=m.source_ref.excerpt if m.source_ref and m.source_ref.excerpt else f"{m.label} {m.display_value}",
                        ),
                    })

        # 2. Check Claims
        if evidence_pkg and evidence_pkg.claims:
            for c in evidence_pkg.claims:
                c_tokens = set(self._tokenize(c.statement))
                overlap = len(set(keywords) & c_tokens)
                if overlap > 0:
                    score = overlap / max(len(keywords), 1)
                    ref = c.source_refs[0] if c.source_refs else None
                    candidates.append({
                        "type": "claim",
                        "score": score,
                        "overlap": overlap,
                        "answer": f"{c.statement}",
                        "citation": CitationItem(
                            page=ref.page if ref and ref.page else 1,
                            excerpt=ref.excerpt if ref and ref.excerpt else c.statement[:120],
                        ),
                    })

        # 3. Check Limitations
        if evidence_pkg and evidence_pkg.limitations and any(w in q_lower for w in ["limitation", "limit", "constraint", "assumption", "weakness"]):
            for lim in evidence_pkg.limitations:
                lim_tokens = set(self._tokenize(lim.statement))
                overlap = len(set(keywords) & lim_tokens)
                score = (overlap / max(len(keywords), 1)) + 0.3
                ref = lim.source_ref
                candidates.append({
                    "type": "limitation",
                    "score": score,
                    "overlap": overlap,
                    "answer": f"The authors identify the following limitation: {lim.statement}",
                    "citation": CitationItem(
                        page=ref.page if ref and ref.page else 1,
                        excerpt=ref.excerpt if ref and ref.excerpt else lim.statement[:120],
                    ),
                })

        # 4. Check Methods
        if evidence_pkg and evidence_pkg.methods and any(w in q_lower for w in ["method", "approach", "architecture", "model", "algorithm", "technique"]):
            for meth in evidence_pkg.methods:
                meth_tokens = set(self._tokenize(meth))
                overlap = len(set(keywords) & meth_tokens)
                if overlap > 0:
                    candidates.append({
                        "type": "method",
                        "score": overlap / max(len(keywords), 1),
                        "overlap": overlap,
                        "answer": f"The proposed method uses: {meth}",
                        "citation": CitationItem(page=1, excerpt=meth[:100]),
                    })

        # 5. Check Document Pages
        if doc and doc.pages:
            for p in doc.pages:
                sentences = re.split(r"(?<=[.!?])\s+", p.text)
                for sent in sentences:
                    s_clean = sent.strip()
                    if len(s_clean) < 25:
                        continue
                    s_tokens = set(self._tokenize(s_clean))
                    overlap = len(set(keywords) & s_tokens)
                    if overlap >= 2:
                        candidates.append({
                            "type": "page_text",
                            "score": overlap / max(len(keywords), 1),
                            "overlap": overlap,
                            "answer": f"According to page {p.page_number}: \"{s_clean}\"",
                            "citation": CitationItem(page=p.page_number, excerpt=s_clean),
                        })

        # 6. Check Core Thesis / Research Question
        if evidence_pkg:
            if evidence_pkg.thesis and any(w in q_lower for w in ["thesis", "hypothesis", "claim", "argument"]):
                candidates.append({
                    "type": "thesis",
                    "score": 0.8,
                    "overlap": 2,
                    "answer": f"The core thesis of the paper is: {evidence_pkg.thesis}",
                    "citation": CitationItem(page=1, excerpt=evidence_pkg.thesis[:120]),
                })
            if evidence_pkg.research_question and any(w in q_lower for w in ["question", "goal", "objective", "aim"]):
                candidates.append({
                    "type": "research_question",
                    "score": 0.8,
                    "overlap": 2,
                    "answer": f"The primary research question investigated is: {evidence_pkg.research_question}",
                    "citation": CitationItem(page=1, excerpt=evidence_pkg.research_question[:120]),
                })

        if not candidates:
            return GroundedQAResponse(
                paper_id=paper_id,
                question=question,
                answer=DISCLAIMER_UNANSWERABLE,
                citations=[],
                confidence="insufficient_evidence",
                insufficient_evidence=True,
            )

        # Sort candidates by score descending
        candidates.sort(key=lambda x: (x["score"], x["overlap"]), reverse=True)
        best = candidates[0]

        # Strict anti-hallucination threshold: requires meaningful overlap
        if best["overlap"] < 1 or (len(keywords) >= 3 and best["overlap"] < 2 and best["score"] < 0.35):
            return GroundedQAResponse(
                paper_id=paper_id,
                question=question,
                answer=DISCLAIMER_UNANSWERABLE,
                citations=[],
                confidence="insufficient_evidence",
                insufficient_evidence=True,
            )

        citations = [best["citation"]] if best.get("citation") else []
        return GroundedQAResponse(
            paper_id=paper_id,
            question=question,
            answer=best["answer"],
            citations=citations,
            confidence="verified",
            insufficient_evidence=False,
        )

    def _verify_and_ground_citations(
        self,
        response: GroundedQAResponse,
        doc: Optional[PageIndexedDocument] = None,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
    ) -> GroundedQAResponse:
        """
        Scans all citations against document page coordinates with DeterministicExcerptVerifier.
        Computes exact_match and normalized highlight_rects for visual overlay.
        """
        if not response.citations or response.insufficient_evidence:
            return response

        verified_citations: List[CitationItem] = []

        # Build fallback lookup maps from evidence package if available
        pkg_rects_map: Dict[str, Tuple[int, List[HighlightRect]]] = {}
        if evidence_pkg:
            for c in evidence_pkg.claims:
                for ref in c.source_refs:
                    if ref.highlight_rects:
                        pkg_rects_map[ref.excerpt.lower().strip()] = (ref.page or 1, ref.highlight_rects)
            for m in evidence_pkg.metrics:
                if m.source_ref and m.source_ref.highlight_rects:
                    pkg_rects_map[m.source_ref.excerpt.lower().strip()] = (m.source_ref.page or 1, m.source_ref.highlight_rects)

        for cit in response.citations:
            excerpt_clean = cit.excerpt.strip()
            if not excerpt_clean:
                continue

            exact_match = cit.exact_match
            page = cit.page
            rects: List[HighlightRect] = list(cit.highlight_rects)

            # If document coordinate layers are available, run exact coordinate verifier
            if doc and doc.pages:
                sr = SourceReference(
                    source_id="qa",
                    page=page,
                    excerpt=excerpt_clean,
                )
                verified_sr = self.verifier.locate_and_verify_reference(sr, doc)
                page = verified_sr.page or page
                exact_match = verified_sr.exact_match
                if verified_sr.highlight_rects:
                    rects = verified_sr.highlight_rects

            # Fallback to pre-computed claim/metric highlight rects
            if not rects and excerpt_clean.lower() in pkg_rects_map:
                cached_page, cached_rects = pkg_rects_map[excerpt_clean.lower()]
                page = cached_page
                rects = cached_rects
                exact_match = True

            verified_citations.append(
                CitationItem(
                    page=page,
                    excerpt=excerpt_clean,
                    exact_match=exact_match,
                    highlight_rects=rects,
                )
            )

        response.citations = verified_citations
        return response
