"""
Consolidated JSON extraction and normalization utilities for noisy LLM outputs.
"""
import json
import re
from typing import Any, Dict, Optional
from src.core.logger import logger


def strip_markdown_fences(text: str) -> str:
    """Strips markdown code fences (```json ... ``` or ``` ... ```) from text."""
    if not text:
        return ""
    cleaned = text.strip()
    # Match leading ```json or ```
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    # Match trailing ```
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def sanitize_json_string(text: str) -> str:
    """Sanitizes unescaped LaTeX backslashes and trailing commas in JSON strings."""
    if not text:
        return ""
    # Sanitize unescaped LaTeX backslashes (\alpha, \sum, \mathcal, etc.)
    sanitized = re.sub(r'\\(?![/\"\\bfnrt]|u[0-9a-fA-F]{4})', r'\\\\', text)
    # Strip trailing commas before closing braces/brackets
    sanitized = re.sub(r',\s*([\]}])', r'\1', sanitized)
    return sanitized


def parse_llm_json(text: Optional[str], default: Any = None) -> Any:
    """
    Robustly parses JSON data (dict, list, or primitive) from potentially noisy LLM output.
    Handles markdown code fences, embedded JSON blocks, unescaped LaTeX backslashes,
    and trailing commas.
    """
    if not text or not str(text).strip():
        return default

    cleaned = strip_markdown_fences(str(text))
    if not cleaned:
        return default

    # 1. Direct parse attempt
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # 2. Sanitize unescaped LaTeX backslashes and trailing commas
    try:
        sanitized = sanitize_json_string(cleaned)
        return json.loads(sanitized)
    except Exception:
        pass

    # 3. Regex search for JSON object {...}
    match_obj = re.search(r"\{[\s\S]*\}", cleaned)
    if match_obj:
        candidate = match_obj.group(0)
        try:
            return json.loads(candidate)
        except Exception:
            try:
                return json.loads(sanitize_json_string(candidate))
            except Exception:
                pass

    # 4. Regex search for JSON array [...]
    match_arr = re.search(r"\[[\s\S]*\]", cleaned)
    if match_arr:
        candidate = match_arr.group(0)
        try:
            return json.loads(candidate)
        except Exception:
            try:
                return json.loads(sanitize_json_string(candidate))
            except Exception:
                pass

    return default


def extract_json_from_llm_text(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Extracts a JSON dictionary from LLM response text.
    Returns None if text does not contain a valid JSON dictionary.
    """
    res = parse_llm_json(text, default=None)
    return res if isinstance(res, dict) else None


# Backward compatibility aliases
extract_json_dict = extract_json_from_llm_text
_extract_json = extract_json_from_llm_text
_extract_synthesis_json = extract_json_from_llm_text
