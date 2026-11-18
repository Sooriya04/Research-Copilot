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


@pytest.mark.asyncio
async def test_generate_novel_hypotheses_metadata():
    from src.mcp.tools.novelty_studio import GENERATE_NOVEL_HYPOTHESES_METADATA
    assert GENERATE_NOVEL_HYPOTHESES_METADATA["name"] == "generate_novel_hypotheses"
    assert "topic" in GENERATE_NOVEL_HYPOTHESES_METADATA["inputSchema"]["required"]
    assert "paper_ids" in GENERATE_NOVEL_HYPOTHESES_METADATA["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_generate_novel_hypotheses_invalid_args():
    from src.mcp.tools.novelty_studio import handle_generate_novel_hypotheses
    res_str = await handle_generate_novel_hypotheses({})
    res = json.loads(res_str)
    assert res["success"] is False
    assert "error" in res


@pytest.mark.asyncio
async def test_generate_novel_hypotheses_execution():
    from src.mcp.tools.novelty_studio import handle_generate_novel_hypotheses
    res_str = await handle_generate_novel_hypotheses({
        "topic": "transformer attention efficiency",
        "paper_ids": ["1706.03762", "2005.14165"],
        "mechanism": "cross_domain_synthesis",
    })
    res = json.loads(res_str)
    assert res["success"] is True
    assert res["topic"] == "transformer attention efficiency"
    assert len(res["proposals"]) >= 1
    p = res["proposals"][0]
    assert "proposal_id" in p
    assert "title" in p
    assert "hypothesis" in p
    assert "proposed_architecture" in p
    assert "expected_gain" in p
    assert "falsifiability_criteria" in p
    assert "baseline_comparisons" in p


@pytest.mark.asyncio
async def test_generate_novel_hypotheses_mcp_server_dispatch():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 12,
        "method": "tools/call",
        "params": {
            "name": "generate_novel_hypotheses",
            "arguments": {
                "topic": "graph neural networks",
                "paper_ids": ["1706.03762"],
            }
        }
    })
    resp_raw = await server.handle_raw_message(req)
    resp = json.loads(resp_raw)
    assert "result" in resp
    content = resp["result"]["content"]
    assert len(content) > 0
    parsed = json.loads(content[0]["text"])
    assert parsed["success"] is True
    assert len(parsed["proposals"]) >= 1
