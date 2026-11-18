"""
Domain 2: Paper Intelligence & Evidence Extraction MCP Tools.
Tools:
  - read_paper_full: Structured section extraction (Abstract, Method, Results, Limitations).
  - summarize_paper: Multi-dimensional executive and architectural summary with benchmark & claim verification.
  - extract_paper_assets: Figure, table, and equation coordinate extraction.
  - verify_paper_claim: (Coming next) Ground claims against verbatim paper text.
  - paper_grounded_qa: (Coming next) Hybrid RAG Q&A with page citations.
"""
import asyncio
import json
import re
from typing import Any, Dict, List, Optional
import pymupdf as fitz
from src.core.canonical_models import PaperSummarizeRequest
from src.core.database import get_db_session
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine
from src.engines.pdf_extractor import PDFExtractor
from src.engines.pdf_parser import PDFSectionExtractor
from src.engines.pdf_visual_extractor import PDFVisualExtractor


_canonical_resolver = CanonicalPaperResolver()
_pdf_extractor = PDFExtractor(timeout=25.0)
_pdf_parser = PDFSectionExtractor()
_paper_intel_engine = PaperIntelligenceEngine()
_visual_extractor = PDFVisualExtractor()


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


EXTRACT_PAPER_ASSETS_METADATA = {
    "name": "extract_paper_assets",
    "description": (
        "Extracts visual and mathematical assets embedded in a research paper PDF: "
        "high-resolution figure diagrams, tabular benchmarks with parsed markdown tables, "
        "and LaTeX/numbered equations with page numbers and bounding-box coordinates."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "paper_id": {
                "type": "string",
                "description": "Paper identifier: arXiv ID (e.g. '1706.03762'), DOI, or scientific paper URL/title.",
            },
            "asset_type": {
                "type": "string",
                "enum": ["all", "figures", "tables", "equations"],
                "description": "Specific asset type to filter: 'figures', 'tables', 'equations', or 'all' (default: 'all').",
            },
            "include_image_data": {
                "type": "boolean",
                "description": "Whether to include base64 data URLs for figures/tables (default: false to conserve token context).",
            },
            "max_assets": {
                "type": "integer",
                "description": "Maximum number of assets to extract per category (default: 20, max: 50).",
            },
        },
        "required": ["paper_id"],
    },
}

MATH_SYMBOLS = (
    "\\sum", "\\prod", "\\int", "\\frac", "\\sqrt", "\\argmax", "\\argmin",
    "\\mathcal", "\\mathbb", "\\mathbf", "\\sigma", "\\alpha", "\\beta",
    "\\gamma", "\\lambda", "\\theta", "\\nabla", "\\partial", "\\approx",
    "\\leq", "\\geq", "\\in", "\\times", "\\to",
)

EQUATION_REGEX = re.compile(
    r"(?:=\s*.+\s*\([0-9IVX]+\)$)|(?:\bEq(?:uation)?\.?\s*\(?[0-9IVX]+\)?)|(?:^[A-Za-z0-9\(\)\s\+\-\*\/\=\<\>\^\_]+\s*\([0-9IVX]+\)$)"
)


def _format_table_markdown(rows: List[List[Any]]) -> str:
    if not rows or not rows[0]:
        return ""
    clean_rows = []
    for r in rows:
        clean_rows.append([str(c or "").replace("\n", " ").strip() for c in r])
    col_count = max(len(r) for r in clean_rows)
    if col_count == 0:
        return ""
    header = clean_rows[0] + [""] * (col_count - len(clean_rows[0]))
    sep = ["---"] * col_count
    md_lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(sep) + " |",
    ]
    for r in clean_rows[1:]:
        padded = r + [""] * (col_count - len(r))
        md_lines.append("| " + " | ".join(padded) + " |")
    return "\n".join(md_lines)


async def handle_extract_paper_assets(arguments: Dict[str, Any]) -> str:
    """Extract figures, tables, and mathematical formulas from a research paper PDF."""
    paper_id = (arguments.get("paper_id") or arguments.get("identifier") or "").strip()
    if not paper_id:
        raise ValueError("Field 'paper_id' is required and cannot be empty.")

    asset_type = arguments.get("asset_type", "all").lower()
    if asset_type not in ("all", "figures", "tables", "equations"):
        asset_type = "all"

    include_image_data = bool(arguments.get("include_image_data", False))
    max_assets = max(1, min(int(arguments.get("max_assets", 20)), 50))

    logger.info(
        "[MCP extract_paper_assets] Extracting assets for '%s' (type=%s, include_image_data=%s, max=%d)",
        paper_id,
        asset_type,
        include_image_data,
        max_assets,
    )

    canonical = await _canonical_resolver.resolve(paper_id)
    if not canonical:
        return json.dumps({
            "success": False,
            "error": f"Paper '{paper_id}' could not be resolved across scientific sources.",
        }, indent=2)

    pdf_bytes = None
    if canonical.pdf_url:
        try:
            pdf_bytes = await _pdf_extractor.fetch_pdf_bytes(canonical.pdf_url)
        except Exception as e:
            logger.warning("[MCP extract_paper_assets] Failed to fetch PDF bytes from %s: %s", canonical.pdf_url, e)

    if not pdf_bytes:
        return json.dumps({
            "success": False,
            "paper_id": canonical.canonical_id,
            "title": canonical.title,
            "error": f"Could not obtain PDF bytes for paper '{paper_id}' (pdf_url: {canonical.pdf_url}). Asset extraction requires an accessible PDF.",
        }, indent=2)

    doc = None
    figures_out: List[Dict[str, Any]] = []
    tables_out: List[Dict[str, Any]] = []
    equations_out: List[Dict[str, Any]] = []

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        # 1. Extract Visual Assets (figures and visual tables)
        if asset_type in ("all", "figures", "tables"):
            visual_assets = _visual_extractor.extract_visual_assets(
                pdf_bytes, paper_id=canonical.canonical_id, max_assets=max_assets * 2
            )
            for va in visual_assets:
                is_table = (va.asset_type == "table")
                if is_table and asset_type in ("all", "tables"):
                    if len(tables_out) < max_assets:
                        md_content = ""
                        try:
                            page_idx = max(0, min(va.page - 1, len(doc) - 1))
                            p = doc[page_idx]
                            tabs = p.find_tables()
                            if tabs and tabs.tables:
                                rows = tabs.tables[0].extract()
                                md_content = _format_table_markdown(rows)
                        except Exception:
                            pass

                        tbl_item = {
                            "table_id": va.id,
                            "label": va.label,
                            "caption": va.caption,
                            "page_number": va.page,
                            "bounding_box": va.bbox,
                            "markdown_content": md_content,
                        }
                        if include_image_data and va.image_data_url:
                            tbl_item["image_data_url"] = va.image_data_url
                        tables_out.append(tbl_item)

                elif not is_table and asset_type in ("all", "figures"):
                    if len(figures_out) < max_assets:
                        fig_item = {
                            "figure_id": va.id,
                            "label": va.label,
                            "caption": va.caption,
                            "page_number": va.page,
                            "bounding_box": va.bbox,
                        }
                        if include_image_data and va.image_data_url:
                            fig_item["image_data_url"] = va.image_data_url
                        figures_out.append(fig_item)

        # 2. Extract Equations
        if asset_type in ("all", "equations"):
            for page_idx in range(min(len(doc), 30)):
                if len(equations_out) >= max_assets:
                    break
                page = doc[page_idx]
                page_num = page_idx + 1
                blocks = page.get_text("blocks") or []
                for b in blocks:
                    if len(equations_out) >= max_assets:
                        break
                    b_text = b[4].strip() if len(b) > 4 else ""
                    if not b_text or len(b_text) < 4:
                        continue
                    for line in b_text.split("\n"):
                        ln = line.strip()
                        if not ln or len(ln) < 4:
                            continue
                        is_eq = bool(EQUATION_REGEX.search(ln)) or (
                            any(sym in ln for sym in MATH_SYMBOLS) and ("=" in ln or "\\in" in ln)
                        )
                        if is_eq:
                            equations_out.append({
                                "equation_id": f"eq-p{page_num}-{len(equations_out) + 1}",
                                "page_number": page_num,
                                "text": ln,
                                "bounding_box": [round(b[0], 2), round(b[1], 2), round(b[2], 2), round(b[3], 2)],
                            })
                            if len(equations_out) >= max_assets:
                                break
    except Exception as e:
        logger.error("[MCP extract_paper_assets] Error extracting assets: %s", e, exc_info=True)
        return json.dumps({
            "success": False,
            "error": f"Asset extraction failed: {str(e)}",
        }, indent=2)
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass

    result: Dict[str, Any] = {
        "success": True,
        "paper_id": canonical.canonical_id,
        "title": canonical.title,
        "asset_type_filter": asset_type,
        "include_image_data": include_image_data,
        "total_figures": len(figures_out),
        "total_tables": len(tables_out),
        "total_equations": len(equations_out),
    }

    if asset_type == "figures":
        result["figures"] = figures_out
    elif asset_type == "tables":
        result["tables"] = tables_out
    elif asset_type == "equations":
        result["equations"] = equations_out
    else:
        result["figures"] = figures_out
        result["tables"] = tables_out
        result["equations"] = equations_out

    return json.dumps(result, indent=2)
