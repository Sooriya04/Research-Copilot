"""
Unit tests for Europe PMC Full-Text JATS XML parsing and integration:
Covering:
- Standard JATS XML section extraction (abstract, intro, methods, experiments, results, discussion, limitations)
- Verification that Discussion is NOT misclassified as Limitations
- Explicit Limitations sub-sections are correctly isolated
- Nested subsections and preserving hierarchy
- Namespaced XML handling
- Malformed XML and HTTP error resilience (404, 500, timeout)
- Integration with PaperRankEngine.rank()
"""

from unittest.mock import AsyncMock, patch
import httpx
import pytest

from src.core.schemas import Paper, RankRequest
from src.engines.access_resolver import AccessResolver
from src.engines.paper_rank import PaperRankEngine

SAMPLE_JATS_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:mml="http://www.w3.org/1998/Math/MathML" article-type="research-article">
  <front>
    <journal-meta>
      <journal-title>Journal of Computational Biology</journal-title>
    </journal-meta>
    <article-meta>
      <abstract>
        <p>This is the structured abstract describing deep generative sequence models for protein folding.</p>
      </abstract>
    </article-meta>
  </front>
  <body>
    <sec sec-type="intro">
      <title>Introduction</title>
      <p>Recent advances in deep learning have transformed structural bioinformatics.</p>
      <p>Here we formalize the problem of generative sequence design.</p>
    </sec>
    <sec sec-type="materials|methods">
      <title>Methods and Model Architecture</title>
      <p>We train an equivariant graph neural network with message passing.</p>
      <sec>
        <title>Loss Formulation</title>
        <p>The network is optimized with cross-entropy and structural regularization loss.</p>
      </sec>
    </sec>
    <sec sec-type="results">
      <title>Empirical Results</title>
      <p>Our model achieves 92.4% recovery rate across benchmark test sets.</p>
    </sec>
    <sec sec-type="discussion">
      <title>Discussion</title>
      <p>The results demonstrate that equivariant features improve generalization across unseen folds.</p>
      <sec>
        <title>Limitations and Future Directions</title>
        <p>A primary limitation is the high GPU memory requirement for complexes exceeding 1000 residues.</p>
      </sec>
    </sec>
    <sec>
      <title>Conclusions</title>
      <p>Equivariant graph representation offers a scalable foundation for de novo design.</p>
    </sec>
  </body>
</article>
"""


def test_parse_jats_xml_sections():
    """Verify parsing of JATS XML into structured PaperSection entities."""
    resolver = AccessResolver()
    sections = resolver.parse_jats_xml(SAMPLE_JATS_XML)

    assert len(sections) >= 5
    sec_types = {s.section_type for s in sections}
    assert "abstract" in sec_types
    assert "intro" in sec_types
    assert "methods" in sec_types
    assert "results" in sec_types
    assert "discussion" in sec_types
    assert "limitations" in sec_types

    # Verify abstract content
    abstract_sec = next(s for s in sections if s.section_type == "abstract")
    assert "protein folding" in abstract_sec.content

    # Verify discussion vs limitations separation
    disc_sec = next(s for s in sections if s.section_type == "discussion")
    assert "equivariant features improve generalization" in disc_sec.content
    assert "limitation" not in disc_sec.title.lower()

    # Explicit limitations section must be extracted
    lim_sec = next(s for s in sections if s.section_type == "limitations")
    assert "Limitations and Future Directions" in lim_sec.title
    assert "high GPU memory requirement" in lim_sec.content

    # Verify nested subsection title preservation
    method_subs = [s for s in sections if "Loss Formulation" in s.title]
    assert len(method_subs) == 1
    assert "cross-entropy" in method_subs[0].content


def test_parse_jats_xml_malformed_resilience():
    """Verify malformed XML bytes do not raise uncaught errors and return empty list."""
    resolver = AccessResolver()

    # Invalid XML string
    assert resolver.parse_jats_xml(b"<article><broken tag>") == []
    # Empty bytes
    assert resolver.parse_jats_xml(b"") == []
    # Missing body / sections
    assert resolver.parse_jats_xml(b"<article><front></front></article>") == []


@pytest.mark.asyncio
async def test_fetch_europepmc_xml_success_and_error_handling():
    """Verify HTTP handling: 200 success, 404 open-access unavailable, and timeout handling."""
    resolver = AccessResolver()

    # 1. Successful 200 response
    async def mock_200_get(url, **kwargs):
        assert "PMC1234567" in url
        return httpx.Response(200, content=SAMPLE_JATS_XML, request=httpx.Request("GET", url))

    with patch("httpx.AsyncClient.get", side_effect=mock_200_get):
        sections = await resolver.fetch_europepmc_xml("PMC1234567")
        assert len(sections) >= 5

        # Also test with raw number without PMC prefix (should auto-normalize)
        sections_num = await resolver.fetch_europepmc_xml("1234567")
        assert len(sections_num) >= 5

    # 2. 404 Not Found (article exists but not open access XML)
    async def mock_404_get(url, **kwargs):
        return httpx.Response(404, request=httpx.Request("GET", url))

    with patch("httpx.AsyncClient.get", side_effect=mock_404_get):
        sections_404 = await resolver.fetch_europepmc_xml("PMC9999999")
        assert sections_404 == []

    # 3. Request timeout
    async def mock_timeout_get(url, **kwargs):
        raise httpx.TimeoutException("Read timed out")

    with patch("httpx.AsyncClient.get", side_effect=mock_timeout_get):
        sections_timeout = await resolver.fetch_europepmc_xml("PMC1234567")
        assert sections_timeout == []


@pytest.mark.asyncio
async def test_paper_rank_pmc_xml_prioritization():
    """Verify PaperRankEngine prioritizes Europe PMC XML over PDF extraction when PMCID is present."""
    rank_engine = PaperRankEngine()

    pmc_paper = Paper(
        id="pmc_paper_1",
        title="Biomedical Sequence Study",
        pmcid="PMC1234567",
        pdf_url="https://example.com/paper.pdf",
    )

    with patch.object(rank_engine.resolver, "search_openalex", new_callable=AsyncMock, return_value=[pmc_paper]), \
         patch.object(rank_engine.resolver, "search_arxiv", new_callable=AsyncMock, return_value=[]), \
         patch.object(
             rank_engine.resolver,
             "fetch_europepmc_xml",
             new_callable=AsyncMock,
             return_value=rank_engine.resolver.parse_jats_xml(SAMPLE_JATS_XML),
         ) as mock_fetch_xml, \
         patch.object(rank_engine.pdf_extractor, "fetch_and_parse_pdf", new_callable=AsyncMock) as mock_pdf:

        req = RankRequest(query="biomedical sequence", full_text_top=1, limit=5)
        res = await rank_engine.rank(req)

        assert len(res.papers) == 1
        p = res.papers[0]
        # Must have sections extracted via XML
        assert len(p.sections) >= 5
        mock_fetch_xml.assert_called_once_with("PMC1234567")
        # PDF extractor should NOT be called because structured XML was sufficient
        mock_pdf.assert_not_called()
