"""
MCP Tools for Domain 5: Reproduction & Experiment Planning Service.
Implements:
- Tool 14: generate_reproduction_plan
- Tool 15: audit_reproducibility
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


async def _resolve_paper_title_and_abstract(paper_id: str) -> tuple[str, str]:
    """Helper to canonically resolve paper title and abstract."""
    resolved_title = paper_id
    abstract = ""
    try:
        res = await _canonical_resolver.resolve(paper_id)
        if res:
            resolved_title = res.title or paper_id
            abstract = res.abstract or ""
    except Exception as e:
        logger.debug("[reproduction_tools] Resolver notice for %s: %s", paper_id, e)
    return resolved_title, abstract


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

    resolved_title, abstract = await _resolve_paper_title_and_abstract(paper_id)

    # Invoke ReproductionMapper
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

    # Compute scaled hours based on target hardware
    base_hours = rep_map.compute_budget.estimated_hours or 12.0
    scale = COMPUTE_SCALING_FACTORS.get(target_compute, 1.0)
    estimated_compute_hours = round(float(base_hours * scale), 1)

    # Construct Environment Specification
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

    # Format Step-by-Step Instructions across 4 phases
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

    existing_phases = {s["phase"] for s in step_by_step_instructions}
    if "environment" not in existing_phases:
        repo = rep_map.code_availability.repo_url or "https://github.com/..."
        step_by_step_instructions.insert(0, {
            "step_number": 1,
            "phase": "environment",
            "action": "Clone repository and initialize virtual environment with Python dependencies",
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

    for idx, s in enumerate(step_by_step_instructions, 1):
        s["step_number"] = idx

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


AUDIT_REPRODUCIBILITY_METADATA = {
    "name": "audit_reproducibility",
    "description": (
        "Evaluates a paper against an 8-point empirical reproducibility rubric, assigning "
        "scores for code availability, data access, hyperparameter transparency, compute disclosure, "
        "and random seed reporting."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "paper_id": {
                "type": "string",
                "description": "Paper identifier (DOI, arXiv ID, or title).",
            }
        },
        "required": ["paper_id"],
    },
}

EIGHT_POINT_RUBRIC = [
    {
        "key": "code_availability",
        "label": "Code Availability & Open-Source Release",
        "weight": 15,
        "patterns": [r"https?://(www\.)?(github|gitlab)\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", r"code\s+(is\s+)?available", r"repository"],
        "artifact_if_missing": "Executable code repository or source script release.",
    },
    {
        "key": "data_access",
        "label": "Data Access & Benchmark Transparency",
        "weight": 15,
        "patterns": [r"https?://huggingface\.co/datasets", r"dataset\s+(is\s+)?available", r"download.*dataset", r"public.*benchmark", r"wmt", r"cifar", r"imagenet", r"benchmark"],
        "artifact_if_missing": "Public dataset download link, accession ID, or training split manifests.",
    },
    {
        "key": "hyperparameter_transparency",
        "label": "Hyperparameter & Architecture Transparency",
        "weight": 15,
        "patterns": [r"learning\s+rate", r"batch\s+size", r"adamw?", r"optimizer", r"weight\s+decay", r"epochs?", r"warmup", r"dropout"],
        "artifact_if_missing": "Comprehensive hyperparameter table (learning rates, batch sizes, optimizer configs).",
    },
    {
        "key": "compute_disclosure",
        "label": "Compute Budget & Hardware Specification",
        "weight": 10,
        "patterns": [r"(a100|h100|v100|t4|rtx\s*\d+|gpu|tpu)s?", r"gpu\s+hours?", r"trained\s+for\s+\d+\s+hours?", r"accelerator"],
        "artifact_if_missing": "Hardware configuration, accelerator counts, and total GPU/TPU hours.",
    },
    {
        "key": "random_seed_reporting",
        "label": "Random Seed Reporting & Uncertainty",
        "weight": 10,
        "patterns": [r"random\s+seeds?", r"seeds?\s*=\s*\d+", r"averaged\s+over\s+\d+\s+runs?", r"confidence\s+intervals?", r"(\+\/|\u00b1)\s*\d+", r"variance", r"standard deviation"],
        "artifact_if_missing": "Multi-seed variance reporting and random initialization seeds.",
    },
    {
        "key": "ablation_studies",
        "label": "Ablation Studies & Component Necessity",
        "weight": 15,
        "patterns": [r"ablation\s+(study|studies|experiments?|table)", r"ablated", r"without.*component", r"isolated"],
        "artifact_if_missing": "Ablation experiment results isolating architectural components.",
    },
    {
        "key": "evaluation_protocol",
        "label": "Standardized Evaluation & Baseline Protocol",
        "weight": 10,
        "patterns": [r"compared\s+(with|against|to)\s+baselines?", r"sota\s+baselines?", r"baseline\s+models?", r"bleu", r"accuracy", r"perplexity"],
        "artifact_if_missing": "Evaluation scripts and competitive published baseline comparisons.",
    },
    {
        "key": "limitations_disclosure",
        "label": "Failure Modes & Assumptions Disclosure",
        "weight": 10,
        "patterns": [r"limitations?", r"threats?\s+to\s+validity", r"failure\s+cases?", r"assumptions?", r"challenges?"],
        "artifact_if_missing": "Explicit discussion of failure cases, assumptions, and validity boundaries.",
    },
]


async def handle_audit_reproducibility(arguments: Dict[str, Any]) -> str:
    """Execute audit_reproducibility tool."""
    paper_id = arguments.get("paper_id", "").strip()
    if not paper_id:
        return json.dumps({
            "success": False,
            "error": "paper_id is required",
            "score": 0,
            "criteria_breakdown": {},
            "missing_artifacts": [],
        }, indent=2)

    resolved_title, abstract = await _resolve_paper_title_and_abstract(paper_id)
    corpus = f"{resolved_title}\n{abstract}".lower()

    # Query reproduction engine for enriched evidence
    try:
        rep_map = await _reproduction_engine.generate_map(
            paper_id=paper_id,
            title=resolved_title,
            abstract=abstract,
            force_refresh=False,
        )
        if rep_map.code_availability.repo_url:
            corpus += f"\n{rep_map.code_availability.repo_url}"
        if rep_map.compute_budget.gpu_type:
            corpus += f"\n{rep_map.compute_budget.gpu_type} {rep_map.compute_budget.estimated_hours} hours"
        for ds in rep_map.dataset_checklist:
            corpus += f"\n{ds.name} {ds.download_url or ''}"
    except Exception:
        pass

    # Evaluate 8-point rubric
    total_score = 0
    criteria_breakdown: Dict[str, Any] = {}
    missing_artifacts: List[str] = []

    for item in EIGHT_POINT_RUBRIC:
        key = item["key"]
        weight = item["weight"]
        label = item["label"]
        matched = False
        evidence_found = ""

        for pat in item["patterns"]:
            m = re.search(pat, corpus, re.IGNORECASE)
            if m:
                matched = True
                evidence_found = m.group(0)
                break

        if matched:
            earned = weight
            total_score += earned
            criteria_breakdown[key] = {
                "label": label,
                "score": earned,
                "max_score": weight,
                "passed": True,
                "evidence": evidence_found,
            }
        else:
            earned = 0
            criteria_breakdown[key] = {
                "label": label,
                "score": earned,
                "max_score": weight,
                "passed": False,
                "evidence": None,
            }
            missing_artifacts.append(item["artifact_if_missing"])

    final_score = max(0, min(100, total_score))

    payload = {
        "success": True,
        "paper_id": paper_id,
        "title": resolved_title,
        "score": final_score,
        "criteria_breakdown": criteria_breakdown,
        "missing_artifacts": missing_artifacts,
    }
    return json.dumps(payload, indent=2)
