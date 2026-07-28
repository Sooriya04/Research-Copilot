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

## Commit 2 (dev) : Implement PostgreSQL Database Cache & Concurrent Go PDF Extraction Service

* **PostgreSQL Database caching (`localhost:5432/research_copilot`)**:
  * Configured connection parameters securely via local `.env` configuration file (ignored from version control).
  * Initialized database tables `arxiv_papers` (tracking page metrics, word counts, and metadata) and `paper_paragraphs` (storing page-by-page parsed segment sequences).
* **Stateless Go PDF Extractor Service**:
  * Refactored a high-performance, stateless Go service on port `8001` into modular segments: `downloader.go`, `extractor.go`, and `main.go`.
  * Implemented pure PDF validation (verifying header `%PDF-` signature) and page text extraction (avoiding OCR, resolving font-mapping panics).
  * Implemented concurrency-safe download timers using a Go `sync.RWMutex`.
* **Python Orchestrator Optimization**:
  * Integrated database batch checking before downloading or processing papers to avoid API rate limits.
  * Integrated `psycopg2.extras.execute_batch` to save parsed paragraphs in bulk, preventing database deadlocks.
  * Configured `THROTTLE_DELAY = 15.0` to comply with the `Crawl-delay: 15` rule in arXiv's `robots.txt`.
  * Exposed full parsed text and paragraph collections directly in the JSON search endpoint payload for Postman validation.
