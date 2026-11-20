# Research Copilot — Model Context Protocol (MCP) Specification

> **Version:** 1.0.0  
> **Protocol Standard:** Model Context Protocol (MCP) JSON-RPC 2.0  
> **Status:** Approved Specification  
> **Target Consumers:** Claude Code, Cursor, Windsurf, Antigravity CLI, OpenCode, and external AI agentic orchestrators.

---

## 1. Overview & Architecture

Research Copilot exposes its scientific literature intelligence, PDF evidence extraction, benchmark tracking, novelty analysis, and reproduction planning engines as a native **Model Context Protocol (MCP) Server**.

By connecting external AI coding agents to Research Copilot via MCP, external agents inherit deep scientific capabilities without needing to implement scientific scrapers, PDF parsers, or citation graph algorithms themselves.

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                        EXTERNAL CODING AGENTS                          │
 │         Claude Code  •  Cursor  •  Antigravity CLI  •  OpenCode         │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ JSON-RPC 2.0 over stdio / SSE
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                 RESEARCH COPILOT MCP SERVER (`src/mcp`)                │
 ├───────────────────────────────────┬────────────────────────────────────┤
 │ 1. Literature Discovery           │ 2. Paper Intelligence & Evidence   │
 │    • search_literature            │    • read_paper_full               │
 │    • resolve_paper                │    • extract_paper_assets          │
 │    • get_paper_citations          │    • verify_paper_claim            │
 │                                   │    • paper_grounded_qa             │
 ├───────────────────────────────────┼────────────────────────────────────┤
 │ 3. Code & Benchmark Intelligence  │ 4. Gap Analysis & Novelty Studio   │
 │    • get_paper_code_repositories  │    • extract_research_gaps         │
 │    • get_sota_leaderboard         │    • generate_novel_hypotheses     │
 │    • inspect_paper_datasets       │    • synthesize_critique           │
 ├───────────────────────────────────┼────────────────────────────────────┤
 │ 5. Reproduction & Experiment      │ 6. Knowledge Graph & Synthesis     │
 │    • generate_reproduction_plan   │    • query_knowledge_graph         │
 │    • audit_reproducibility        │    • compare_papers_matrix         │
 │                                   │    • export_research_dossier       │
 └───────────────────────────────────┴────────────────────────────────────┘
```

---

## 2. Core Service Domains & Function Catalog

The platform provides **6 Service Domains** with **18 High-Impact Tools**:

| Service Domain | Function Name | Primary Responsibility |
| :--- | :--- | :--- |
| **Domain 1: Literature Discovery** | `search_literature` | Multi-source unified search across 8+ scientific databases. |
| | `resolve_paper` | Resolve DOI/arXiv/PubMed/URL to metadata & open-access PDF. |
| | `get_paper_citations` | Forward & backward citation network expansion. |
| **Domain 2: Paper Intelligence & Evidence** | `read_paper_full` | Structured section extraction (Abstract, Method, Results, Limitations). |
| | `summarize_paper` | Structured synthesis (problem, contributions, methodology, claims). |
| | `extract_paper_assets` | Extract figures, tables, and equations with coordinates. |
| | `verify_paper_claim` | Ground claims against paper text with verbatim quote verification. |
| | `paper_grounded_qa` | Hybrid vector + graph RAG Q&A over paper text with page citations. |
| **Domain 3: Code & Benchmarks** | `get_paper_code_repositories` | Find official & community GitHub repositories, star counts & licenses. |
| | `get_sota_leaderboard` | Retrieve SOTA leaderboards, evaluation metrics & dataset rankings. |
| | `inspect_paper_datasets` | Identify training/testing datasets, splits & evaluation metrics. |
| **Domain 4: Gap Analysis & Novelty** | `extract_research_gaps` | Extract unaddressed limitations, technical bottlenecks & assumptions. |
| | `generate_novel_hypotheses` | Synthesize novel, evidence-backed hypotheses and proposals. |
| | `synthesize_critique` | Peer-review critique: methodology strengths, weaknesses, failure modes. |
| **Domain 5: Reproduction & Experiment** | `generate_reproduction_plan` | Step-by-step reproduction guide: hardware, deps, commands, checkpoints. |
| | `audit_reproducibility` | 8-point rubric audit of code, compute, data, and hyperparameters. |
| **Domain 6: Knowledge Graph & Synthesis** | `query_knowledge_graph` | Traverse multi-hop entities (papers, tasks, methods, datasets). |
| | `compare_papers_matrix` | Side-by-side comparative matrix across 2-5 papers. |
| | `export_research_dossier` | Generate structured markdown/LaTeX evidence dossier with BibTeX. |

---

## 3. Detailed Tool Specifications (All 18 Functions)

---

### Domain 1: Literature Discovery Service (`mcp_literature`)

#### Tool 1: `search_literature`
- **Description:** Performs federated, multi-source scientific literature search across arXiv, OpenAlex, Semantic Scholar, CrossRef, Europe PMC, and Hugging Face. Merges duplicates, computes cross-source PaperRank, and returns structured bibliographic records.
- **Input Parameters:**
  - `query` (*string, required*): Scientific search topic or question (e.g. `"sparse mixture of experts routing stability"`).
  - `sources` (*array of strings, optional, default: `["arxiv", "openalex", "semanticscholar"]`*): Target databases to query.
  - `limit` (*integer, optional, default: `10`*): Maximum number of top-ranked papers to return.
  - `year_start` (*integer, optional*): Earliest publication year filter.
  - `year_end` (*integer, optional*): Latest publication year filter.
- **Output:**
  - `results` (*array*): List of papers with `paper_id`, `title`, `abstract`, `authors`, `year`, `venue`, `citation_count`, `doi`, `arxiv_id`, `open_access_pdf_url`, and `rank_score`.
- **Underlying Engine:** `src/engines/multi_provider_search.py`, `src/engines/paper_rank.py`.

#### Tool 2: `resolve_paper`
- **Description:** Takes any paper identifier (DOI, arXiv ID, PubMed ID, Semantic Scholar Corpus ID, publisher URL, or title) and resolves it to its canonical record, verifying open-access PDF availability and generating formatted BibTeX.
- **Input Parameters:**
  - `identifier` (*string, required*): The paper DOI (e.g. `"10.1145/3394486.3403177"`), arXiv ID (e.g. `"1706.03762"`), or URL.
- **Output:**
  - `canonical_id` (*string*): Standardized identifier.
  - `title` (*string*): Verified canonical title.
  - `doi` (*string, nullable*): Digital Object Identifier.
  - `arxiv_id` (*string, nullable*): arXiv identifier.
  - `pdf_url` (*string, nullable*): Direct downloadable open-access PDF link.
  - `is_open_access` (*boolean*): Access status.
  - `bibtex` (*string*): Standard publication citation entry.
- **Underlying Engine:** `src/engines/canonical_resolver.py`, `src/engines/access_resolver.py`.

#### Tool 3: `get_paper_citations`
- **Description:** Expands the literature graph around a specific paper by traversing forward citations (papers that cited this work) and backward references (prior works cited by this paper).
- **Input Parameters:**
  - `paper_id` (*string, required*): Canonical paper identifier or DOI.
  - `direction` (*string, optional, default: `"both"`, enum: `["forward", "backward", "both"]`*): Direction of citation traversal.
  - `limit` (*integer, optional, default: `20`*): Max citations to retrieve per direction.
- **Output:**
  - `references` (*array*): Prior foundational works with title, year, and influence score.
  - `citations` (*array*): Subsequent works citing this paper.
  - `co_citation_clusters` (*array*): Highly connected conceptual paper clusters.
- **Underlying Engine:** `src/engines/citation_graph.py`, `src/api/routes_litgraph.py`.

---

### Domain 2: Paper Intelligence & Evidence Service (`mcp_paper_reader`)

#### Tool 4: `read_paper_full`
- **Description:** Downloads, parses, and extracts clean, structured textual sections from a paper's PDF or publisher HTML, separating Abstract, Introduction, Method/Architecture, Experiments, Results, and Limitations.
- **Input Parameters:**
  - `identifier` (*string, required*): arXiv ID, DOI, or local paper ID.
  - `include_sections` (*boolean, optional, default: `true`*): Whether to return split section objects.
  - `max_chars` (*integer, optional, default: `60000`*): Maximum text character budget to prevent context overflow.
- **Output:**
  - `metadata` (*object*): Title, authors, venue, publication date.
  - `abstract` (*string*): Full abstract.
  - `sections` (*array*): Structured objects with `heading`, `text`, `page_start`, and `page_end`.
  - `reading_time_minutes` (*integer*): Estimated human read time.
- **Underlying Engine:** `src/engines/pdf_parser.py`, `src/engines/section_extractor.py`.

#### Tool 5: `summarize_paper`
- **Description:** Generates or retrieves an end-to-end multi-dimensional scientific analysis of a paper, combining problem formulation, core architectural contributions, methodology, empirical experiments, limitations, open questions, Papers with Code benchmark records, and verified claims with SQLite persistence.
- **Input Parameters:**
  - `identifier` (*string, required*): arXiv ID, DOI, or title.
  - `force_refresh` (*boolean, optional, default: `false`*): Whether to bypass cached SQLite analysis.
- **Output:**
  - `paper_id` (*string*): Canonical paper identifier.
  - `summary` (*object*): Structured summary with `problem`, `contributions`, `methodology`, `experiments`, `limitations`, `open_questions`, and `claims`.
  - `benchmarks` (*array*): Benchmark evaluation records from Papers with Code.
  - `code_repositories` (*array*): Associated GitHub repositories with stars and frameworks.
  - `cached` (*boolean*): Whether returned from SQLite cache.
- **Underlying Engine:** `src/engines/paper_intelligence_engine.py`, `src/engines/paper_analyzer.py`, `src/engines/claim_verifier.py`.

#### Tool 6: `extract_paper_assets`
- **Description:** Extracts all visual and mathematical assets embedded in the paper: high-resolution figures, tabular benchmarks with parsed column headers, and key LaTeX equations with bounding-box coordinates.
- **Input Parameters:**
  - `paper_id` (*string, required*): Paper identifier.
  - `asset_type` (*string, optional, default: `"all"`, enum: `["figures", "tables", "equations", "all"]`*): Specific asset class to filter.
- **Output:**
  - `figures` (*array*): Objects containing `figure_id`, `caption`, `page_number`, `image_url_or_base64`, `bounding_box`.
  - `tables` (*array*): Objects containing `table_id`, `caption`, `markdown_content`, `page_number`.
  - `equations` (*array*): LaTeX mathematical formulas with page references.
- **Underlying Engine:** `src/engines/pdf_visual_extractor.py`, `src/engines/pdf_coordinate_engine.py`.

#### Tool 6: `verify_paper_claim`
- **Description:** Given an assertion or controversial claim, audits the entire paper text using verbatim string matching, fuzzy semantic alignment, and coordinate bounding to determine if the claim is supported, refuted, or hallucinated.
- **Input Parameters:**
  - `paper_id` (*string, required*): Paper identifier.
  - `claim_text` (*string, required*): The assertion to verify (e.g. `"Method achieves 84.2% top-1 accuracy on ImageNet-1K with 12M parameters"`).
- **Output:**
  - `verdict` (*string, enum: `["SUPPORTED", "REFUTED", "UNVERIFIABLE", "PARTIALLY_SUPPORTED"]`*): Grounded verdict.
  - `verifiable_score` (*float*): Confidence score between `0.0` and `1.0`.
  - `exact_quotes` (*array*): Exact excerpt strings from the paper supporting or contradicting the claim.
  - `page_numbers` (*array of integers*): Pages where the evidence is located.
- **Underlying Engine:** `src/engines/claim_verifier.py`, `src/engines/excerpt_verifier.py`.

#### Tool 7: `paper_grounded_qa`
- **Description:** Performs hybrid dense-vector and BM25 RAG query against the paper's indexed text chunks, returning a synthesis grounded in retrieved passage coordinates with exact page citations.
- **Input Parameters:**
  - `paper_id` (*string, required*): Paper identifier.
  - `question` (*string, required*): Research inquiry (e.g. `"What optimizer learning rate schedule was used during pre-training?"`).
  - `top_k` (*integer, optional, default: `5`*): Number of context chunks to retrieve.
- **Output:**
  - `answer` (*string*): Grounded markdown answer.
  - `citations` (*array*): List of cited evidence passages with `page`, `section`, and `relevance_score`.
  - `confidence` (*float*): Grounding confidence.
- **Underlying Engine:** `src/engines/grounded_qa.py`, `src/rag/service.py`.

---

### Domain 3: Code & Benchmark Intelligence Service (`mcp_code_benchmarks`)

#### Tool 8: `get_paper_code_repositories` *(Implemented)*
- **Description:** Queries PapersWithCode, GitHub, and Hugging Face to identify official and verified community implementations of a paper's method, extracting stars, active maintenance status, programming languages, and licenses.
- **Input Parameters:**
  - `paper_id_or_title` (*string, required*): Paper title, arXiv ID, or URL.
- **Output:**
  - `official_repositories` (*array*): Repositories created by original paper authors.
  - `community_repositories` (*array*): Third-party reproduction repositories with star counts and last commit date.
  - `primary_framework` (*string*): Detected framework (`PyTorch`, `JAX`, `TensorFlow`, `Rust`, etc.).
- **Underlying Engine:** `src/engines/paperswithcode.py`, `src/mcp/tools/code_benchmarks.py`.

#### Tool 9: `get_sota_leaderboard`
- **Description:** Retrieves the latest state-of-the-art benchmark leaderboard for an ML/AI task or dataset, showing ranked methods, metric scores, paper citations, and evaluation code.
- **Input Parameters:**
  - `task_or_dataset` (*string, required*): Target benchmark task (e.g. `"image-classification"`, `"gsm8k"`, `"human-eval"`).
  - `limit` (*integer, optional, default: `10`*): Top N leaderboard positions.
- **Output:**
  - `task_name` (*string*): Standard task name.
  - `metric` (*string*): Evaluation metric (e.g. `"Accuracy"`, `"BLEU"`, `"pass@1"`).
  - `leaderboard` (*array*): Ranked entries with `rank`, `model_name`, `score`, `paper_title`, `paper_url`, `code_url`.
- **Underlying Engine:** `src/engines/paperswithcode.py`, `src/api/routes_benchmarks.py`.

#### Tool 10: `inspect_paper_datasets`
- **Description:** Identifies all datasets utilized in a paper for pre-training, fine-tuning, or evaluation, including dataset size, public availability, license, and download access points.
- **Input Parameters:**
  - `paper_id_or_title` (*string, required*): Target paper identifier.
- **Output:**
  - `datasets` (*array*): Objects containing `dataset_name`, `usage_type` (`pretraining`, `evaluation`, `benchmark`), `splits_used`, `public_url`, and `license`.
- **Underlying Engine:** `src/engines/paperswithcode.py`, `src/engines/abstract_entity_extractor.py`.

---

### Domain 4: Gap Analysis & Novelty Studio Service (`mcp_novelty_studio`)

#### Tool 11: `extract_research_gaps`
- **Description:** Performs combinatorial gap analysis across one or more related papers, extracting explicit author-acknowledged limitations, unexamined edge cases, computational bottlenecks, and open challenges.
- **Input Parameters:**
  - `paper_ids` (*array of strings, required*): List of paper identifiers to analyze.
- **Output:**
  - `limitations` (*array*): Explicit limitations stated by the authors.
  - `structural_gaps` (*array*): Conceptual gaps where current methods fail or scale poorly.
  - `untested_assumptions` (*array*): Implicit assumptions made in the experimental designs.
- **Underlying Engine:** `src/engines/gap_extractor.py`, `src/api/routes_intelligence.py`.

#### Tool 12: `generate_novel_hypotheses`
- **Description:** Combines extracted research gaps, complementary techniques, and inductive reasoning mechanisms to propose novel, testable research hypotheses with concrete falsifiability criteria.
- **Input Parameters:**
  - `topic` (*string, required*): Target research domain.
  - `paper_ids` (*array of strings, required*): Baseline papers to synthesize from.
  - `mechanism` (*string, optional, default: `"cross_domain_synthesis"`, enum: `["cross_domain_synthesis", "gap_realization", "architecture_inversion", "computational_relaxation"]`*): Ideation mechanism.
- **Output:**
  - `proposals` (*array*): Structured objects containing `proposal_id`, `title`, `hypothesis`, `proposed_architecture`, `expected_gain`, `falsifiability_criteria`, and `baseline_comparisons`.
- **Underlying Engine:** `src/engines/graph_novelty_engine.py`, `src/engines/paper_analyzer.py`.

#### Tool 13: `synthesize_critique`
- **Description:** Generates an exhaustive, peer-review style critique of a paper's methodology, evaluating claim soundness, experimental validity, baseline fairness, statistical rigor, and reproducibility.
- **Input Parameters:**
  - `paper_id` (*string, required*): Target paper identifier.
- **Output:**
  - `strengths` (*array of strings*): Core architectural and theoretical contributions.
  - `weaknesses` (*array of strings*): Methodological flaws or experimental shortcomings.
  - `threats_to_validity` (*array of strings*): Confounding variables or data leakage risks.
  - `verdict_score` (*integer, 1-10*): Overall rigor score.
- **Underlying Engine:** `src/engines/critique_synthesizer.py`.

---

### Domain 5: Reproduction & Experiment Planning Service (`mcp_reproduction`)

#### Tool 14: `generate_reproduction_plan`
- **Description:** Compiles a comprehensive, executable reproduction recipe for a paper: hardware budget, environment setup (`uv` / `pip` / `conda`), dataset download script, model training commands, evaluation protocols, and expected metric tolerances.
- **Input Parameters:**
  - `paper_id` (*string, required*): Paper identifier.
  - `target_compute` (*string, optional, default: `"single_gpu"`, enum: `["cpu", "single_gpu", "multi_gpu", "cloud_tpu"]`*): Hardware envelope.
- **Output:**
  - `estimated_compute_hours` (*float*): Total GPU hours required.
  - `environment_spec` (*object*): Python version, CUDA requirements, and core libraries.
  - `step_by_step_instructions` (*array*): Execution phases (`environment`, `data_preparation`, `training`, `evaluation`).
  - `validation_checkpoints` (*array*): Intermediate loss/metric checkpoints to abort failing runs early.
- **Underlying Engine:** `src/engines/reproduction_mapper.py`.

#### Tool 15: `audit_reproducibility`
- **Description:** Evaluates a paper against an 8-point empirical reproducibility rubric, assigning scores for code availability, data access, hyperparameter transparency, compute disclosure, and random seed reporting.
- **Input Parameters:**
  - `paper_id` (*string, required*): Paper identifier.
- **Output:**
  - `score` (*integer, 0 to 100*): Overall reproducibility index.
  - `criteria_breakdown` (*object*): Itemized checklist scores.
  - `missing_artifacts` (*array of strings*): Critical information omitted by authors.
- **Underlying Engine:** `src/engines/rubric_evaluator.py`, `src/engines/claim_verifier.py`.

---

### Domain 6: Knowledge Graph & Synthesis Service (`mcp_knowledge_graph`)

#### Tool 16: `query_knowledge_graph`
- **Description:** Traverses the multi-paper knowledge graph, executing semantic path searches across interconnected nodes: Papers, Authors, Architectures, Methods, Datasets, and Benchmarks.
- **Input Parameters:**
  - `query` (*string, required*): Entity name, concept, or relationship to investigate.
  - `depth` (*integer, optional, default: `2`*): Maximum graph traversal hops.
  - `entity_types` (*array of strings, optional*): Filter for node types (e.g. `["dataset", "architecture"]`).
- **Output:**
  - `nodes` (*array*): Entities with IDs, types, and labels.
  - `edges` (*array*): Directed relationships (e.g. `EVALUATED_ON`, `OUTPERFORMS`, `DERIVED_FROM`).
- **Underlying Engine:** `src/graph/store.py`, `src/engines/citation_graph.py`.

#### Tool 17: `compare_papers_matrix`
- **Description:** Builds a structured comparison matrix across 2 to 5 papers, aligning and comparing their core architectures, objective functions, dataset scale, compute budgets, and benchmark results side-by-side.
- **Input Parameters:**
  - `paper_ids` (*array of strings, required, min items: 2, max items: 5*): Paper identifiers to compare.
- **Output:**
  - `matrix` (*object*): Structured dimensions comparing `architecture`, `loss_function`, `training_data`, `parameters_count`, `hardware_cost`, and `key_results`.
  - `tradeoff_analysis` (*string*): Summary of qualitative tradeoffs between the compared approaches.
- **Underlying Engine:** `src/api/routes_intelligence.py` (`routes_compare`).

#### Tool 18: `export_research_dossier`
- **Description:** Packages all gathered evidence, verified claims, methodology analyses, and citations for a collection of papers into a clean, publication-ready research dossier formatted in Markdown or LaTeX with a genuine BibTeX bibliography.
- **Input Parameters:**
  - `paper_ids` (*array of strings, required*): Papers to include in dossier.
  - `format` (*string, optional, default: `"markdown"`, enum: `["markdown", "latex", "json"]`*): Output document format.
  - `include_code_links` (*boolean, optional, default: `true`*): Include verified GitHub repositories.
- **Output:**
  - `document` (*string*): Fully formatted research dossier.
  - `bibtex` (*string*): Consolidated BibTeX file with verified citations.
  - `referenced_figures` (*array*): File paths to extracted figure assets.
- **Underlying Engine:** `src/engines/dossier_exporter.py`, `src/engines/preprint_generator.py`.

---

## 4. MCP Resources Specification

External agents can read persistent Research Copilot state via standardized MCP resource URIs:

| URI Scheme | Description | Content Type |
| :--- | :--- | :--- |
| `research://papers/{id}` | Canonical paper metadata, structured sections, and verified facts. | `application/json` |
| `research://benchmarks/{task_id}` | Live SOTA benchmark leaderboard for an ML/AI task. | `application/json` |
| `research://workspaces/{id}/summary` | Current workspace state, saved papers, and active research memories. | `application/json` |

---

## 5. MCP Prompt Templates Specification

The server exposes 3 guided research workflow prompts:

1. **`reproduce_paper`**
   - *Arguments:* `paper_identifier`
   - *Behavior:* Pre-populates the external agent's context with paper code links, dataset instructions, and reproduction milestones to guide autonomous environment setup.
2. **`literature_review`**
   - *Arguments:* `research_topic`
   - *Behavior:* Drives an autonomous literature survey, guiding the agent to search, rank, extract gaps, and synthesize findings.
3. **`novelty_ideation`**
   - *Arguments:* `topic`, `baseline_paper_ids`
   - *Behavior:* Guides the agent through combinatorial gap realization to formulate new hypotheses.

---

## 6. How External AI Agents Connect to This Server

### Claude Code / Cursor Configuration (`mcpServers`)
Add the following to your agent's MCP settings configuration file (`~/.claude.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "research-copilot": {
      "command": "/media/workspace/Research-Copilot/.venv/bin/python",
      "args": ["-m", "src.mcp.server"],
      "cwd": "/media/workspace/Research-Copilot",
      "env": {
        "PYTHONPATH": "/media/workspace/Research-Copilot"
      }
    }
  }
}
```

### Direct CLI Verification
Test the server directly over standard input/output:
```bash
python -m src.mcp.server
```
Send standard JSON-RPC 2.0 handshake:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{},"resources":{},"prompts":{}},"serverInfo":{"name":"research-copilot-mcp","version":"1.0.0"}}}
```
