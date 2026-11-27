# Research Copilot — Novelty & Gap Analysis Engine Audit

**Auditor:** Lois Lane & Barbara Vane (Engineering Audit)  
**Date:** November 27, 2026  
**Scope:** Research Novelty & Gap Analysis Subsystem (`src/novelty/`, `src/api/routes_novelty.py`, `frontend/src/views/novelty/`, and related test suites)  
**Assumed Load:** 1 to 10 concurrent research sessions, workspaces with up to hundreds of staged papers, asynchronous cloud/local LLM provider completions, and SQLite persistence.

---

## 1. Executive Summary

This audit evaluates the redesigned 8-stage Scientific Novelty & Gap Analysis pipeline. The core modular pipeline architecture is significantly cleaner and faster than the previous monolith, but 12 distinct issues were identified across frontend request propagation, database upsert consistency, cross-workspace isolation boundaries, JSON repair resiliency, gap formulation UI rendering, connection efficiency, and test coverage.

### Mandatory Execution Strategy: Atomic Fix-and-Push Workflow
> [!IMPORTANT]
> **Strict Execution Rule: Do NOT one-shot all fixes in a single commit.**  
> Every issue below must be tackled independently following this exact lifecycle:
> 1. Isolate the bug or code improvement.
> 2. Apply the minimal, clean fix.
> 3. Verify with targeted unit/integration tests and frontend build checks.
> 4. Commit with a concise, descriptive commit message referencing the issue.
> 5. Push to GitHub (`dev` and `main`).
> 6. Proceed to the next issue.

---

## 2. Audit Findings (12 Issues)

### Group 1: Must Fix (Bugs, Data Consistency & Isolation)

#### 1. Frontend Ignores Analysis Mode and Prior-Art Toggle During Synthesis
- **Location:** `frontend/src/views/novelty/useNoveltyWorkspace.js:L200-L212`
- **What this is:** The `runAnalysis()` hook function that compiles the request payload and sends it to `POST /api/v1/novelty/synthesize`.
- **Problem:** The UI exposes analysis depth ("Focused" vs. "Comprehensive") and a checkbox for automated prior-art verification in `AnalysisConfigBar.jsx`. However, `runAnalysis()` omits `analysis_mode` and `verify_prior_art` from the JSON request body. As a result, the backend always runs with the default values (`"focused"` and `True`), silently ignoring user configuration.
- **Fix:** Include `analysis_mode: analysisDepth` and `verify_prior_art: verifyPriorArt` in the JSON body passed to `fetch('/api/v1/novelty/synthesize', ...)`.
- **If we skip it:** Users cannot toggle off external prior-art search or request comprehensive candidate exploration from the interface.

---

#### 2. SQLite Upsert Drops Updated Paper Citations and Workspace Metadata
- **Location:** `src/novelty/persistence.py:L198-L210`
- **What this is:** The SQLite upsert statement in `save_proposal()` storing proposals in the `novelty_proposals` table.
- **Problem:** The `ON CONFLICT(id) DO UPDATE SET` clause updates title, pitch, and hypothesis, but completely omits `grounded_paper_ids`, `grounded_paper_titles`, `workspace_id`, `topic`, `engine`, and `model_name`. When a proposal is re-synthesized with new papers or assigned to another workspace, SQLite quietly retains the stale citations and old workspace ID.
- **Fix:** Add `grounded_paper_ids = excluded.grounded_paper_ids, grounded_paper_titles = excluded.grounded_paper_titles, workspace_id = excluded.workspace_id, topic = excluded.topic, engine = excluded.engine, model_name = excluded.model_name` into the `ON CONFLICT(id) DO UPDATE SET` clause.
- **If we skip it:** Re-running synthesis or re-grounding proposals against updated literature leaves obsolete citations in SQLite.

---

#### 3. Fallback Grounding Leaks Papers Across Unrelated Workspaces
- **Location:** `src/novelty/grounding.py:L38-L44`
- **What this is:** Stage 1 fallback that resolves staged papers when `paper_ids` is omitted or empty.
- **Problem:** When no paper IDs are explicitly provided, it iterates through `self.store.graph.nodes` and collects all `NodeType.PAPER` nodes without scoping by `workspace_id`. If a user runs synthesis in Workspace B without manually selecting paper checkboxes, it pulls papers belonging to Workspace A.
- **Fix:** Filter graph nodes to only those connected to `workspace_id` (checking predecessors/successors of `f"ws-{workspace_id}"`), matching `routes_novelty.py:348-356`.
- **If we skip it:** Multi-workspace setups leak confidential or unrelated literature into other workspaces' novelty candidate prompts.

---

#### 4. Greedy Regex in JSON Repair Captures Multi-Block Text and Fails to Parse
- **Location:** `src/novelty/json_utils.py:L50-L51`
- **What this is:** Fallback JSON block extraction in `parse_llm_json()` when an LLM returns conversational prose around JSON.
- **Problem:** `re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)` uses greedy matching. If the model outputs conversational text containing braces before or after the JSON payload (e.g. `Here is {thought}: {"proposals": [...]}`), it matches from the first `{` to the last `}`, creating invalid JSON that fails `json.loads`.
- **Fix:** Use a balanced top-level bracket matcher and pass `strict=False` into `json.loads` to tolerate unescaped literal newlines in quotes.
- **If we skip it:** Complex LLM completions with reasoning before and after the JSON block fail parsing and drop back to heuristic fallbacks unnecessarily.

---

#### 5. Gaps Panel Renders `undefined × undefined` When Gaps Lack Method/Dataset Keys
- **Location:** `frontend/src/views/novelty/GapsPanel.jsx:L42-L45` & `frontend/src/views/novelty/NoveltyStudioPage.jsx:L66-L72`
- **What this is:** The collapsible panel displaying detected research gaps and its "Draft Proposal" action.
- **Problem:** The JSX blindly displays `{g.method_name || g.method_id} × {g.dataset_name || g.dataset_id}`. When gaps come from Stage 3 `ExtractedGap` (which uses `title` and `description` instead of `method_name`/`dataset_name`), the UI displays `undefined × undefined` and the drafted proposal title becomes `Evaluating undefined on undefined`.
- **Fix:** Display `g.title || `${g.method_name || g.method_id} × ${g.dataset_name || g.dataset_id}`` and check for `gap.title` in `handleFormulateFromGap`.
- **If we skip it:** Evidence-extracted gaps display broken labels and pre-fill corrupted proposal drafts.

---

### Group 2: Should Fix (Performance, Cleanliness & Verification)

#### 6. N+1 SQLite Connections During Stage 1 Paper Loading
- **Location:** `src/novelty/grounding.py:L46-L50` & `L98-L123`
- **What this is:** Stage 1 loading paper metadata, abstracts, and full-text chunks.
- **Problem:** `_load_single_paper` opens and closes a new `aiosqlite.connect` connection sequentially for every target paper. Staging 30 papers opens and closes SQLite 30 times in a row.
- **Fix:** Open one connection in `ground()` and pass the `db` handle into `_load_single_paper`, or fetch all staged papers in a single `SELECT ... WHERE id IN (...)` query.
- **If we skip it:** Grounding wastes 50–200ms of unnecessary SQLite connection handshakes on every run.

---

#### 7. Ephemeral HTTP Clients and Missing User-Agent in OpenAlex Prior-Art Search
- **Location:** `src/novelty/prior_art.py:L60-L65`
- **What this is:** External academic query execution against OpenAlex during Stage 5.
- **Problem:** `verify_candidate` instantiates a brand new `httpx.AsyncClient` for each candidate without a connection pool or custom `User-Agent`. OpenAlex requires an identification email in `User-Agent` for their polite pool; raw default HTTP clients face strict rate limits and 429/403 drops under concurrent requests.
- **Fix:** Reuse a shared `httpx.AsyncClient` with a polite `User-Agent: ResearchCopilot/2.0 (mailto:admin@local)` header.
- **If we skip it:** Concurrent prior-art checks get rate-limited or blocked by OpenAlex during large runs.

---

#### 8. PaperAnalyzer Sends Unbounded Paper Volume in a Single Prompt
- **Location:** `src/novelty/paper_analyzer.py:L37-L59`
- **What this is:** Stage 2 extraction analyzing technical profiles across all grounded papers.
- **Problem:** The code comment states "Batch up to 8 papers into a single structured extraction call", but there is no batching logic; all papers are appended to one prompt. If 20 papers are staged, it sends ~70,000 characters in a single prompt, which overflows context limits on local Ollama or Groq models.
- **Fix:** Chunk `papers` into batches of 6–8 before sending completion requests.
- **If we skip it:** Staging more than 8 papers fails with context-length errors or silent truncation on low-context models.

---

#### 9. Dead Imports in API Routes and Orchestrator
- **Location:** `src/api/routes_novelty.py:L2,10,12,20` & `src/novelty/provider_orchestrator.py:L13`
- **What this is:** Unused module imports in the novelty backend.
- **Problem:** `os`, `NoveltyItem`, `ResearchGraphStore`, and `get_saved_provider_config` are imported in `routes_novelty.py` but never referenced. `Any` and `Dict` are imported in `provider_orchestrator.py` but never referenced.
- **Fix:** Delete the unused imports.
- **If we skip it:** Dead imports clutter the entry points and trip linters.

---

#### 10. Dead f-strings in Heuristic Proposal Generator
- **Location:** `src/novelty/pipeline.py:L211,212,240,241`
- **What this is:** Static heuristic proposal fallback definitions.
- **Problem:** `technical_methodology` and `algorithmic_approach` strings use `f"..."` prefixes without any placeholder expressions.
- **Fix:** Remove the `f` prefix from lines 211, 212, 240, and 241.
- **If we skip it:** Static linters flag these as dead format strings.

---

#### 11. Missing HTTP Endpoint Test Coverage for Proposal Deletion and Graph Injection
- **Location:** `tests/test_novelty_routes.py`
- **What this is:** Integration test suite for the novelty router.
- **Problem:** Endpoints `POST /api/v1/novelty/add-to-graph`, `DELETE /api/v1/novelty/proposals/{id}`, and `DELETE /api/v1/novelty/proposals` have engine tests but no HTTP route tests verifying status codes and error paths.
- **Fix:** Add three short `TestClient` tests in `test_novelty_routes.py` verifying proposal deletion, clearing, and graph injection.
- **If we skip it:** Regressions in route-level parameter validation or exception formatting can slip into production untested.

---

### Group 3: Nice to Have (Micro-optimizations)

#### 12. In-Memory Candidate Deduplication Recalculates Regex Tokens on Each Pair
- **Location:** `src/novelty/candidate_generator.py:L95-L108`
- **What this is:** Jaccard similarity candidate deduplication in Stage 4.
- **Problem:** `tokens = set(re.findall(...))` is computed repeatedly inside the candidate loop instead of precomputing token sets once.
- **Fix:** Precompute token sets for all candidates in a dictionary before the nested loop.
- **If we skip it:** Minor redundant regex executions on candidate deduplication passes.

---

## 3. Step-by-Step Fix Schedule

To adhere to the atomic fix-and-push workflow, the changes must be applied and committed in this sequence:

| Step | Target Issue | File(s) to Modify | Verification Command | Commit Message |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | Issue 1: Frontend parameter propagation | `frontend/src/views/novelty/useNoveltyWorkspace.js` | `cd frontend && npm run build` | `fix(novelty): propagate analysis_mode and verify_prior_art in runAnalysis` |
| **P2** | Issue 2: SQLite upsert citation preservation | `src/novelty/persistence.py` | `pytest tests/test_novelty_routes.py -k test_saved_proposals` | `fix(novelty): preserve grounded paper citations on proposal upsert conflict` |
| **P3** | Issue 3: Scoped fallback grounding | `src/novelty/grounding.py` | `pytest tests/test_novelty_routes.py -k test_workspace_novelty_strict_isolation` | `fix(novelty): scope fallback paper grounding strictly to active workspace` |
| **P4** | Issue 4: Resilient balanced JSON parsing | `src/novelty/json_utils.py` | `pytest tests/test_novelty_pipeline_modules.py -k test_parse_llm_json` | `fix(novelty): harden JSON repair against trailing prose and unescaped newlines` |
| **P5** | Issue 5: GapsPanel title fallback | `frontend/src/views/novelty/GapsPanel.jsx`, `NoveltyStudioPage.jsx` | `cd frontend && npm run build` | `fix(novelty): support titled scientific gaps in GapsPanel and proposal formulation` |
| **P6** | Issue 6: Batch SQLite connection in grounding | `src/novelty/grounding.py` | `pytest tests/test_graph_novelty_engine.py` | `perf(novelty): reuse SQLite connection across paper loading loop` |
| **P7** | Issue 7: Shared HTTP client & User-Agent for OpenAlex | `src/novelty/prior_art.py` | `pytest tests/test_novelty_pipeline_modules.py -k test_prior_art` | `perf(novelty): add connection pooling and identification User-Agent to OpenAlex client` |
| **P8** | Issue 8: Batch PaperAnalyzer requests | `src/novelty/paper_analyzer.py` | `pytest tests/test_novelty_pipeline_modules.py` | `fix(novelty): chunk grounded papers into batches during Stage 2 analysis` |
| **P9** | Issue 9: Remove dead imports | `src/api/routes_novelty.py`, `src/novelty/provider_orchestrator.py` | `python3 -m pyflakes src/novelty/ src/api/routes_novelty.py` | `chore(novelty): remove unused imports in routes and provider orchestrator` |
| **P10** | Issue 10: Clean static f-strings | `src/novelty/pipeline.py` | `python3 -m pyflakes src/novelty/pipeline.py` | `chore(novelty): remove dead f-string prefixes in heuristic generators` |
| **P11** | Issue 11: HTTP tests for proposal deletion & injection | `tests/test_novelty_routes.py` | `pytest tests/test_novelty_routes.py -v` | `test(novelty): add HTTP endpoint tests for proposal delete, clear, and graph injection` |
| **P12** | Issue 12: Precompute deduplication tokens | `src/novelty/candidate_generator.py` | `pytest tests/test_novelty_pipeline_modules.py -k test_candidate_deduplication` | `perf(novelty): precompute candidate tokens in Jaccard deduplication` |

---

**Audit Sign-off:** Lois Lane & Barbara Vane  
**Status:** Ready for sequential one-by-one execution.
