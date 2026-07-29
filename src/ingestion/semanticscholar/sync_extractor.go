package semanticscholar

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"

	"research_copilot/src/core"
)

// syncOpenAccessPDF downloads the open access PDF from Semantic Scholar,
// parses it using the shared PDF extractor microservice, and indexes the paragraphs.
func (c *S2Client) syncOpenAccessPDF(ctx context.Context, p S2Paper) {
	if p.PDFURL == nil || *p.PDFURL == "" {
		return
	}

	pdfURL := *p.PDFURL
	paperID := p.PaperID // Default to S2 paper ID

	// Detect if it's an arXiv link to capture the standard arXiv ID!
	arxivRe := regexp.MustCompile(`/pdf/([^/]+)\.pdf`)
	matches := arxivRe.FindStringSubmatch(pdfURL)
	if len(matches) > 1 {
		paperID = matches[1]
	}

	log.Printf("[INGESTION] [S2:%s] Downloading PDF from %s", p.PaperID, pdfURL)
	localPath, err := c.Extractor.Download(ctx, paperID, pdfURL)
	if err != nil {
		log.Printf("[INGESTION] [S2:%s] PDF download failed: %v", p.PaperID, err)
		return
	}

	log.Printf("[INGESTION] [S2:%s] PDF saved. Extracting text...", p.PaperID)
	extData, err := c.Extractor.Extract(ctx, localPath)
	if err != nil {
		log.Printf("[INGESTION] [S2:%s] PDF extraction failed: %v", p.PaperID, err)
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
	err = core.DB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM arxiv_papers WHERE paper_id = $1);", paperID).Scan(&exists)
	if err == nil && !exists {
		// Sync to arxiv_papers & paper_paragraphs
		arxivTx, err := core.DB.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[DATABASE] [S2:%s] Failed to begin arXiv transaction: %v", p.PaperID, err)
			return
		}

		// Prepare authors JSON
		var authors []string
		for _, a := range p.Authors {
			authors = append(authors, a.Name)
		}
		authorsJSON, _ := json.Marshal(authors)
		metadataJSON, _ := json.Marshal(p)

		var pubDate *string
		if p.PublicationDate != nil {
			strDate := p.PublicationDate.Format("2006-01-02")
			pubDate = &strDate
		}

		_, err = arxivTx.ExecContext(ctx, `
			INSERT INTO arxiv_papers (
				paper_id, title, abstract, authors, published_at, pdf_url,
				full_text, paragraph_count, page_count, word_count, metadata
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			ON CONFLICT (paper_id) DO NOTHING;`,
			paperID, p.Title, p.Abstract, authorsJSON, pubDate, pdfURL,
			fullTextStr, len(paragraphsText), extData.PageCount, extData.WordCount, metadataJSON,
		)
		if err != nil {
			arxivTx.Rollback()
			log.Printf("[DATABASE] [S2:%s] Failed to insert arXiv paper record: %v", p.PaperID, err)
			return
		}

		stmt, err := arxivTx.PrepareContext(ctx, "INSERT INTO paper_paragraphs (paper_id, paragraph_index, page_number, text) VALUES ($1, $2, $3, $4);")
		if err != nil {
			arxivTx.Rollback()
			log.Printf("[DATABASE] [S2:%s] Failed to prepare paragraphs: %v", p.PaperID, err)
			return
		}
		defer stmt.Close()

		for pIdx, paraText := range paragraphsText {
			if _, err = stmt.ExecContext(ctx, paperID, pIdx, extData.Paragraphs[pIdx].PageNumber, paraText); err != nil {
				arxivTx.Rollback()
				log.Printf("[DATABASE] [S2:%s] Failed to insert paragraph %d: %v", p.PaperID, pIdx, err)
				return
			}
		}

		if err := arxivTx.Commit(); err != nil {
			log.Printf("[DATABASE] [S2:%s] Failed to commit arXiv paper transaction: %v", p.PaperID, err)
			return
		}

		log.Printf("[DATABASE] [S2:%s] Successfully synchronized PDF text to arxiv_papers & paper_paragraphs", p.PaperID)
	}
}
