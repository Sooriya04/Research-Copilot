import hashlib
import json
import re
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.factory import get_llm_provider

class ScientificGapExtractor:
    """Scientific Research Gap Extractor with dual AI-LLM and grounded NLP heuristic fallback modes."""

    def __init__(self, provider: Optional[BaseLLMProvider] = None):
        self._provider = provider

    def _get_provider(self) -> Optional[BaseLLMProvider]:
        if self._provider:
            return self._provider
        try:
            return get_llm_provider("gemini")
        except Exception:
            try:
                return get_llm_provider("ollama")
            except Exception:
                return None

    def extract_heuristic_gaps(
        self,
        title: str,
        abstract: str = "",
        sections: Optional[List[Dict[str, Any]]] = None,
        limitations: Optional[List[str]] = None,
        concerns: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Extract structured scientific research gaps using grounded heuristic NLP rules."""
        gaps: List[Dict[str, Any]] = []
        combined_text = f"{title}. {abstract} "
        if sections:
            for s in sections:
                if isinstance(s, dict):
                    combined_text += f"{s.get('title', '')} {s.get('content', '')} "

        lower_text = combined_text.lower()

        # If existing limitations or concerns are passed in, convert them directly
        if limitations:
            for idx, lim in enumerate(limitations):
                cat = "methodology_gap"
                lim_l = lim.lower()
                if any(w in lim_l for w in ["compute", "gpu", "overhead", "time", "memory", "resource", "cost"]):
                    cat = "compute_bottleneck"
                elif any(w in lim_l for w in ["generaliz", "ood", "out-of-distribution", "transfer", "domain"]):
                    cat = "ood_generalization"
                elif any(w in lim_l for w in ["theor", "proof", "bound", "guarantee", "formal"]):
                    cat = "theoretical_bound"
                elif any(w in lim_l for w in ["data", "bias", "label", "annotation"]):
                    cat = "dataset_bias"
                elif any(w in lim_l for w in ["evaluat", "metric", "benchmark", "synthetic"]):
                    cat = "evaluation_gap"

                gap_id = f"gap-{cat}-{hashlib.md5(lim.encode()).hexdigest()[:8]}"
                gaps.append({
                    "id": gap_id,
                    "category": cat,
                    "title": f"{cat.replace('_', ' ').title()}: {lim[:45]}...",
                    "description": lim,
                    "evidence_text": lim,
                    "proposed_direction": f"Develop empirical adaptations to alleviate: {lim[:90]}.",
                    "source_origin": "extracted_fallback",
                })

        if concerns:
            for idx, con in enumerate(concerns):
                cat = "evaluation_gap" if "statistical" in con.lower() or "code" in con.lower() else "methodology_gap"
                gap_id = f"gap-{cat}-{hashlib.md5(con.encode()).hexdigest()[:8]}"
                if not any(g["description"] == con for g in gaps):
                    gaps.append({
                        "id": gap_id,
                        "category": cat,
                        "title": f"Rigor Gap: {con[:45]}...",
                        "description": con,
                        "evidence_text": con,
                        "proposed_direction": f"Conduct standardized evaluations addressing: {con[:80]}.",
                        "source_origin": "extracted_fallback",
                    })

        # Pattern-based gap detection across abstract and text
        patterns = [
            (
                "compute_bottleneck",
                r"(quadratic|memory|latency|hardware|compute|gpu|tpu|expensive|costly|resource-intensive|computational overhead)",
                "Scaling & Computational Bound",
                "High computational demands and memory complexity constrain scaling to longer contexts or larger parameter regimes.",
                "Explore linear-time state-space mechanisms, low-rank approximations, or quantized architectures to reduce inference overhead."
            ),
            (
                "ood_generalization",
                r"(out-of-distribution|domain shift|generaliz|distributional shift|unseen|transfer|cross-domain)",
                "Out-of-Distribution Robustness",
                "Empirical effectiveness exhibits performance degradation under domain shift or noisy out-of-distribution transfer.",
                "Formulate domain-invariant loss formulations and stress-test on distributionally shifted benchmark splits."
            ),
            (
                "theoretical_bound",
                r"(heuristic|empirical|black-box|interpretab|lack.*theoretical|understanding.*mechanism|theoretical guarantee)",
                "Theoretical & Mechanistic Characterization",
                "Relies primarily on empirical validation without rigorous mathematical convergence bounds or causal circuit explanations.",
                "Construct formal theoretical bounds on error propagation and develop mechanistic interpretability probes."
            ),
            (
                "evaluation_gap",
                r"(benchmark|single dataset|synthetic|evaluat|metric|hallucinat|human evaluat|limited to)",
                "Comprehensive Benchmark Validation",
                "Validation is constrained to specific benchmark splits; broader empirical stress-testing across diverse real-world tasks is missing.",
                "Establish standardized multi-dataset evaluation suites with rigorous confidence intervals and statistical significance testing."
            ),
            (
                "dataset_bias",
                r"(supervis|annotat|label.*data|high-quality|sample.*efficien|few-shot|pretrain.*data)",
                "Data Efficiency & Label Dependency",
                "High dependency on massive curated training corpuses or dense supervised labels hinders few-shot adaptability.",
                "Investigate self-supervised representation alignment and zero-shot transfer protocols."
            ),
        ]

        for cat, pat, fallback_title, fallback_desc, fallback_dir in patterns:
            if not any(g["category"] == cat for g in gaps):
                match = re.search(pat, lower_text)
                if match:
                    # Find enclosing sentence for evidence
                    start = max(0, match.start() - 60)
                    end = min(len(combined_text), match.end() + 100)
                    evidence = combined_text[start:end].strip()
                    gaps.append({
                        "id": f"gap-{cat}-{hashlib.md5(title.encode()).hexdigest()[:6]}",
                        "category": cat,
                        "title": f"{fallback_title} in {title[:30]}",
                        "description": f"{fallback_desc} (Detected in context of '{match.group(0)}')",
                        "evidence_text": evidence,
                        "proposed_direction": fallback_dir,
                        "source_origin": "extracted_fallback",
                    })

        # Ensure at least 2 high-quality research gaps are formulated
        if len(gaps) < 2:
            default_cat = "methodology_gap" if not any(g["category"] == "methodology_gap" for g in gaps) else "evaluation_gap"
            gaps.append({
                "id": f"gap-{default_cat}-{hashlib.md5((title + 'default').encode()).hexdigest()[:6]}",
                "category": default_cat,
                "title": f"Ablation & Component Sensitivity in {title[:32]}",
                "description": f"Sensitivity analysis regarding component interaction, hyperparameter variance, and reproducibility bounds across alternative architectures for '{title}'.",
                "evidence_text": abstract[:140] if abstract else title,
                "proposed_direction": "Systematically ablate each architectural sub-module across varied random seeds to quantify variance bounds.",
                "source_origin": "extracted_fallback",
            })

        return gaps[:5]

    async def extract_gaps_with_llm(
        self,
        title: str,
        abstract: str,
        full_text: str = "",
    ) -> Optional[List[Dict[str, Any]]]:
        """Attempt LLM-based structured scientific research gap extraction."""
        provider = self._get_provider()
        if not provider:
            return None

        prompt = (
            "You are a Principal AI Research Engineer analyzing an academic paper to extract critical open research gaps.\n"
            f"Paper Title: {title}\n"
            f"Abstract: {abstract}\n"
            f"Text Excerpt: {full_text[:2000]}\n\n"
            "Identify 2 to 4 specific, actionable RESEARCH GAPS and LIMITATIONS in this work.\n"
            "Return STRICT JSON as an array of objects matching this exact schema:\n"
            "[\n"
            "  {\n"
            '    "category": "compute_bottleneck" | "ood_generalization" | "theoretical_bound" | "evaluation_gap" | "dataset_bias" | "methodology_gap",\n'
            '    "title": "Concise 3-7 word scientific gap title",\n'
            '    "description": "Precise explanation of the bottleneck or open limitation",\n'
            '    "evidence_text": "Direct excerpt or sentence reference from the paper",\n'
            '    "proposed_direction": "Actionable future research hypothesis or experimental test"\n'
            "  }\n"
            "]"
        )

        try:
            resp = await provider.complete([ChatMessage(role="user", content=prompt)])
            cleaned = resp.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) > 0:
                results = []
                for idx, item in enumerate(parsed):
                    if isinstance(item, dict) and item.get("description"):
                        cat = item.get("category", "methodology_gap")
                        results.append({
                            "id": f"gap-{cat}-{hashlib.md5((title + str(idx)).encode()).hexdigest()[:6]}",
                            "category": cat,
                            "title": item.get("title", f"Research Gap {idx+1}"),
                            "description": item.get("description"),
                            "evidence_text": item.get("evidence_text", abstract[:100]),
                            "proposed_direction": item.get("proposed_direction", "Further empirical investigation required."),
                            "source_origin": "ai_inferred",
                        })
                if results:
                    return results
        except Exception as e:
            logger.debug("[ScientificGapExtractor] LLM gap extraction failed: %s; falling back to heuristic", e)

        return None

    async def extract_gaps(
        self,
        title: str,
        abstract: str = "",
        sections: Optional[List[Dict[str, Any]]] = None,
        limitations: Optional[List[str]] = None,
        concerns: Optional[List[str]] = None,
        full_text: str = "",
        use_llm: bool = True,
    ) -> List[Dict[str, Any]]:
        """Unified gap extraction pipeline: tries LLM if permitted, gracefully falls back to grounded NLP heuristics."""
        if use_llm and abstract and len(abstract) > 50:
            llm_gaps = await self.extract_gaps_with_llm(title=title, abstract=abstract, full_text=full_text)
            if llm_gaps:
                return llm_gaps

        return self.extract_heuristic_gaps(
            title=title,
            abstract=abstract,
            sections=sections,
            limitations=limitations,
            concerns=concerns,
        )

    @staticmethod
    def synthesize_cross_paper_gaps(papers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Identify combinatorial and cross-cutting research gaps spanning between compared papers."""
        if len(papers) < 2:
            return []

        cross_gaps = []
        p1 = papers[0]
        p2 = papers[1]

        t1 = p1.get("title", "Paper 1")
        t2 = p2.get("title", "Paper 2")

        # 1. Cross-model transfer gap
        cross_gaps.append({
            "title": f"Cross-Paradigm Transfer: {t1[:25]} vs {t2[:25]}",
            "description": f"Evaluating whether the architectural mechanisms of '{t1[:30]}' can be integrated with the evaluation protocols or objective functions of '{t2[:30]}'.",
            "method": f"Hybrid {t1[:18]} + {t2[:18]}",
            "dataset_or_task": "Cross-Domain Benchmark Suite",
            "paper_ids": [p1.get("id", ""), p2.get("id", "")],
            "gap_type": "combinatorial_unexplored"
        })

        # 2. Compute efficiency vs accuracy trade-off
        cross_gaps.append({
            "title": f"Efficiency-Accuracy Pareto Frontier Comparison",
            "description": f"Lack of head-to-head Pareto frontier profiling under normalized FLOP and memory budgets comparing '{t1[:28]}' directly against '{t2[:28]}'.",
            "method": "Normalized Hardware Benchmark Profiling",
            "dataset_or_task": "Standardized Empirical Testbed",
            "paper_ids": [p1.get("id", ""), p2.get("id", "")],
            "gap_type": "empirical_tradeoff"
        })

        # If 3 or more papers, add a unified benchmark synthesis gap
        if len(papers) >= 3:
            p3 = papers[2]
            t3 = p3.get("title", "Paper 3")
            cross_gaps.append({
                "title": "Unified Tri-Model Robustness & Failure Mode Taxonomy",
                "description": f"Comparative evaluation across '{t1[:20]}', '{t2[:20]}', and '{t3[:20]}' on adversarial or noisy inputs to catalog mutual failure distributions.",
                "method": "Multi-System Stress Testing",
                "dataset_or_task": "Adversarial & OOD Robustness Suite",
                "paper_ids": [p.get("id", "") for p in papers[:3]],
                "gap_type": "meta_evaluation"
            })

        return cross_gaps
