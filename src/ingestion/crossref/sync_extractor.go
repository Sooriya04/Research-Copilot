package crossref

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"

	"research_copilot/src/core"
	"research_copilot/src/ingestion/extractor"
)

// syncOpenAccessPDF downloads the open access PDF from Crossref links,
// parses it using the shared PDF extractor microservice, and indexes the paragraphs.
func (c *CrossrefClient) syncOpenAccessPDF(ctx context.Context, p CrossrefPaper) {
	if p.PDFURL == nil || *p.PDFURL == "" {
		return
	}

	pdfURL := *p.PDFURL
	paperID := p.PaperID // Default to Crossref paper ID/DOI

	// Detect if it's an arXiv link to capture the standard arXiv ID!
	arxivRe := regexp.MustCompile(`/pdf/([^/]+)\.pdf`)
	matches := arxivRe.FindStringSubmatch(pdfURL)
	if len(matches) > 1 {
		paperID = matches[1]
	}

	log.Printf("[INGESTION] [Crossref:%s] Downloading PDF from %s", p.PaperID, pdfURL)
	localPath, err := c.Extractor.Download(ctx, paperID, pdfURL)
	if err != nil {
		log.Printf("[INGESTION] [Crossref:%s] PDF download failed: %v", p.PaperID, err)
		return
	}

	log.Printf("[INGESTION] [Crossref:%s] PDF saved. Extracting text...", p.PaperID)
	extData, err := c.Extractor.Extract(ctx, localPath)
	if err != nil {
		log.Printf("[INGESTION] [Crossref:%s] PDF extraction failed: %v", p.PaperID, err)
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

	// Fallback 2: Extract abstract from PDF content if it's still empty
	if len(p.Abstract) < 10 {
		extractedAbs := extractAbstractFromParagraphs(extData.Paragraphs)
		if extractedAbs != "" {
			p.Abstract = extractedAbs
			log.Printf("[INGESTION] [Crossref:%s] Successfully extracted fallback abstract from PDF text: %d chars", p.PaperID, len(p.Abstract))

			// Update crossref_papers table with the newly extracted abstract
			_, err = core.DB.ExecContext(ctx, "UPDATE crossref_papers SET abstract = $1 WHERE paper_id = $2;", p.Abstract, p.PaperID)
			if err != nil {
				log.Printf("[DATABASE] [Crossref:%s] Failed to update Crossref paper abstract: %v", p.PaperID, err)
			}
		}
	}

	// Check if paper already exists in arxiv_papers before inserting
	var exists bool
	err = core.DB.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM arxiv_papers WHERE paper_id = $1);", paperID).Scan(&exists)
	if err == nil && !exists {
		// Sync to arxiv_papers & paper_paragraphs
		arxivTx, err := core.DB.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[DATABASE] [Crossref:%s] Failed to begin arXiv transaction: %v", p.PaperID, err)
			return
		}

		// Prepare authors JSON
		var authors []string
		for _, a := range p.Authors {
			authors = append(authors, a.FullName)
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
			log.Printf("[DATABASE] [Crossref:%s] Failed to insert arXiv paper record: %v", p.PaperID, err)
			return
		}

		stmt, err := arxivTx.PrepareContext(ctx, "INSERT INTO paper_paragraphs (paper_id, paragraph_index, page_number, text) VALUES ($1, $2, $3, $4);")
		if err != nil {
			arxivTx.Rollback()
			log.Printf("[DATABASE] [Crossref:%s] Failed to prepare paragraphs: %v", p.PaperID, err)
			return
		}
		defer stmt.Close()

		for pIdx, paraText := range paragraphsText {
			if _, err = stmt.ExecContext(ctx, paperID, pIdx, extData.Paragraphs[pIdx].PageNumber, paraText); err != nil {
				arxivTx.Rollback()
				log.Printf("[DATABASE] [Crossref:%s] Failed to insert paragraph %d: %v", p.PaperID, pIdx, err)
				return
			}
		}

		if err := arxivTx.Commit(); err != nil {
			log.Printf("[DATABASE] [Crossref:%s] Failed to commit arXiv paper transaction: %v", p.PaperID, err)
			return
		}

		log.Printf("[DATABASE] [Crossref:%s] Successfully synchronized PDF text to arxiv_papers & paper_paragraphs", p.PaperID)
	}
}

// Extract abstract from the PDF text paragraphs
func extractAbstractFromParagraphs(paragraphs []extractor.Paragraph) string {
	for i, para := range paragraphs {
		cleanText := strings.TrimSpace(para.Text)
		lowerText := strings.ToLower(cleanText)

		if strings.HasPrefix(lowerText, "abstract") {
			res := cleanText[8:]
			res = strings.TrimLeft(res, " \t\r\n:.-—")
			if len(res) > 30 {
				return res
			}
		}

		if i < 3 && len(cleanText) > 200 && len(cleanText) < 2500 {
			if !strings.HasPrefix(lowerText, "arxiv:") && !strings.Contains(lowerText, "licence") {
				return cleanText
			}
		}
	}
	return ""
}
