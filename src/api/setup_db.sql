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
