package pubmed

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"research_copilot/src/core"
)

// IngestPubMedSearchResult persists raw payloads to Bronze (raw_pubmed_doc) and structured entities to Silver (pubmed_papers, pubmed_authors)
func IngestPubMedSearchResult(ctx context.Context, db *sql.DB, res *PubMedSearchResult) error {
	if res == nil || len(res.Papers) == 0 {
		return nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start database transaction: %w", err)
	}
	defer tx.Rollback()

	for _, p := range res.Papers {
		// 1. Bronze Layer: Insert raw JSON payload
		rawPayload, _ := json.Marshal(p)
		_, err := tx.ExecContext(ctx, `
			INSERT INTO raw_pubmed_doc (pmid, payload, fetched_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (pmid) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW();
		`, p.PMID, string(rawPayload))
		if err != nil {
			log.Printf("[PUBMED] Warning: failed to insert raw document for PMID %s: %v", p.PMID, err)
		}

		// 2. Silver Layer: Insert structured pubmed_papers row
		var pubDate *time.Time
		if p.Year > 0 {
			t := time.Date(p.Year, 1, 1, 0, 0, 0, 0, time.UTC)
			pubDate = &t
		}

		paperURL := ""
		if p.PaperURL != nil {
			paperURL = *p.PaperURL
		}
		pdfURL := ""
		if p.PDFURL != nil {
			pdfURL = *p.PDFURL
		}
		doi := ""
		if p.DOI != nil {
			doi = *p.DOI
		}
		pmcid := ""
		if p.PMCID != nil {
			pmcid = *p.PMCID
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO pubmed_papers (
				paper_id, pmid, pmcid, doi, title, abstract, journal, 
				publication_date, year, pdf_url, paper_url, is_open_access, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
			ON CONFLICT (paper_id) DO UPDATE SET
				title = EXCLUDED.title,
				abstract = EXCLUDED.abstract,
				journal = EXCLUDED.journal,
				pdf_url = EXCLUDED.pdf_url,
				is_open_access = EXCLUDED.is_open_access;
		`, p.PaperID, p.PMID, pmcid, doi, p.Title, p.Abstract, p.Journal,
			pubDate, p.Year, pdfURL, paperURL, p.IsOpenAccess)

		if err != nil {
			log.Printf("[PUBMED] Error inserting pubmed_papers row for PMID %s: %v", p.PMID, err)
			continue
		}

		// 3. Silver Layer: Insert authors and relational mappings
		for _, a := range p.Authors {
			var authorID int
			err := tx.QueryRowContext(ctx, `
				INSERT INTO pubmed_authors (last_name, fore_name, full_name, created_at)
				VALUES ($1, $2, $3, NOW())
				ON CONFLICT (last_name, fore_name, full_name) DO UPDATE SET full_name = EXCLUDED.full_name
				RETURNING author_id;
			`, a.LastName, a.ForeName, a.FullName).Scan(&authorID)

			if err != nil {
				// Fallback select if returning didn't execute
				_ = tx.QueryRowContext(ctx, `
					SELECT author_id FROM pubmed_authors 
					WHERE last_name = $1 AND fore_name = $2 AND full_name = $3;
				`, a.LastName, a.ForeName, a.FullName).Scan(&authorID)
			}

			if authorID > 0 {
				_, _ = tx.ExecContext(ctx, `
					INSERT INTO pubmed_paper_authors (paper_id, author_id)
					VALUES ($1, $2)
					ON CONFLICT DO NOTHING;
				`, p.PaperID, authorID)
			}
		}

		// 4. Background Sync: Extract PDF text if open-access PDF available
		if p.PDFURL != nil && *p.PDFURL != "" && core.AcquireInFlight("pubmed:"+p.PaperID) {
			go SyncPubMedPDFContent(p.PaperID, *p.PDFURL)
		}
	}

	return tx.Commit()
}

// SyncPubMedPDFContent downloads and parses PDF content in background
func SyncPubMedPDFContent(paperID, pdfURL string) {
	defer core.ReleaseInFlight("pubmed:" + paperID)

	client := NewPubMedClient()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	localPath, err := client.Extractor.Download(ctx, paperID, pdfURL)
	if err != nil {
		return
	}

	res, err := client.Extractor.Extract(ctx, localPath)
	if err != nil || res.Status != "success" || len(res.Paragraphs) == 0 {
		return
	}

	var parts []string
	for _, p := range res.Paragraphs {
		if p.Text != "" {
			parts = append(parts, p.Text)
		}
	}
	fullText := strings.Join(parts, "\n\n")

	if fullText != "" {
		_, _ = core.DB.ExecContext(context.Background(), `
			UPDATE pubmed_papers SET pdf_url = $1 WHERE paper_id = $2;
		`, pdfURL, paperID)
	}
}
