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

## Commit 3 (dev and main) : Migrate Orchestrator to Go, Decouple Ingestion, Integrate pdftotext, and Modularize Ingestion Packages

* **Go Native Orchestrator Migration (Port 8000)**:
  * Migrated the python FastAPI backend fully to Go.
* **Non-Blocking Background Ingestion**:
  * Decoupled paper download and extraction from the client HTTP query path, bringing search latency down from 90s+ to ~2s.
  * Spawns non-blocking goroutines using `context.Background()` to download, extract, and write missing papers to PostgreSQL in the background.
* **Poppler pdftotext Integration**:
  * Switched default PDF extraction to use poppler's `pdftotext` system binary, resolving layout/word-spacing glyph extraction bugs, and falling back to Go dslipak/pdf parser if pdftotext is unavailable.
* **Database UTF-8 Null Byte Fix**:
  * Strip null characters (`\x00`) from all string variables (titles, abstracts, authors, and text paragraphs) before SQL insertion, resolving Postgres string encoding constraint errors.
* **Reusable Extraction Client (`src/ingestion/extractor`)**:
  * Extracted the HTTP client wrapper for the PDF Extractor microservice into its own standalone package, enabling reuse by future ingestion engines (e.g. Hugging Face).
* **Folder Modularization & Logging Cleanup**:
  * Split the large `arxiv/client.go` file into modular `client.go`, `parser.go`, `ingestion.go`, and `models.go` files.
  * Removed emoji decoration from standard logging outputs to present standard production-ready terminal output.
* **Build Scripts and Git Ignore Updates**:
  * Configured `.gitignore` to track only source files, ignoring Go compiled binaries, directories like `bin/`, and log outputs.

