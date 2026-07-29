package huggingface

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
	isArxiv := false
	if strings.Contains(p.PaperID, ".") || strings.Contains(p.PaperID, "/") {
		isArxiv = true
	}

	if isArxiv {
		pdfURL := fmt.Sprintf("https://arxiv.org/pdf/%s.pdf", p.PaperID)
		log.Printf("[INGESTION] [HF:%s] Paper identified as arXiv. Downloading PDF from %s", p.PaperID, pdfURL)

		localPath, err := c.Extractor.Download(ctx, p.PaperID, pdfURL)
		if err != nil {
			log.Printf("[INGESTION] [HF:%s] PDF download failed: %v", p.PaperID, err)
			return
		}

		log.Printf("[INGESTION] [HF:%s] PDF saved. Extracting text...", p.PaperID)
		extData, err := c.Extractor.Extract(ctx, localPath)
		if err != nil {
			log.Printf("[INGESTION] [HF:%s] PDF extraction failed: %v", p.PaperID, err)
			return
		}

		// Build and sanitize extracted paragraphs
		var paragraphsText []string
		var fullTextBuf bytes.Buffer
		for _, para := range extData.Paragraphs {
			cleanPara := strings.ReplaceAll(para.Text, "\x00", "")
			paragraphsText = append(paragraphsText, cleanPara)
			fullTextBuf.WriteString(cleanPara + "\n\n")
		}
		fullTextStr := strings.ReplaceAll(strings.TrimSpace(fullTextBuf.String()), "\x00", "")

		// Check if paper already exists in arxiv_papers before inserting
		var exists bool
		err = core.DB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM arxiv_papers WHERE paper_id = $1);", p.PaperID).Scan(&exists)
		if err == nil && !exists {
			// Write to arxiv_papers & paper_paragraphs
			arxivTx, err := core.DB.BeginTx(ctx, nil)
			if err != nil {
				log.Printf("[DATABASE] [HF:%s] Failed to begin arXiv transaction: %v", p.PaperID, err)
				return
			}

			authorsJSON, _ := json.Marshal(p.Authors)
			metadataJSON, _ := json.Marshal(p)

			_, err = arxivTx.ExecContext(ctx, `
				INSERT INTO arxiv_papers (
					paper_id, title, abstract, authors, published_at, pdf_url,
					full_text, paragraph_count, page_count, word_count, metadata
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				ON CONFLICT (paper_id) DO NOTHING;`,
				p.PaperID, p.Title, p.Summary, authorsJSON, p.PublishedAt, pdfURL,
				fullTextStr, len(paragraphsText), extData.PageCount, extData.WordCount, metadataJSON,
			)
			if err != nil {
				arxivTx.Rollback()
				log.Printf("[DATABASE] [HF:%s] Failed to insert arXiv paper record: %v", p.PaperID, err)
				return
			}

			stmt, err := arxivTx.PrepareContext(ctx, "INSERT INTO paper_paragraphs (paper_id, paragraph_index, page_number, text) VALUES ($1, $2, $3, $4);")
			if err != nil {
				arxivTx.Rollback()
				log.Printf("[DATABASE] [HF:%s] Failed to prepare paragraphs: %v", p.PaperID, err)
				return
			}
			defer stmt.Close()

			for pIdx, paraText := range paragraphsText {
				if _, err = stmt.ExecContext(ctx, p.PaperID, pIdx, extData.Paragraphs[pIdx].PageNumber, paraText); err != nil {
					arxivTx.Rollback()
					log.Printf("[DATABASE] [HF:%s] Failed to insert paragraph %d: %v", p.PaperID, pIdx, err)
					return
				}
			}

			if err := arxivTx.Commit(); err != nil {
				log.Printf("[DATABASE] [HF:%s] Failed to commit arXiv paper transaction: %v", p.PaperID, err)
				return
			}

			log.Printf("[DATABASE] [HF:%s] Successfully synchronized PDF text to arxiv_papers & paper_paragraphs", p.PaperID)
		}
	}
}
