import json
import pytest
from src.core.schemas import Author, Paper
from src.mcp.protocol import MCPProtocolHandler
from src.mcp.server import create_mcp_server
from src.mcp.tools.literature import (
    SEARCH_LITERATURE_METADATA,
    handle_search_literature,
)


@pytest.mark.asyncio
async def test_mcp_initialize_and_ping():
    server = create_mcp_server()

    # Test initialize
    init_req = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-agent", "version": "1.0"},
        },
    })
    init_res_raw = await server.handle_raw_message(init_req)
    assert init_res_raw is not None
    init_res = json.loads(init_res_raw)
    assert init_res["id"] == 1
    assert init_res["result"]["protocolVersion"] == "2024-11-05"
    assert "tools" in init_res["result"]["capabilities"]
    assert init_res["result"]["serverInfo"]["name"] == "research-copilot-mcp"

    # Test ping
    ping_req = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "ping"})
    ping_res = json.loads(await server.handle_raw_message(ping_req))
    assert ping_res["id"] == 2
    assert ping_res["result"] == {}


@pytest.mark.asyncio
async def test_mcp_tools_list_contains_search_literature():
    server = create_mcp_server()
    list_req = json.dumps({"jsonrpc": "2.0", "id": 10, "method": "tools/list"})
    res = json.loads(await server.handle_raw_message(list_req))

    assert res["id"] == 10
    tools = res["result"]["tools"]
    tool_names = [t["name"] for t in tools]
    assert "search_literature" in tool_names

    search_tool = next(t for t in tools if t["name"] == "search_literature")
    assert "query" in search_tool["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_mcp_search_literature_validation():
    # Empty query should fail gracefully
    call_req = json.dumps({
        "jsonrpc": "2.0",
        "id": 99,
        "method": "tools/call",
        "params": {
            "name": "search_literature",
            "arguments": {"query": ""},
        },
    })
    server = create_mcp_server()
    res = json.loads(await server.handle_raw_message(call_req))
    assert res["id"] == 99
    assert res["result"]["isError"] is True
    assert "required" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_search_literature_execution(monkeypatch):
    server = create_mcp_server()

    # Mock openalex & arxiv searches
    sample_paper_1 = Paper(
        id="arxiv:2301.00001",
        title="Sparse Mixture of Experts Routing",
        abstract="We investigate routing stability in sparse mixture-of-experts models.",
        authors=[Author(name="Alice Smith"), Author(name="Bob Jones")],
        year=2023,
        primary_source="arxiv",
        citation_count=42,
        is_open_access=True,
    )
    sample_paper_2 = Paper(
        id="openalex:W12345678",
        title="Sparse Mixture of Experts Routing",
        abstract="Duplicate openalex record.",
        authors=[Author(name="Alice Smith")],
        year=2023,
        primary_source="openalex",
        citation_count=42,
        is_open_access=True,
    )

    from src.mcp.tools import literature

    async def mock_search_arxiv(query, limit=10):
        return [sample_paper_1]

    async def mock_search_openalex(query, limit=10):
        return [sample_paper_2]

    monkeypatch.setattr(literature._resolver, "search_arxiv", mock_search_arxiv)
    monkeypatch.setattr(literature._resolver, "search_openalex", mock_search_openalex)

    call_req = json.dumps({
        "jsonrpc": "2.0",
        "id": 101,
        "method": "tools/call",
        "params": {
            "name": "search_literature",
            "arguments": {
                "query": "sparse mixture of experts",
                "sources": ["arxiv", "openalex"],
                "limit": 5,
            },
        },
    })

    raw_res = await server.handle_raw_message(call_req)
    res = json.loads(raw_res)

    assert res["id"] == 101
    assert "content" in res["result"]
    text_content = res["result"]["content"][0]["text"]
    data = json.loads(text_content)

    assert data["query"] == "sparse mixture of experts"
    # Duplicate paper should have been deduplicated down to 1
    assert data["total_results"] == 1
    assert data["papers"][0]["title"] == "Sparse Mixture of Experts Routing"
    assert "Alice Smith" in data["papers"][0]["authors"]

    # 2. Test paperswithcode source handling
    req_pwc = json.dumps({
        "jsonrpc": "2.0",
        "id": 105,
        "method": "tools/call",
        "params": {
            "name": "search_literature",
            "arguments": {
                "query": "classification",
                "sources": ["paperswithcode"],
                "limit": 3,
            },
        },
    })
    res_pwc = json.loads(await server.handle_raw_message(req_pwc))
    assert res_pwc["id"] == 105
    data_pwc = json.loads(res_pwc["result"]["content"][0]["text"])
    assert data_pwc["query"] == "classification"
    assert len(data_pwc["papers"]) > 0
    assert data_pwc["papers"][0]["primary_source"] == "paperswithcode"


@pytest.mark.asyncio
async def test_mcp_resolve_paper_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 201,
        "method": "tools/call",
        "params": {
            "name": "resolve_paper",
            "arguments": {"identifier": ""},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 201
    assert res["result"]["isError"] is True
    assert "identifier" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_resolve_paper_execution(monkeypatch):
    from src.core.canonical_models import AuthorEntity, CanonicalPaper, SourceMetadata
    from src.mcp.tools import literature

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
        authors=[
            AuthorEntity(name="Ashish Vaswani"),
            AuthorEntity(name="Noam Shazeer"),
        ],
        year=2017,
        arxiv_id="1706.03762",
        doi="10.48550/arXiv.1706.03762",
        pdf_url="https://arxiv.org/pdf/1706.03762.pdf",
        is_open_access=True,
        citation_count=120000,
        sources=[
            SourceMetadata(source_name="arxiv", external_id="1706.03762", url="https://arxiv.org/abs/1706.03762"),
        ],
    )

    async def mock_resolve(identifier):
        if "1706.03762" in identifier:
            return mock_canonical
        return None

    monkeypatch.setattr(literature._canonical_resolver, "resolve", mock_resolve)

    # 1. Successful resolution
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 202,
        "method": "tools/call",
        "params": {
            "name": "resolve_paper",
            "arguments": {"identifier": "1706.03762"},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 202
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["canonical_id"] == "arxiv:1706.03762"
    assert data["title"] == "Attention Is All You Need"
    assert "Ashish Vaswani" in data["authors"]
    assert data["is_open_access"] is True
    assert "@article{" in data["bibtex"]
    assert "Attention Is All You Need" in data["bibtex"]

    # Test non-latin author BibTeX citation key fallback
    from src.mcp.tools.literature import generate_bibtex
    non_latin_bib = generate_bibtex("arxiv:2401.12345", "Non-Latin Author Paper", ["李明"], 2024)
    assert "@article{paper2024_" in non_latin_bib

    # 2. Unknown identifier
    unknown_req = json.dumps({
        "jsonrpc": "2.0",
        "id": 203,
        "method": "tools/call",
        "params": {
            "name": "resolve_paper",
            "arguments": {"identifier": "unknown:9999999"},
        },
    })
    unknown_res = json.loads(await server.handle_raw_message(unknown_req))
    assert unknown_res["id"] == 203
    unknown_data = json.loads(unknown_res["result"]["content"][0]["text"])
    assert unknown_data["success"] is False
    assert "could not be resolved" in unknown_data["error"]


@pytest.mark.asyncio
async def test_mcp_get_paper_citations_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 301,
        "method": "tools/call",
        "params": {
            "name": "get_paper_citations",
            "arguments": {"paper_id": ""},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 301
    assert res["result"]["isError"] is True
    assert "paper_id" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_get_paper_citations_execution(monkeypatch):
    from src.core.canonical_models import AuthorEntity, CanonicalPaper, SourceMetadata
    from src.mcp.tools import literature

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="Transformer architecture.",
        authors=[AuthorEntity(name="Ashish Vaswani")],
        year=2017,
        arxiv_id="1706.03762",
        openalex_id="W2741809807",
        citation_count=100000,
        sources=[
            SourceMetadata(
                source_name="arxiv",
                external_id="1706.03762",
                url="https://arxiv.org/abs/1706.03762",
                raw_metadata={"referenced_works": ["W2122222222"]},
            )
        ],
    )

    sample_work_citing = {
        "id": "https://openalex.org/W2964344444",
        "title": "BERT: Pre-training of Deep Bidirectional Transformers",
        "publication_year": 2018,
        "cited_by_count": 80000,
        "authorships": [{"author": {"display_name": "Jacob Devlin"}}],
    }

    sample_work_referenced = {
        "id": "https://openalex.org/W2122222222",
        "title": "Neural Machine Translation by Jointly Learning to Align and Translate",
        "publication_year": 2014,
        "cited_by_count": 30000,
        "authorships": [{"author": {"display_name": "Dzmitry Bahdanau"}}],
    }

    async def mock_resolve(identifier):
        return mock_canonical

    async def mock_fetch_citing(client, oa_id, limit=10):
        return [sample_work_citing]

    async def mock_fetch_referenced(client, ref_ids):
        return [sample_work_referenced]

    monkeypatch.setattr(literature._canonical_resolver, "resolve", mock_resolve)
    monkeypatch.setattr(literature._citation_engine, "_fetch_citing_works", mock_fetch_citing)
    monkeypatch.setattr(literature._citation_engine, "_fetch_referenced_works", mock_fetch_referenced)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 302,
        "method": "tools/call",
        "params": {
            "name": "get_paper_citations",
            "arguments": {
                "paper_id": "1706.03762",
                "direction": "both",
                "limit": 10,
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 302
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["seed_paper"]["title"] == "Attention Is All You Need"
    assert data["total_citations_found"] == 1
    assert data["citations"][0]["title"] == "BERT: Pre-training of Deep Bidirectional Transformers"
    assert "prestige_score" in data["citations"][0]
    assert data["total_references_found"] == 1
    assert data["references"][0]["title"] == "Neural Machine Translation by Jointly Learning to Align and Translate"
    assert data["graph_topology"]["total_nodes"] == 3


