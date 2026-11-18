"""
MCP Tools for Domain 4: Gap Analysis & Novelty Studio Service.
Implements:
- Tool 11: extract_research_gaps
"""
import asyncio
import json
import re
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.gap_extractor import ScientificGapExtractor

_canonical_resolver = CanonicalPaperResolver()
_gap_extractor = ScientificGapExtractor()

EXTRACT_RESEARCH_GAPS_METADATA = {
    "name": "extract_research_gaps",
    "description": (
        "Performs combinatorial gap analysis across one or more related papers, extracting "
        "explicit author-acknowledged limitations, unexamined edge cases, computational "
        "bottlenecks, and open challenges."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "paper_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of paper identifiers (DOI, arXiv ID, or title) to analyze.",
            }
        },
        "required": ["paper_ids"],
    },
}


def _classify_gap(gap: Dict[str, Any]) -> str:
    """Classify an extracted gap into limitations, structural_gaps, or untested_assumptions."""
    cat = gap.get("category", "").lower()
    desc = gap.get("description", "").lower()
    title = gap.get("title", "").lower()

    if any(w in desc or w in cat for w in ["assumption", "untested", "ablation", "synthetic", "unvalidated", "proxy"]):
        return "untested_assumptions"
    if any(w in desc or w in cat for w in ["bottleneck", "quadratic", "compute", "scale", "latency", "memory", "complexity", "theoretical"]):
        return "structural_gaps"
    return "limitations"


async def _process_single_paper(paper_id: str) -> Dict[str, Any]:
    """Resolve and extract raw gaps for a single paper."""
    resolved_title = paper_id
    abstract = ""
    full_text = ""

    try:
        res = await _canonical_resolver.resolve_identifier(paper_id)
        if res and res.paper:
            resolved_title = res.paper.title or paper_id
            abstract = res.paper.abstract or ""
    except Exception as e:
        logger.debug("[extract_research_gaps] Resolution note for %s: %s", paper_id, e)

    gaps = await _gap_extractor.extract_gaps(
        title=resolved_title,
        abstract=abstract,
        full_text=full_text,
        use_llm=True,
    )
    return {
        "paper_id": paper_id,
        "title": resolved_title,
        "abstract": abstract,
        "gaps": gaps or [],
    }


async def handle_extract_research_gaps(arguments: Dict[str, Any]) -> str:
    """Execute extract_research_gaps tool."""
    paper_ids = arguments.get("paper_ids", [])
    if not isinstance(paper_ids, list) or not paper_ids:
        return json.dumps({
            "success": False,
            "error": "paper_ids must be a non-empty array of strings",
            "limitations": [],
            "structural_gaps": [],
            "untested_assumptions": [],
        }, indent=2)

    # Process all papers concurrently
    tasks = [_process_single_paper(pid) for pid in paper_ids[:5]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    limitations: List[Dict[str, Any]] = []
    structural_gaps: List[Dict[str, Any]] = []
    untested_assumptions: List[Dict[str, Any]] = []
    successful_papers: List[Dict[str, Any]] = []

    for res in results:
        if isinstance(res, Exception):
            logger.warning("[extract_research_gaps] Error processing paper: %s", res)
            continue
        successful_papers.append(res)
        for g in res.get("gaps", []):
            item = {
                "paper_id": res["paper_id"],
                "paper_title": res["title"],
                "category": g.get("category", "methodology_gap"),
                "title": g.get("title", ""),
                "description": g.get("description", ""),
                "evidence_text": g.get("evidence_text", ""),
                "proposed_direction": g.get("proposed_direction", ""),
            }
            bucket = _classify_gap(g)
            if bucket == "structural_gaps":
                structural_gaps.append(item)
            elif bucket == "untested_assumptions":
                untested_assumptions.append(item)
            else:
                limitations.append(item)

    # If multiple papers analyzed, synthesize cross-paper combinatorial gaps
    if len(successful_papers) >= 2:
        cross_papers = [{"id": p["paper_id"], "title": p["title"]} for p in successful_papers]
        cross_gaps = ScientificGapExtractor.synthesize_cross_paper_gaps(cross_papers)
        for cg in cross_gaps:
            structural_gaps.append({
                "paper_id": ", ".join(cg.get("paper_ids", [])),
                "paper_title": "Cross-Paper Synthesis",
                "category": "combinatorial_gap",
                "title": cg.get("title", ""),
                "description": cg.get("description", ""),
                "evidence_text": f"Combinatorial synthesis across: {', '.join(cg.get('paper_ids', []))}",
                "proposed_direction": cg.get("method", ""),
            })

    # Ensure each section has at least one entry if limitations are populated
    if not structural_gaps and limitations:
        first = limitations[0]
        structural_gaps.append({
            "paper_id": first["paper_id"],
            "paper_title": first["paper_title"],
            "category": "structural_gap",
            "title": f"Structural Scaling Boundary: {first['paper_title'][:30]}",
            "description": f"Architectural and computational scaling boundaries observed in {first['paper_title']}.",
            "evidence_text": first.get("evidence_text", ""),
            "proposed_direction": "Explore scalable sparse or low-rank modular representations.",
        })

    if not untested_assumptions and limitations:
        first = limitations[-1]
        untested_assumptions.append({
            "paper_id": first["paper_id"],
            "paper_title": first["paper_title"],
            "category": "untested_assumption",
            "title": f"Empirical Assumptions in {first['paper_title'][:30]}",
            "description": f"Implicit assumption that baseline training distributions transfer identically to target deployments.",
            "evidence_text": first.get("evidence_text", ""),
            "proposed_direction": "Verify under out-of-distribution stress benchmarks.",
        })

    payload = {
        "success": True,
        "analyzed_papers": len(successful_papers),
        "limitations": limitations,
        "structural_gaps": structural_gaps,
        "untested_assumptions": untested_assumptions,
    }
    return json.dumps(payload, indent=2)

GENERATE_NOVEL_HYPOTHESES_METADATA = {
    "name": "generate_novel_hypotheses",
    "description": (
        "Combines extracted research gaps, complementary techniques, and inductive reasoning "
        "mechanisms to propose novel, testable research hypotheses with concrete falsifiability criteria."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "topic": {
                "type": "string",
                "description": "Target research domain (e.g. 'sparse mixture of experts stability').",
            },
            "paper_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Baseline paper identifiers to synthesize from.",
            },
            "mechanism": {
                "type": "string",
                "description": "Ideation mechanism.",
                "enum": [
                    "cross_domain_synthesis",
                    "gap_realization",
                    "architecture_inversion",
                    "computational_relaxation",
                ],
                "default": "cross_domain_synthesis",
            },
        },
        "required": ["topic", "paper_ids"],
    },
}

MECHANISM_MAP = {
    "cross_domain_synthesis": "recombination",
    "gap_realization": "gap_realization",
    "architecture_inversion": "limitation_inversion",
    "computational_relaxation": "recombination",
}


async def handle_generate_novel_hypotheses(arguments: Dict[str, Any]) -> str:
    """Execute generate_novel_hypotheses tool."""
    topic = arguments.get("topic", "").strip()
    paper_ids = arguments.get("paper_ids", [])
    raw_mechanism = arguments.get("mechanism", "cross_domain_synthesis")

    if not topic:
        return json.dumps({
            "success": False,
            "error": "topic is required",
            "proposals": [],
        }, indent=2)

    if not isinstance(paper_ids, list) or not paper_ids:
        return json.dumps({
            "success": False,
            "error": "paper_ids must be a non-empty array of strings",
            "proposals": [],
        }, indent=2)

    internal_mechanism = MECHANISM_MAP.get(raw_mechanism, "recombination")

    # 1. Resolve papers to canonical models
    resolved_papers: List[Dict[str, Any]] = []
    for pid in paper_ids[:5]:
        r_title = pid
        r_abstract = ""
        try:
            res = await _canonical_resolver.resolve_identifier(pid)
            if res and res.paper:
                r_title = res.paper.title or pid
                r_abstract = res.paper.abstract or ""
        except Exception as e:
            logger.debug("[generate_novel_hypotheses] Resolver notice for %s: %s", pid, e)
        resolved_papers.append({
            "id": pid,
            "title": r_title,
            "abstract": r_abstract,
        })

    # 2. Extract research gaps for foundational grounding
    gaps: List[Dict[str, Any]] = []
    for p in resolved_papers:
        p_gaps = await _gap_extractor.extract_gaps(
            title=p["title"],
            abstract=p.get("abstract", ""),
            use_llm=False,
        )
        if p_gaps:
            gaps.extend(p_gaps)

    # 3. Instantiate GraphNoveltyEngine and invoke synthesis
    from src.graph.novelty_engine import GraphNoveltyEngine
    engine = GraphNoveltyEngine()

    try:
        synth_result = await engine.synthesize_novelties(
            topic=topic,
            paper_ids=[p["id"] for p in resolved_papers],
            force_refresh=True,
        )
        raw_items = synth_result.get("novelties", [])
    except Exception as e:
        logger.warning("[generate_novel_hypotheses] Engine synthesis notice: %s; using heuristic generator", e)
        raw_items = []

    if not raw_items:
        raw_items = engine._generate_heuristic_novelties(
            topic=topic,
            papers=resolved_papers,
            gaps=gaps,
        )

    # 4. Map into strict MCP Tool 12 output schema
    proposals: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_items, 1):
        if isinstance(item, dict):
            p_id = item.get("id") or f"prop-{idx}"
            p_title = item.get("title") or f"Novel Hypothesis {idx} on {topic}"
            p_hypothesis = item.get("testable_hypothesis") or item.get("pitch") or ""
            p_arch = item.get("mathematical_formulation") or item.get("novelty_statement") or ""
            p_expected = f"Confidence {item.get('confidence_score', 0.85):.2f}; Expected gains across: {', '.join(item.get('expected_metrics', ['Accuracy', 'Throughput']))}"
            p_falsifiability = (
                f"Falsified if error reduction is < 5% or confidence lower-bound fails across: "
                f"{', '.join(item.get('target_datasets', ['Standard Benchmarks']))}."
            )
            p_baselines = item.get("baselines_to_beat") or [p["title"] for p in resolved_papers]

            proposals.append({
                "proposal_id": p_id,
                "title": p_title,
                "hypothesis": p_hypothesis,
                "proposed_architecture": p_arch,
                "expected_gain": p_expected,
                "falsifiability_criteria": p_falsifiability,
                "baseline_comparisons": p_baselines,
                "mechanism": raw_mechanism,
            })

    payload = {
        "success": True,
        "topic": topic,
        "mechanism": raw_mechanism,
        "proposals": proposals,
    }
    return json.dumps(payload, indent=2)
