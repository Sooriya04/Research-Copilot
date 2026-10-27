"""
Unit and integration tests for Option 1 — Research Paper Reproduction Map (A3).
Verifies:
1. Deterministic heuristic extraction (GitHub URLs, frameworks, compute hardware, datasets).
2. Schema validation and boundary constraints on ReproductionMap.
3. Multi-tier LLM resilience and graceful offline fallback.
4. FastAPI endpoint GET /api/v1/evidence/{paper_id}/reproduction-map with force_refresh support.
"""

import pytest
from pydantic import ValidationError
from httpx import AsyncClient, ASGITransport

from src.api.app import app
from src.core.database import init_db
from src.core.evidence_schemas import (
    CodeAvailability,
    ComputeBudget,
    DatasetChecklist,
    ReproductionStep,
    ReproductionMap,
    PaperEvidencePackage,
)
from src.engines.reproduction_mapper import ReproductionMapper


def test_heuristic_extraction_github_pytorch_a100_datasets():
    """Verify deterministic extraction of repository URL, PyTorch, A100 GPUs, and standard datasets."""
    mapper = ReproductionMapper()

    paper_text = """
    Title: Attention-Based Vision Transformers
    Abstract: We propose an efficient attention mechanism for computer vision.
    All code and pretrained checkpoints are made available at https://github.com/google-research/vision-transformer.
    The implementation is written in PyTorch using the transformers library under the Apache-2.0 license.
    Training was carried out on a cluster of 8x NVIDIA A100 GPUs for approximately 48 hours of training.
    We evaluate our approach on the ImageNet and CIFAR-10 benchmark datasets.
    """

    rep_map = mapper._heuristic_reproduction_map(
        paper_id="test-vision-transformer",
        evidence_summary=paper_text,
    )

    # 1. Code Availability assertions
    assert rep_map.code_availability.has_repo is True
    assert rep_map.code_availability.repo_url == "https://github.com/google-research/vision-transformer"
    assert "PyTorch" in (rep_map.code_availability.framework or "")
    assert rep_map.code_availability.has_checkpoints is True
    assert rep_map.code_availability.license == "Apache-2.0"
    assert "torch" in rep_map.code_availability.dependencies or "transformers" in rep_map.code_availability.dependencies

    # 2. Compute Budget assertions
    assert rep_map.compute_budget.hardware_mentioned is True
    assert rep_map.compute_budget.gpu_type == "NVIDIA A100"
    assert rep_map.compute_budget.gpu_count == 8
    assert rep_map.compute_budget.estimated_hours == 48.0
    assert "NVIDIA A100" in (rep_map.compute_budget.notes or "")

    # 3. Dataset Checklist assertions
    ds_names = [d.name.lower() for d in rep_map.dataset_checklist]
    assert any("imagenet" in name for name in ds_names)
    assert any("cifar-10" in name for name in ds_names)
    for ds in rep_map.dataset_checklist:
        assert ds.access_type == "public"

    # 4. Actionable Reproduction Steps assertions
    assert len(rep_map.steps) == 4
    phases = [s.phase for s in rep_map.steps]
    assert phases == ["setup", "data_prep", "training", "eval"]
    assert "git clone" in (rep_map.steps[0].suggested_command or "")
    assert rep_map.steps[0].verification_criteria != ""

    # 5. Score and Friction assertions
    assert rep_map.reproducibility_score >= 70.0
    assert "Low Friction" in rep_map.friction_summary


def test_heuristic_extraction_minimal_and_private_dataset():
    """Verify handling of paper with no repository, undisclosed compute, and proprietary dataset."""
    mapper = ReproductionMapper()

    paper_text = """
    Title: Proprietary Fraud Detection in Banking
    Abstract: We present an enterprise risk scoring model.
    Evaluated on an internal proprietary dataset of 5 million transactions from corporate customer accounts.
    Code and weights cannot be released due to commercial IP constraints.
    """

    rep_map = mapper._heuristic_reproduction_map(
        paper_id="test-fraud-paper",
        evidence_summary=paper_text,
    )

    assert rep_map.code_availability.has_repo is False
    assert rep_map.code_availability.repo_url is None
    assert rep_map.compute_budget.hardware_mentioned is False

    # Check that missing elements are properly flagged
    missing = " ".join(rep_map.missing_critical_elements)
    assert "code repository" in missing.lower() or "repository" in missing.lower()
    assert "hardware specifications" in missing.lower() or "hardware" in missing.lower()

    # Score should be penalised for missing code & private dataset
    assert rep_map.reproducibility_score <= 40.0
    assert "High Friction" in rep_map.friction_summary


def test_reproduction_map_schema_validation():
    """Verify Pydantic schema validation and bounds on ReproductionMap."""
    valid_map = ReproductionMap(
        paper_id="paper-123",
        reproducibility_score=85.5,
        code_availability=CodeAvailability(
            has_repo=True,
            repo_url="https://github.com/author/repo",
            framework="PyTorch",
            has_checkpoints=True,
            dependencies=["torch", "numpy"],
            license="MIT",
        ),
        compute_budget=ComputeBudget(
            hardware_mentioned=True,
            gpu_type="NVIDIA V100",
            gpu_count=4,
            estimated_hours=24.0,
            notes="Trained on 4x V100 for 24h.",
        ),
        dataset_checklist=[
            DatasetChecklist(
                name="SQuAD",
                access_type="public",
                download_url="https://rajpurkar.github.io/SQuAD-explorer/",
                preprocessing_notes="Standard split.",
            )
        ],
        steps=[
            ReproductionStep(
                step_number=1,
                phase="setup",
                action="Install dependencies",
                suggested_command="pip install -r requirements.txt",
                verification_criteria="No errors on import.",
            )
        ],
        missing_critical_elements=["Hyperparameter random seeds not provided."],
        friction_summary="Low Friction: Repository and public dataset available.",
    )

    assert valid_map.paper_id == "paper-123"
    assert valid_map.reproducibility_score == 85.5
    assert valid_map.code_availability.has_repo is True
    assert len(valid_map.steps) == 1

    # Verify score boundary validation (0.0 <= score <= 100.0)
    with pytest.raises(ValidationError):
        ReproductionMap(
            paper_id="paper-invalid",
            reproducibility_score=105.0,  # exceeds 100.0
            code_availability=valid_map.code_availability,
            compute_budget=valid_map.compute_budget,
            friction_summary="Invalid score",
        )

    with pytest.raises(ValidationError):
        ReproductionMap(
            paper_id="paper-invalid-neg",
            reproducibility_score=-5.0,  # below 0.0
            code_availability=valid_map.code_availability,
            compute_budget=valid_map.compute_budget,
            friction_summary="Invalid score",
        )


@pytest.mark.asyncio
async def test_reproduction_mapper_offline_resilience(tmp_path):
    """Verify ReproductionMapper falls back to heuristics and caches results when no LLM is configured."""
    db_file = str(tmp_path / "test_rep_cache.db")
    mapper = ReproductionMapper(provider=None, db_path=db_file)

    pkg = PaperEvidencePackage(
        paper_id="test-offline-1",
        title="Offline Resilient Reproduction Paper",
        thesis="Demonstrating zero-crash offline execution.",
        plain_summary="Paper trained on 4x NVIDIA A100 GPUs using PyTorch.",
        research_question="Can models reproduce without frontier API access?",
        methods=["Transformer training with AdamW optimizer"],
        findings=["Achieved 82.5% accuracy on CIFAR-100"],
    )

    # First call generates map via heuristics and caches to SQLite
    rep_map = await mapper.generate_map(
        paper_id="test-offline-1",
        evidence_pkg=pkg,
        force_refresh=True,
    )

    assert rep_map.paper_id == "test-offline-1"
    assert rep_map.compute_budget.gpu_type == "NVIDIA A100"
    assert rep_map.compute_budget.gpu_count == 4
    assert rep_map.reproducibility_score >= 0.0

    # Second call hits cache
    cached_map = await mapper.generate_map(
        paper_id="test-offline-1",
        evidence_pkg=pkg,
        force_refresh=False,
    )

    assert cached_map.paper_id == rep_map.paper_id
    assert cached_map.reproducibility_score == rep_map.reproducibility_score
    assert len(cached_map.steps) == len(rep_map.steps)


@pytest.mark.asyncio
async def test_reproduction_map_api_endpoint():
    """Verify FastAPI GET /api/v1/evidence/{paper_id}/reproduction-map endpoint end-to-end."""
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Ingest synthetic evidence first
        ingest_payload = {
            "paper_id": "test-paper-rep-api",
            "title": "Synthetic Multi-GPU Transformer Reproduction",
            "force_refresh": True,
        }
        ingest_res = await client.post("/api/v1/evidence/ingest", json=ingest_payload)
        assert ingest_res.status_code == 200

        # 2. Query Reproduction Map endpoint
        res = await client.get("/api/v1/evidence/test-paper-rep-api/reproduction-map")
        assert res.status_code == 200
        data = res.json()

        # Validate top-level schema attributes
        assert data["paper_id"] == "test-paper-rep-api"
        assert "reproducibility_score" in data
        assert isinstance(data["reproducibility_score"], (int, float))
        assert 0.0 <= data["reproducibility_score"] <= 100.0

        # Validate code_availability
        assert "code_availability" in data
        assert "has_repo" in data["code_availability"]
        assert "dependencies" in data["code_availability"]

        # Validate compute_budget
        assert "compute_budget" in data
        assert "hardware_mentioned" in data["compute_budget"]

        # Validate dataset_checklist
        assert "dataset_checklist" in data
        assert isinstance(data["dataset_checklist"], list)

        # Validate steps
        assert "steps" in data
        assert len(data["steps"]) >= 1
        first_step = data["steps"][0]
        assert "step_number" in first_step
        assert "phase" in first_step
        assert "action" in first_step
        assert "verification_criteria" in first_step

        # Validate missing elements and friction summary
        assert "missing_critical_elements" in data
        assert "friction_summary" in data
        assert len(data["friction_summary"]) > 0

        # 3. Test force_refresh query param
        refresh_res = await client.get("/api/v1/evidence/test-paper-rep-api/reproduction-map?force_refresh=true")
        assert refresh_res.status_code == 200
        refreshed_data = refresh_res.json()
        assert refreshed_data["paper_id"] == "test-paper-rep-api"
