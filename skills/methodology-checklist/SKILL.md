---
name: methodology-checklist
description: Audits scientific papers against the 5 core NeurIPS/ICLR empirical rigor criteria, assessing assumptions & limitations, reproducibility paths, experimental details, statistical significance, and compute budgets.
parameters:
  title:
    type: string
    description: Paper title.
  abstract:
    type: string
    description: Paper abstract.
  full_text:
    type: string
    description: Optional full-text paper body.
  sections:
    type: array
    description: Structured list of extracted paper sections (title, content, section_type).
---

# Full-Text Methodology Checklist & Rigor Rubrics Skill

## Overview
**Methodology Checklist** implements automated heuristic verification inspired by the **NeurIPS Paper Checklist Guidelines** and **ICLR Reproducibility Rubrics**.

It audits scientific documents across 5 core empirical dimensions:

| Dimension | Question | Target Sections | Extracted Evidence |
| :--- | :--- | :--- | :--- |
| **1. Assumptions & Limitations** | Does the paper discuss assumptions, scope, robustness, or limitations? | `limitations`, `discussion`, `conclusion` | Failure modes, dataset shift bounds, scope caveats |
| **2. Reproducibility Path** | Does the paper provide a path to reproduce or verify main results? | `reproducibility`, `methodology`, `experiments` | GitHub/GitLab links, checkpoints, installation recipes |
| **3. Experimental Details** | Does the paper specify experimental setup details, baselines, and ablations? | `methodology`, `experiments`, `results` | Ablation tables, baseline comparisons, hyperparameter grids |
| **4. Statistical Significance** | Does the paper report uncertainty, error bars, confidence intervals, or variance? | `results`, `experiments` | $\pm$ standard deviation, p-values, multi-seed averages |
| **5. Compute Resources** | Does the paper state compute resources and hardware budgets? | `methodology`, `experiments` | GPU/TPU accelerator counts (e.g. 8x A100), training duration |

---

## Output Structure
For each criterion, the skill outputs:
- **`answer`**: `"present"`, `"partial"`, or `"missing"`
- **`confidence`**: Assessment confidence score $[0.0, 1.0]$ based on section specificity
- **`matched_markers`**: Detected empirical tokens and regex matches
- **`evidence_snippet`**: Verifiable verbatim excerpt from the paper
- **`rationale`**: Clear explanation of findings
- **`rubric_gaps`**: Count of failed checklist items
- **`recommendations`**: Concrete actionable steps for peer review or reproduction

---

## Execution Interface
Call via FastAPI:
```bash
POST /api/v1/rank/checklist
Content-Type: application/json

{
  "title": "Scaling Laws for Neural Language Models",
  "abstract": "We investigate empirical scaling laws... We trained on 128x TPUv3 for 2 weeks with standard deviation reported.",
  "paper_id": "scaling-laws"
}
```

Or invoke dynamically via the Skill Registry:
```bash
POST /api/v1/rank/skills/methodology-checklist
Content-Type: application/json

{
  "params": {
    "title": "Empirical Study of LLM Fine-Tuning",
    "abstract": "Ablation experiments conducted on SOTA baselines. Code: https://github.com/org/repo.",
    "full_text": "We ran 5 random seeds (p < 0.01) on 8x A100 GPUs for 48 hours. Limitations: English only."
  }
}
```
