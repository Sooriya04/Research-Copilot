import pytest
from src.core.json_utils import parse_llm_json, extract_json_from_llm_text, strip_markdown_fences, sanitize_json_string


def test_strip_markdown_fences():
    assert strip_markdown_fences("```json\n{\"a\": 1}\n```") == '{"a": 1}'
    assert strip_markdown_fences("```\n{\"a\": 1}\n```") == '{"a": 1}'
    assert strip_markdown_fences('{"a": 1}') == '{"a": 1}'
    assert strip_markdown_fences("") == ""


def test_sanitize_json_string():
    # LaTeX backslashes
    raw = '{"formula": "\\alpha + \\beta = \\gamma", "sum": "\\sum_{i=1}^n x_i"}'
    sanitized = sanitize_json_string(raw)
    assert "\\\\alpha" in sanitized
    assert "\\\\sum" in sanitized

    # Trailing commas
    trailing = '{"a": 1, "b": [2, 3,],}'
    sanitized_commas = sanitize_json_string(trailing)
    assert sanitized_commas == '{"a": 1, "b": [2, 3]}'


def test_parse_llm_json():
    # Clean json
    assert parse_llm_json('{"key": "value"}') == {"key": "value"}
    
    # Fenced json
    assert parse_llm_json('```json\n{"score": 95.5}\n```') == {"score": 95.5}
    
    # Text surrounding json
    noisy = 'Here is the requested evaluation:\n```json\n{"status": "success", "items": [1, 2]}\n```\nHope this helps!'
    assert parse_llm_json(noisy) == {"status": "success", "items": [1, 2]}
    
    # Unescaped LaTeX formulas
    latex_json = '{"hypothesis": "Convergence rate of \\mathcal{O}(1/\\sqrt{T})", "detail": "\\beta_1 parameter"}'
    parsed = parse_llm_json(latex_json)
    assert parsed is not None
    assert "Convergence rate" in parsed["hypothesis"]

    # Trailing commas in objects and arrays
    trailing_json = '{"name": "test", "values": [10, 20,], "meta": {"nested": true,},}'
    parsed_trailing = parse_llm_json(trailing_json)
    assert parsed_trailing == {"name": "test", "values": [10, 20], "meta": {"nested": True}}

    # Empty and invalid
    assert parse_llm_json("") is None
    assert parse_llm_json(None) is None
    assert parse_llm_json("Not a json at all") is None
    assert parse_llm_json("Not a json at all", default={"fallback": True}) == {"fallback": True}


def test_extract_json_from_llm_text():
    # Valid dict
    assert extract_json_from_llm_text('{"a": 1}') == {"a": 1}
    # List instead of dict returns None
    assert extract_json_from_llm_text('[1, 2, 3]') is None
    # None on invalid
    assert extract_json_from_llm_text("invalid") is None
