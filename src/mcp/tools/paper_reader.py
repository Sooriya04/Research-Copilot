"""
Domain 2: Paper Intelligence & Evidence Extraction MCP Tools.
Tools:
  - read_paper_full: Structured section extraction (Abstract, Method, Results, Limitations).
  - summarize_paper: (Coming next) Multi-dimensional executive and architectural summary.
  - extract_paper_assets: (Coming next) Figure, table, and equation coordinate extraction.
  - verify_paper_claim: (Coming next) Ground claims against verbatim paper text.
  - paper_grounded_qa: (Coming next) Hybrid RAG Q&A with page citations.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.pdf_extractor import PDFExtractor
from src.engines.pdf_parser import PDFSectionExtractor


_canonical_resolver = CanonicalPaperResolver()
_pdf_extractor = PDFExtractor(timeout=25.0)
_pdf_parser = PDFSectionExtractor()


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
