import re
from typing import Dict, List, Optional
from src.core.schemas import ChecklistRubric, Paper

class RubricEvaluator:
    """Evaluates papers against empirical scientific rigor and reproducibility heuristics."""

    ABLATION_PATTERNS = [
        re.compile(r"\b(ablation\s+(study|studies|experiments?|table|results?)|ablated)\b", re.IGNORECASE),
        re.compile(r"\bwithout\s+(the\s+)?(component|loss|module|layer|attention)\b", re.IGNORECASE),
    ]

    BASELINE_PATTERNS = [
        re.compile(r"\b(compared\s+(with|against|to)\s+baselines?|baseline\s+models?|sota\s+baselines?)\b", re.IGNORECASE),
        re.compile(r"\b(outperforms?|superior\s+to|state-of-the-art|benchmark\s+comparison)\b", re.IGNORECASE),
    ]

    BENCHMARK_PATTERNS = [
        re.compile(r"\b(evaluated\s+on|benchmark\s+dataset|standard\s+benchmarks?)\b", re.IGNORECASE),
        re.compile(r"\b(glue|superglue|mmlu|gsm8k|humaneval|imagenet|cifar|squad|pdbbind|cameo)\b", re.IGNORECASE),
    ]

    UNCERTAINTY_PATTERNS = [
        re.compile(r"\b(confidence\s+intervals?|\bci\b|\bstd\b|standard\s+deviations?|error\s+bars?|p\s*<\s*0\.0\d|statistical\s+significance)\b", re.IGNORECASE),
        re.compile(r"\b(\+\/|\u00b1)\s*\d+(\.\d+)?\b"),
    ]

    CODE_PATTERNS = [
        re.compile(r"https?://(www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", re.IGNORECASE),
        re.compile(r"https?://(www\.)?gitlab\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", re.IGNORECASE),
        re.compile(r"\b(code\s+(is\s+)?available\s+at|source\s+code\s+released|open-source\s+implementation)\b", re.IGNORECASE),
    ]

    COMPUTE_PATTERNS = [
        re.compile(r"\b(\d+\s*(x|\*)\s*(a100|h100|v100|t4|rtx|gpu|tpu)s?|\b(gpu|tpu)\s+hours?\b|\btrained\s+for\s+\d+\s+(hours?|days?|epochs?)\b)", re.IGNORECASE),
        re.compile(r"\b(batch\s+size\s*(of|=)\s*\d+|learning\s+rate\s*(of|=)\s*[\d.e-]+|adamw?\s+optimizer)\b", re.IGNORECASE),
    ]

    LIMITATION_PATTERNS = [
        re.compile(r"\b(limitations?|failure\s+cases?|threats\s+to\s+validity|future\s+work|bottlenecks?)\b", re.IGNORECASE),
    ]

    def evaluate(self, paper: Paper, full_text: Optional[str] = None) -> ChecklistRubric:
        """Run heuristic rubric evaluations on paper abstract and extracted text."""
        corpus = (paper.abstract or "") + " "
        if full_text:
            corpus += full_text + " "
        for sec in paper.sections:
            corpus += (sec.content or "") + " "

        has_ablation = any(bool(pat.search(corpus)) for pat in self.ABLATION_PATTERNS)
        has_baselines = any(bool(pat.search(corpus)) for pat in self.BASELINE_PATTERNS)
        has_benchmarks = any(bool(pat.search(corpus)) for pat in self.BENCHMARK_PATTERNS)
        has_empirical_eval = has_baselines or has_benchmarks
        has_uncertainty = any(bool(pat.search(corpus)) for pat in self.UNCERTAINTY_PATTERNS)
        
        # Code detection
        code_url = None
        has_code = False
        for pat in self.CODE_PATTERNS:
            match = pat.search(corpus)
            if match:
                has_code = True
                raw_match = match.group(0)
                if raw_match.startswith("http"):
                    code_url = re.sub(r"[.,;:)\s]+$", "", raw_match)
                break

        # Compute budget
        has_compute = False
        compute_details = None
        for pat in self.COMPUTE_PATTERNS:
            match = pat.search(corpus)
            if match:
                has_compute = True
                compute_details = match.group(0)
                break

        has_limitations = any(bool(pat.search(corpus)) for pat in self.LIMITATION_PATTERNS)
        has_dataset = "dataset" in corpus.lower() or "data availability" in corpus.lower()

        # Rubric Score (0 to 100)
        score = 0.0
        if has_empirical_eval: score += 25.0
        if has_ablation: score += 20.0
        if has_code: score += 20.0
        if has_uncertainty: score += 15.0
        if has_compute: score += 10.0
        if has_limitations: score += 10.0

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
            rubric_score=score
        )
