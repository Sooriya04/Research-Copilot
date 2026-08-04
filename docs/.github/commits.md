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

<br />

## Commit 4 (dev and main) : Add Hugging Face Ingestion client, Parser, models, schemas, database table, and API router

* **Hugging Face Ingestion Module (`src/ingestion/huggingface`)**:
  * Built a native Go connector to query the Hugging Face daily papers API (`https://huggingface.co/api/daily_papers`).
  * Created modular components: `client.go` (initialization), `models.go` (data mapping structs), `parser.go` (fetching and checks), and `ingestion.go` (asynchronous pipeline processing).
* **Bronze & Silver Database Relational Schemas**:
  * Appended schemas for `raw_hf_doc` (Bronze layer raw payload table), `hf_papers` (Silver layer paper schema), and `hf_paper_authors` (Silver layer authors table) to `src/api/setup_db.sql` and initialized them in PostgreSQL.
* **Extraction Reuse & Sync**:
  * Reused the shared `extractor` client inside the Hugging Face pipeline to download and parse PDFs (using poppler `pdftotext` microservice) for papers that are hosted on arXiv.
  * Synchronized the extracted full text and paragraph segments back to the global `arxiv_papers` and `paper_paragraphs` databases for search unified access.
* **Hugging Face Endpoint Handler**:
  * Exposed `/api/v1/search/huggingface` POST API endpoint in `src/api/router.go` mapped to `handleSearchHuggingFace` to execute daily syncs.
* **Knowledge Graph Update**:
  * Ran static AST code update via `/graphify update .` to update the structure graph with the new Hugging Face and extractor packages.


## Commit 5 (dev and main) : Implement Hugging Face Topic-Based Search, Unified Models/Datasets Caching, JSON Mapping Fixes, and Strict Package Code-Splitting

* **Topic-Based Models and Datasets Search**:
  * Implemented query-based search capability to fetch Hugging Face models (`/api/models`) and datasets (`/api/datasets`) in the Go client, returning and sorting the top_k matched resources.
* **Silver Caching Tables (`hf_models` / `hf_datasets`)**:
  * Deployed relational database schemas for `hf_models` and `hf_datasets` in PostgreSQL to store download counts, tags, upvotes, pipeline tags, and metadata.
* **Strict Source Code Splitting (No 200+ Line Files)**:
  * Modularized the Hugging Face codebase by splitting logic into 7 single-responsibility files (`client.go`, `models.go`, `parser.go`, `search_api.go`, `ingest_paper.go`, `ingest_metadata.go`, and `sync_extractor.go`), keeping every single source file strictly under 170 lines.
* **JSON Mapping Corrections**:
  * Aligned the JSON struct tags in `HFModel` and `HFDataset` from `model_id` / `dataset_id` to `id` to match the incoming REST response schemas, correcting empty ID and URL response structures.
* **Graphify Rebuild**:
  * Refreshed structural knowledge index via `/graphify update .` using static AST extraction.

<br />

## Commit 6 (dev and main) : Implement Semantic Scholar Ingestion, In-Flight Task Deduplication, and Global Query Duplication Middleware

* **Semantic Scholar Search & Ingestion (`src/ingestion/semanticscholar`)**:
  * Built a native Go connector to query the Semantic Scholar Graph Search API (`/paper/search`) to retrieve rich academic metadata including citation counts, influential citations, venue, reference count, and open access properties.
  * Extracted Open Access PDF URLs (including resolving arXiv pdf documents) and concurrently downloaded and indexed text paragraphs using the shared PDF extractor.
  * Kept the package strictly modular with 5 source files (`client.go`, `models.go`, `parser.go`, `ingest_paper.go`, `sync_extractor.go`) all under 125 lines.
* **Bronze & Silver Database Schemas**:
  * Deployed `raw_s2_documents`, `s2_papers`, `s2_authors`, and `s2_paper_authors` schemas in PostgreSQL to cache all fetched research metadata.
* **In-Flight Task Deduplication Manager**:
  * Developed a thread-safe deduplication lock manager (`src/core/dedup.go`) with `AcquireInFlight` and `ReleaseInFlight` to avoid concurrent redundant PDF downloads or extraction calls for the same paper ID.
* **Global HTTP Duplication Monitor Middleware**:
  * Built a custom HTTP middleware (`duplicationMonitorMiddleware`) wrapping the search endpoints to detect identical keyword/topic queries submitted within a 30-second window, reporting total queries, duplicate counts, and duplication rates in terminal logs.


## Commit 7 (dev and main) : Implement Kaggle Client for Datasets & Models Search and Ingestion

* **Kaggle REST API Integration (`src/ingestion/kaggle`)**:
  * Implemented a native Go client to search Kaggle Datasets (`/datasets/list`) and Models (`/models/list`) using the new Kaggle API Bearer Token authentication flow.
  * Flat-mapped models variations structures into standard entities to present frameworks and tuning attributes seamlessly.
  * Ensured a highly modular package layout with 4 files (`client.go`, `models.go`, `parser.go`, `ingestion.go`) all under 190 lines of code.
* **Bronze & Silver Database Relational Schemas**:
  * Deployed `raw_kaggle_doc` (Bronze storage payload table), `kaggle_datasets` (Silver datasets cache), and `kaggle_models` (Silver models cache) to support robust background persistence.
* **Duplication Middleware & Graphify update**:
  * Configured duplication middleware to monitor Kaggle POST requests, calculating rates and hit ratios, and ran static `graphify` code AST updates.


## Commit 8 (dev and main) : Implement OpenAlex Client & Multi-Level Fallback Abstract Extraction

* **OpenAlex Ingestion Subsystem (`src/ingestion/openalex`)**:
  * Built a native Go client to search OpenAlex works (`/works?search=query`), supporting the optional `OPENALEX_API_KEY` configuration.
  * Deployed Bronze (`raw_openalex_doc`) and Silver (`openalex_papers`, `openalex_authors`, `openalex_paper_authors`) schemas.
  * Registered `POST /api/v1/search/openalex` in `router.go` and integrated it with `duplicationMonitorMiddleware` in `main.go`.
* **Multi-Level Robust Abstract Fallback Ingestion**:
  * Added fallback 1: Resolves missing abstracts by querying Semantic Scholar API via paper DOI (extracting it from OpenAlex response).
  * Added S2 key-bypass logic: Automatically retries without an API key if the `.env` S2 key returns a `429` (Rate Limited) or `403` error.
  * Added fallback 2: Concurrently downloads Open Access PDFs, triggering the Go PDF extractor microservice, and parses paragraphs to extract abstract segments if public catalog lookups fail.
  * Serialized background ingestion loop with a 1.2-second rate-limiting delay between tasks to protect public API allocations.


## Commit 9 (dev and main) : Implement Crossref Client for Works Search and Polite Pool Ingestion

* **Crossref Ingestion Subsystem (`src/ingestion/crossref`)**:
  * Deployed a native Go client to query Crossref REST API works (`/works?query=query`), utilizing `CROSSREF_EMAIL` environment variable to hook into the API's "Polite Pool" for high-priority bandwidth.
  * Created Bronze (`raw_crossref_doc`) and Silver (`crossref_papers`, `crossref_authors`, `crossref_paper_authors`) schema tables.
  * Constructed parsing rules to handle Citeproc-JSON `date-parts` formats, links array PDF mapping, and JATS XML abstract tag-stripping.
  * Integrated sequential rate-limiting (1.2-second sleep) inside the background worker pipeline to respect polite pool guidelines.
  * Added Semantic Scholar fallback DOI lookup and PDF extraction sync paths.
* **Routing & Middleware Integration**:
  * Registered route `POST /api/v1/search/crossref` in `router.go` and mapped it to query duplication detection middleware.

## Commit 10 (dev and main) : Papers With Code Integration, Reproduction Enrichment & Modular Routing

* **Database Refactoring & Reproduction Details**:
  * Updated `research_papers` schema in `setup_db.sql` to support rich reproduction attributes (`code_repository`, `frameworks`, `tasks`, `benchmarks`, `hyperparameters`).
  * Deployed Silver schemas for Papers With Code: `pwc_papers`, `pwc_repositories`, and `pwc_results`.
* **Papers With Code Integration (`src/ingestion/paperswithcode`)**:
  * Built the PWC API client to parse linked GitHub repositories, ML tasks, evaluation metrics, and framework details.
* **Unified Provider Enrichment**:
  * Extended arXiv, OpenAlex, Semantic Scholar, Crossref, and Hugging Face parsers to extract GitHub/GitLab links from abstracts/comments.
  * Extracted concepts and topics as specific ML "tasks".
  * Mapped deep learning frameworks (PyTorch, TensorFlow, Jax) from descriptions via regex heuristics.
* **Modular API Routing Strategy**:
  * Refactored monolithic `router.go` into domain-specific, independent routers (`arxiv_router.go`, `openalex_router.go`, `paperswithcode_router.go`, etc.).
  * Centralized duplication and fallback logic inside `unified_router.go` for executing parallel cross-provider queries securely and aggregating the results.
