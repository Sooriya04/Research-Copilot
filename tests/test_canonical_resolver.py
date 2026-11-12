import pytest
from src.core.canonical_models import AuthorEntity, CanonicalPaper, PaperSectionEntity, PaperSectionType
from src.engines.canonical_resolver import CanonicalPaperResolver

def test_canonical_paper_model_validation():
    paper = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
        authors=[AuthorEntity(name="Ashish Vaswani", affiliation="Google Brain")],
        arxiv_id="1706.03762",
        year=2017,
        citation_count=130000,
        is_open_access=True
    )
    assert paper.canonical_id == "arxiv:1706.03762"
    assert paper.year == 2017
    assert len(paper.authors) == 1
    assert paper.authors[0].name == "Ashish Vaswani"

def test_identifier_normalization():
    resolver = CanonicalPaperResolver()
    
    id_type, clean = resolver.normalize_identifier("https://doi.org/10.1038/s41586-021-03819-2")
    assert id_type == "doi"
    assert clean == "10.1038/s41586-021-03819-2"

    id_type, clean = resolver.normalize_identifier("https://arxiv.org/abs/2309.00667v2")
    assert id_type == "arxiv"
    assert "2309.00667" in clean

    id_type, clean = resolver.normalize_identifier("W2741809807")
    assert id_type == "openalex"
    assert clean == "W2741809807"

    id_type, clean = resolver.normalize_identifier("Scaling Laws for Neural Language Models")
    assert id_type == "title"

@pytest.mark.asyncio
async def test_resolve_canonical_arxiv():
    from unittest.mock import AsyncMock, patch
    from src.core.schemas import Paper, Author, PaperAccessResponse

    resolver = CanonicalPaperResolver()
    mock_paper = Paper(
        id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
        authors=[Author(name="Ashish Vaswani"), Author(name="Noam Shazeer")],
        year=2017,
        arxiv_id="1706.03762",
        primary_source="arxiv",
        url="https://arxiv.org/abs/1706.03762",
        pdf_url="https://arxiv.org/pdf/1706.03762.pdf",
        is_open_access=True,
    )
    mock_resp = PaperAccessResponse(
        identifier="1706.03762",
        id_type="arxiv",
        paper=mock_paper,
        candidates=[],
    )
    with patch.object(resolver, "_lookup_in_sqlite", return_value=None), \
         patch.object(resolver.access_resolver, "resolve_identifier", new_callable=AsyncMock, return_value=mock_resp):
        paper = await resolver.resolve("1706.03762")
        assert paper is not None
        assert "Attention" in paper.title
        assert paper.arxiv_id == "1706.03762"
        assert paper.is_open_access is True


@pytest.mark.asyncio
async def test_deterministic_fallback_canonical_id():
    import hashlib
    from unittest.mock import AsyncMock, patch
    from src.core.schemas import Paper, PaperAccessResponse

    resolver = CanonicalPaperResolver()
    title = "Quantum Computing Fault Tolerance Survey"
    expected_hash = hashlib.sha256(title.encode("utf-8")).hexdigest()[:12]
    
    mock_paper = Paper(
        id=f"raw:{expected_hash}",
        title=title,
        abstract="Fault tolerant surface codes.",
    )
    mock_access_resp = PaperAccessResponse(
        identifier=title,
        id_type="title",
        paper=mock_paper,
        candidates=[],
    )

    with patch.object(resolver.access_resolver, "resolve_identifier", new_callable=AsyncMock, return_value=mock_access_resp):
        res = await resolver.resolve(title)
        assert res is not None
        assert res.canonical_id == f"paper:{expected_hash}"

