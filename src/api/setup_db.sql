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

CREATE TABLE IF NOT EXISTS paper_paragraphs (
    id SERIAL PRIMARY KEY,
    paper_id VARCHAR(50) REFERENCES arxiv_papers(paper_id) ON DELETE CASCADE,
    paragraph_index INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL
);

-- Indexing for fast search lookups
CREATE INDEX IF NOT EXISTS idx_paper_paragraphs_paper_id ON paper_paragraphs(paper_id);

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



