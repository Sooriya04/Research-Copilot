-- Initialize Research Copilot database schema for arXiv papers and paragraph segments

CREATE TABLE IF NOT EXISTS arxiv_papers (
    paper_id VARCHAR(50) PRIMARY KEY,
    title TEXT NOT NULL,
    abstract TEXT,
    authors JSONB DEFAULT '[]'::jsonb,
    published_at TIMESTAMP,
    pdf_url TEXT,
    full_text TEXT,
    paragraph_count INTEGER DEFAULT 0,
    page_count INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- We drop the old paper_paragraphs to migrate it to research_papers
DROP TABLE IF EXISTS paper_paragraphs;

-- Initialize Hugging Face schemas (Bronze & Silver layers)
CREATE TABLE IF NOT EXISTS raw_hf_doc (
    _id VARCHAR(50) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hf_papers (
    paper_id VARCHAR(50) PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    ai_summary TEXT,
    published_at TIMESTAMP,
    submitted_on_daily_at TIMESTAMP,
    submitted_by TEXT,
    upvotes INTEGER DEFAULT 0,
    discussion_id TEXT,
    github_repo TEXT,
    github_stars INTEGER,
    url TEXT NOT NULL,
    ai_keywords TEXT[],
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hf_paper_authors (
    paper_id VARCHAR(50) REFERENCES hf_papers(paper_id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    PRIMARY KEY (paper_id, author_name)
);

CREATE TABLE IF NOT EXISTS hf_models (
    model_id      TEXT PRIMARY KEY,
    likes         INTEGER DEFAULT 0,
    downloads     INTEGER DEFAULT 0,
    pipeline_tag  TEXT,
    library_name  TEXT,
    tags          TEXT[],
    url           TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fetched_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hf_datasets (
    dataset_id    TEXT PRIMARY KEY,
    author        TEXT,
    likes         INTEGER DEFAULT 0,
    downloads     INTEGER DEFAULT 0,
    description   TEXT,
    tags          TEXT[],
    url           TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fetched_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hf_papers_published_at ON hf_papers(published_at);
CREATE INDEX IF NOT EXISTS idx_hf_models_downloads ON hf_models(downloads);
CREATE INDEX IF NOT EXISTS idx_hf_datasets_downloads ON hf_datasets(downloads);

-- Initialize Semantic Scholar schemas (Bronze & Silver layers)
CREATE TABLE IF NOT EXISTS raw_s2_documents (
    source_id VARCHAR(50) PRIMARY KEY,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS s2_papers (
    paper_id VARCHAR(50) PRIMARY KEY,
    title TEXT NOT NULL,
    abstract TEXT,
    year INTEGER,
    citation_count INTEGER DEFAULT 0,
    influential_citation_count INTEGER DEFAULT 0,
    is_open_access BOOLEAN DEFAULT FALSE,
    pdf_url TEXT,
    paper_url TEXT,
    reference_count INTEGER DEFAULT 0,
    venue TEXT,
    publication_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS s2_authors (
    author_id VARCHAR(50) PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS s2_paper_authors (
    paper_id VARCHAR(50) REFERENCES s2_papers(paper_id) ON DELETE CASCADE,
    author_id VARCHAR(50) REFERENCES s2_authors(author_id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_s2_papers_citation ON s2_papers(citation_count);

-- Initialize Kaggle schemas (Bronze & Silver layers)
CREATE TABLE IF NOT EXISTS raw_kaggle_doc (
    ref VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'dataset' or 'model'
    payload JSONB NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kaggle_datasets (
    ref VARCHAR(255) PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    creator_name TEXT,
    creator_url TEXT,
    total_bytes BIGINT DEFAULT 0,
    url TEXT,
    download_count INTEGER DEFAULT 0,
    vote_count INTEGER DEFAULT 0,
    usability_rating NUMERIC(4, 2) DEFAULT 0.0,
    license_name TEXT,
    tags TEXT[],
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kaggle_models (
    url TEXT PRIMARY KEY,
    ref VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    owner_name TEXT,
    owner_ref TEXT,
    framework VARCHAR(100),
    fine_tunable BOOLEAN DEFAULT FALSE,
    vote_count INTEGER DEFAULT 0,
    tags TEXT[],
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kaggle_datasets_downloads ON kaggle_datasets(download_count);
CREATE INDEX IF NOT EXISTS idx_kaggle_models_votes ON kaggle_models(vote_count);

-- Initialize OpenAlex schemas (Bronze & Silver layers)
CREATE TABLE IF NOT EXISTS raw_openalex_doc (
    source_id VARCHAR(50) PRIMARY KEY,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS openalex_papers (
    paper_id VARCHAR(50) PRIMARY KEY,
    title TEXT NOT NULL,
    abstract TEXT,
    year INTEGER,
    citation_count INTEGER DEFAULT 0,
    is_open_access BOOLEAN DEFAULT FALSE,
    pdf_url TEXT,
    paper_url TEXT,
    publication_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS openalex_authors (
    author_id VARCHAR(50) PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS openalex_paper_authors (
    paper_id VARCHAR(50) REFERENCES openalex_papers(paper_id) ON DELETE CASCADE,
    author_id VARCHAR(50) REFERENCES openalex_authors(author_id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_openalex_papers_citation ON openalex_papers(citation_count);

-- Initialize Crossref schemas (Bronze & Silver layers)
CREATE TABLE IF NOT EXISTS raw_crossref_doc (
    source_id VARCHAR(100) PRIMARY KEY,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crossref_papers (
    paper_id VARCHAR(100) PRIMARY KEY, -- Stores DOI
    title TEXT NOT NULL,
    abstract TEXT,
    year INTEGER,
    citation_count INTEGER DEFAULT 0,
    is_open_access BOOLEAN DEFAULT FALSE,
    pdf_url TEXT,
    paper_url TEXT,
    publication_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crossref_authors (
    author_id SERIAL PRIMARY KEY,
    given_name TEXT,
    family_name TEXT,
    full_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uniq_crossref_author UNIQUE (given_name, family_name, full_name)
);

CREATE TABLE IF NOT EXISTS crossref_paper_authors (
    paper_id VARCHAR(100) REFERENCES crossref_papers(paper_id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES crossref_authors(author_id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_crossref_papers_citation ON crossref_papers(citation_count);

-- Initialize Papers With Code schemas (Bronze & Silver layers)
CREATE TABLE IF NOT EXISTS pwc_papers (
    paper_id VARCHAR(255) PRIMARY KEY,
    title TEXT NOT NULL,
    abstract TEXT,
    tasks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pwc_repositories (
    repo_url TEXT PRIMARY KEY,
    paper_id VARCHAR(255) REFERENCES pwc_papers(paper_id) ON DELETE CASCADE,
    framework VARCHAR(100),
    stars INTEGER DEFAULT 0,
    is_official BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pwc_results (
    id SERIAL PRIMARY KEY,
    paper_id VARCHAR(255) REFERENCES pwc_papers(paper_id) ON DELETE CASCADE,
    dataset TEXT,
    task TEXT,
    metric TEXT,
    value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Core search sessions mapping request_id to query
CREATE TABLE IF NOT EXISTS search_sessions (
    request_id VARCHAR(255) PRIMARY KEY,
    query TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unified research papers table for storing search results with reproduction details
CREATE TABLE IF NOT EXISTS research_papers (
    id VARCHAR(255) PRIMARY KEY,
    request_id VARCHAR(255) REFERENCES search_sessions(request_id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT, -- JSON array string
    url TEXT,
    pdf_url TEXT,
    citation_count INTEGER DEFAULT 0,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    code_repository TEXT,
    frameworks JSONB DEFAULT '[]'::jsonb,
    tasks JSONB DEFAULT '[]'::jsonb,
    benchmarks JSONB DEFAULT '[]'::jsonb,
    hyperparameters JSONB DEFAULT '{}'::jsonb,
    embedding double precision[],
    embedding_model VARCHAR(100),
    embedded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema tables for graph engine visualizer compatibility
-- Schema tables for graph engine visualizer compatibility
CREATE TABLE IF NOT EXISTS graph_nodes (
    id VARCHAR(255) PRIMARY KEY,
    request_id VARCHAR(255) REFERENCES search_sessions(request_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    label TEXT NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS graph_edges (
    id VARCHAR(255) PRIMARY KEY,
    request_id VARCHAR(255) REFERENCES search_sessions(request_id) ON DELETE CASCADE,
    source VARCHAR(255) NOT NULL,
    target VARCHAR(255) NOT NULL,
    relation VARCHAR(50) NOT NULL,
    weight NUMERIC(4,2) DEFAULT 1.0,
    properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- RESEARCH PAPER CONTENT HEALTH + REPAIR PIPELINE SCHEMA
-- =====================================================================

-- 1. Add health tracking fields to research_papers
ALTER TABLE research_papers
ADD COLUMN IF NOT EXISTS abstract_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS pdf_content_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS extraction_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_extraction_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_validation_at TIMESTAMP;

-- 2. Create paper_content_versions to store idempotent, versioned extractions
CREATE TABLE IF NOT EXISTS paper_content_versions (
    id SERIAL PRIMARY KEY,
    paper_id VARCHAR(255) REFERENCES research_papers(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL, -- ABSTRACT, PDF, FULL_TEXT
    source_url TEXT,
    source_type VARCHAR(50),
    extraction_method VARCHAR(100),
    extractor_version VARCHAR(50),
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 for idempotency
    quality_score NUMERIC(4,2),
    validation_status VARCHAR(50),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(paper_id, content_type, content_hash) -- Prevent duplicate content
);

-- 3. Recreate paper_paragraphs pointing to research_papers and paper_content_versions
CREATE TABLE IF NOT EXISTS paper_paragraphs (
    id SERIAL PRIMARY KEY,
    paper_id VARCHAR(255) REFERENCES research_papers(id) ON DELETE CASCADE,
    content_version_id INTEGER REFERENCES paper_content_versions(id) ON DELETE CASCADE,
    paragraph_index INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    text_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_paper_paragraphs_paper_id ON paper_paragraphs(paper_id);

-- 3b. Create paper_chunks pointing to research_papers and paper_content_versions for Agentic RAG
CREATE TABLE IF NOT EXISTS paper_chunks (
    id SERIAL PRIMARY KEY,
    paper_id VARCHAR(255) REFERENCES research_papers(id) ON DELETE CASCADE,
    content_version_id INTEGER REFERENCES paper_content_versions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    section_name VARCHAR(100),
    page_start INTEGER,
    page_end INTEGER,
    word_count INTEGER,
    token_count INTEGER,
    chunk_type VARCHAR(50) DEFAULT 'PARAGRAPH',
    embedding double precision[],
    embedding_status VARCHAR(50) DEFAULT 'PENDING',
    embedding_model VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_version_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_paper_chunks_paper_id ON paper_chunks(paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_chunks_status ON paper_chunks(embedding_status);

-- 4. Create content_repair_jobs (PostgreSQL Persistent Queue)
CREATE TABLE IF NOT EXISTS content_repair_jobs (
    id SERIAL PRIMARY KEY,
    paper_id VARCHAR(255) REFERENCES research_papers(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL,
    reason VARCHAR(100) NOT NULL,
    priority INTEGER DEFAULT 10,
    status VARCHAR(50) DEFAULT 'QUEUED', -- QUEUED, REPAIRING, COMPLETED, FAILED
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    locked_at TIMESTAMP,
    locked_by VARCHAR(255),
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(paper_id, content_type) -- Prevent duplicate repair jobs per paper/type
);

-- 5. Create repair_attempts (History/Provenance)
CREATE TABLE IF NOT EXISTS repair_attempts (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES content_repair_jobs(id) ON DELETE CASCADE,
    source_url TEXT,
    source_type VARCHAR(50),
    extraction_method VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    quality_score NUMERIC(4,2),
    error TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

