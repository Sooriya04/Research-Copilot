"""
Module: src/novelty/json_utils.py

What this file does:
Provides bounded, deterministic JSON extraction and repair utilities for parsing
structured LLM responses containing LaTeX math or minor formatting artifacts.

Functions:
- strip_markdown_fences(raw_text): Strips leading/trailing ```json or ``` code fences.
- parse_llm_json(raw_text): Performs bounded 3-stage JSON parsing (direct, LaTeX backslash
  escaping, trailing-comma removal) and returns the parsed dict/list or None.
"""
import json
import re
from typing import Any, Optional

from src.core.logger import logger


def strip_markdown_fences(raw_text: str) -> str:
    """Remove surrounding Markdown code fences from an LLM string."""
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _extract_balanced_spans(text: str) -> list[str]:
    """Find all top-level balanced {...} or [...] blocks in text."""
    spans: list[str] = []
    stack: list[str] = []
    start_idx = -1
    in_string = False
    escape = False

    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch in ("{", "["):
            if not stack:
                start_idx = i
            stack.append(ch)
        elif ch in ("}", "]"):
            if stack:
                expected = "}" if stack[-1] == "{" else "]"
                if ch == expected:
                    stack.pop()
                    if not stack and start_idx != -1:
                        spans.append(text[start_idx : i + 1])
                        start_idx = -1
                else:
                    stack.clear()
                    start_idx = -1

    return spans


def _try_parse_candidate(candidate: str) -> Optional[Any]:
    """Attempt parsing a candidate JSON string through repair stages."""
    # Stage 1: direct parse with strict=False (allows unescaped newlines/tabs in strings)
    try:
        return json.loads(candidate, strict=False)
    except Exception:
        pass

    # Stage 2: Escape unescaped LaTeX backslashes (e.g. \alpha, \sum)
    sanitized = re.sub(r'\\(?![/\"\\bfnrt]|u[0-9a-fA-F]{4})', r"\\\\", candidate)
    try:
        return json.loads(sanitized, strict=False)
    except Exception:
        pass

    # Stage 3: Strip trailing commas
    try:
        no_trailing = re.sub(r",\s*([\]}])", r"\1", sanitized)
        return json.loads(no_trailing, strict=False)
    except Exception:
        pass

    return None


def parse_llm_json(raw_text: str) -> Optional[Any]:
    """
    Parse JSON from LLM output using bounded, deterministic repair steps:
    1. Direct json.loads with strict=False
    2. Extract balanced JSON block ({...} or [...])
    3. Escape unescaped LaTeX backslashes (e.g. \\alpha, \\sum)
    4. Strip trailing commas before ] or }
    """
    cleaned = strip_markdown_fences(raw_text)
    if not cleaned:
        return None

    # Attempt 1: Direct parse of entire cleaned string
    res = _try_parse_candidate(cleaned)
    if res is not None:
        return res

    # Attempt 2: Extract balanced JSON object/array spans (tolerating surrounding prose/thoughts)
    spans = _extract_balanced_spans(cleaned)
    for span in sorted(spans, key=len, reverse=True):
        res = _try_parse_candidate(span)
        if res is not None:
            return res

    logger.warning("[NoveltyJSON] Bounded JSON repair failed for input.")
    return None
