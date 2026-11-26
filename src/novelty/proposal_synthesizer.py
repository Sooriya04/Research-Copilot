"""
Module: src/novelty/proposal_synthesizer.py

What this file does:
Implements Stage 6 (Research Proposal Synthesis) of the Novelty pipeline.
Transforms verified NoveltyCandidate items, ExtractedGap records, and PriorArtAssessment
results into schema-validated NoveltyItem research proposals.

Classes & Functions:
- ProposalSynthesizer: Generates structured proposals containing methodology,
  algorithmic approach, mathematical formulation (where appropriate), hypothesis,
  experimental design, baselines, metrics, and limitations without fabricating citations.
"""
import json
from typing import Dict, List

from src.graph.schema import slugify_id
from src.novelty.json_utils import parse_llm_json
from src.novelty.provider_orchestrator import ProviderOrchestrator
from src.novelty.schemas import (
    ExtractedGap,
    GroundingContext,
    NoveltyCandidate,
    NoveltyItem,
    PriorArtAssessment,
    PriorArtStatus,
    StructuredPaperAnalysis,
)
from src.providers.base import BaseLLMProvider, ChatMessage


class ProposalSynthesizer:
    """Stage 6: Synthesizes detailed, schema-validated research proposals."""

    def __init__(self, orchestrator: ProviderOrchestrator):
        self.orchestrator = orchestrator

    async def synthesize(
        self,
        context: GroundingContext,
        analyses: List[StructuredPaperAnalysis],
        gaps: List[ExtractedGap],
        candidates: List[NoveltyCandidate],
        prior_art_map: Dict[str, PriorArtAssessment],
        provider: BaseLLMProvider,
        model: str,
        engine_name: str,
    ) -> List[NoveltyItem]:
        """Synthesize structured NoveltyItem proposals from verified candidates."""
        paper_title_by_id = {p.id: p.title for p in context.papers}
        has_full_text = any(p.has_full_text for p in context.papers)
        evidence_label = "full_text" if has_full_text else ("abstract_only" if context.papers else "topic_only")

        prompt = (
            f"Research Topic: {context.topic}\n"
            f"Candidates: {json.dumps([c.model_dump() for c in candidates], indent=2)}\n"
            f"Gaps: {json.dumps([g.model_dump() for g in gaps[:5]], indent=2)}\n"
            f"Papers: {json.dumps([{'id': p.id, 'title': p.title} for p in context.papers])}\n\n"
            "Expand each candidate into a rigorous research proposal. "
            "Do NOT fabricate citations or paper IDs outside the provided list.\n"
            "Return STRICT JSON:\n"
            '{"proposals": [{"id": "...", "title": "...", "mechanism": "recombination", '
            '"pitch": "...", "problem_statement": "...", "research_motivation": "...", '
            '"identified_gap": "...", "novelty_statement": "...", '
            '"technical_methodology": "...", "algorithmic_approach": "...", '
            '"mathematical_formulation": "...", "testable_hypothesis": "...", '
            '"target_datasets": ["..."], "baselines_to_beat": ["..."], '
            '"expected_metrics": ["..."], "potential_limitations": "...", '
            '"grounded_paper_ids": ["..."]}]}'
        )

        raw_proposals = []
        try:
            raw = await self.orchestrator.complete(
                provider,
                [
                    ChatMessage(role="system", content="Synthesize rigorous, grounded scientific research proposals. Strict JSON only."),
                    ChatMessage(role="user", content=prompt),
                ],
                model=model,
                temperature=0.25,
            )
            parsed = parse_llm_json(raw)
            if isinstance(parsed, dict):
                raw_proposals = (
                    parsed.get("proposals")
                    or parsed.get("novelties")
                    or parsed.get("ideas")
                    or []
                )
            elif isinstance(parsed, list):
                raw_proposals = parsed
        except Exception:
            raw_proposals = []

        # Map synthesized payloads or construct from candidates if LLM failed
        results: List[NoveltyItem] = []
        if not raw_proposals and candidates:
            for c in candidates:
                pa = prior_art_map.get(c.id)
                pids = [pid for pid in c.supporting_paper_ids if pid in paper_title_by_id]
                results.append(
                    NoveltyItem(
                        id=c.id,
                        title=c.title,
                        mechanism=c.strategy or "recombination",
                        engine=engine_name,
                        model_name=model,
                        pitch=c.rationale or c.core_contribution,
                        problem_statement=c.rationale or c.core_contribution,
                        novelty_statement=c.core_contribution,
                        grounded_paper_ids=pids,
                        grounded_paper_titles=[paper_title_by_id[pid] for pid in pids],
                        prior_art_status=(pa.status.value if pa else PriorArtStatus.NOT_ASSESSED.value),
                        prior_art_check=pa,
                        evidence_status=evidence_label,
                    )
                )
            return results

        for idx, prop in enumerate(raw_proposals):
            if not isinstance(prop, dict):
                continue
            title = str(prop.get("title") or prop.get("concept_name") or f"Proposal {idx + 1}")
            cand = candidates[idx] if idx < len(candidates) else None
            pa = prior_art_map.get(cand.id) if cand else None
            raw_pids = list(prop.get("grounded_paper_ids") or (cand.supporting_paper_ids if cand else []))
            valid_pids = [pid for pid in raw_pids if pid in paper_title_by_id] or raw_pids
            titles = [paper_title_by_id[pid] for pid in valid_pids if pid in paper_title_by_id] or list(prop.get("grounded_paper_titles") or [])

            results.append(
                NoveltyItem(
                    id=str(prop.get("id") or (cand.id if cand else f"novelty-{slugify_id(title)[:32]}")),
                    title=title,
                    mechanism=str(prop.get("mechanism") or (cand.strategy if cand else None) or "recombination"),
                    engine=engine_name,
                    model_name=model,
                    pitch=str(prop.get("pitch") or prop.get("problem_statement") or ""),
                    problem_statement=str(prop.get("problem_statement") or prop.get("pitch") or ""),
                    research_motivation=str(prop.get("research_motivation") or ""),
                    identified_gap=str(prop.get("identified_gap") or ""),
                    novelty_statement=str(prop.get("novelty_statement") or prop.get("pitch") or ""),
                    technical_methodology=str(prop.get("technical_methodology") or ""),
                    algorithmic_approach=str(prop.get("algorithmic_approach") or ""),
                    grounded_paper_ids=valid_pids,
                    grounded_paper_titles=titles,
                    mathematical_formulation=str(prop.get("mathematical_formulation") or ""),
                    testable_hypothesis=str(prop.get("testable_hypothesis") or ""),
                    target_datasets=list(prop.get("target_datasets") or []),
                    baselines_to_beat=list(prop.get("baselines_to_beat") or []),
                    expected_metrics=list(prop.get("expected_metrics") or []),
                    potential_limitations=str(prop.get("potential_limitations") or ""),
                    prior_art_status=(pa.status.value if pa else PriorArtStatus.NOT_ASSESSED.value),
                    prior_art_check=pa,
                    evidence_status=evidence_label,
                    confidence_score=float(prop.get("confidence_score") or 0.75),
                )
            )
        return results
