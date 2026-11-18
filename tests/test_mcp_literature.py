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
