import os
import pytest
from src.engines.pdf_markdown_engine import PDFMarkdownEngine


def test_pdf_markdown_anara_conversion():
    sample_pdf_path = "./others/dump/paper.pdf"
    if not os.path.exists(sample_pdf_path):
        pytest.skip("Sample PDF not found in others/dump/paper.pdf")

    with open(sample_pdf_path, "rb") as f:
        pdf_bytes = f.read()

    engine = PDFMarkdownEngine()
    result = engine.convert_pdf_to_markdown(pdf_bytes, filename="test_paper.pdf")

    # 1. Structured metadata
    assert "Cognitive Extensions" in result["title"]
    assert len(result["authors"]) >= 1
    assert any("Santos" in a or "Oliveira" in a for a in result["authors"])
    assert len(result["affiliations"]) >= 1
    assert any("Lisboa" in aff or "INESC" in aff or "Técnico" in aff for aff in result["affiliations"])
    assert result["year"] in [2024, 2025, 2026]
    assert len(result["abstract"]) > 50
    assert "SwiftSage" in result["abstract"] or "Language agents" in result["abstract"]

    # 2. Body markdown starting at Section 1
    assert "body_markdown" in result
    body = result["body_markdown"]
    assert "1 Introduction" in body
    assert not body.startswith("# Cognitive Extensions")  # Preamble stripped from body

    # 3. Hierarchical TOC sections
    assert "sections" in result
    assert len(result["sections"]) >= 4
    section_titles = [s["title"] for s in result["sections"]]
    assert any("Introduction" in t for t in section_titles)
    assert any("Method" in t for t in section_titles)

    # 4. Full publication markdown
    assert "# " + result["title"] in result["markdown"]
    assert "> **Abstract**" in result["markdown"]
    assert "## 1 Introduction" in result["markdown"]
