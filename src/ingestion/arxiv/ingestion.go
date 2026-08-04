package arxiv

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"strings"

	"research_copilot/src/core"
)

// ingestPaper handles the full download → extract → DB write pipeline for a single paper.
func (c *ArxivClient) ingestPaper(ctx context.Context, p ArxivPaper) {
	// Deduplicate in-flight ingestion tasks
	lockKey := "arxiv:" + p.ArxivID
	if !core.AcquireInFlight(lockKey) {
		log.Printf("[INGESTION] [%s] Ingestion already in-flight. Skipping duplicate worker.", p.ArxivID)
		return
	}
	defer core.ReleaseInFlight(lockKey)

	// Sanitize paper struct strings to strip null bytes (PostgreSQL doesn't support them in text fields)
	p.Title = strings.ReplaceAll(p.Title, "\x00", "")
	p.Abstract = strings.ReplaceAll(p.Abstract, "\x00", "")
	p.ArxivID = strings.ReplaceAll(p.ArxivID, "\x00", "")
	p.PublishedDate = strings.ReplaceAll(p.PublishedDate, "\x00", "")
	if p.UpdatedDate != nil {
		cleanUpdate := strings.ReplaceAll(*p.UpdatedDate, "\x00", "")
		p.UpdatedDate = &cleanUpdate
	}
	p.PDFURL = strings.ReplaceAll(p.PDFURL, "\x00", "")
	p.EntryID = strings.ReplaceAll(p.EntryID, "\x00", "")
	p.PrimaryCategory = strings.ReplaceAll(p.PrimaryCategory, "\x00", "")
	for idx, author := range p.Authors {
		p.Authors[idx].Name = strings.ReplaceAll(author.Name, "\x00", "")
		if author.Affiliation != nil {
			cleanAff := strings.ReplaceAll(*author.Affiliation, "\x00", "")
			p.Authors[idx].Affiliation = &cleanAff
		}
	}
	for idx, category := range p.Categories {
		p.Categories[idx] = strings.ReplaceAll(category, "\x00", "")
	}
	if p.DOI != nil {
		cleanDOI := strings.ReplaceAll(*p.DOI, "\x00", "")
		p.DOI = &cleanDOI
	}
	if p.JournalRef != nil {
		cleanRef := strings.ReplaceAll(*p.JournalRef, "\x00", "")
		p.JournalRef = &cleanRef
	}
	if p.Comment != nil {
		cleanComment := strings.ReplaceAll(*p.Comment, "\x00", "")
		p.Comment = &cleanComment
	}

	log.Printf("[INGESTION] [%s] Starting ingestion: '%s'", p.ArxivID, p.Title)

	// --- Step 1: Download PDF ---
	log.Printf("[INGESTION] [%s] Downloading PDF from %s", p.ArxivID, p.PDFURL)
	localPath, err := c.Extractor.Download(ctx, p.ArxivID, p.PDFURL)
	if err != nil {
		log.Printf("[INGESTION] [%s] Download failed: %v", p.ArxivID, err)
		return
	}
	log.Printf("[INGESTION] [%s] PDF saved to %s", p.ArxivID, localPath)

	// --- Step 2: Extract Text ---
	log.Printf("[INGESTION] [%s] Extracting text from %s", p.ArxivID, localPath)
	extData, err := c.Extractor.Extract(ctx, localPath)
	if err != nil {
		log.Printf("[INGESTION] [%s] Extraction failed: %v", p.ArxivID, err)
		return
	}
	log.Printf("[INGESTION] [%s] Extraction done (pages: %d, paragraphs: %d, words: %d)",
		p.ArxivID, extData.PageCount, len(extData.Paragraphs), extData.WordCount)

	// Build full text
	var paragraphsText []string
	var fullTextBuf bytes.Buffer
	for _, para := range extData.Paragraphs {
		// Strip null bytes - PostgreSQL UTF-8 rejects 0x00 characters
		cleanPara := strings.ReplaceAll(para.Text, "\x00", "")
		paragraphsText = append(paragraphsText, cleanPara)
		fullTextBuf.WriteString(cleanPara + "\n\n")
	}
	fullTextStr := strings.ReplaceAll(strings.TrimSpace(fullTextBuf.String()), "\x00", "")

	// --- Step 3: Write to Database ---
	tx, err := core.DB.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[INGESTION] [%s] Failed to begin transaction: %v", p.ArxivID, err)
		return
	}

	authorsJSON, _ := json.Marshal(p.Authors)
	metadataJSON, _ := json.Marshal(p)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO arxiv_papers (
			paper_id, title, abstract, authors, published_at, pdf_url,
			full_text, paragraph_count, page_count, word_count, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (paper_id) DO NOTHING;`,
		p.ArxivID, p.Title, p.Abstract, authorsJSON, p.PublishedDate, p.PDFURL,
		fullTextStr, len(paragraphsText), extData.PageCount, extData.WordCount, metadataJSON,
	)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [%s] Failed to insert paper row: %v", p.ArxivID, err)
		return
	}

	stmt, err := tx.PrepareContext(ctx, "INSERT INTO paper_paragraphs (paper_id, paragraph_index, page_number, text) VALUES ($1, $2, $3, $4);")
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [%s] Failed to prepare paragraph statement: %v", p.ArxivID, err)
		return
	}
	defer stmt.Close()

	for pIdx, para := range extData.Paragraphs {
		cleanPara := strings.ReplaceAll(para.Text, "\x00", "")
		if _, err = stmt.ExecContext(ctx, p.ArxivID, pIdx, para.PageNumber, cleanPara); err != nil {
			tx.Rollback()
			log.Printf("[INGESTION] [%s] Failed to insert paragraph %d: %v", p.ArxivID, pIdx, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[INGESTION] [%s] Failed to commit transaction: %v", p.ArxivID, err)
		return
	}

	log.Printf("[INGESTION] [%s] Stored paper + %d paragraphs. Ready for next request.", p.ArxivID, len(paragraphsText))
}
