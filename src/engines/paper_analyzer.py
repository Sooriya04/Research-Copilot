import json
from typing import Dict, List, Optional
from src.core.canonical_models import (
    BenchmarkEvidence, CanonicalPaper, CodeRepository, ExtractedClaim,
    PaperSectionEntity, PaperSectionType, StructuredPaperSummary, VerificationStatus
)
from src.core.logger import logger
from src.providers.base import ChatMessage
from src.providers.gemini import GeminiFlashLiteProvider

class PaperAnalyzer:
    """Constructs a compact evidence package and runs Gemini Flash-Lite structured scientific analysis."""

    def __init__(self, provider: Optional[GeminiFlashLiteProvider] = None):
        self.provider = provider or GeminiFlashLiteProvider()

    def build_evidence_package(self, paper: CanonicalPaper) -> str:
        """Construct a compact, noise-free evidence package strictly under ~3,000 tokens."""
        package_lines = [
            f"PAPER TITLE: {paper.title}",
            f"AUTHORS: {', '.join(a.name for a in paper.authors[:6])}",
            f"YEAR: {paper.year or 'N/A'}",
            f"DOI: {paper.doi or 'N/A'} | ARXIV: {paper.arxiv_id or 'N/A'}",
            f"\nABSTRACT:\n{paper.abstract}\n",
        ]

        # Add section excerpts
        for sec in paper.sections:
            if sec.section_type in [
                PaperSectionType.PROBLEM,
                PaperSectionType.RELATED_WORK,
                PaperSectionType.METHOD,
                PaperSectionType.EXPERIMENTS,
                PaperSectionType.LIMITATIONS,
            ]:
                # Compact section text to first 400 words
                words = sec.content.split()[:400]
                compact_content = " ".join(words)
                package_lines.append(f"SECTION [{sec.section_type.value.upper()} - {sec.title}]:\n{compact_content}\n")

        # Add Benchmark Evidence from Papers With Code
        if paper.benchmarks:
            package_lines.append("BENCHMARK EVIDENCE (Papers with Code):")
            for b in paper.benchmarks[:5]:
                package_lines.append(f"- Task: {b.task} | Dataset: {b.dataset} | Metric: {b.metric} = {b.value} | Model: {b.model or 'N/A'}")
            package_lines.append("")

        # Add Code Evidence
        if paper.code_repositories:
            package_lines.append("CODE EVIDENCE:")
            for r in paper.code_repositories[:3]:
                package_lines.append(f"- Repo: {r.url} (Official: {r.is_official}, Stars: {r.stars})")
            package_lines.append("")

        return "\n".join(package_lines)

    async def analyze(self, paper: CanonicalPaper) -> StructuredPaperSummary:
        """Execute LLM evidence analysis using Gemini Flash-Lite."""
        evidence_pkg = self.build_evidence_package(paper)

        system_instruction = (
            "You are an expert AI Research Engineer analyzing a scientific paper. "
            "You must output STRICT JSON matching this schema:\n"
            "{\n"
            '  "problem": "Concise formulation of the exact research problem and motivation.",\n'
            '  "contributions": ["Key contribution 1", "Key contribution 2"],\n'
            '  "methodology": "Specific mathematical and architectural mechanisms introduced.",\n'
            '  "experiments": "Empirical evaluation setup, datasets, and baseline comparison results.",\n'
            '  "limitations": ["Specific limitation or failure mode 1", "Limitation 2"],\n'
            '  "open_questions": ["Unresolved research question 1"],\n'
            '  "claims": [\n'
            '    {\n'
            '      "claim": "Specific empirical or theoretical claim made in the paper",\n'
            '      "evidence": "Direct quote or section reference supporting this claim",\n'
            '      "metric": "Name of evaluated metric (if empirical)",\n'
            '      "value": "Reported score or value",\n'
            '      "baseline": "Baseline model compared against",\n'
            '      "confidence": 0.95\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "Ground your analysis strictly in the provided evidence package. Do NOT fabricate metrics or claims."
        )

        messages = [
            ChatMessage(role="system", content=system_instruction),
            ChatMessage(role="user", content=f"Analyze this research paper evidence package:\n\n{evidence_pkg}")
        ]

        raw_json_str = await self.provider.complete(messages)

        try:
            parsed = json.loads(raw_json_str)
        except Exception:
            # Fallback if markdown fence was included
            clean_str = raw_json_str.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(clean_str)

        claims = [
            ExtractedClaim(
                claim=c.get("claim", ""),
                evidence=c.get("evidence", ""),
                metric=c.get("metric"),
                value=c.get("value"),
                baseline=c.get("baseline"),
                confidence=float(c.get("confidence", 0.8)),
                verification_status=VerificationStatus.UNVERIFIED
            )
            for c in parsed.get("claims", [])
        ]

        summary = StructuredPaperSummary(
            problem=parsed.get("problem", ""),
            contributions=parsed.get("contributions", []),
            methodology=parsed.get("methodology", ""),
            experiments=parsed.get("experiments", ""),
            limitations=parsed.get("limitations", []),
            open_questions=parsed.get("open_questions", []),
            claims=claims,
            model_used=self.provider.model
        )

        return summary
