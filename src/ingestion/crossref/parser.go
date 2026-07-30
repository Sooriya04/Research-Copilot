package crossref

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

// Search queries the Crossref works REST API.
// It checks existing cached papers in PostgreSQL, triggers asynchronous background ingestion for missing ones,
// and returns immediately.
func (c *CrossrefClient) Search(ctx context.Context, query string, limit int) (*CrossrefSearchResult, error) {
	reqURL := fmt.Sprintf("%s/works?query=%s&rows=%d", c.BaseURL, url.QueryEscape(query), limit)
	if c.Email != "" {
		reqURL = fmt.Sprintf("%s&mailto=%s", reqURL, url.QueryEscape(c.Email))
	}

	log.Printf("[CROSSREF] Querying Crossref API: %s", reqURL)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", fmt.Sprintf("ResearchCopilot/1.0 (mailto:%s)", c.Email))

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Crossref API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Crossref API returned error code %d", resp.StatusCode)
	}

	var apiResp CrossrefAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	var papers []CrossrefPaper
	var paperDOIs []string

	for _, item := range apiResp.Message.Items {
		if item.DOI == "" {
			continue
		}
		paperDOIs = append(paperDOIs, item.DOI)

		title := ""
		if len(item.Title) > 0 {
			title = item.Title[0]
		}

		var authors []CrossrefAuthor
		for _, auth := range item.Author {
			fullName := strings.TrimSpace(auth.Given + " " + auth.Family)
			if fullName == "" {
				continue
			}
			authors = append(authors, CrossrefAuthor{
				GivenName:  auth.Given,
				FamilyName: auth.Family,
				FullName:   fullName,
			})
		}

		// Extract Year and Date
		var year *int
		var pubDate *time.Time

		// Check published-print, published-online, then created date parts
		var dateParts []int
		if item.PublishedPrint != nil && len(item.PublishedPrint.DateParts) > 0 {
			dateParts = item.PublishedPrint.DateParts[0]
		} else if item.PublishedOnline != nil && len(item.PublishedOnline.DateParts) > 0 {
			dateParts = item.PublishedOnline.DateParts[0]
		} else if item.Created != nil && len(item.Created.DateParts) > 0 {
			dateParts = item.Created.DateParts[0]
		}

		if len(dateParts) > 0 {
			y := dateParts[0]
			year = &y

			m := 1
			d := 1
			if len(dateParts) > 1 {
				m = dateParts[1]
			}
			if len(dateParts) > 2 {
				d = dateParts[2]
			}
			t := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
			pubDate = &t
		}

		// Extract PDF url from links
		var pdfURL *string
		var isOpenAccess bool
		for _, l := range item.Link {
			if strings.Contains(strings.ToLower(l.ContentType), "pdf") || strings.Contains(strings.ToLower(l.URL), ".pdf") {
				pdfURL = &l.URL
				isOpenAccess = true
				break
			}
		}

		paperURL := "https://doi.org/" + item.DOI

		papers = append(papers, CrossrefPaper{
			PaperID:         item.DOI,
			Title:           title,
			Abstract:        CleanXMLAbstract(item.Abstract),
			Year:            year,
			CitationCount:   item.IsReferencedBy,
			IsOpenAccess:    isOpenAccess,
			PDFURL:          pdfURL,
			PaperURL:        &paperURL,
			PublicationDate: pubDate,
			Authors:         authors,
		})
	}

	// 2. Batch check database cache
	existingPapers := make(map[string]bool)
	if len(paperDOIs) > 0 {
		rows, err := core.DB.QueryContext(ctx, "SELECT paper_id FROM crossref_papers WHERE paper_id = ANY($1);", pq.Array(paperDOIs))
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var cachedID string
				if err := rows.Scan(&cachedID); err == nil {
					existingPapers[cachedID] = true
				}
			}
		}
	}

	log.Printf("[DATABASE] Found %d/%d papers already cached in PostgreSQL database.", len(existingPapers), len(paperDOIs))

	// 3. Trigger ingestion for missing papers (sequential loop)
	var missingPapers []CrossrefPaper
	var rawDocs []CrossrefWorkAPI
	for idx, paper := range papers {
		if !existingPapers[paper.PaperID] {
			missingPapers = append(missingPapers, paper)
			rawDocs = append(rawDocs, apiResp.Message.Items[idx])
		}
	}

	if len(missingPapers) > 0 {
		log.Printf("[INGESTION] Firing background ingestion for %d Crossref papers (non-blocking)", len(missingPapers))

		bgCtx := context.Background()
		go func(papersToIngest []CrossrefPaper, rawList []CrossrefWorkAPI) {
			for idx, p := range papersToIngest {
				c.ingestCrossrefPaper(bgCtx, p, rawList[idx])
				if idx < len(papersToIngest)-1 {
					time.Sleep(1200 * time.Millisecond) // Respect polite pool rate limits
				}
			}
			log.Printf("[INGESTION] Background ingestion completed for %d Crossref papers.", len(papersToIngest))
		}(missingPapers, rawDocs)
	}

	return &CrossrefSearchResult{
		Query:         query,
		TotalResults:  apiResp.Message.TotalResults,
		ReturnedCount: len(papers),
		Papers:        papers,
	}, nil
}
