import pytest
from fastapi.testclient import TestClient
from src.api.app import app


@pytest.fixture
def client():
    return TestClient(app)


def test_list_benchmark_tasks(client):
    resp = client.get("/api/v1/benchmarks/tasks")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any("translation" in item.get("id", "") for item in data)


def test_get_sota_leaderboard(client):
    resp = client.get("/api/v1/benchmarks/leaderboard")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    first = data[0]
    assert "model" in first
    assert "metric" in first
    assert "value" in first


def test_generate_and_persist_experiment_plan(client):
    req_payload = {
        "title": "Low-Rank Orthogonal Adapter Tuning",
        "hypothesis": "Orthogonal parameter adaptation prevents catastrophic forgetting across multilingual benchmarks.",
        "target_datasets": ["WMT-14 En-De"],
        "baselines_to_beat": ["LoRA (2021)"],
        "expected_metrics": ["BLEU", "Latency"],
        "mathematical_formulation": r"\Delta W = A B^T",
    }
    resp = client.post("/api/v1/benchmarks/plan/generate", json=req_payload)
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["success"] is True
    plan = res_data["plan"]
    assert "objective" in plan
    assert "dataset_pipeline_py" in plan
    assert "model_delta_py" in plan
    assert "hyperparameters" in plan
    assert "hardware_budget" in plan

    # Test saving the plan
    save_payload = {
        "workspace_id": "test-ws-bench-unique",
        "title": res_data["title"],
        "target_dataset": res_data["target_dataset"],
        "baseline_model": res_data["baseline_model"],
        "plan_data": plan,
    }
    save_resp = client.post("/api/v1/benchmarks/plan/save", json=save_payload)
    assert save_resp.status_code == 200
    plan_id = save_resp.json().get("id")
    assert plan_id is not None

    # Test listing saved plans
    list_resp = client.get(f"/api/v1/benchmarks/plans?workspace_id=test-ws-bench-unique")
    assert list_resp.status_code == 200
    saved_list = list_resp.json()
    assert len(saved_list) >= 1
    assert any(p["id"] == plan_id for p in saved_list)

    # Test deletion
    del_resp = client.delete(f"/api/v1/benchmarks/plan/{plan_id}")
    assert del_resp.status_code == 200


def test_codebase_reproducibility_audit(client):
    req_payload = {
        "github_url": "https://github.com/microsoft/LoRA",
        "paper_title": "LoRA: Low-Rank Adaptation of Large Language Models",
        "arxiv_id": "2106.09685",
    }
    resp = client.post("/api/v1/benchmarks/audit", json=req_payload)
    assert resp.status_code == 200
    audit_data = resp.json()
    assert audit_data["success"] is True
    assert "reproducibility_score" in audit_data
    assert "checked_items" in audit_data
    assert len(audit_data["checked_items"]) >= 3
