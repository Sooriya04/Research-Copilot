# Development Roadmap

Implementation roadmap and milestones for the **Research Copilot** platform.

---

### Phase 1: Core Research Engine & SQLite Foundation ✅
- [x] Multi-source ingestion (OpenAlex, arXiv)
- [x] 6-Factor PaperRank algorithm implementation
- [x] Directed citation network & PageRank prestige (NetworkX)
- [x] Section-aware PDF/HTML parser (PyMuPDF + BeautifulSoup)
- [x] Heuristic rubric evaluator (Ablations, baselines, code repos, compute budgets)
- [x] Async SQLite persistence (aiosqlite + SQLAlchemy 2.0)
- [x] Loop + Graph state machine pipeline (`src/graph/`)
- [x] Comprehensive Pytest test suite

### Phase 2: Intelligence & Comparison Endpoints ✅
- [x] Scientific multi-paper comparison matrix (`POST /api/v1/papers/compare`)
- [x] Automated paper critique & limitation extractor (`POST /api/v1/papers/critique`)
- [x] Gap-driven hypothesis generator (`POST /api/v1/hypothesis/generate`)
- [x] Section extraction endpoint (`GET /api/v1/paper/{id}/sections`)
- [x] Graph visualization JSON output (`GET /api/v1/graph/visualize/{session_id}`)
- [x] Complete endpoints reference directory (`ENDPOINTS.md`)
- [x] Architectural innovations & ideas document (`ideas.md`)

### Phase 3: Coding Agent Sandboxing & Bio Tools (Next)
- [ ] MCP Router connecting Claude Code, OpenAI Codex, and OpenCode
- [ ] Containerized Docker execution sandbox for ML training recipes
- [ ] Biomolecular structure prediction (Chai-1 / Boltz-1 / DiffDock) dispatch
- [ ] Interactive Ketcher chemical sketch viewer
- [ ] Automated LaTeX manuscript generation (`01_intro.tex` through `08_conclusion.tex`)
