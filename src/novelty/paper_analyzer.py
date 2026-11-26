"""
Module: src/novelty/paper_analyzer.py

What this file does:
Implements Stage 2 (Structured Paper Analysis) of the Novelty pipeline.
Extracts research problems, contributions, methodologies, assumptions, limitations,
findings, and future directions per paper with explicit evidence availability status.

Classes & Functions:
- PaperAnalyzer: Analyzes each GroundedPaper into a StructuredPaperAnalysis record
  without fabricating missing details.
"""
from typing import List

from src.novelty.json_utils import parse_llm_json
from src.novelty.provider_orchestrator import ProviderOrchestrator
from src.novelty.schemas import GroundedPaper, StructuredPaperAnalysis
from src.providers.base import BaseLLMProvider, ChatMessage


class PaperAnalyzer:
    """Stage 2: Extracts structured technical profiles from grounded papers."""

    def __init__(self, orchestrator: ProviderOrchestrator):
        self.orchestrator = orchestrator

    async def analyze_papers(
        self,
        papers: List[GroundedPaper],
        provider: BaseLLMProvider,
        model: str,
    ) -> List[StructuredPaperAnalysis]:
        """Extract structured technical details for each paper in the grounding set."""
        if not papers:
            return []

        # Batch up to 8 papers into a single structured extraction call for efficiency,
        # preferring full_text (up to 3500 chars) over abstracts.
        paper_blocks = []
        for p in papers:
            body = p.full_text[:3500] if p.has_full_text and p.full_text else p.abstract[:1500]
            avail = "full_text" if p.has_full_text else ("abstract_only" if p.abstract else "metadata_only")
            paper_blocks.append(
                f"PAPER_ID: {p.id}\n"
                f"TITLE: {p.title} ({p.year or 'n/d'})\n"
                f"SOURCE_AVAILABILITY: {avail}\n"
                f"CONTENT:\n{body or 'No abstract/full text available.'}\n"
            )

        prompt = (
            "Extract factual technical profiles for each paper below. "
            "Do NOT fabricate methods, limitations, or findings that are not present in the provided content; "
            "leave lists empty if not stated.\n\n"
            + "\n---\n".join(paper_blocks)
            + "\nReturn STRICT JSON matching:\n"
            '{"analyses": [{"paper_id": "...", "research_problem": "...", "main_contributions": ["..."], '
            '"methodology": "...", "mechanisms": ["..."], "assumptions": ["..."], '
            '"limitations": ["..."], "experimental_findings": ["..."], "future_directions": ["..."]}]}'
        )

        try:
            raw = await self.orchestrator.complete(
                provider,
                [
                    ChatMessage(role="system", content="Extract structured scientific facts strictly from provided text. Return JSON only."),
                    ChatMessage(role="user", content=prompt),
                ],
                model=model,
                temperature=0.1,
            )
            parsed = parse_llm_json(raw)
            items = parsed.get("analyses", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
        except Exception:
            items = []

        by_id = {str(it.get("paper_id")): it for it in items if isinstance(it, dict) and it.get("paper_id")}
        results: List[StructuredPaperAnalysis] = []
        for p in papers:
            avail = "full_text" if p.has_full_text else ("abstract_only" if p.abstract else "metadata_only")
            it = by_id.get(p.id, {})
            results.append(
                StructuredPaperAnalysis(
                    paper_id=p.id,
                    title=p.title,
                    research_problem=str(it.get("research_problem") or ""),
                    main_contributions=list(it.get("main_contributions") or []),
                    methodology=str(it.get("methodology") or ""),
                    mechanisms=list(it.get("mechanisms") or p.methods or []),
                    assumptions=list(it.get("assumptions") or []),
                    limitations=list(it.get("limitations") or []),
                    experimental_findings=list(it.get("experimental_findings") or []),
                    future_directions=list(it.get("future_directions") or []),
                    evidence_availability=avail,
                )
            )
        return results
