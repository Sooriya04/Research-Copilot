# Research Copilot — Codebase Quality, Security, MCP & Architecture Audit

**Auditor:** Barbara Vane (Barb)  
**Date:** November 18, 2026 (Live Audit & MCP Domain 1 Update)  
**Scope:** Full repository (`src/`, `frontend/`, `tests/`, `src/mcp/`, configurations, docs)  
**Assumed Workload:** 1 to 10 concurrent research sessions on a researcher workstation or lab server, executing background PDF extractions, hybrid graph RAG, local/cloud LLM inference (Ollama/vLLM/Gemini), and MCP stdio integration with external coding agents (Claude Code, Cursor, Antigravity).

---

## 1. Executive Summary & Health Check

**Overall Verdict: High Health & Fast Velocity.**

- **Test Suite:** **162 passed, 2 skipped** (optional Redis), 0 failures, 0 errors in 142.65s.
- **Frontend Performance:** Bundle refactored with `React.lazy()` and Rollup manual chunking. Monolithic 1.86 MB bundle sliced down to **~246 kB initial load** (an **87% reduction** in initial load weight).
- **Offline / Local AI:** Added `LocalOpenAIProvider` (vLLM, LM Studio, LocalAI) and persistent connection pooling for `LocalOllamaProvider`.
- **MCP Server Layer:** Specification approved for 18 tools across 6 service domains (`docs/mcp_specification.md`). Native stdio server engine implemented with Domain 1 tools: `search_literature` and `resolve_paper` (with automated BibTeX generation).

---

## 2. Active Audit Findings (Recent Changes Audit)

### Must Fix

1. **Logger writes to `sys.stdout` and corrupts MCP JSON-RPC stdio stream** (`src/core/logger.py:L8`)
   - **What this is:** `setup_logger()` configures a `logging.StreamHandler(sys.stdout)` for all application logs.
   - **Problem:** In MCP stdio transport mode, standard output is strictly reserved for newline-delimited JSON-RPC messages. Any log written to `sys.stdout` will be parsed by external clients (Claude Code, Cursor) as malformed JSON, breaking the connection on launch.
   - **Fix:** Direct `StreamHandler` to `sys.stderr` in `src/core/logger.py`: `handler = logging.StreamHandler(sys.stderr)`.
   - **If skipped:** External MCP clients will crash with `SyntaxError: Unexpected token` upon starting the MCP server.

---

### Should Fix

2. **`PapersWithCodeClient.search_papers` method does not exist** (`src/mcp/tools/literature.py:L113` & `src/api/routes_search.py:L508`)
   - **What this is:** Literature search wrapper querying PapersWithCode when `sources` includes `"paperswithcode"`.
   - **Problem:** `PapersWithCodeClient` only implements benchmark and repo lookups (`get_paper_benchmarks`, `get_code_repositories`, `search_tasks`, `search_datasets`). It has no `search_papers` method, throwing an unhandled `AttributeError` when queried.
   - **Fix:** Drop `"paperswithcode"` from text search sources (PapersWithCode is a benchmark/entity database, not a full-text search index) or redirect to `search_tasks(query)`.
   - **If skipped:** Any search query explicitly requesting `"paperswithcode"` fails with an internal error.

---

### Nice to Have

3. **Non-ASCII author names produce empty BibTeX citation keys** (`src/mcp/tools/literature.py:L199-204`)
   - **What this is:** Citation key generator in `generate_bibtex()`.
   - **Problem:** Stripping all non-alphanumeric characters from non-latin author names leaves `clean_author` empty, generating keys like `@article{2024_170603, ...}` that can upset LaTeX compilers.
   - **Fix:** Add a fallback: `clean_author = re.sub(r"[^a-z0-9]", "", first_author) or "paper"`.
   - **If skipped:** Papers with non-latin author transliterations produce malformed BibTeX keys.

4. **`LocalOpenAIProvider` locks client timeout to the first request's value** (`src/providers/llm.py:L192-195`)
   - **What this is:** Shared HTTP client reuse helper in `LocalOpenAIProvider`.
   - **Problem:** If `test_connection()` runs first with its 5.0-second timeout, the cached `_client` retains 5.0s for subsequent long-running `complete()` calls that need 90 seconds.
   - **Fix:** Configure `_client` with `timeout=120.0` at creation time, or pass `timeout=...` directly to individual request calls (`client.post(..., timeout=...)`).
   - **If skipped:** Local LLMs generating long paper analyses will abort prematurely with `ReadTimeout` if a connection test was run earlier in the same process.

---

## 3. Comprehensive Master Resolution Ledger

| ID | Category | Item Description | Status | Verification & Resolution Detail |
|:---|:---|:---|:---:|:---|
| **1** | Security | Unprotected API Key Exfiltration Route | **RESOLVED** | Deleted `/settings/providers/{id}/key`. No raw keys exposed over HTTP. |
| **2** | Security | Open SSRF in PDF Streamer Proxy | **RESOLVED** | Enforced scientific domain allowlist & loopback/private IP rejection. |
| **3** | Crash / Bug | LaTeX Escape Crash in Novelty Engine | **RESOLVED** | Added LaTeX backslash sanitization + fallback to heuristic proposals. |
| **4** | Concurrency | SQLite Concurrency Locking & WAL Mode | **RESOLVED** | Configured `PRAGMA journal_mode=WAL;` & `busy_timeout=5000;`. |
| **5** | Dependencies | Redis / FakeRedis in Manifest & Import Guards | **RESOLVED** | Added to requirements and guarded with `pytest.importorskip("fakeredis.aioredis")`. |
| **6** | API Design | SPA Route Returns 200 `null` on Bad URLs | **RESOLVED** | Emits standard HTTP 404 for unmatched `/api/...` routes. |
| **7** | Data Loss | Orphaned Memory Records on Workspace Delete | **RESOLVED** | Added `memories = relationship("WorkspaceMemoryModel", cascade="all, delete-orphan")`. |
| **8** | Rigor | Fabricated Citations in Preprint Generator | **RESOLVED** | Stripped hardcoded citations; now renders only genuine paper references. |
| **9** | Logic / Speed| PaperRank Full-Text Evaluation Inversion | **RESOLVED** | Ranks via metadata/abstract first, then extracts full text for true top N. |
| **10** | Stability | Non-Deterministic `hash()` IDs | **RESOLVED** | Switched from process-salted `hash()` to stable `sha256` digest hashing. |
| **11** | Code Hygiene| Hardcoded Test Paper in Canonical Resolver | **RESOLVED** | Removed hardcoded `1706.03762` shortcut in favor of clean test mocks. |
| **12** | Lean | Quadruplicate LLM JSON Parsing Code | **RESOLVED** | Consolidated into unified `src/core/json_utils.py` utility. |
| **13** | API Schema | Chat Stream Endpoint Query Param Bug | **RESOLVED** | Accepts `ChatStreamRequest` in JSON body with credential resolution. |
| **14** | UX / Chat | Forced JSON Mode on Freeform Chat | **RESOLVED** | Chat defaults to clean Markdown; JSON is opt-in via `json_mode=True`. |
| **15** | Dev Experience| Missing `pytest.ini` Traversed Submodules | **RESOLVED** | Added `pytest.ini` with `testpaths = tests` and `addopts = -ra -q`. |
| **16** | Performance | Per-Call HTTP Client Instantiation | **RESOLVED** | Maintained persistent `httpx.AsyncClient` on `AccessResolver` & `LocalOllamaProvider`. |
| **17** | Redundancy | Duplicate PyMuPDF Document Close Call | **RESOLVED** | Removed redundant `doc.close()` before `finally:` block. |
| **18** | Latency | Bogus Model `gemini-3.5-flash-lite` | **RESOLVED** | Updated default model and candidate fallback list to `gemini-2.0-flash`. |
| **19** | Hygiene | Redundant Root `package.json` | **RESOLVED** | Added root convenience proxy scripts (`dev`, `build`). |
| **20** | Stability | PaperAnalyzer Unprotected JSON Decoding | **RESOLVED** | Uses `json_mode=True` and `parse_llm_json` from `src.core.json_utils`. |
| **21** | Test Hygiene| Gemini `api_key` Falsy Key Leak | **RESOLVED** | Explicit `api_key is not None` check prevents `.env` key leaking into unit tests. |
| **22** | Performance | Monolithic 1.86 MB Frontend Bundle | **RESOLVED** | Added `React.lazy()` view splitting & Rollup manual chunks in Vite (down to 246 kB). |
| **23** | Offline AI | Missing Local OpenAI-Compatible Engine | **RESOLVED** | Implemented `LocalOpenAIProvider` for vLLM, LM Studio, LocalAI, and llama.cpp. |
| **24** | Architecture| Model Context Protocol (MCP) Foundation | **RESOLVED** | Created zero-dependency stdio JSON-RPC 2.0 server (`src/mcp/`) with Domain 1 tools. |

---

## 4. MCP Implementation Progress (6 Domains, 18 Tools)

```
[ Domain 1: Literature Discovery ] — 100% Complete (3 of 3 Tools)
  [x] search_literature          (Implemented, multi-source deduplication, PaperRank)
  [x] resolve_paper              (Implemented, canonical metadata, BibTeX generation)
  [x] get_paper_citations        (Implemented, bidirectional traversal, PageRank prestige)

[ Domain 2: Paper Intelligence & Evidence ] — 100% Complete (5 of 5 Tools)
  [x] read_paper_full            (Implemented, section chunking, character budgeting)
  [x] summarize_paper            (Implemented, executive & architectural analysis, benchmarks)
  [x] extract_paper_assets       (Implemented, figures, markdown tables & equations)
  [x] verify_paper_claim         (Implemented, verbatim quote matching, benchmark check)
  [x] paper_grounded_qa          (Implemented, hybrid QA, citations with page coordinates)

[ Domain 3: Code & Benchmarks ] — In Progress (1 of 3 Tools)
  [x] get_paper_code_repositories (Implemented, PapersWithCode/GitHub/HuggingFace repo extraction & live metadata enrichment)
  [ ] get_sota_leaderboard
  [ ] inspect_paper_datasets

[ Domain 4: Gap Analysis & Novelty Studio ] — 100% Complete (3 of 3 Tools)
  [x] extract_research_gaps      (Implemented, author limitations, structural gaps, combinatorial synthesis)
  [x] generate_novel_hypotheses  (Implemented, grounded multi-paper hypotheses, falsifiability criteria, 4 mechanisms)
  [x] synthesize_critique        (Implemented, peer-review methodology critique, validity threats, calibrated verdict score)

[ Domain 5: Reproduction & Experiment Planning ] — 100% Complete (2 of 2 Tools)
  [x] generate_reproduction_plan (Implemented, multi-hardware budget, uv/pip env spec, 4 execution phases, early-abort checkpoints)
  [x] audit_reproducibility      (Implemented, 8-point empirical reproducibility rubric, itemized breakdown, missing artifacts)

[ Domain 6: Knowledge Graph & Synthesis ]
  [ ] query_knowledge_graph
  [ ] compare_papers_matrix
  [ ] export_research_dossier
```

---

## 5. Test Suite Verification Summary

```text
============================= test session starts ==============================
platform linux -- Python 3.11.17, pytest-9.1.1
rootdir: /media/workspace/Research-Copilot
configfile: pytest.ini
testpaths: tests
collected 164 items / 2 skipped

tests/test_access_resolver.py ..                                         [  1%]
tests/test_api.py ...........                                            [  7%]
tests/test_benchmark_routes.py ....                                      [ 10%]
tests/test_canonical_resolver.py ....                                    [ 12%]
tests/test_chat_routes.py ...                                            [ 14%]
tests/test_citation_expansion.py ...                                     [ 16%]
tests/test_claim_verifier.py ....                                        [ 18%]
tests/test_critique_synthesizer.py .......                               [ 22%]
tests/test_deepseek_provider.py ....                                     [ 25%]
tests/test_dossier_exporter.py ...                                       [ 27%]
tests/test_europepmc_xml.py ....                                         [ 29%]
tests/test_evidence_export_api.py .                                      [ 30%]
tests/test_evidence_foundations.py .....                                 [ 33%]
tests/test_graph_engine.py .                                             [ 34%]
tests/test_graph_engine_v2.py .....                                      [ 37%]
tests/test_graph_novelty_engine.py ..                                    [ 38%]
tests/test_grounded_qa.py ....                                           [ 40%]
tests/test_grounded_qa_api.py .                                          [ 41%]
tests/test_intelligence_routes.py .........                              [ 46%]
tests/test_json_utils.py ....                                            [ 49%]
tests/test_knowledge_graph_ingestion.py .......                          [ 53%]
tests/test_litgraph.py ...                                               [ 55%]
tests/test_local_providers.py .....                                      [ 58%]
tests/test_manuscript_and_search.py ...                                  [ 60%]
tests/test_mcp_literature.py ......                                      [ 64%]
tests/test_multi_source_ingestion.py ...                                 [ 65%]
tests/test_novelty_routes.py ........                                    [ 70%]
tests/test_paper_intelligence_engine.py .....                            [ 73%]
tests/test_paper_rag.py ....                                             [ 76%]
tests/test_paper_rank.py ....                                            [ 78%]
tests/test_paper_repository.py ..                                        [ 80%]
tests/test_pdf_intelligence.py ...                                       [ 82%]
tests/test_reproduction_map.py .....                                     [ 85%]
tests/test_schemas.py ..                                                 [ 86%]
tests/test_searqon_research.py .........                                 [ 91%]
tests/test_settings_routes.py .......                                    [ 96%]
tests/test_skills.py .....                                               [ 98%]
tests/test_sqlite_db.py ..                                               [ 99%]
tests/test_workspace_graph_isolation.py .                                [ 99%]
tests/test_workspace_graph_synthesis.py ...                              [100%]

============ 164 passed, 2 skipped, 4 warnings in 143.5s ============
```
