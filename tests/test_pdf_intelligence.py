import pytest
from src.core.canonical_models import PaperSectionType
from src.engines.context_cleaner import ContextCleaner
from src.engines.pdf_extractor import PDFExtractor
from src.engines.section_extractor import SectionExtractor

def test_context_cleaner_removes_headers_footers_and_citations():
    cleaner = ContextCleaner()
    raw_page = """
    Preprint Under Review
    1. Introduction
    Neural networks have demonstrated remarkable capabilities [1, 2, 14–18] across various domains.
    We propose a novel trans-
    former architecture.
    Page 1 of 12
    https://arxiv.org/abs/2309.00667
    """
    cleaned = cleaner.clean_page(raw_page)
    
    # Assert header and footer stripped
    assert "Preprint Under Review" not in cleaned
    assert "Page 1 of 12" not in cleaned
    assert "https://arxiv.org/abs/2309.00667" not in cleaned
    
    # Assert citation brackets stripped
    assert "[1, 2, 14–18]" not in cleaned
    
    # Assert hyphenation fixed
    assert "transformer architecture" in cleaned

def test_section_extractor_semantic_classification():
    extractor = SectionExtractor()
    sample_pages = [
        """
        1. Problem Statement
        Large language models exhibit unexpected degradation under domain shift. This poses significant risks in production.

        2. Related Works
        Prior studies investigated adversarial robustness and out-of-distribution transfer metrics.

        3. Proposed Methodology
        We formulate a curvature-aware regularizer that minimizes the spectral norm of intermediate representations.

        4. Empirical Evaluation
        We benchmark our model on GLUE and MMLU datasets, achieving a 4.2% accuracy improvement over baselines.

        5. Limitations and Threats to Validity
        Our current evaluation is constrained to English text and requires additional GPU memory during backward passes.
        """
    ]
    sections = extractor.extract_sections(sample_pages)
    
    types = [s.section_type for s in sections]
    assert PaperSectionType.PROBLEM in types
    assert PaperSectionType.RELATED_WORK in types
    assert PaperSectionType.METHOD in types
    assert PaperSectionType.EXPERIMENTS in types
    assert PaperSectionType.LIMITATIONS in types

def test_pdf_extractor_handles_malformed_bytes():
    extractor = PDFExtractor()
    # Random corrupted bytes should safely return empty list without crashing
    pages = extractor.extract_pages(b"corrupted_header_not_a_valid_pdf_stream_123456789")
    assert pages == []
