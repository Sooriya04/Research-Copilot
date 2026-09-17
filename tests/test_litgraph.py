import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app
from src.api.routes_litgraph import jaccard


def test_jaccard_similarity():
    # Identical sets
    assert jaccard({"ref1", "ref2", "ref3"}, {"ref1", "ref2", "ref3"}) == 1.0
    # Disjoint sets
    assert jaccard({"ref1", "ref2"}, {"ref3", "ref4"}) == 0.0
    # Partial overlap: intersection 1, union 3 -> 1/3
    assert abs(jaccard({"ref1", "ref2"}, {"ref2", "ref3"}) - (1 / 3)) < 1e-5
    # Empty sets
    assert jaccard(set(), {"ref1"}) == 0.0
    assert jaccard(set(), set()) == 0.0


@pytest.mark.asyncio
async def test_litgraph_search_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/v1/litgraph/search?q=attention")
        assert res.status_code in [200, 502]
        if res.status_code == 200:
            data = res.json()
            assert isinstance(data, list)


@pytest.mark.asyncio
async def test_litgraph_cache_clear():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.delete("/api/v1/litgraph/cache")
        assert res.status_code == 200
        assert res.json() == {"status": "cleared"}
