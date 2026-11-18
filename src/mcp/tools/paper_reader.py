"""
Domain 2: Paper Intelligence & Evidence Extraction MCP Tools.
Tools:
  - read_paper_full: Structured section extraction (Abstract, Method, Results, Limitations).
  - summarize_paper: Multi-dimensional executive and architectural summary with benchmark & claim verification.
  - extract_paper_assets: (Coming next) Figure, table, and equation coordinate extraction.
  - verify_paper_claim: (Coming next) Ground claims against verbatim paper text.
  - paper_grounded_qa: (Coming next) Hybrid RAG Q&A with page citations.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional
from src.core.canonical_models import PaperSummarizeRequest
from src.core.database import get_db_session
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine
from src.engines.pdf_extractor import PDFExtractor
from src.engines.pdf_parser import PDFSectionExtractor


_canonical_resolver = CanonicalPaperResolver()
_pdf_extractor = PDFExtractor(timeout=25.0)
_pdf_parser = PDFSectionExtractor()
_paper_intel_engine = PaperIntelligenceEngine()


READ_PAPER_FULL_METADATA = {
    "name": "read_paper_full",
    "description": (
        "Downloads, parses, and extracts structured textual sections (Abstract, Introduction, Method, "
        "Experiments, Results, Discussion, Limitations) from a research paper PDF or open-access record, "
        "with character budgeting to prevent LLM context overflow."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "identifier": {
                "type": "string",
                "description": "Paper identifier: arXiv ID (e.g. '1706.03762'), DOI, or open-access PDF URL.",
            },
            "include_sections": {
                "type": "boolean",
                "description": "Whether to return split structured sections (default: true).",
            },
            "max_chars": {
                "type": "integer",
                "description": "Maximum character budget across extracted text (default: 50000, max: 120000).",
            },
        },
        "required": ["identifier"],
    },
}


async def handle_read_paper_full(arguments: Dict[str, Any]) -> str:
    """Download, parse, and structure sections from a research paper."""
    identifier = arguments.get("identifier", "").strip()
    if not identifier:
        raise ValueError("Field 'identifier' is required and cannot be empty.")

    include_sections = bool(arguments.get("include_sections", True))
    max_chars = max(1000, min(int(arguments.get("max_chars", 50000)), 120000))

    logger.info("[MCP read_paper_full] Reading paper: '%s' (max_chars=%d)", identifier, max_chars)

    canonical = await _canonical_resolver.resolve(identifier)
    if not canonical:
        return json.dumps({
            "success": False,
            "error": f"Paper '{identifier}' could not be resolved across scientific sources.",
        }, indent=2)

    authors_list = [a.name for a in (canonical.authors or []) if hasattr(a, "name")]
    pdf_url = canonical.pdf_url

    parsed_sections: List[Dict[str, Any]] = []
    char_count = 0
    pdf_downloaded = False

    if pdf_url:
        try:
            pdf_bytes = await _pdf_extractor.fetch_pdf_bytes(pdf_url)
            if pdf_bytes:
                pdf_downloaded = True
                raw_sections = _pdf_parser.parse_pdf_bytes(pdf_bytes)
                for sec in raw_sections:
                    content = sec.content or ""
                    if char_count + len(content) > max_chars:
                        budget_left = max(0, max_chars - char_count)
                        if budget_left > 100:
                            parsed_sections.append({
                                "title": sec.title,
                                "section_type": sec.section_type,
                                "content": content[:budget_left] + "\n[...truncated to character budget...]",
                            })
                        break
                    parsed_sections.append({
                        "title": sec.title,
                        "section_type": sec.section_type,
                        "content": content,
                    })
                    char_count += len(content)
        except Exception as e:
            logger.warning("[MCP read_paper_full] PDF download/parse failed for %s: %s", pdf_url, e)

    # Fallback to abstract if no sections parsed
    if not parsed_sections and canonical.abstract:
        parsed_sections.append({
            "title": "Abstract",
            "section_type": "abstract",
            "content": canonical.abstract[:max_chars],
        })

    combined_text = "\n\n".join(
        f"## {s['title']} ({s['section_type']})\n{s['content']}" for s in parsed_sections
    )

    payload = {
        "success": True,
        "paper_id": canonical.canonical_id,
        "title": canonical.title,
        "authors": authors_list,
        "year": canonical.year,
        "venue": canonical.venue,
        "doi": canonical.doi,
        "arxiv_id": canonical.arxiv_id,
        "pdf_url": canonical.pdf_url,
        "pdf_downloaded": pdf_downloaded,
        "total_sections": len(parsed_sections),
        "total_characters": len(combined_text),
    }

    if include_sections:
        payload["sections"] = parsed_sections
    else:
        payload["full_text"] = combined_text

    return json.dumps(payload, indent=2)


SUMMARIZE_PAPER_METADATA = {
    "name": "summarize_paper",
    "description": (
        "Generates or retrieves a structured scientific summary of a paper, including problem formulation, "
        "key architectural contributions, methodology, empirical experiments, limitations, benchmark metrics from "
        "Papers with Code, and verified claims."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "identifier": {
                "type": "string",
                "description": "Paper identifier: arXiv ID (e.g. '1706.03762'), DOI, or scientific paper title.",
            },
            "force_refresh": {
                "type": "boolean",
                "description": "Whether to bypass cached SQLite analysis and force live extraction (default: false).",
            },
        },
        "required": ["identifier"],
    },
}


async def handle_summarize_paper(arguments: Dict[str, Any]) -> str:
    """End-to-end paper analysis: extraction, benchmarks, LLM synthesis, and claim verification."""
    identifier = arguments.get("identifier", "").strip()
    if not identifier:
        raise ValueError("Field 'identifier' is required and cannot be empty.")

    force_refresh = bool(arguments.get("force_refresh", False))
    logger.info("[MCP summarize_paper] Summarizing paper: '%s' (force_refresh=%s)", identifier, force_refresh)

    try:
        async with get_db_session() as db:
            resp = await _paper_intel_engine.summarize_paper(
                PaperSummarizeRequest(identifier=identifier, force_refresh=force_refresh),
                db,
            )
            paper = resp.canonical_paper
            summary = paper.summary

            payload = {
                "success": True,
                "paper_id": paper.canonical_id,
                "title": paper.title,
                "authors": [a.name for a in (paper.authors or []) if hasattr(a, "name")],
                "year": paper.year,
                "venue": paper.venue,
                "doi": paper.doi,
                "arxiv_id": paper.arxiv_id,
                "cached": resp.cached,
                "execution_time_ms": resp.execution_time_ms,
                "summary": {
                    "problem": summary.problem if summary else "",
                    "contributions": summary.contributions if summary else [],
                    "methodology": summary.methodology if summary else "",
                    "experiments": summary.experiments if summary else "",
                    "limitations": summary.limitations if summary else [],
                    "open_questions": summary.open_questions if summary else [],
                    "claims": [
                        {
                            "claim": c.claim,
                            "evidence": c.evidence,
                            "metric": c.metric,
                            "value": c.value,
                            "baseline": c.baseline,
                            "confidence": c.confidence,
                            "verification_status": (
                                c.verification_status.value
                                if hasattr(c.verification_status, "value")
                                else str(c.verification_status)
                            ),
                        }
                        for c in (summary.claims if summary else [])
                    ],
                    "model_used": summary.model_used if summary else None,
                },
                "benchmarks": [
                    {
                        "task": b.task,
                        "dataset": b.dataset,
                        "metric": b.metric,
                        "value": b.value,
                        "model": b.model,
                    }
                    for b in (paper.benchmarks or [])
                ],
                "code_repositories": [
                    {
                        "url": r.url,
                        "is_official": r.is_official,
                        "stars": r.stars,
                        "framework": r.framework,
                    }
                    for r in (paper.code_repositories or [])
                ],
            }
            return json.dumps(payload, indent=2)
    except Exception as e:
        logger.warning("[MCP summarize_paper] Primary pipeline failed for '%s', attempting fallback: %s", identifier, e)
        canonical = await _canonical_resolver.resolve(identifier)
        if not canonical:
            return json.dumps({
                "success": False,
                "error": f"Failed to analyze or resolve paper '{identifier}': {str(e)}",
            }, indent=2)

        payload = {
            "success": True,
            "paper_id": canonical.canonical_id,
            "title": canonical.title,
            "authors": [a.name for a in (canonical.authors or []) if hasattr(a, "name")],
            "year": canonical.year,
            "venue": canonical.venue,
            "doi": canonical.doi,
            "arxiv_id": canonical.arxiv_id,
            "cached": False,
            "execution_time_ms": 0.0,
            "summary": {
                "problem": "Extracted from paper abstract: " + (canonical.abstract[:300] if canonical.abstract else "N/A"),
                "contributions": ["Extracted from canonical metadata"],
                "methodology": canonical.abstract or "Full methodology requires live LLM extraction.",
                "experiments": "Refer to published paper sections.",
                "limitations": [],
                "open_questions": [],
                "claims": [],
                "model_used": "extractive-fallback",
            },
            "benchmarks": [],
            "code_repositories": [],
            "note": f"Structured summary generated via metadata fallback (pipeline exception: {str(e)})",
        }
        return json.dumps(payload, indent=2)
