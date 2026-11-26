"""
Module: src/novelty/candidate_generator.py

What this file does:
Implements Stage 4 (Novelty Candidate Generation) of the Novelty pipeline.
Uses optional ideation strategies (recombination, contradiction_resolution,
limitation_inversion, gap_realization) grounded in extracted gaps and analyses,
then deduplicates semantically similar candidates.

Classes & Functions:
- CandidateGenerator: Generates 0 or more NoveltyCandidate records depending on
  evidence quality and removes near-duplicate candidates via token Jaccard similarity.
"""
import json
import re
from typing import List, Set

from src.graph.schema import slugify_id
from src.novelty.json_utils import parse_llm_json
from src.novelty.provider_orchestrator import ProviderOrchestrator
from src.novelty.schemas import (
    ExtractedGap,
    GroundingContext,
    NoveltyCandidate,
    StructuredPaperAnalysis,
)
from src.providers.base import BaseLLMProvider, ChatMessage


class CandidateGenerator:
    """Stage 4: Generates and deduplicates grounded novelty candidates."""

    def __init__(self, orchestrator: ProviderOrchestrator):
        self.orchestrator = orchestrator

    async def generate_candidates(
        self,
        context: GroundingContext,
        analyses: List[StructuredPaperAnalysis],
        gaps: List[ExtractedGap],
        provider: BaseLLMProvider,
        model: str,
        max_candidates: int = 4,
    ) -> List[NoveltyCandidate]:
        """Generate 0..max_candidates grounded novelty candidates and deduplicate."""
        prompt = (
            f"Research Topic: {context.topic}\n"
            f"Paper Analyses: {json.dumps([a.model_dump() for a in analyses[:8]], indent=2)}\n"
            f"Extracted Gaps: {json.dumps([g.model_dump() for g in gaps[:6]], indent=2)}\n\n"
            "Generate concrete novelty candidates grounded in the above gaps and methods. "
            "Optional strategies: recombination, contradiction_resolution, limitation_inversion, gap_realization. "
            "If evidence is insufficient, return fewer or zero candidates rather than inventing fluff.\n"
            f"Return STRICT JSON (up to {max_candidates} candidates):\n"
            '{"candidates": [{"title": "...", "strategy": "recombination", "core_contribution": "...", '
            '"target_gap_ids": ["..."], "supporting_paper_ids": ["..."], "rationale": "..."}]}'
        )

        candidates: List[NoveltyCandidate] = []
        try:
            raw = await self.orchestrator.complete(
                provider,
                [
                    ChatMessage(role="system", content="Generate technical novelty candidates strictly from provided gaps. JSON only."),
                    ChatMessage(role="user", content=prompt),
                ],
                model=model,
                temperature=0.3,
            )
            parsed = parse_llm_json(raw)
            items = (
                parsed.get("candidates")
                or parsed.get("proposals")
                or parsed.get("novelties")
                or []
            ) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
            for c in items[:max_candidates]:
                if not isinstance(c, dict) or not (c.get("title") or c.get("concept_name")):
                    continue
                c_title = str(c.get("title") or c.get("concept_name"))
                c_id = str(c.get("id") or f"cand-{slugify_id(c_title)[:32]}")
                candidates.append(
                    NoveltyCandidate(
                        id=c_id,
                        title=c_title,
                        strategy=c.get("strategy") or c.get("mechanism"),
                        core_contribution=str(c.get("core_contribution") or c.get("novelty_statement") or c.get("pitch") or c.get("rationale") or ""),
                        target_gap_ids=list(c.get("target_gap_ids") or []),
                        supporting_paper_ids=list(c.get("supporting_paper_ids") or c.get("grounded_paper_ids") or [p.id for p in context.papers[:2]]),
                        rationale=str(c.get("rationale") or c.get("pitch") or ""),
                    )
                )
        except Exception:
            pass

        return self.deduplicate(candidates)

    @staticmethod
    def deduplicate(candidates: List[NoveltyCandidate], threshold: float = 0.72) -> List[NoveltyCandidate]:
        """Remove semantically near-duplicate candidates using normalized token Jaccard similarity."""
        kept: List[NoveltyCandidate] = []
        seen_sets: List[Set[str]] = []
        for cand in candidates:
            tokens = set(re.findall(r"[a-z0-9]+", f"{cand.title} {cand.core_contribution}".lower()))
            if not tokens:
                continue
            is_dup = False
            for prev in seen_sets:
                union = tokens | prev
                if union and (len(tokens & prev) / len(union)) >= threshold:
                    is_dup = True
                    break
            if not is_dup:
                kept.append(cand)
                seen_sets.append(tokens)
        return kept
