import pytest
from fastapi.testclient import TestClient
from src.api.app import create_app
from src.core.schemas import Paper, PaperSection
from src.skills.methodology_checklist import MethodologyChecklistSkill
from src.skills.paper_rank import PaperRankSkill
from src.skills.registry import skill_registry

client = TestClient(create_app())


@pytest.mark.asyncio
async def test_skill_registry_registration():
    skills = skill_registry.list_skills()
    names = [s.name for s in skills]
    assert "paper-rank" in names
    assert "methodology-checklist" in names


@pytest.mark.asyncio
async def test_methodology_checklist_skill_evaluation():
    skill = MethodologyChecklistSkill()
    result = await skill.execute({
        "title": "Robust Training of Transformers with Uncertainty",
        "abstract": "We present an ablation study on SOTA baselines. Source code is released at https://github.com/org/transformer-study.",
        "full_text": "We trained on 8x A100 GPUs for 48 hours. We report error bars with p < 0.01 across 5 random seeds. Limitations: evaluated only on English benchmark datasets.",
        "sections": [
            {"title": "Limitations", "content": "Our method has bounded scope and assumes high-memory GPUs.", "section_type": "limitations"},
        ],
    })

    assert result["rubric_score"] > 70.0
    assert result["has_code_repo"] is True
    assert result["code_url"] == "https://github.com/org/transformer-study"
    assert result["has_compute_budget"] is True
    assert result["has_uncertainty_quant"] is True
    assert result["has_limitations"] is True
    assert len(result["items"]) == 5

    # Check evidence snippet extraction
    lim_item = next(i for i in result["items"] if i["id"] == "limitations")
    assert lim_item["answer"] == "present"
    assert lim_item["confidence"] >= 0.75
    assert lim_item["evidence_snippet"] is not None


@pytest.mark.asyncio
async def test_paper_rank_profiles():
    response = client.get("/api/v1/rank/profiles")
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    assert "reproducibility" in data["profiles"]
    assert data["profiles"]["reproducibility"]["reproducibility"] == 0.35


def test_api_checklist_endpoint():
    payload = {
        "title": "Scaling Vision Transformers",
        "abstract": "We compare with SOTA baselines and provide ablations. Code at https://github.com/vision/vit.",
        "full_text": "Trained for 100 epochs on 16x V100 GPUs. Limitations: computational bottleneck.",
    }
    response = client.post("/api/v1/rank/checklist", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["has_code_repo"] is True
    assert data["has_compute_budget"] is True
    assert data["has_ablation"] is True
    assert len(data["items"]) == 5


def test_api_skills_endpoint_execution():
    list_res = client.get("/api/v1/rank/skills")
    assert list_res.status_code == 200
    skills = list_res.json()["skills"]
    assert any(s["name"] == "methodology-checklist" for s in skills)

    exec_res = client.post(
        "/api/v1/rank/skills/methodology-checklist",
        json={"params": {
            "title": "Test Paper",
            "abstract": "Ablation experiments comparing against baselines.",
            "full_text": "Code: https://github.com/test/repo",
        }}
    )
    assert exec_res.status_code == 200
    res_data = exec_res.json()
    assert res_data["status"] == "success"
    assert res_data["result"]["has_code_repo"] is True
