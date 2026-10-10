import re
from typing import Dict, List, Optional, Tuple
from src.core.schemas import ChecklistRubric, Paper, RubricItemAssessment

SECTION_ALIASES = {
    "abstract": ["abstract", "summary", "overview"],
    "introduction": ["introduction", "background", "motivation"],
    "methodology": ["methodology", "methods", "approach", "method", "proposed method", "architecture"],
    "experiments": ["experiments", "experimental setup", "evaluation setup", "setup", "evaluation"],
    "results": ["results", "findings", "performance", "benchmarks"],
    "discussion": ["discussion", "analysis", "interpretation"],
    "limitations": ["limitations", "limit", "weaknesses", "threats to validity", "scope"],
    "reproducibility": ["reproducibility", "artifact", "artifacts", "code availability", "data availability", "open science"],
    "conclusion": ["conclusion", "conclusions", "closing", "concluding remarks"],
}

CHECKLIST_SPECS = [
    {
        "id": "limitations",
        "label": "Assumptions & Limitations",
        "question": "Does the paper discuss assumptions, scope, robustness, or limitations?",
        "target_sections": ["limitations", "discussion", "conclusion"],
        "patterns": [
            re.compile(r"\b(limitations?|threats?\s+to\s+validity|failure\s+cases?|bottlenecks?|assumptions?|bounded\s+scope)\b", re.IGNORECASE),
            re.compile(r"\b(we\s+acknowledge\s+that|our\s+approach\s+struggles|cannot\s+guarantee|restricted\s+to)\b", re.IGNORECASE),
        ],
        "weight": 20.0,
    },
    {
        "id": "reproducibility-path",
        "label": "Reproducibility & Code Path",
        "question": "Does the paper provide a path to reproduce or verify the main results?",
        "target_sections": ["reproducibility", "methodology", "experiments"],
        "patterns": [
            re.compile(r"https?://(www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", re.IGNORECASE),
            re.compile(r"https?://(www\.)?gitlab\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", re.IGNORECASE),
            re.compile(r"https?://huggingface\.co/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", re.IGNORECASE),
            re.compile(r"\b(code\s+(is\s+)?available\s+at|source\s+code\s+released|open-source\s+implementation|reproducibility\s+checklist)\b", re.IGNORECASE),
        ],
        "weight": 25.0,
    },
    {
        "id": "experimental-details",
        "label": "Experimental Details & Baselines",
        "question": "Does the paper specify experimental setup details such as datasets, baselines, metrics, training, or hyperparameters?",
        "target_sections": ["methodology", "experiments", "results"],
        "patterns": [
            re.compile(r"\b(ablation\s+(study|studies|experiments?|table|results?)|ablated)\b", re.IGNORECASE),
            re.compile(r"\b(compared\s+(with|against|to)\s+baselines?|sota\s+baselines?|baseline\s+models?)\b", re.IGNORECASE),
            re.compile(r"\b(benchmark\s+dataset|glue|superglue|mmlu|gsm8k|humaneval|imagenet|cifar|squad|pdbbind|cameo)\b", re.IGNORECASE),
            re.compile(r"\b(hyperparameters?|learning\s+rate|batch\s+size|adamw?|epochs?|optimizer)\b", re.IGNORECASE),
        ],
        "weight": 25.0,
    },
    {
        "id": "statistical-significance",
        "label": "Statistical Significance & Uncertainty",
        "question": "Does the paper report uncertainty, error bars, confidence intervals, variance, or statistical significance?",
        "target_sections": ["results", "experiments"],
        "patterns": [
            re.compile(r"\b(confidence\s+intervals?|\bci\b|\bstd\b|standard\s+deviations?|error\s+bars?|p\s*<\s*0\.0\d|statistical\s+significance|p-value)\b", re.IGNORECASE),
            re.compile(r"\b(\+\/|\u00b1)\s*\d+(\.\d+)?\b"),
            re.compile(r"\b(averaged\s+over\s+\d+\s+runs?|random\s+seeds?)\b", re.IGNORECASE),
        ],
        "weight": 15.0,
    },
    {
        "id": "compute-resources",
        "label": "Compute Resources & Budget",
        "question": "Does the paper state compute resources needed to reproduce experiments?",
        "target_sections": ["methodology", "experiments"],
        "patterns": [
            re.compile(r"\b(\d+\s*(x|\*)\s*(a100|h100|v100|t4|rtx\s*\d+|gpu|tpu)s?|\b(gpu|tpu)\s+hours?\b|\btrained\s+for\s+\d+\s+(hours?|days?|epochs?)\b)", re.IGNORECASE),
            re.compile(r"\b(cluster\s+of|hardware\s+setup|nvidia|google\s+cloud|compute\s+infrastructure)\b", re.IGNORECASE),
        ],
        "weight": 15.0,
    },
]

class RubricEvaluator:
    """Evaluates papers against empirical scientific rigor and NeurIPS-grade reproducibility rubrics."""

    def evaluate(self, paper: Paper, full_text: Optional[str] = None) -> ChecklistRubric:
        """Run section-aware heuristic rubric evaluation on paper abstract and extracted full text."""
        # Build normalized section lookup map
        section_map: Dict[str, str] = {}
        if paper.abstract:
            section_map["abstract"] = paper.abstract

        for sec in (paper.sections or []):
            stype = self._classify_section(sec.title, sec.section_type)
            existing = section_map.get(stype, "")
            section_map[stype] = (existing + "\n" + (sec.content or "")).strip()

        if full_text:
            existing_body = section_map.get("body", "")
            section_map["body"] = (existing_body + "\n" + full_text).strip()

        # Global corpus fallback
        global_corpus = " ".join(section_map.values())

        # Evaluate each checklist item
        item_assessments: List[RubricItemAssessment] = []
        total_score = 0.0
        gaps_count = 0
        recommendations: List[str] = []

        for spec in CHECKLIST_SPECS:
            item_id = spec["id"]
            label = spec["label"]
            question = spec["question"]
            target_sections = spec["target_sections"]
            patterns = spec["patterns"]
            weight = spec["weight"]

            # Check target sections first, then fallback to global corpus
            inspected_sections = [s for s in target_sections if s in section_map]
            missing_sections = [s for s in target_sections if s not in section_map]

            found_snippets: List[str] = []
            matched_markers: List[str] = []

            # 1. Search in target sections
            for sname in inspected_sections:
                stext = section_map[sname]
                for pat in patterns:
                    for m in pat.finditer(stext):
                        matched_markers.append(m.group(0))
                        found_snippets.append(self._extract_snippet(stext, m.start(), m.end()))

            # 2. Search in global corpus if not found in target sections
            if not matched_markers:
                for pat in patterns:
                    for m in pat.finditer(global_corpus):
                        matched_markers.append(m.group(0))
                        found_snippets.append(self._extract_snippet(global_corpus, m.start(), m.end()))

            # Determine status & confidence
            if matched_markers:
                # If found in dedicated target sections, higher confidence
                has_in_target = any(s in inspected_sections for s in target_sections)
                answer = "present"
                confidence = 0.95 if has_in_target else 0.75
                rationale = f"Detected {len(matched_markers)} empirical indicator(s) including '{matched_markers[0]}'."
                evidence_snippet = found_snippets[0] if found_snippets else None
                total_score += weight
            else:
                answer = "missing"
                confidence = 0.85 if inspected_sections else 0.60
                rationale = f"No indicators found for {label.lower()} in paper text."
                evidence_snippet = None
                gaps_count += 1
                if item_id == "limitations":
                    recommendations.append("Explicitly state known failure modes, scope boundaries, and dataset distribution assumptions.")
                elif item_id == "reproducibility-path":
                    recommendations.append("Release official open-source repository with dependency lockfiles and dataset access scripts.")
                elif item_id == "experimental-details":
                    recommendations.append("Document complete ablation study tables and standardized benchmark baseline comparison.")
                elif item_id == "statistical-significance":
                    recommendations.append("Report error bars, confidence intervals, or variance across multiple random seeds.")
                elif item_id == "compute-resources":
                    recommendations.append("Disclose compute requirements (GPU/TPU model count, training duration, memory footprints).")

            item_assessments.append(RubricItemAssessment(
                id=item_id,
                label=label,
                source="NeurIPS Paper Checklist Guidelines",
                question=question,
                answer=answer,
                confidence=round(confidence, 2),
                sections_inspected=inspected_sections or ["abstract"],
                missing_sections=missing_sections,
                matched_markers=matched_markers[:5],
                rationale=rationale,
                evidence_snippet=evidence_snippet,
            ))

        # Backward compatibility attributes
        has_ablation = bool(re.search(r"\b(ablations?|ablated)\b", global_corpus, re.IGNORECASE))
        has_baselines = bool(re.search(r"\b(baseline|baselines|sota|compared\s+(with|to|against))\b", global_corpus, re.IGNORECASE))
        has_benchmarks = bool(re.search(r"\b(benchmark|benchmarks|dataset|datasets|glue|mmlu|gsm8k|humaneval|imagenet)\b", global_corpus, re.IGNORECASE))
        has_empirical_eval = has_baselines or has_benchmarks
        has_uncertainty = any(item.id == "statistical-significance" and item.answer == "present" for item in item_assessments)
        has_limitations = any(item.id == "limitations" and item.answer == "present" for item in item_assessments)
        has_compute = any(item.id == "compute-resources" and item.answer == "present" for item in item_assessments)
        
        # Code detection
        code_match = re.search(r"https?://(www\.)?(github\.com|gitlab\.com|huggingface\.co)/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", global_corpus, re.IGNORECASE)
        code_url = re.sub(r"[.,;:)\s]+$", "", code_match.group(0)) if code_match else None
        has_code = bool(code_match) or any(item.id == "reproducibility-path" and item.answer == "present" for item in item_assessments)
        
        # Compute snippet
        compute_match = re.search(r"\b(\d+\s*(x|\*)\s*(a100|h100|v100|t4|rtx\s*\d+|gpu|tpu)s?|\b(gpu|tpu)\s+hours?\b|\btrained\s+for\s+\d+\s+(hours?|days?|epochs?)\b)", global_corpus, re.IGNORECASE)
        compute_details = compute_match.group(0) if compute_match else None

        has_dataset = "dataset" in global_corpus.lower() or "data availability" in global_corpus.lower()

        return ChecklistRubric(
            has_ablation=has_ablation,
            has_baselines=has_baselines,
            has_benchmarks=has_benchmarks,
            has_empirical_eval=has_empirical_eval,
            has_uncertainty_quant=has_uncertainty,
            has_code_repo=has_code,
            code_url=code_url,
            has_dataset_link=has_dataset,
            has_compute_budget=has_compute,
            compute_details=compute_details,
            has_limitations=has_limitations,
            rubric_score=round(total_score, 1),
            items=item_assessments,
            rubric_gaps=gaps_count,
            recommendations=recommendations,
        )

    def _classify_section(self, title: str, declared_type: Optional[str] = None) -> str:
        """Classify a section into canonical standard academic section categories."""
        if declared_type and declared_type in SECTION_ALIASES:
            return declared_type
        clean_title = (title or "").lower().strip()
        for cat, aliases in SECTION_ALIASES.items():
            for alias in aliases:
                if alias in clean_title:
                    return cat
        return "other"

    def _extract_snippet(self, text: str, start: int, end: int, window: int = 100) -> str:
        """Extract a readable evidence excerpt centered around the matched marker."""
        snip_start = max(0, start - window)
        snip_end = min(len(text), end + window)
        raw = text[snip_start:snip_end].strip()
        # Clean linebreaks
        raw = re.sub(r"\s+", " ", raw)
        prefix = "..." if snip_start > 0 else ""
        suffix = "..." if snip_end < len(text) else ""
        return f"{prefix}{raw}{suffix}"

