import pytest
from src.engines.access_resolver import AccessResolver

@pytest.mark.asyncio
async def test_detect_identifier():
    resolver = AccessResolver()
    
    id_type, clean = resolver.detect_identifier_type("10.1038/s41586-021-03819-2")
    assert id_type == "doi"
    assert clean == "10.1038/s41586-021-03819-2"

    id_type, clean = resolver.detect_identifier_type("arXiv:1706.03762")
    assert id_type == "arxiv"
    assert clean == "1706.03762"

    id_type, clean = resolver.detect_identifier_type("W2741809807")
    assert id_type == "openalex"
    assert clean == "W2741809807"

    id_type, clean = resolver.detect_identifier_type("scaling laws neural language models")
    assert id_type == "query"
