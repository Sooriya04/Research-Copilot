---
name: paper-rank
description: Ranks scientific literature using a 6-factor algorithm combining topical relevance, citation impact, citation graph PageRank prestige, annual velocity, empirical methodology quality, and open science reproducibility.
parameters:
  query:
    type: string
    description: Scientific research topic, keywords, or research question.
  limit:
    type: integer
    default: 10
    description: Maximum number of ranked papers to return.
  profile:
    type: string
    enum: [balanced, reproducibility, empirical_rigor, recent_velocity, prestige]
    default: balanced
    description: Sensitivity weighting profile.
  custom_weights:
    type: object
    description: Optional custom weights dictionary mapping component keys to floats.
---

# PaperRank Scoring & Literature Discovery Skill

## Overview
**PaperRank** answers the foundational question of scientific literature exploration: **"What should a researcher read first?"**

Instead of naive date-based or single-provider sorting, PaperRank computes a transparent, multi-dimensional score $S \in [0, 100]$ across candidate literature:

$$\text{Score} = \sum_{k} w_k \cdot C_k$$

### 6-Factor Scoring Breakdown
1. **Topical Relevance ($w=0.30$)**: BM25-grade token matching across title and abstract, exact title substring bonuses, and semantic query alignment.
2. **Citation Impact ($w=0.20$)**: Log-scaled citation counts normalized against field and publication year percentiles.
3. **Graph Prestige ($w=0.20$)**: PageRank damping-factored centrality ($\alpha=0.85$) applied on the localized citation graph.
4. **Citation Velocity ($w=0.10$)**: Annual citation momentum measuring recent research impact ($\text{Velocity} = \frac{\text{Citations}}{\text{CurrentYear} - \text{PubYear} + 1}$).
5. **Methodology Quality ($w=0.10$)**: Heuristic detection of empirical rigor: ablation tables, standardized benchmark evaluations, and statistical uncertainty reporting.
6. **Reproducibility ($w=0.10$)**: Detection of open-source GitHub/GitLab repositories, dataset links, and disclosed compute/hardware budgets.

---

## Sensitivity Profiles

| Profile Name | Relevance | Impact | Prestige | Velocity | Rigor | Reproducibility | Best For |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `balanced` (Default) | 0.30 | 0.20 | 0.20 | 0.10 | 0.10 | 0.10 | General literature review |
| `reproducibility` | 0.20 | 0.10 | 0.10 | 0.10 | 0.15 | **0.35** | Finding implementable models with code |
| `empirical_rigor` | 0.20 | 0.10 | 0.10 | 0.10 | **0.35** | 0.15 | Identifying robust benchmarks & ablations |
| `recent_velocity` | 0.25 | 0.10 | 0.10 | **0.35** | 0.10 | 0.10 | Discovering fast-moving recent breakthroughs |
| `prestige` | 0.20 | 0.25 | **0.35** | 0.05 | 0.08 | 0.07 | Foundational seed papers & classic citations |

---

## Execution Interface
Call via FastAPI:
```bash
POST /api/v1/rank
Content-Type: application/json

{
  "query": "diffusion models for time series forecasting",
  "limit": 10,
  "weights": { ... }
}
```

Or invoke dynamically via the Skill Registry:
```bash
POST /api/v1/rank/skills/paper-rank
Content-Type: application/json

{
  "params": {
    "query": "transformer attention mechanisms",
    "profile": "reproducibility",
    "limit": 5
  }
}
```
