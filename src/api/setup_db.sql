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

-- Unified search session and research papers tables
CREATE TABLE IF NOT EXISTS search_sessions (
    request_id UUID PRIMARY KEY,
    query TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_papers (
    id UUID PRIMARY KEY,
    request_id UUID REFERENCES search_sessions(request_id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    authors JSONB DEFAULT '[]'::jsonb,
    url TEXT,
    pdf_url TEXT,
    published_at TIMESTAMP,
    citation_count INTEGER DEFAULT 0,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_papers_request_id ON research_papers(request_id);
CREATE INDEX IF NOT EXISTS idx_research_papers_source ON research_papers(source);
CREATE INDEX IF NOT EXISTS idx_search_sessions_query ON search_sessions(query);

