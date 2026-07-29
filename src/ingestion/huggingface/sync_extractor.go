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

// syncArxivPDF handles downloading and extracting PDF text for Hugging Face papers that are hosted on arXiv,
// and stores the parsed contents in arxiv_papers and paper_paragraphs.
func (c *HuggingFaceClient) syncArxivPDF(ctx context.Context, p HFPaper) {
	isArxiv := false
	if strings.Contains(p.PaperID, ".") || strings.Contains(p.PaperID, "/") {
		isArxiv = true
	}

	if !isArxiv {
		return
	}

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
