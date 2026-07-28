# Git Commit Log & Issue Tracking

---

## Commit 1 : Initialized repository structure, core documentation, system architecture, and Graphify knowledge graph

* Established the initial repository structure for **Research Copilot**.
* Added **AI agent guidelines** (`AGENTS.md`) defining architecture, Agentic RAG, async execution, and citation rules.
* Created project documentation including:
  * `README.md` with system overview and architecture diagram.
  * `architecture.md` explaining the system design and data flow.
  * `workflow.md` describing the end-to-end research pipeline.
  * `roadmap.md` outlining the implementation phases and milestones.
* Initialized **Graphify Knowledge Graph** to index project documentation.
* Generated an interactive knowledge graph with **49 nodes** across **9 communities** for easier navigation and understanding of the project.

<br />

---

## Commit 2 : Implement FastAPI QUERY Search with Structured Logging

* Implemented custom HTTP `QUERY` method search endpoint (`QUERY /api/v1/search/arxiv`) using FastAPI.
* Removed standard `GET` and `POST` search methods to limit query interface strictly to HTTP `QUERY` body payload semantics.
* Configured structured logging (`logging.getLogger("research_copilot.api")`) to trace execution, log request inputs, track search durations, and log exception traces.

