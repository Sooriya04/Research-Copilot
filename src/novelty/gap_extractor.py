"""
Module: src/novelty/gap_extractor.py

What this file does:
Implements Stage 3 (Research Gap Extraction) of the Novelty pipeline.
Extracts evidence-backed methodological, theoretical, empirical, scalability,
contradiction, and future-direction gaps from structured paper analyses and
graph topology—avoiding blind combinatorial method-dataset pairs.

Classes & Functions:
- ResearchGapExtractor: Identifies typed ExtractedGap items with supporting paper IDs,
  evidence excerpts, and evidence availability status.
"""
import json
from typing import List

from src.graph.gap_engine import GapDetectionEngine
from src.graph.schema import slugify_id
from src.novelty.json_utils import parse_llm_json
from src.novelty.provider_orchestrator import ProviderOrchestrator
from src.novelty.schemas import (
    EvidenceClaim,
    ExtractedGap,
    GapType,
    GroundingContext,
    StructuredPaperAnalysis,
)
from src.providers.base import BaseLLMProvider, ChatMessage


class ResearchGapExtractor:
    """Stage 3: Extracts evidence-backed scientific gaps from analyzed papers."""

    def __init__(self, orchestrator: ProviderOrchestrator, gap_engine: GapDetectionEngine):
        self.orchestrator = orchestrator
        self.gap_engine = gap_engine

    async def extract_gaps(
        self,
        context: GroundingContext,
        analyses: List[StructuredPaperAnalysis],
        provider: BaseLLMProvider,
        model: str,
    ) -> List[ExtractedGap]:
        """Extract typed, evidence-grounded research gaps."""
        if not analyses:
            return []

        summary_payload = [a.model_dump() for a in analyses]
        prompt = (
            f"Target Topic: {context.topic}\n"
            f"Analyzed Papers:\n{json.dumps(summary_payload, indent=2)}\n\n"
            f"Inter-Paper Edges: {json.dumps(context.edges[:15])}\n\n"
            "Identify genuine, evidence-backed research gaps across these categories: "
            "methodological, performance_scalability, theoretical, empirical, "
            "unresolved_question, contradiction, future_direction.\n"
            "Do NOT treat arbitrary unexplored method-dataset pairs as gaps unless justified by limitations or findings.\n"
            "Return STRICT JSON:\n"
            '{"gaps": [{"gap_type": "methodological", "title": "...", "description": "...", '
            '"supporting_paper_ids": ["..."], "evidence_excerpts": [{"paper_id": "...", "claim": "...", "source_type": "author_statement"}]}]}'
        )

        extracted: List[ExtractedGap] = []
        try:
            raw = await self.orchestrator.complete(
                provider,
                [
                    ChatMessage(role="system", content="Identify evidence-backed scientific research gaps. Strict JSON only."),
                    ChatMessage(role="user", content=prompt),
                ],
                model=model,
                temperature=0.2,
            )
            parsed = parse_llm_json(raw)
            items = parsed.get("gaps", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
            for idx, g in enumerate(items):
                if not isinstance(g, dict) or not g.get("title"):
                    continue
                try:
                    gtype = GapType(str(g.get("gap_type", "methodological")).lower())
                except ValueError:
                    gtype = GapType.METHODOLOGICAL
                claims = [
                    EvidenceClaim(**c)
                    for c in (g.get("evidence_excerpts") or [])
                    if isinstance(c, dict) and c.get("paper_id") and c.get("claim")
                ]
                avail = "full_text" if any(a.evidence_availability == "full_text" for a in analyses) else "abstract_only"
                extracted.append(
                    ExtractedGap(
                        id=f"gap-{slugify_id(g['title'])[:28]}-{idx}",
                        gap_type=gtype,
                        title=str(g["title"]),
                        description=str(g.get("description") or ""),
                        supporting_paper_ids=list(g.get("supporting_paper_ids") or []),
                        evidence_excerpts=claims,
                        evidence_availability=avail,
                    )
                )
        except Exception:
            pass

        return extracted
