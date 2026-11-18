"""
MCP Tools for Domain 5: Reproduction & Experiment Planning Service.
Implements:
- Tool 14: generate_reproduction_plan
"""
import asyncio
import json
import re
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.reproduction_mapper import ReproductionMapper

_canonical_resolver = CanonicalPaperResolver()
_reproduction_engine = ReproductionMapper()

GENERATE_REPRODUCTION_PLAN_METADATA = {
    "name": "generate_reproduction_plan",
    "description": (
        "Compiles a comprehensive, executable reproduction recipe for a paper: hardware budget, "
        "environment setup (uv / pip / conda), dataset download script, model training commands, "
        "evaluation protocols, and expected metric tolerances."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "paper_id": {
                "type": "string",
                "description": "Paper identifier (DOI, arXiv ID, or title).",
            },
            "target_compute": {
                "type": "string",
                "description": "Target hardware envelope.",
                "enum": ["cpu", "single_gpu", "multi_gpu", "cloud_tpu"],
                "default": "single_gpu",
            },
        },
        "required": ["paper_id"],
    },
}

COMPUTE_SCALING_FACTORS = {
    "cpu": 8.0,
    "single_gpu": 1.0,
    "multi_gpu": 0.28,
    "cloud_tpu": 0.22,
}


async def handle_generate_reproduction_plan(arguments: Dict[str, Any]) -> str:
    """Execute generate_reproduction_plan tool."""
    paper_id = arguments.get("paper_id", "").strip()
    target_compute = arguments.get("target_compute", "single_gpu")

    if not paper_id:
        return json.dumps({
            "success": False,
            "error": "paper_id is required",
            "estimated_compute_hours": 0.0,
            "environment_spec": {},
            "step_by_step_instructions": [],
            "validation_checkpoints": [],
        }, indent=2)

    # 1. Resolve paper to canonical representation
    resolved_title = paper_id
    abstract = ""
    try:
        res = await _canonical_resolver.resolve_identifier(paper_id)
        if res and res.paper:
            resolved_title = res.paper.title or paper_id
            abstract = res.paper.abstract or ""
    except Exception as e:
        logger.debug("[generate_reproduction_plan] Resolver notice for %s: %s", paper_id, e)

    # 2. Invoke ReproductionMapEngine
    try:
        rep_map = await _reproduction_engine.generate_map(
            paper_id=paper_id,
            title=resolved_title,
            abstract=abstract,
            force_refresh=False,
        )
    except Exception as e:
        logger.warning("[generate_reproduction_plan] Engine notice: %s; falling back to heuristic", e)
        rep_map = _reproduction_engine._heuristic_reproduction_map(
            paper_id=paper_id,
            evidence_summary=f"{resolved_title}. {abstract}",
        )

    # 3. Compute scaled hours based on target hardware
    base_hours = rep_map.compute_budget.estimated_hours or 12.0
    scale = COMPUTE_SCALING_FACTORS.get(target_compute, 1.0)
    estimated_compute_hours = round(float(base_hours * scale), 1)

    # 4. Construct Environment Specification
    fw = rep_map.code_availability.framework or "PyTorch"
    cuda_req = "CUDA 12.1+ / cuDNN 8.9" if target_compute != "cpu" else "None (CPU only)"
    core_libs = [f"{fw.lower()}", "numpy>=1.24", "scipy>=1.10", "tqdm", "accelerate"]
    if "torch" in fw.lower():
        core_libs.extend(["torchvision", "torchaudio"])

    environment_spec = {
        "python_version": ">=3.10, <3.13",
        "cuda_requirements": cuda_req,
        "target_compute": target_compute,
        "primary_framework": fw,
        "package_manager": "uv (recommended) or pip / conda",
        "core_libraries": core_libs,
        "code_url": rep_map.code_availability.repo_url,
    }

    # 5. Format Step-by-Step Instructions across 4 phases
    phase_mapping = {
        "setup": "environment",
        "data_prep": "data_preparation",
        "training": "training",
        "eval": "evaluation",
    }

    step_by_step_instructions: List[Dict[str, Any]] = []
    for step in rep_map.steps:
        norm_phase = phase_mapping.get(step.phase, step.phase)
        step_by_step_instructions.append({
            "step_number": step.step_number,
            "phase": norm_phase,
            "action": step.action,
            "command": step.suggested_command or f"# Execute {step.action}",
            "verification": step.verification_criteria,
        })

    # Ensure all 4 key execution phases are present
    existing_phases = {s["phase"] for s in step_by_step_instructions}
    if "environment" not in existing_phases:
        repo = rep_map.code_availability.repo_url or "https://github.com/..."
        step_by_step_instructions.insert(0, {
            "step_number": 1,
            "phase": "environment",
            "action": "Clone repository and install dependencies using uv",
            "command": f"git clone {repo} && cd $(basename {repo} .git) && uv venv && source .venv/bin/activate && uv pip install -e .",
            "verification": "python -c 'import torch; print(torch.__version__)' succeeds without errors.",
        })
    if "data_preparation" not in existing_phases:
        ds_name = rep_map.dataset_checklist[0].name if rep_map.dataset_checklist else "benchmark dataset"
        step_by_step_instructions.append({
            "step_number": len(step_by_step_instructions) + 1,
            "phase": "data_preparation",
            "action": f"Download and verify {ds_name}",
            "command": "python scripts/prepare_data.py --dataset all --verify-checksums",
            "verification": "Dataset manifests match expected sample counts and split directories exist.",
        })
    if "training" not in existing_phases:
        step_by_step_instructions.append({
            "step_number": len(step_by_step_instructions) + 1,
            "phase": "training",
            "action": f"Launch training run configured for {target_compute}",
            "command": f"python train.py --device {target_compute} --batch-size 32 --epochs 50 --save-checkpoints",
            "verification": "Loss decreases monotonically across epochs without NaNs or gradient explosions.",
        })
    if "evaluation" not in existing_phases:
        step_by_step_instructions.append({
            "step_number": len(step_by_step_instructions) + 1,
            "phase": "evaluation",
            "action": "Evaluate best checkpoint against published baseline metrics",
            "command": "python evaluate.py --checkpoint checkpoints/best.pt --split test --compute-metrics",
            "verification": "Reported metrics match paper claims within 1.5% tolerance interval.",
        })

    # Re-index steps
    for idx, s in enumerate(step_by_step_instructions, 1):
        s["step_number"] = idx

    # 6. Validation Checkpoints for Early Abort
    validation_checkpoints = [
        {
            "checkpoint_name": "Epoch 1 Convergence Check",
            "phase": "training",
            "metric": "training_loss",
            "condition": "loss < initial_loss * 0.85 and not isnan(loss)",
            "failure_action": "Abort run early; check learning rate warm-up, gradient clipping, or precision scaling.",
        },
        {
            "checkpoint_name": "Mid-Training Validation Check",
            "phase": "training",
            "metric": "validation_loss",
            "condition": "val_loss shows downward trend without severe divergence (> 2x train loss)",
            "failure_action": "Abort or adjust weight decay / dropout regularization to prevent overfitting.",
        },
        {
            "checkpoint_name": "Evaluation Metric Tolerance",
            "phase": "evaluation",
            "metric": "target_benchmark_score",
            "condition": "within +/- 2.5% of reported metric in paper",
            "failure_action": "Inspect random seed variance, data augmentation pipeline, or test set preprocessing alignment.",
        },
    ]

    payload = {
        "success": True,
        "paper_id": paper_id,
        "title": resolved_title,
        "target_compute": target_compute,
        "estimated_compute_hours": estimated_compute_hours,
        "reproducibility_score": rep_map.reproducibility_score,
        "environment_spec": environment_spec,
        "step_by_step_instructions": step_by_step_instructions,
        "validation_checkpoints": validation_checkpoints,
    }
    return json.dumps(payload, indent=2)
