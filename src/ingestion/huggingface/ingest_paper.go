package huggingface

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"research_copilot/src/core"
)

// ingestHFPaper runs the ingestion pipeline for a Hugging Face daily paper:
// 1. Sanitizes string inputs to avoid UTF-8 null bytes.
// 2. Stores raw JSON document into raw_hf_doc (Bronze).
// 3. Stores transformed metadata into hf_papers / hf_paper_authors (Silver).
// 4. Concurrently triggers arXiv-style PDF download + text extraction & stores text in arxiv_papers database.
func (c *HuggingFaceClient) ingestHFPaper(ctx context.Context, p HFPaper, rawDoc HFResponseItem) {
	// Sanitize inputs
	p.PaperID = strings.ReplaceAll(p.PaperID, "\x00", "")
	p.Title = strings.ReplaceAll(p.Title, "\x00", "")
	p.Summary = strings.ReplaceAll(p.Summary, "\x00", "")
	if p.AISummary != nil {
		cleanAISum := strings.ReplaceAll(*p.AISummary, "\x00", "")
		p.AISummary = &cleanAISum
	}
	if p.SubmittedBy != nil {
		cleanSub := strings.ReplaceAll(*p.SubmittedBy, "\x00", "")
		p.SubmittedBy = &cleanSub
	}
	if p.DiscussionID != nil {
		cleanDisc := strings.ReplaceAll(*p.DiscussionID, "\x00", "")
		p.DiscussionID = &cleanDisc
	}
	if p.GithubRepo != nil {
		cleanRepo := strings.ReplaceAll(*p.GithubRepo, "\x00", "")
		p.GithubRepo = &cleanRepo
	}
	p.URL = strings.ReplaceAll(p.URL, "\x00", "")
	for idx, author := range p.Authors {
		p.Authors[idx] = strings.ReplaceAll(author, "\x00", "")
	}

	log.Printf("[INGESTION] [HF:%s] Starting ingestion: '%s'", p.PaperID, p.Title)

	// Step 1: Write raw document to raw_hf_doc (Bronze Layer)
	rawJSON, err := json.Marshal(rawDoc)
	if err == nil {
		_, err = core.DB.ExecContext(ctx, `
			INSERT INTO raw_hf_doc (_id, data, updated_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
		`, p.PaperID, rawJSON)
		if err != nil {
			log.Printf("[INGESTION] [HF:%s] Failed to write Bronze raw document: %v", p.PaperID, err)
		}
	}

	// Step 2: Write transformed paper metadata to hf_papers (Silver Layer)
	tx, err := core.DB.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[INGESTION] [HF:%s] Failed to start database transaction: %v", p.PaperID, err)
		return
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO hf_papers (
			paper_id, title, summary, ai_summary, published_at, 
			submitted_on_daily_at, submitted_by, upvotes, 
			discussion_id, github_repo, github_stars, url, fetched_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
		ON CONFLICT (paper_id) DO UPDATE SET
			title = EXCLUDED.title,
			summary = EXCLUDED.summary,
			ai_summary = EXCLUDED.ai_summary,
			published_at = EXCLUDED.published_at,
			submitted_on_daily_at = EXCLUDED.submitted_on_daily_at,
			submitted_by = EXCLUDED.submitted_by,
			upvotes = EXCLUDED.upvotes,
			discussion_id = EXCLUDED.discussion_id,
			github_repo = EXCLUDED.github_repo,
			github_stars = EXCLUDED.github_stars,
			url = EXCLUDED.url,
			fetched_at = NOW();
	`,
		p.PaperID, p.Title, p.Summary, p.AISummary, p.PublishedAt,
		p.SubmittedOnDailyAt, p.SubmittedBy, p.Upvotes,
		p.DiscussionID, p.GithubRepo, p.GithubStars, p.URL,
	)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [HF:%s] Failed to write paper metadata: %v", p.PaperID, err)
		return
	}

	// Step 3: Write authors
	authorStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO hf_paper_authors (paper_id, author_name)
		VALUES ($1, $2)
		ON CONFLICT (paper_id, author_name) DO NOTHING;
	`)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [HF:%s] Failed to prepare authors statement: %v", p.PaperID, err)
		return
	}
	defer authorStmt.Close()

	for _, authorName := range p.Authors {
		if _, err := authorStmt.ExecContext(ctx, p.PaperID, authorName); err != nil {
			tx.Rollback()
			log.Printf("[INGESTION] [HF:%s] Failed to insert author %s: %v", p.PaperID, authorName, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[INGESTION] [HF:%s] Failed to commit silver transaction: %v", p.PaperID, err)
		return
	}

	log.Printf("[INGESTION] [HF:%s] Successfully wrote metadata to hf_papers & hf_paper_authors", p.PaperID)

	// Step 4: Reuse Extractor Client to download & extract full text if it's an arXiv paper
	c.syncArxivPDF(ctx, p)
}
