# Research Copilot

> **An autonomous AI research engineering platform** — from discovering papers to reproducing experiments and generating publication-ready drafts.

---

## What is Research Copilot?

Research Copilot is not a chatbot. It is not a search engine. It is not a paper summarizer.

It is an **AI Research Engineer** that helps you:

- Discover knowledge across 8+ scientific databases
- Understand existing work with deep paper intelligence
- Identify research gaps using combinatorial analysis
- Generate novel hypotheses grounded in evidence
- Reproduce published experiments end-to-end
- Compare methods against SOTA baselines
- Produce publication-ready research paper drafts

---

## Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| Python | `>= 3.11` |
| Node.js | `>= 18` |
| npm | `>= 9` |

### 1. Clone & Setup

```bash
git clone https://github.com/Sooriya04/Research-Copilot.git
cd Research-Copilot

# Create Python virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Environment Variables (Optional)

Create a `.env` file in the project root for API keys:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

> Most features work without API keys using open-access sources. Gemini Flash is used for paper analysis and hypothesis generation.

### 3. Run

```bash
# Start both backend + frontend in one command
./run.sh

# Or separately
./run.sh backend    # FastAPI on port 8000
./run.sh frontend   # Vite/React on port 5173

# Stop everything
./run.sh stop
```

| Service | URL |
|---|---|
| **Frontend App** | http://localhost:5173 |
| **Backend API** | http://localhost:8000 |
| **API Docs (Swagger)** | http://localhost:8000/docs |

Logs are written to `.logs/backend.log` and `.logs/frontend.log`.

---

## Architecture

```
research-copilot/
├── src/
│   ├── api/                  # FastAPI routers
│   │   ├── routes_search.py        # Unified multi-source search
│   │   ├── routes_graph.py         # Knowledge graph & gap detection
│   │   ├── routes_litgraph.py      # LitGraph bibliometric similarity
│   │   ├── routes_paper_intelligence.py  # Paper analysis & claim verification
│   │   ├── routes_workbench.py     # Workspace management
│   │   ├── routes_chat.py          # AI research chat
│   │   └── routes_manuscript.py   # Paper draft generation
│   ├── graph/                # Knowledge graph engine
│   │   ├── store.py               # NetworkX DiGraph + aiosqlite persistence
│   │   ├── builder.py             # Paper → graph entity extraction
│   │   ├── schema.py              # Node/Edge Pydantic models
│   │   ├── gap_engine.py          # Combinatorial gap detection
│   │   └── pipeline.py            # Iterative research state machine
│   ├── engines/              # Research intelligence engines
│   │   ├── paper_intelligence_engine.py
│   │   ├── access_resolver.py     # Multi-source PDF resolver
│   │   ├── paper_rank.py          # 6-factor PaperRank scoring
│   │   └── pdf_parser.py          # Section-aware PDF extraction
│   └── core/                 # Database, config, models
├── frontend/
│   └── src/
│       ├── views/            # React page components
│       ├── context/          # AppContext global state
│       └── components/       # Shared UI components
├── tests/                    # Pytest test suite (42/42 passing)
├── data/                     # SQLite database (auto-created)
├── run.sh                    # Dev runner script
└── requirements.txt
```

---

## Features

### Literature Discovery
Search across **8 scientific sources** simultaneously:
`arXiv` · `OpenAlex` · `Semantic Scholar` · `Crossref` · `PubMed` · `Europe PMC` · `Hugging Face` · `Papers With Code`

### Knowledge Graph
- Dynamically ingested from paper metadata
- Nodes: `Topic` · `Paper` · `Method` · `Dataset` · `Claim` · `Gap`
- Workspace-scoped — each workspace has its own isolated graph
- Combinatorial gap detection (unexplored Method × Dataset pairs)

### LitGraph (ConnectedPapers-style)
- Bibliographic coupling via Jaccard similarity
- Force-directed physics canvas with citation-scaled node sizes
- Temporal color palette from foundational → recent papers

### Paper Intelligence
- Canonical multi-source resolution (DOI / arXiv ID / Title)
- Section-aware PDF extraction (Abstract · Method · Results · Limitations)
- Claim verification grounded against extracted evidence
- Papers With Code benchmark enrichment

### Research Workspaces
- Each workspace scopes: search state · graph · reader · chat
- Persists across page refreshes
- Activate / Deactivate without deleting

### AI Chat
- Context-grounded to active workspace + active paper
- Real-time SSE streaming responses

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/search/unified` | Multi-source literature search |
| `POST` | `/api/v1/paper/summarize` | Full paper intelligence extraction |
| `GET` | `/api/v1/graph/elements` | Workspace-scoped graph nodes + edges |
| `POST` | `/api/v1/graph/ingest-paper` | Add paper to knowledge graph |
| `GET` | `/api/v1/graph/gaps` | Detected research gaps |
| `GET` | `/api/v1/graph/summary` | Method × Dataset coverage matrix |
| `GET` | `/api/v1/litgraph/graph` | Bibliometric similarity graph |
| `POST` | `/api/v1/hypothesis/generate` | AI hypothesis generation |
| `POST` | `/api/v1/manuscript/draft` | Publication-ready paper draft |
| `GET` | `/api/v1/workbench/workspaces` | List all workspaces |
| `POST` | `/api/v1/chat/stream` | Streaming AI research chat |

Full interactive docs: **http://localhost:8000/docs**

---

## Running Tests

```bash
source .venv/bin/activate
pytest tests/ -v
```

**42/42 tests passing** ✓

---

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Python 3.11 · FastAPI · Uvicorn |
| Database | SQLite (`aiosqlite` + SQLAlchemy 2.0 async) |
| Graph Engine | NetworkX DiGraph |
| PDF Parsing | PyMuPDF (`fitz`) · BeautifulSoup |
| AI Provider | Google Gemini 2.0 Flash Lite |
| Frontend | React 18 · Vite · Vis-Network · react-force-graph-2d · KaTeX |
| Search Sources | arXiv · OpenAlex · Semantic Scholar · Crossref · PubMed · HF · PWC |

---

## Commit Log

See [`docs/.github/commits.md`](docs/.github/commits.md) for the full changelog.

---

## License

Private research project. All rights reserved.
