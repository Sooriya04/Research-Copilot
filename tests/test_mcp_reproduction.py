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


@pytest.mark.asyncio
async def test_audit_reproducibility_metadata():
    from src.mcp.tools.reproduction import AUDIT_REPRODUCIBILITY_METADATA
    assert AUDIT_REPRODUCIBILITY_METADATA["name"] == "audit_reproducibility"
    assert "paper_id" in AUDIT_REPRODUCIBILITY_METADATA["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_audit_reproducibility_invalid_args():
    from src.mcp.tools.reproduction import handle_audit_reproducibility
    res_str = await handle_audit_reproducibility({})
    res = json.loads(res_str)
    assert res["success"] is False
    assert "error" in res


@pytest.mark.asyncio
async def test_audit_reproducibility_execution():
    from src.mcp.tools.reproduction import handle_audit_reproducibility
    res_str = await handle_audit_reproducibility({"paper_id": "1706.03762"})
    res = json.loads(res_str)
    assert res["success"] is True
    assert "score" in res
    assert 0 <= res["score"] <= 100
    assert "criteria_breakdown" in res
    assert len(res["criteria_breakdown"]) == 8
    assert "missing_artifacts" in res
    assert isinstance(res["missing_artifacts"], list)


@pytest.mark.asyncio
async def test_audit_reproducibility_mcp_server_dispatch():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 15,
        "method": "tools/call",
        "params": {
            "name": "audit_reproducibility",
            "arguments": {"paper_id": "1706.03762"}
        }
    })
    resp_raw = await server.handle_raw_message(req)
    resp = json.loads(resp_raw)
    assert "result" in resp
    content = resp["result"]["content"]
    assert len(content) > 0
    parsed = json.loads(content[0]["text"])
    assert parsed["success"] is True
    assert 0 <= parsed["score"] <= 100
