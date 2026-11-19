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


# ─────────────────────────────────────────────────────────────────────────────
# Tool 17: compare_papers_matrix Tests
# ─────────────────────────────────────────────────────────────────────────────

from src.mcp.tools.knowledge_graph import (
    COMPARE_PAPERS_MATRIX_METADATA,
    handle_compare_papers_matrix,
)


def test_compare_papers_matrix_metadata():
    assert COMPARE_PAPERS_MATRIX_METADATA["name"] == "compare_papers_matrix"
    assert "paper_ids" in COMPARE_PAPERS_MATRIX_METADATA["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_compare_papers_matrix_invalid_args():
    res_str = await handle_compare_papers_matrix({})
    res = json.loads(res_str)
    assert res["success"] is False
    assert "error" in res

    # Less than 2 papers
    res_str2 = await handle_compare_papers_matrix({"paper_ids": ["1706.03762"]})
    res2 = json.loads(res_str2)
    assert res2["success"] is False


@pytest.mark.asyncio
async def test_compare_papers_matrix_execution():
    res_str = await handle_compare_papers_matrix({
        "paper_ids": ["1706.03762", "2106.09685"]
    })
    res = json.loads(res_str)
    assert res["success"] is True
    assert res["papers_count"] == 2
    assert "matrix" in res
    assert "architecture" in res["matrix"]
    assert "loss_function" in res["matrix"]
    assert "tradeoff_analysis" in res


@pytest.mark.asyncio
async def test_server_dispatch_compare_papers_matrix():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 17,
        "method": "tools/call",
        "params": {
            "name": "compare_papers_matrix",
            "arguments": {"paper_ids": ["1706.03762", "2106.09685"]}
        }
    })
    resp_raw = await server.handle_raw_message(req)
    resp = json.loads(resp_raw)
    assert "result" in resp
    content = resp["result"]["content"]
    assert len(content) > 0
    parsed = json.loads(content[0]["text"])
    assert parsed["success"] is True
    assert parsed["papers_count"] == 2
