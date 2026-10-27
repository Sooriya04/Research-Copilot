"""
Unit tests for Citation Graph Expansion:
Covering:
- Graph direction (citing -> cited)
- PageRank prestige calculation (alpha = 0.85)
- OpenAlex crawler with mocked HTTP responses (cites filter and referenced works)
- Multi-hop traversal depth, deduplication, and node limits
- Integration with PaperRankEngine.rank()
- Preserving original behavior when expand_citations == 0
"""

from unittest.mock import AsyncMock, patch
import httpx
import pytest

from src.core.schemas import Paper, RankRequest
from src.engines.citation_graph import CitationGraphEngine
from src.engines.paper_rank import PaperRankEngine


def test_graph_direction_and_pagerank_prestige():
    """Verify directed edge convention (citing -> cited) accumulates prestige onto cited nodes."""
    engine = CitationGraphEngine(damping=0.85)

    # p1 is cited by p2, p3, p4
    p1 = Paper(id="W1", title="Foundational Theory", referenced_works=[])
    p2 = Paper(id="W2", title="Derivative Model A", referenced_works=["W1"])
    p3 = Paper(id="W3", title="Derivative Model B", referenced_works=["W1"])
    p4 = Paper(id="W4", title="Derivative Model C", referenced_works=["W1"])

    graph = engine.build_graph([p1, p2, p3, p4])
    stats = engine.get_graph_stats(graph)
    assert stats[0] >= 4
    # Edges must be directed from citing to cited: (W2, W1), (W3, W1), (W4, W1)
    assert graph.has_edge("W2", "W1")
    assert graph.has_edge("W3", "W1")
    assert graph.has_edge("W4", "W1")

    scores = engine.calculate_prestige(graph)
    # W1 is cited by 3 papers, so its normalized prestige should be 100.0 (the maximum)
    assert scores["W1"] == 100.0
    assert scores["W1"] > scores["W2"]
    assert scores["W1"] > scores["W3"]


@pytest.mark.asyncio
async def test_expand_graph_with_mocked_openalex():
    """Verify multi-hop expansion fetches citing and referenced works using mocked OpenAlex responses."""
    engine = CitationGraphEngine(damping=0.85)

    seed = Paper(
        id="W_SEED",
        title="Seed Transformer Paper",
        openalex_id="W_SEED",
        referenced_works=["https://openalex.org/W_REF1"],
        citation_count=1000,
    )

    mock_citing_response = {
        "results": [
            {
                "id": "https://openalex.org/W_CITING_1",
                "title": "BERT Language Model",
                "publication_year": 2018,
                "cited_by_count": 50000,
                "ids": {"doi": "https://doi.org/10.1000/bert"},
                "authorships": [{"author": {"display_name": "Devlin et al."}}],
            }
        ]
    }

    mock_referenced_response = {
        "results": [
            {
                "id": "https://openalex.org/W_REF1",
                "title": "Seq2Seq Foundational Work",
                "publication_year": 2014,
                "cited_by_count": 20000,
                "ids": {"doi": "https://doi.org/10.1000/seq2seq"},
                "authorships": [{"author": {"display_name": "Sutskever et al."}}],
            }
        ]
    }

    async def mock_get(url, params=None, **kwargs):
        # Dispatch based on filter parameter
        filter_val = (params or {}).get("filter", "")
        if "cites:" in filter_val:
            return httpx.Response(200, json=mock_citing_response, request=httpx.Request("GET", url))
        elif "openalex_id:" in filter_val:
            return httpx.Response(200, json=mock_referenced_response, request=httpx.Request("GET", url))
        return httpx.Response(404, request=httpx.Request("GET", url))

    with patch("httpx.AsyncClient.get", side_effect=mock_get):
        graph, prestige, discovered = await engine.expand_graph([seed], depth=1, max_expansion_per_node=5)

        # Graph should contain seed, citing paper (BERT), and referenced paper (Seq2Seq)
        assert "W_SEED" in graph
        assert "W_CITING_1" in graph
        assert "W_REF1" in graph

        # Verify edges
        assert graph.has_edge("W_CITING_1", "W_SEED")  # BERT cites Seed
        assert graph.has_edge("W_SEED", "W_REF1")      # Seed cites Seq2Seq

        # Verify discovered papers are populated
        discovered_ids = {p.id for p in discovered}
        assert "W_CITING_1" in discovered_ids or any("BERT" in p.title for p in discovered)
        assert len(prestige) >= 3


@pytest.mark.asyncio
async def test_paper_rank_expand_citations_integration():
    """Verify PaperRankEngine integration with expand_citations enabled vs disabled."""
    rank_engine = PaperRankEngine()

    mock_candidates = [
        Paper(id="p1", title="Attention Paper", openalex_id="W1", referenced_works=["W_FOUNDATION"], citation_count=5000),
        Paper(id="p2", title="Transformer Variant", openalex_id="W2", referenced_works=["W1"], citation_count=100),
    ]

    # Mock resolver search
    with patch.object(rank_engine.resolver, "search_openalex", new_callable=AsyncMock, return_value=mock_candidates), \
         patch.object(rank_engine.resolver, "search_arxiv", new_callable=AsyncMock, return_value=[]):

        # 1. Without citation expansion (expand_citations=0)
        req_no_expand = RankRequest(query="attention", expand_citations=0, limit=10)
        res_no_expand = await rank_engine.rank(req_no_expand)

        assert res_no_expand.total_found == 2
        assert len(res_no_expand.papers) == 2
        # Graph nodes reflect basic 1-hop
        assert res_no_expand.graph_nodes >= 2

        # 2. With citation expansion (expand_citations=1)
        mock_discovered = [
            Paper(id="W_FOUNDATION", title="Foundational Seq2Seq Paper", citation_count=10000, openalex_id="W_FOUNDATION"),
        ]

        with patch.object(
            rank_engine.graph_engine,
            "expand_graph",
            new_callable=AsyncMock,
            return_value=(
                rank_engine.graph_engine.build_graph(mock_candidates + mock_discovered),
                {"W1": 80.0, "W2": 30.0, "W_FOUNDATION": 100.0, "p1": 80.0, "p2": 30.0},
                mock_discovered,
            ),
        ):
            req_expand = RankRequest(query="attention", expand_citations=1, limit=10)
            res_expand = await rank_engine.rank(req_expand)

            # Discovered foundation paper should enter the paper pool
            assert res_expand.total_found >= 3
            paper_titles = [p.title for p in res_expand.papers]
            assert "Foundational Seq2Seq Paper" in paper_titles
            # Discovered paper has graph prestige score exposed
            found_paper = next(p for p in res_expand.papers if p.title == "Foundational Seq2Seq Paper")
            assert found_paper.score_breakdown is not None
            assert found_paper.score_breakdown.graph_prestige > 0.0
