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


def parse_llm_json(raw_text: str) -> Optional[Any]:
    """
    Parse JSON from LLM output using bounded, deterministic repair steps:
    1. Direct json.loads
    2. Escape unescaped LaTeX backslashes (e.g. \\alpha, \\sum)
    3. Strip trailing commas before ] or }
    """
    cleaned = strip_markdown_fences(raw_text)
    if not cleaned:
        return None

    # Attempt 1: Direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Extract first JSON object/array span if surrounding prose leaked in
    match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
    candidate = match.group(1) if match else cleaned

    # Attempt 2: Escape unescaped LaTeX backslashes
    sanitized = re.sub(r'\\(?![/\"\\bfnrt]|u[0-9a-fA-F]{4})', r"\\\\", candidate)
    try:
        return json.loads(sanitized)
    except json.JSONDecodeError:
        pass

    # Attempt 3: Strip trailing commas
    try:
        no_trailing = re.sub(r",\s*([\]}])", r"\1", sanitized)
        return json.loads(no_trailing)
    except Exception as exc:
        logger.warning("[NoveltyJSON] Bounded JSON repair failed: %s", exc)
        return None
