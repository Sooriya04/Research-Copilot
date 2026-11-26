"""
Module: src/novelty/evaluator.py

What this file does:
Implements Stage 7 (Proposal Quality Assessment) of the Novelty pipeline.
Validates each synthesized NoveltyItem for source grounding, falsifiability,
and technical specificity—never treating LLM confidence as calibrated novelty.

Classes & Functions:
- ProposalEvaluator: Scores proposals deterministically on grounding, falsifiability,
  and specificity, flagging missing citations or vague hypotheses.
"""
from typing import List

from src.novelty.schemas import NoveltyItem, QualityAssessment


class ProposalEvaluator:
    """Stage 7: Deterministic quality and evidence validation for synthesized proposals."""

    def evaluate(self, proposals: List[NoveltyItem]) -> List[NoveltyItem]:
        """Attach QualityAssessment metadata to each proposal."""
        for p in proposals:
            issues: List[str] = []

            # 1. Grounding check
            paper_count = len(p.grounded_paper_ids)
            grounding_score = min(1.0, paper_count / 2.0) if paper_count > 0 else 0.2
            if paper_count == 0:
                issues.append("No workspace paper citations linked.")

            # 2. Falsifiability check
            hyp = (p.testable_hypothesis or "").strip()
            has_metrics = len(p.expected_metrics) > 0
            falsifiability_score = (0.6 if len(hyp) >= 25 else 0.2) + (0.4 if has_metrics else 0.0)
            if len(hyp) < 25:
                issues.append("Testable hypothesis is missing or underspecified.")

            # 3. Technical specificity check
            spec_parts = [
                len(p.novelty_statement or "") >= 30,
                len(p.technical_methodology or p.mathematical_formulation or "") >= 20,
                len(p.baselines_to_beat) > 0,
            ]
            specificity_score = round(sum(1 for ok in spec_parts if ok) / 3.0, 2)
            if not p.baselines_to_beat:
                issues.append("No comparison baselines specified.")

            p.quality_assessment = QualityAssessment(
                grounding_score=round(grounding_score, 2),
                falsifiability_score=round(falsifiability_score, 2),
                specificity_score=specificity_score,
                issues=issues,
                passed=len(issues) <= 1,
            )
        return proposals
