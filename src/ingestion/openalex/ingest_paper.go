package openalex

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"research_copilot/src/core"
)

// ingestOpenAlexPaper handles Bronze raw storage and Silver database upserts.
// It also triggers PDF syncing if an open access PDF URL is available.
func (c *OpenAlexClient) ingestOpenAlexPaper(ctx context.Context, p OpenAlexPaper, rawDoc OpenAlexWorkAPI) {
	// Deduplicate in-flight ingestion tasks
	lockKey := "openalex:" + p.PaperID
	if !core.AcquireInFlight(lockKey) {
		log.Printf("[INGESTION] [OpenAlex:%s] Ingestion already in-flight. Skipping duplicate worker.", p.PaperID)
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
	for idx, author := range p.Authors {
		p.Authors[idx].AuthorID = strings.ReplaceAll(author.AuthorID, "\x00", "")
		p.Authors[idx].Name = strings.ReplaceAll(author.Name, "\x00", "")
	}

	// Fallback: If abstract is missing or extremely short, attempt to fetch it from Semantic Scholar via DOI
	if len(p.Abstract) < 10 && rawDoc.DOI != "" {
		doi := strings.TrimPrefix(rawDoc.DOI, "https://doi.org/")
		log.Printf("[INGESTION] [OpenAlex:%s] Abstract is missing. Attempting Semantic Scholar DOI lookup fallback for DOI: %s", p.PaperID, doi)

		s2URL := fmt.Sprintf("https://api.semanticscholar.org/graph/v1/paper/DOI:%s?fields=abstract", url.QueryEscape(doi))
		req, err := http.NewRequestWithContext(ctx, "GET", s2URL, nil)
		if err == nil {
			req.Header.Set("User-Agent", "Mozilla/5.0")
			s2Key := os.Getenv("S2_API_KEY")
			if s2Key != "" {
				req.Header.Set("x-api-key", s2Key)
				log.Printf("[INGESTION] [OpenAlex:%s] Using S2 API Key from environment", p.PaperID)
			}

			resp, err := c.HTTPClient.Do(req)
			if err == nil && (resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusForbidden) {
				resp.Body.Close()
				log.Printf("[INGESTION] [OpenAlex:%s] S2 returned status %d with API Key. Retrying without API Key...", p.PaperID, resp.StatusCode)
				req2, err2 := http.NewRequestWithContext(ctx, "GET", s2URL, nil)
				if err2 == nil {
					req2.Header.Set("User-Agent", "Mozilla/5.0")
					resp, err = c.HTTPClient.Do(req2)
				}
			}

			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var s2Resp struct {
						Abstract string `json:"abstract"`
					}
					if err := json.NewDecoder(resp.Body).Decode(&s2Resp); err == nil && s2Resp.Abstract != "" {
						p.Abstract = strings.ReplaceAll(s2Resp.Abstract, "\x00", "")
						log.Printf("[INGESTION] [OpenAlex:%s] Successfully fetched fallback abstract from Semantic Scholar: %d chars", p.PaperID, len(p.Abstract))
					} else {
						log.Printf("[INGESTION] [OpenAlex:%s] S2 returned OK, but failed to parse abstract payload: %v", p.PaperID, err)
					}
				} else {
					log.Printf("[INGESTION] [OpenAlex:%s] S2 returned non-200 HTTP status: %d", p.PaperID, resp.StatusCode)
				}
			} else {
				log.Printf("[INGESTION] [OpenAlex:%s] S2 HTTP request failed: %v", p.PaperID, err)
			}
		} else {
			log.Printf("[INGESTION] [OpenAlex:%s] Failed to create S2 request: %v", p.PaperID, err)
		}
	}

	log.Printf("[INGESTION] [OpenAlex:%s] Starting ingestion: '%s'", p.PaperID, p.Title)

	// Step 1: Write raw document to raw_openalex_doc (Bronze Layer)
	rawJSON, err := json.Marshal(rawDoc)
	if err == nil {
		_, err = core.DB.ExecContext(ctx, `
			INSERT INTO raw_openalex_doc (source_id, payload, fetched_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (source_id) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW();
		`, p.PaperID, rawJSON)
		if err != nil {
			log.Printf("[INGESTION] [OpenAlex:%s] Failed to write Bronze raw document: %v", p.PaperID, err)
		}
	}

	// Step 2: Write transformed paper metadata to openalex_papers (Silver Layer)
	tx, err := core.DB.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[INGESTION] [OpenAlex:%s] Failed to start database transaction: %v", p.PaperID, err)
		return
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO openalex_papers (
			paper_id, title, abstract, year, citation_count,
			is_open_access, pdf_url, paper_url, publication_date, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (paper_id) DO UPDATE SET
			title = EXCLUDED.title,
			abstract = EXCLUDED.abstract,
			year = EXCLUDED.year,
			citation_count = EXCLUDED.citation_count,
			is_open_access = EXCLUDED.is_open_access,
			pdf_url = EXCLUDED.pdf_url,
			paper_url = EXCLUDED.paper_url,
			publication_date = EXCLUDED.publication_date;
	`,
		p.PaperID, p.Title, p.Abstract, p.Year, p.CitationCount,
		p.IsOpenAccess, p.PDFURL, p.PaperURL, p.PublicationDate,
	)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [OpenAlex:%s] Failed to write paper metadata: %v", p.PaperID, err)
		return
	}

	// Step 3: Insert authors and openalex_paper_authors mapping
	authorStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO openalex_authors (author_id, name, created_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (author_id) DO UPDATE SET name = EXCLUDED.name;
	`)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [OpenAlex:%s] Failed to prepare authors statement: %v", p.PaperID, err)
		return
	}
	defer authorStmt.Close()

	mappingStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO openalex_paper_authors (paper_id, author_id)
		VALUES ($1, $2)
		ON CONFLICT (paper_id, author_id) DO NOTHING;
	`)
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [OpenAlex:%s] Failed to prepare mapping statement: %v", p.PaperID, err)
		return
	}
	defer mappingStmt.Close()

	for _, author := range p.Authors {
		if author.AuthorID == "" {
			continue
		}
		if _, err := authorStmt.ExecContext(ctx, author.AuthorID, author.Name); err != nil {
			tx.Rollback()
			log.Printf("[INGESTION] [OpenAlex:%s] Failed to upsert author %s: %v", p.PaperID, author.Name, err)
			return
		}
		if _, err := mappingStmt.ExecContext(ctx, p.PaperID, author.AuthorID); err != nil {
			tx.Rollback()
			log.Printf("[INGESTION] [OpenAlex:%s] Failed to map author %s: %v", p.PaperID, author.AuthorID, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[INGESTION] [OpenAlex:%s] Failed to commit Silver transaction: %v", p.PaperID, err)
		return
	}

	log.Printf("[INGESTION] [OpenAlex:%s] Successfully wrote metadata to openalex_papers & openalex_paper_authors", p.PaperID)

	// Step 4: Co-extract PDF text in the background if it's an Open Access PDF
	if p.PDFURL != nil && *p.PDFURL != "" {
		c.syncOpenAccessPDF(ctx, p)
	}
}
