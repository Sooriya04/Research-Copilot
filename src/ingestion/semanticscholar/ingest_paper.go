package semanticscholar

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"research_copilot/src/core"
)

// ingestS2Paper handles Bronze raw storage and Silver database upserts.
// It also triggers the PDF syncing if open access PDF URL is available.
func (c *S2Client) ingestS2Paper(ctx context.Context, p S2Paper, rawDoc S2PaperAPI) {
	// Deduplicate in-flight ingestion tasks
	lockKey := "semanticscholar:" + p.PaperID
	if !core.AcquireInFlight(lockKey) {
		log.Printf("[INGESTION] [S2:%s] Ingestion already in-flight. Skipping duplicate worker.", p.PaperID)
		return
	}
	defer core.ReleaseInFlight(lockKey)

	// Sanitize string inputs to avoid UTF-8 null bytes
	p.PaperID = strings.ReplaceAll(p.PaperID, "\x00", "")
	p.Title = strings.ReplaceAll(p.Title, "\x00", "")
	p.Abstract = strings.ReplaceAll(p.Abstract, "\x00", "")
	if p.PDFURL != nil {
		cleanPDF := strings.ReplaceAll(*p.PDFURL, "\x00", "")
		p.PDFURL = &cleanPDF
	}
	if p.PaperURL != nil {
		cleanURL := strings.ReplaceAll(*p.PaperURL, "\x00", "")
		p.PaperURL = &cleanURL
	}
	if p.Venue != nil {
		cleanVenue := strings.ReplaceAll(*p.Venue, "\x00", "")
		p.Venue = &cleanVenue
	}
	for idx, author := range p.Authors {
		p.Authors[idx].AuthorID = strings.ReplaceAll(author.AuthorID, "\x00", "")
		p.Authors[idx].Name = strings.ReplaceAll(author.Name, "\x00", "")
	}

	log.Printf("[INGESTION] [S2:%s] Starting ingestion: '%s'", p.PaperID, p.Title)

	// Step 1: Write raw document to raw_s2_documents (Bronze Layer)
	rawJSON, err := json.Marshal(rawDoc)
	if err == nil {
		_, err = core.DB.ExecContext(ctx, `
			INSERT INTO raw_s2_documents (source_id, payload, fetched_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (source_id) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW();
		`, p.PaperID, rawJSON)
		if err != nil {
			log.Printf("[INGESTION] [S2:%s] Failed to write Bronze raw document: %v", p.PaperID, err)
		}
	}

	// Step 2: Write transformed paper metadata to s2_papers (Silver Layer)
	tx, err := core.DB.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[INGESTION] [S2:%s] Failed to start database transaction: %v", p.PaperID, err)
		return
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO s2_papers (
			paper_id, title, abstract, year, citation_count, influential_citation_count,
			is_open_access, pdf_url, paper_url, reference_count, venue, publication_date, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
		ON CONFLICT (paper_id) DO UPDATE SET
			title = EXCLUDED.title,
			abstract = EXCLUDED.abstract,
			year = EXCLUDED.year,
			citation_count = EXCLUDED.citation_count,
			influential_citation_count = EXCLUDED.influential_citation_count,
			is_open_access = EXCLUDED.is_open_access,
			pdf_url = EXCLUDED.pdf_url,
			paper_url = EXCLUDED.paper_url,
			reference_count = EXCLUDED.reference_count,
			venue = EXCLUDED.venue,
			publication_date = EXCLUDED.publication_date;
	`,
		p.PaperID, p.Title, p.Abstract, p.Year, p.CitationCount, p.InfluentialCitationCount,
		p.IsOpenAccess, p.PDFURL, p.PaperURL, p.ReferenceCount, p.Venue, p.PublicationDate,
	)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [S2:%s] Failed to write paper metadata: %v", p.PaperID, err)
		return
	}

	// Step 3: Insert authors and s2_paper_authors mapping
	authorStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO s2_authors (author_id, name, created_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (author_id) DO UPDATE SET name = EXCLUDED.name;
	`)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [S2:%s] Failed to prepare authors statement: %v", p.PaperID, err)
		return
	}
	defer authorStmt.Close()

	mappingStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO s2_paper_authors (paper_id, author_id)
		VALUES ($1, $2)
		ON CONFLICT (paper_id, author_id) DO NOTHING;
	`)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [S2:%s] Failed to prepare mapping statement: %v", p.PaperID, err)
		return
	}
	defer mappingStmt.Close()

	for _, author := range p.Authors {
		if author.AuthorID == "" {
			continue
		}
		if _, err := authorStmt.ExecContext(ctx, author.AuthorID, author.Name); err != nil {
			tx.Rollback()
			log.Printf("[INGESTION] [S2:%s] Failed to upsert author %s: %v", p.PaperID, author.Name, err)
			return
		}
		if _, err := mappingStmt.ExecContext(ctx, p.PaperID, author.AuthorID); err != nil {
			tx.Rollback()
			log.Printf("[INGESTION] [S2:%s] Failed to map author %s: %v", p.PaperID, author.AuthorID, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[INGESTION] [S2:%s] Failed to commit Silver transaction: %v", p.PaperID, err)
		return
	}

	log.Printf("[INGESTION] [S2:%s] Successfully wrote metadata to s2_papers & s2_paper_authors", p.PaperID)

	// Step 4: Co-extract PDF text in the background if it's an Open Access PDF
	if p.PDFURL != nil && *p.PDFURL != "" {
		c.syncOpenAccessPDF(ctx, p)
	}
}
