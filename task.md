# Ingestion and Database Enhancements for Research Paper Reproduction

- [x] Update database schema (`setup_db.sql`) with reproduction columns and Papers With Code tables
- [x] Implement Papers With Code ingestion package (`src/ingestion/paperswithcode`)
  - [x] `models.go` - PWC API models
  - [x] `client.go` - PWC client initialization
  - [x] `parser.go` - Query and parse PWC papers, repositories, and results
  - [x] `ingest_paper.go` - Ingest into database tables
- [x] Enrich other search providers with reproduction details
  - [x] arXiv: Extract code repository URLs from `comment` field
  - [x] OpenAlex: Extract concepts/topics as `tasks`
  - [x] Semantic Scholar: Extract repository URL and fields of study
  - [x] Crossref: Extract links and relations
  - [x] Hugging Face: Map related model cards and datasets
- [x] Build the Unified Search API on top of Commit 9, split cleanly into sub-routers:
  - [x] `router.go` - Main routing declarations and health checks
  - [x] `arxiv_router.go`, `huggingface_router.go`, `semanticscholar_router.go`, `kaggle_router.go`, `openalex_router.go`, `crossref_router.go`, `paperswithcode_router.go` - Independent routers
  - [x] `unified_router.go` - Collating, deduplicating, and database entry of reproduction data
  - [x] `unified_helpers.go` - Title normalization, regex hyperparameter and framework extraction
- [x] Verify execution by building, running, and testing search queries
