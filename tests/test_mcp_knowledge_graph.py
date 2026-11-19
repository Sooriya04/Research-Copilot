"""
Unit tests for Domain 6: Knowledge Graph & Synthesis MCP Tools.
Tests:
- Tool 16: query_knowledge_graph
"""
import json
import pytest
from src.mcp.tools.knowledge_graph import (
    QUERY_KNOWLEDGE_GRAPH_METADATA,
    handle_query_knowledge_graph,
)
from src.mcp.server import create_mcp_server


def test_query_knowledge_graph_metadata():
    assert QUERY_KNOWLEDGE_GRAPH_METADATA["name"] == "query_knowledge_graph"
    assert "query" in QUERY_KNOWLEDGE_GRAPH_METADATA["inputSchema"]["required"]
    assert "depth" in QUERY_KNOWLEDGE_GRAPH_METADATA["inputSchema"]["properties"]
    assert "entity_types" in QUERY_KNOWLEDGE_GRAPH_METADATA["inputSchema"]["properties"]


@pytest.mark.asyncio
async def test_handle_query_knowledge_graph_basic():
    res_str = await handle_query_knowledge_graph({"query": "lora", "depth": 2})
    res = json.loads(res_str)
    assert res["success"] is True
    assert "nodes" in res
    assert "edges" in res
    assert res["total_nodes"] >= 1
    assert any(n["id"] == "lora" for n in res["nodes"])


@pytest.mark.asyncio
async def test_handle_query_knowledge_graph_filter():
    res_str = await handle_query_knowledge_graph({
        "query": "lora",
        "depth": 2,
        "entity_types": ["method", "paper"],
    })
    res = json.loads(res_str)
    assert res["success"] is True
    for node in res["nodes"]:
        assert node["type"] in ["method", "paper"]


@pytest.mark.asyncio
async def test_handle_query_knowledge_graph_missing_query():
    res_str = await handle_query_knowledge_graph({})
    res = json.loads(res_str)
    assert res["success"] is False
    assert "error" in res


@pytest.mark.asyncio
async def test_server_dispatch_query_knowledge_graph():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 16,
        "method": "tools/call",
        "params": {
            "name": "query_knowledge_graph",
            "arguments": {"query": "lora", "depth": 1}
        }
    })
    resp_raw = await server.handle_raw_message(req)
    resp = json.loads(resp_raw)
    assert "result" in resp
    content = resp["result"]["content"]
    assert len(content) > 0
    parsed = json.loads(content[0]["text"])
    assert parsed["success"] is True
    assert parsed["query"] == "lora"
    assert parsed["total_nodes"] >= 1
