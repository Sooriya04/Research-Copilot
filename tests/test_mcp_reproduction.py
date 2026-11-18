"""Unit tests for Domain 5: Reproduction & Experiment Planning MCP tools."""
import json
import pytest
from src.mcp.tools.reproduction import (
    GENERATE_REPRODUCTION_PLAN_METADATA,
    handle_generate_reproduction_plan,
)
from src.mcp.server import create_mcp_server


@pytest.mark.asyncio
async def test_generate_reproduction_plan_metadata():
    assert GENERATE_REPRODUCTION_PLAN_METADATA["name"] == "generate_reproduction_plan"
    assert "paper_id" in GENERATE_REPRODUCTION_PLAN_METADATA["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_generate_reproduction_plan_invalid_args():
    res_str = await handle_generate_reproduction_plan({})
    res = json.loads(res_str)
    assert res["success"] is False
    assert "error" in res


@pytest.mark.asyncio
async def test_generate_reproduction_plan_execution():
    res_str = await handle_generate_reproduction_plan({
        "paper_id": "1706.03762",
        "target_compute": "single_gpu",
    })
    res = json.loads(res_str)
    assert res["success"] is True
    assert "estimated_compute_hours" in res
    assert isinstance(res["estimated_compute_hours"], (int, float))
    assert "environment_spec" in res
    assert "python_version" in res["environment_spec"]
    assert "step_by_step_instructions" in res
    assert len(res["step_by_step_instructions"]) >= 4
    phases = {s["phase"] for s in res["step_by_step_instructions"]}
    assert "environment" in phases
    assert "data_preparation" in phases
    assert "training" in phases
    assert "evaluation" in phases
    assert "validation_checkpoints" in res
    assert len(res["validation_checkpoints"]) >= 2


@pytest.mark.asyncio
async def test_generate_reproduction_plan_compute_scaling():
    res_single = json.loads(await handle_generate_reproduction_plan({"paper_id": "1706.03762", "target_compute": "single_gpu"}))
    res_multi = json.loads(await handle_generate_reproduction_plan({"paper_id": "1706.03762", "target_compute": "multi_gpu"}))
    assert res_multi["estimated_compute_hours"] < res_single["estimated_compute_hours"]


@pytest.mark.asyncio
async def test_generate_reproduction_plan_mcp_server_dispatch():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 14,
        "method": "tools/call",
        "params": {
            "name": "generate_reproduction_plan",
            "arguments": {"paper_id": "1706.03762", "target_compute": "multi_gpu"}
        }
    })
    resp_raw = await server.handle_raw_message(req)
    resp = json.loads(resp_raw)
    assert "result" in resp
    content = resp["result"]["content"]
    assert len(content) > 0
    parsed = json.loads(content[0]["text"])
    assert parsed["success"] is True
    assert parsed["target_compute"] == "multi_gpu"
