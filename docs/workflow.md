# Research Engineering Workflow

This document outlines the **12-Stage Research Engineering Process** executed by Research Copilot.

```mermaid
flowchart TD
    A["1. Query & Topic Definition"] --> B["2. Multi-Source Ingestion<br/>(OpenAlex, arXiv, PubMed)"]
    B --> C["3. 6-Factor PaperRank Scoring"]
    C --> D["4. Directed Citation Network & PageRank"]
    D --> E["5. Section-Aware PDF/XML Parsing"]
    E --> F["6. Heuristic Rubric Validation<br/>(Ablations, Code, Compute)"]
    F --> G["7. Research Gap & Limitation Mining"]
    G --> H["8. Hypothesis Formulation"]
    H --> I["9. Multi-Paper Comparison Matrix"]
    I --> J["10. State Graph Loop Execution (SQLite Ledgers)"]
    J --> K["11. Sandbox Code Reproduction (MCP Router)"]
    K --> L["12. Structured LaTeX Manuscript Synthesis"]
```

---

## 🔬 Stage Descriptions

1. **Query & Topic Definition**: Formulates scientific scope with natural language or scientific queries (`POST /api/v1/rank`).
2. **Multi-Source Ingestion**: Aggregates candidate works across OpenAlex and arXiv (`src/engines/access_resolver.py`).
3. **PaperRank Prioritization**: Computes transparent weighted scores across relevance, citations, graph prestige, velocity, rigor, and reproducibility.
4. **Citation Graph Analysis**: NetworkX builds directed citation subgraphs and calculates PageRank prestige.
5. **Section Extraction**: PyMuPDF & BeautifulSoup segment papers into `Introduction`, `Methods`, `Results`, `Limitations`.
6. **Heuristic Rubric Validation**: Automatically verifies presence of ablation tables, baseline comparisons, public GitHub links, and hardware budgets.
7. **Research Gap Mining**: Extracts stated limitations from published literature.
8. **Hypothesis Formulation**: Proposes testable novel research directions (`POST /api/v1/hypothesis/generate`).
9. **Multi-Paper Comparison**: Generates side-by-side matrices comparing methodology and rigor (`POST /api/v1/papers/compare`).
10. **State Graph Loop**: Iterative state machine persisting snapshots and artifact ledgers into SQLite (`POST /api/v1/graph/run`).
11. **Sandbox Reproduction**: Offloads compute and execution tasks to external coding agents via MCP.
12. **Manuscript Synthesis**: Produces structured Markdown synthesis briefs and publication-ready LaTeX section drafts.
