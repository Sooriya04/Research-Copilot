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
    resolver = CanonicalPaperResolver()
    paper = await resolver.resolve("1706.03762")
    assert paper is not None
    assert "Attention" in paper.title
    assert paper.arxiv_id == "1706.03762"
    assert paper.is_open_access is True
