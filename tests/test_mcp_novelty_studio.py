"""Unit tests for Domain 4: Gap Analysis & Novelty Studio MCP tools."""
import json
import pytest
from src.mcp.tools.novelty_studio import (
    EXTRACT_RESEARCH_GAPS_METADATA,
    handle_extract_research_gaps,
)
from src.mcp.server import create_mcp_server


@pytest.mark.asyncio
async def test_extract_research_gaps_metadata():
    assert EXTRACT_RESEARCH_GAPS_METADATA["name"] == "extract_research_gaps"
    assert "paper_ids" in EXTRACT_RESEARCH_GAPS_METADATA["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_extract_research_gaps_invalid_args():
    res_str = await handle_extract_research_gaps({})
    res = json.loads(res_str)
    assert res["success"] is False
    assert "error" in res


@pytest.mark.asyncio
async def test_extract_research_gaps_single_paper():
    res_str = await handle_extract_research_gaps({"paper_ids": ["1706.03762"]})
    res = json.loads(res_str)
    assert res["success"] is True
    assert res["analyzed_papers"] == 1
    assert "limitations" in res
    assert "structural_gaps" in res
    assert "untested_assumptions" in res
    assert len(res["limitations"]) + len(res["structural_gaps"]) + len(res["untested_assumptions"]) > 0


@pytest.mark.asyncio
async def test_extract_research_gaps_multi_paper_synthesis():
    res_str = await handle_extract_research_gaps({"paper_ids": ["1706.03762", "2005.14165"]})
    res = json.loads(res_str)
    assert res["success"] is True
    assert res["analyzed_papers"] >= 2
    assert isinstance(res["structural_gaps"], list)


@pytest.mark.asyncio
async def test_extract_research_gaps_mcp_server_dispatch():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 11,
        "method": "tools/call",
        "params": {
            "name": "extract_research_gaps",
            "arguments": {"paper_ids": ["1706.03762"]}
        }
    })
    resp_raw = await server.handle_raw_message(req)
    resp = json.loads(resp_raw)
    assert "result" in resp
    content = resp["result"]["content"]
    assert len(content) > 0
    parsed = json.loads(content[0]["text"])
    assert parsed["success"] is True
