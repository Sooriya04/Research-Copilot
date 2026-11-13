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


@pytest.mark.asyncio
async def test_access_resolver_persistent_client_lifecycle():
    resolver = AccessResolver()
    # Initially lazy client is None
    assert resolver._client is None

    # Accessing client property instantiates it
    client_1 = resolver.client
    assert client_1 is not None
    assert not client_1.is_closed

    # Second access returns the exact same persistent client instance
    client_2 = resolver.client
    assert client_1 is client_2

    # Closing resolver closes the client and resets it
    await resolver.aclose()
    assert resolver._client is None
    assert client_1.is_closed

    # Re-accessing creates a fresh active client
    client_3 = resolver.client
    assert client_3 is not None
    assert not client_3.is_closed
    assert client_3 is not client_1

    # Test class-level aclose_all
    await AccessResolver.aclose_all()
    assert resolver._client is None
    assert client_3.is_closed

