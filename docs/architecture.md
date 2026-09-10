# Research Copilot — System Architecture

Research Copilot is an autonomous AI Research Engineering platform designed with a **Loop + Graph** execution core and a modular **Python + FastAPI** service architecture.

---

## 🏛️ High-Level System Architecture

```mermaid
flowchart TD
    subgraph ClientAndUI ["1. Interface & Workstation"]
        API_DOCS["Interactive OpenAPI / Swagger Docs"]
        WB_CLIENT["Science Workbench Frontend (React / Static Shell)"]
    end

    subgraph FastAPIGateway ["2. FastAPI API Gateway & Routers (src/api/)"]
        R_RANK["/api/v1/rank (PaperRank 6-Factor Engine)"]
        R_SEARCH["/api/v1/search & /api/v1/paper/{id} (Access Resolver)"]
        R_GRAPH["/api/v1/graph/run (Iterative Research Loop)"]
        R_WB["/api/v1/workbench/* (Projects, Sessions, Artifacts)"]
        R_CHAT["/api/v1/chat/stream (SSE Streaming Chat)"]
    end

    subgraph GraphLoopEngine ["3. Loop + Graph Execution Core (src/graph/)"]
        STATE["ResearchGraphState (Pydantic v2 Immutable State)"]
        NODE_DISC["PaperDiscoveryNode"]
        NODE_RANK["PaperRankScoringNode"]
        NODE_EXP["CitationGraphExpansionNode"]
        NODE_PDF["FullTextExtractionNode"]
        NODE_SYNTH["EvidenceSynthesisNode"]
        ROUTER{"Loop Convergence Router"}
    end

    subgraph ScientificEngines ["4. Scientific Engines (src/engines/)"]
        ENG_PR["PaperRank Algorithm (Lexical, Citations, Velocity, Rigor)"]
        ENG_PAGERANK["NetworkX Directed Citation Graph & PageRank"]
        ENG_RUBRIC["Rubric Evaluator (Ablations, Baselines, Code, Compute)"]
        ENG_PDF["PyMuPDF & BeautifulSoup Section-Aware Extractor"]
        ENG_RESOLVER["Multi-Source Legal Access Resolver"]
    end

    subgraph StorageLayer ["5. Storage & Persistence (src/core/)"]
        SQLITE["Async SQLite Engine (aiosqlite + SQLAlchemy 2.0)"]
        CACHE["Paper Cache, Projects, Sessions, Artifact Ledgers"]
    end

    subgraph ExternalServices ["6. External Research APIs & LLMs"]
        OPENALEX["OpenAlex Works API"]
        ARXIV["arXiv API"]
        EUROPE_PMC["Europe PMC / PubMed API"]
        CROSSREF["Crossref DOI API"]
        LLM_ROUTER["LLM Providers (OpenRouter, Anthropic, OpenAI, Ollama)"]
    end

    ClientAndUI --> FastAPIGateway
    FastAPIGateway --> StorageLayer
    FastAPIGateway --> GraphLoopEngine
    GraphLoopEngine --> ScientificEngines
    ScientificEngines --> ExternalServices
    StorageLayer --> SQLITE
```

---

## 🔑 Core Subsystems

### 1. Loop + Graph Research Engine (`src/graph/`)
- Built on a state-machine graph topology where nodes encapsulate distinct research operations.
- Conditional edge routing enables feedback loops (e.g. expanding citations, re-ranking, and retrieving full-text until convergence).
- Extensible architecture: Developers can plug custom nodes (e.g. Bio folding nodes, ML training recipe generators, code sandboxes) into the execution pipeline with standard contracts.

### 2. The PaperRank Algorithm (`src/engines/paper_rank.py`)
Multi-factor paper prioritization:
1. **Topical Relevance (30%)**: BM25 & n-gram lexical coverage.
2. **Citation Impact (20%)**: Normalized log-scaled citation volume.
3. **Graph Prestige (20%)**: PageRank over local directed citation graphs.
4. **Citation Velocity (10%)**: Annual publication momentum.
5. **Methodology Quality (10%)**: Automated detection of ablations, baselines, benchmarks, and uncertainty quantification.
6. **Reproducibility (10%)**: Automated detection of GitHub/GitLab repositories, dataset links, and compute budgets.

### 3. Legal Open-Access Resolver (`src/engines/access_resolver.py`)
- Resolves DOI, arXiv ID, OpenAlex ID, PMID, and PMCID to locate legal open-access PDF/HTML candidates.

### 4. Async SQLite Storage & Ledgers (`src/core/database.py`)
- Asynchronous SQLite database via `aiosqlite` and `SQLAlchemy 2.0`.
- Manages projects, sessions, artifact ledgers, and graph run snapshots.
