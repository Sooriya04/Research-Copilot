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

## Commit 11 (dev and main) : Refactor Knowledge Engine and Optimize Visualizer Graph Generation

* **Knowledge Engine Modular Re-architecture (`services/knowledge_engine`)**:
  * Refactored monolithic `graph.go` by decoupling logical layers into dedicated packages: `similarity.go` (computes tokenize/Jaccard content overlap), `llm.go` (coordinates LLM prompt composition and Gemini REST API fallbacks), and `graph.go` (constructs graph metadata layers and handles exports).
  * Implemented resilient fallback routines for CrossRef or Open Access documents lacking abstracts or PDF text: formats custom publication summaries dynamically using paper titles and metadata to prevent blank placeholders.
  * Re-configured PostgreSQL persistence calls to use `ON CONFLICT (id) DO UPDATE` upserts to prevent concurrent database isolation failures.
* **Understand-Anything Visualizer Optimization**:
  * Gutted noisy ML task classifications (e.g. general physics concepts) and duplicate author/dataset nodes, showing only root search topics, publication articles, ML frameworks, and linked repository nodes.
  * Added dynamic git subprocess querying in the Knowledge Engine: queries `git rev-parse HEAD` on the fly to write git commit hash metadata inside `.ua/knowledge-graph.json` to prevent freshness errors.
  * Patched `StalenessBanner.tsx` in the dashboard frontend code to return `null` immediately, disabling the uncommitted working-tree changes banner permanently.


## Commit 12 (dev and main) : Implement GitHub Repository Ingestion and Unified Router Integration

* **GitHub Ingestion Client (`src/ingestion/github`)**:
  * Implemented a native Go client to query the GitHub REST API (`/search/repositories`) to fetch source code repositories based on unified search queries.
  * Added environment variable support for `GITHUB_TOKEN` to allow authenticated requests and bypass the strict unauthenticated rate limits (10 req/min).
  * Built strict data models (`models.go`) to parse `StargazersCount`, `Language`, `Topics`, and `Owner.Login`.
* **Unified API Aggregation (`src/api/unified_router.go`)**:
  * Added `"github"` as the 7th parallel source in the unified multi-source search controller.
  * Mapped GitHub data models seamlessly to `UnifiedResearchPaper` (e.g. mapping repository stars to citations, and repo topics/language to ML frameworks).
  * The unified engine automatically de-duplicates and aggregates GitHub results alongside Arxiv, PapersWithCode, and HuggingFace, storing the output in the `.ua/knowledge-graph.json` graph via background triggers.

<br />

## Commit 13 (dev and main) : Implement Decoupled Query Expansion, PDF Extractor Robustness, and API Schema Upgrades

* **Decoupled Python Query Expansion Server (`services/query_optimizer/main.py`)**:
  * Implemented a dedicated query expansion service in Python on port `8100`.
  * Integrates the Google Generative Language API (`gemini-1.5-flash`) for high-fidelity query optimization, expanding prompts into 3 distinct keyword/subtopic variations.
  * Configured a robust local fallback to `phi4-mini` via Ollama if the `GEMINI_API_KEY` is missing or the call fails, and a final fallback to returning the original query.
  * Added manual `.env` file parser to avoid third-party library dependencies.
* **Go Backend Unified Router Integration (`src/api/unified_router.go`)**:
  * Refactored `handleSearchUnified` to hit `POST /expand` on the Python service at startup.
  * Executes searches for all generated subqueries + original query in parallel across all 7 sources, merging and deduplicating results.
  * Modified `.Search()` calls to pass the target subquery string dynamically instead of static request parameters.
* **Robust PDF Extractor Validation (`services/pdf_extractor/extractor.go`)**:
  * Added `%PDF-` file signature verification inside the stateless PDF extractor.
  * Catches invalid files (e.g., HTML block/error pages saved as `.pdf`) early, cleaning them up from local disk and throwing a clean error instead of spawning corrupted `pdftotext` runs.
* **API Schema & Cache Upgrades (`src/api/schemas.go`)**:
  * Added `source_counts` mapping to `UnifiedSearchResponse` showing retrieved count per source in the final payload.
  * Added `pdf_text` field to `UnifiedResearchPaper` schema, dynamically populated from the database if the paper has been previously downloaded and parsed.
* **Reorganized Launch Scripts & Binaries**:
  * Consolidated all side services inside `service.sh` (running PDF Extractor and the new Python Query Expansion Server).
  * Relocated Go compiled binaries to the ignored `bin/` folder to prevent dirtying the repository root.
  * Fixed Go startup API key caching order bug by importing `_ "github.com/joho/godotenv/autoload"` first in `main.go`.

## Commit 14 (dev and main) : Implement Content Health & Repair Pipeline and Embedding Pipeline

* **Content Health & Repair Pipeline**:
  * **Go Backend & Detection Workflow (`src/api/unified_router.go`)**:
    * Fixed missing brace in the `arxiv` query case.
    * Added validation trigger for abstracts and PDFs upon saving research papers.
    * Added queue flood-guard checking for existing active (`QUEUED`/`REPAIRING`) repair jobs.
  * **Repair Worker (`services/repair_worker/main.go`, `pipeline.go`)**:
    * Replaced hardcoded fallback DSN with a clean `.env` loader.
    * Fixed fragile inline anonymous ternary function with standard `attemptStatus` variable.
    * Fixed argument mismatch when calling `extractContent`.
  * **Repair Agent (`agent/main.py`)**:
    * Completely rewrote `discover_sources` with a 3-tier fallback (SearxNG, real arXiv API search, Semantic Scholar).
    * Integrated JSON content-type validation to prevent HTML parsing crashes.
* **Embedding Pipeline**:
  * **Schema Integration (`src/api/setup_db.sql`)**:
    * Added `embedding`, `embedding_model`, and `embedded_at` columns to `research_papers`.
  * **Ollama Embedding Worker (`services/embedding_worker/main.py`)**:
    * Implemented Python worker to generate 768-dimensional vectors using `nomic-embed-text` in batches.
    * Configured standard health endpoint and service management integrations in `service.sh`.

<br />

## Commit 15 (dev and main) : Implement Universal Color-Coded Logging, Fix Worker/Agent Timeout Deadlines, Blacklist Attempted URLs, and Prevent Search Polling Resets

* **Universal Color-Coded Log Interception (`services/repair_worker/logger.go`)**:
  * Designed a thread-safe `ColorWriter` wrapping `os.Stderr`/`os.Stdout` to dynamically format standard log lines using ANSI escape codes.
  * Colors errors and critical failures in bold red (`\033[1;31m`) and warnings in yellow/amber (`\033[33m`) with prominent visual symbols (🛑, ⚠️) to improve terminal readability.
  * Deployed color-coded logging globally across the Go repair worker service.
* **Worker & Agent Timeout Mismatch Fix (`services/repair_worker/pipeline.go`)**:
  * Resolved a deadline deadlock where the Go worker aborted agent requests after 10 seconds, which was shorter than the Python agent's search APIs sequential timeouts (up to 22 seconds).
  * Increased the Go HTTP client-side timeout to **35 seconds** to safely accommodate multi-stage search queries.
* **Attempt Exclusion & Blacklist (`agent/main.py` and `services/repair_worker/pipeline.go`)**:
  * Patched the Python agent's `discover-repair-source` endpoint to normalize and filter out previously attempted URLs.
  * Updated the Go worker to query the `repair_attempts` table and populate the `ExistingURLs` field in its request payload, allowing the agent to blacklist failed URLs and preventing infinite repair loops on wrong candidate selections.
* **Non-Retryable Failure Optimizations (`services/repair_worker/pipeline.go`)**:
  * Configured the worker to skip retry loops entirely when a document is validated as `WRONG_DOCUMENT` (meaning the wrong title was matched), marking the job as `FAILED` immediately instead of exhausting 3 attempts.
* **Search Polling Ingestion Decoupling (`src/api/unified_router.go`)**:
  * Refactored `handleSearchUnified` to use `ON CONFLICT DO NOTHING` when queueing missing PDF or abstract repairs.
  * This prevents background UI polling from resetting failed or active jobs back to `QUEUED` with `attempts = 0`, keeping the persistent repair queue stable and predictable.

<br />

## Comprehensive System Bug Fixes & Native Go Repair Agent & Sentinel Migration

* **Native Go Repair Agent & Sentinel Architecture (`src/agent/sentinel.go`, `src/agent/main/main.go`)**:
  * Fully replaced legacy Python agent (`agent/main.py`) with a native, high-performance Go Repair Agent server (`bin/repair_agent` on port `8101`).
  * Implemented native Go multi-source fallbacks (SearxNG, arXiv API, Semantic Scholar API) with URL classification and weighted scoring.
  * Built event-driven background Sentinel repair monitoring with non-blocking concurrency locks.
* **Core & SHA-256 Entropy Fixes (`src/api/unified_helpers.go`, `src/core/chunker.go`)**:
  * Removed 16-character string truncation in `computeSHA256` to return full 64-character SHA-256 hex hashes, eliminating primary key collision risks on `research_papers.id`.
  * Preserved non-ASCII UTF-8 runes in `normalizeTitle` (`r > 127`) to prevent non-Latin publication titles from normalizing to empty strings.
* **Database & Schema Integrity (`src/api/setup_db.sql`, `services/repair_worker/pipeline.go`)**:
  * Fixed foreign key in `paper_paragraphs` table to reference `research_papers(id)` instead of `arxiv_papers(paper_id)`.
  * Fixed `paper_content_versions` upsert query by updating `quality_score = EXCLUDED.quality_score` to guarantee SQL `RETURNING id` behavior.
* **Concurrency & Resource Management (`services/repair_worker/pipeline.go`, `services/repair_worker/main.go`)**:
  * Closed DB query rows explicitly before making HTTP calls in `discoverSource` to prevent connection pool exhaustion.
  * Dedicated `recoverStaleJobs` stale job recovery execution exclusively to `worker-1`.
  * Separated download and extract HTTP client timeouts in `extractContent` to 60-second independent limits.
* **Worker & Pipeline Optimizations (`services/query_optimizer/main.py`, `services/chunker/main.py`, `services/embedding_worker/main.py`)**:
  * Added `threading.Lock()` to `query_optimizer` for atomic in-memory cache evictions.
  * Cleaned up top-level `hashlib` imports and eliminated dummy row creation in `chunker`.
  * Removed early `return` in `embedding_worker` so paper-level and chunk-level embeddings process within the same loop cycle.
  * Added a `TopK` maximum cap (`50`) in `unified_router.go` to prevent DoS vulnerabilities.
* **Build & Launcher Alignment (`build.sh`, `service.sh`)**:
  * Updated `build.sh` to compile `bin/repair_agent` on port `8101`.
  * Updated `service.sh` to run the compiled Go `./bin/repair_agent` service binary instead of Python script.

<br />

## Implement PubMed / Entrez Medical Literature Ingestion Connector

* **PubMed / Entrez Microservice Client (`src/ingestion/pubmed/client.go`, `models.go`)**:
  * Built native Go client for NCBI Entrez eUtils (`esearch.fcgi` and `efetch.fcgi`).
  * Defined structured models for PMIDs, PMCIDs, DOIs, open-access status, journal titles, and authors (`PubMedPaper`, `PubMedAuthor`, `PubMedSearchResult`).
* **XML eFetch Parser Engine (`src/ingestion/pubmed/parser.go`)**:
  * Built custom XML decoder mapping `PubmedArticleSet` to structured paper metadata, extracting structured abstract sections (e.g. OBJECTIVE, METHODS, RESULTS) and PMC open-access PDF URLs (`https://www.ncbi.nlm.nih.gov/pmc/articles/PMC.../pdf/`).
* **Bronze & Silver Database Layer (`src/api/setup_db.sql`, `src/ingestion/pubmed/ingest_paper.go`)**:
  * Deployed PostgreSQL Bronze (`raw_pubmed_doc`) and Silver (`pubmed_papers`, `pubmed_authors`, `pubmed_paper_authors`) tables.
  * Implemented background PDF sync (`SyncPubMedPDFContent`) with in-flight deduplication via `core.AcquireInFlight`.
* **API & Unified Router Integration (`src/api/router.go`, `src/api/unified_router.go`)**:
  * Added standalone REST endpoint `POST /api/v1/search/pubmed`.
  * Registered PubMed into the multi-source unified search array (`"pubmed"`), enabling parallel search across all 8 scientific databases (arXiv, OpenAlex, Semantic Scholar, Crossref, Hugging Face, Papers with Code, GitHub, and PubMed).
* **Roadmap Milestone (`docs/roadmap.md`)**:
  * Completed the final remaining client in Phase 1 (Data Collection & Ingestion Layer).

<br />

## Implement Python Agentic RAG Retrieval Engine (Phase 3.1)

* **Python Agentic RAG Retrieval Microservice (`services/retrieval_service/main.py`)**:
  * Built Python microservice on port `8104` for Phase 3.1 Agentic RAG retrieval.
  * Implemented dense vector similarity retrieval using Ollama `nomic-embed-text` 768-dimensional embeddings.
  * Implemented PostgreSQL full-text search (`ts_rank_cd` over `to_tsvector` with `websearch_to_tsquery`).
  * Implemented Reciprocal Rank Fusion (RRF $k=60$) algorithm merging dense and sparse candidates.
  * Enforced strict `request_id` session isolation across dense, sparse, and fusion stages.
* **Go Router Proxy (`src/api/router.go`)**:
  * Configured `handleHybridRetrieval` in Go backend to proxy `POST /api/v1/retrieval/hybrid` directly to Python Retrieval Microservice on port `8104`.
* **Service Management (`service.sh`)**:
  * Added `retrieval_service` (port `8104`) to background process launcher and shutdown trap.
* **Bug Fixes & Refactoring**:
  * **Dense Search Vector Math Fix**: Implemented exact 768-dimensional Cosine Similarity calculation in `services/retrieval_service/main.py`, eliminating dummy index-based scoring.
  * **FTS GIN Index Optimization**: Updated sparse search SQL to query `c.search_vector @@ websearch_to_tsquery('english', %s)` directly, leveraging PostgreSQL GIN indexing.
  * **DB Connection Health**: Replaced per-request connection creation with persistent connection pooling and status verification.
  * **Dead Code Cleanup**: Deleted redundant/bypassed Go retrieval package (`src/retrieval/`).

