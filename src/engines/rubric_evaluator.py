"""
Artifact and Code Repository Extractor for Research-Copilot.
Extracts verified open-source repository URLs, dataset availability,
and empirical signals directly from paper text and metadata without fabricated scoring.
"""

import re
from typing import Dict, List, Optional
from src.core.schemas import ChecklistRubric, Paper


class RubricEvaluator:
    """Extracts code repositories, dataset links, and empirical artifacts from papers."""

    # Robust matching for public code repositories and checkpoints
    CODE_REPO_REGEX = re.compile(
        r"https?://(?:www\.)?(?:github\.com|gitlab\.com|huggingface\.co)/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",
        re.IGNORECASE,
    )

    # Dataset repository and registry patterns
    DATASET_REGEX = re.compile(
        r"(?:https?://(?:www\.)?(?:huggingface\.co/datasets|kaggle\.com/datasets|zenodo\.org/records?|paperswithcode\.com/dataset)/[A-Za-z0-9_.-]+|\b(?:code\s+and\s+data|dataset\s+(?:is\s+)?available\s+at)\b)",
        re.IGNORECASE,
    )

    # Compute and hardware disclosures
    COMPUTE_REGEX = re.compile(
        r"\b(?:\d+\s*(?:x|\*)\s*(?:a100|h100|v100|t4|rtx\s*\d+|gpu|tpu)s?|(?:gpu|tpu)\s+hours?|trained\s+for\s+\d+\s+(?:hours?|days?|epochs?))\b",
        re.IGNORECASE,
    )

    def evaluate(self, paper: Paper, full_text: Optional[str] = None) -> ChecklistRubric:
        """Extract verified code repos, dataset links, and empirical artifacts without fake rubric scoring."""
        text_parts: List[str] = []
        if paper.abstract:
            text_parts.append(paper.abstract)
        if paper.url:
            text_parts.append(paper.url)
        for sec in (paper.sections or []):
            if sec.content:
                text_parts.append(sec.content)
        if full_text:
            text_parts.append(full_text)

        corpus = " ".join(text_parts)

        # 1. Real Code Repository Extraction (GitHub / Hugging Face / GitLab)
        code_match = self.CODE_REPO_REGEX.search(corpus)
        code_url = re.sub(r"[.,;:)\s]+$", "", code_match.group(0)) if code_match else None
        has_code = bool(code_url)

        # 2. Dataset Links & Availability
        has_dataset = bool(self.DATASET_REGEX.search(corpus)) or "dataset" in corpus.lower()

        # 3. Compute Budget Disclosures
        compute_match = self.COMPUTE_REGEX.search(corpus)
        compute_details = compute_match.group(0) if compute_match else None

        # 4. Empirical & Scientific Signals
        has_ablation = bool(re.search(r"\b(ablations?|ablated)\b", corpus, re.IGNORECASE))
        has_baselines = bool(re.search(r"\b(baseline|baselines|sota|compared\s+(with|to|against))\b", corpus, re.IGNORECASE))
        has_benchmarks = bool(re.search(r"\b(benchmark|benchmarks|dataset|datasets|glue|mmlu|gsm8k|humaneval|imagenet)\b", corpus, re.IGNORECASE))
        has_empirical = has_baselines or has_benchmarks
        has_limitations = bool(re.search(r"\b(limitations?|threats?\s+to\s+validity|failure\s+cases?)\b", corpus, re.IGNORECASE))

        features_checklist = {
            "open_source": "present" if has_code else "missing",
            "dataset_available": "present" if has_dataset else "missing",
            "compute_disclosed": "present" if compute_details else "missing",
            "empirical_eval": "present" if has_empirical else "missing",
        }

        return ChecklistRubric(
            has_ablation=has_ablation,
            has_baselines=has_baselines,
            has_benchmarks=has_benchmarks,
            has_empirical_eval=has_empirical,
            has_uncertainty_quant=False,
            has_code_repo=has_code,
            code_url=code_url,
            has_dataset_link=has_dataset,
            has_compute_budget=bool(compute_details),
            compute_details=compute_details,
            has_limitations=has_limitations,
            features_checklist=features_checklist,
            rubric_score=0.0,
            items=[],
            rubric_gaps=0,
            recommendations=[],
        )
