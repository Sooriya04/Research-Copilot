package semanticscholar

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

// Search queries Semantic Scholar papers search API.
// It also checks existing records in PostgreSQL, triggers asynchronous background ingestion for missing ones,
// and returns immediately.
func (c *S2Client) Search(ctx context.Context, query string, limit int) (*S2SearchResult, error) {
	reqURL := fmt.Sprintf("%s/paper/search?query=%s&limit=%d&fields=%s",
		c.BaseURL, url.QueryEscape(query), limit, c.Fields)

	log.Printf("[SEMANTICSCHOLAR] Querying Semantic Scholar API: %s", reqURL)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0")
	if c.APIKey != "" {
		req.Header.Set("x-api-key", c.APIKey)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Semantic Scholar API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("Semantic Scholar Rate Limit Exceeded (429). Add an S2_API_KEY to your .env file")
	}

	if resp.StatusCode != http.StatusOK {
		var errData S2APIResponse
		_ = json.NewDecoder(resp.Body).Decode(&errData)
		errMsg := errData.Message
		if errMsg == "" {
			errMsg = fmt.Sprintf("HTTP Status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("Semantic Scholar API returned error: %s", errMsg)
	}

	var apiResp S2APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	var papers []S2Paper
	var paperIDs []string

	for _, item := range apiResp.Data {
		if item.PaperID == "" {
			continue
		}
		paperIDs = append(paperIDs, item.PaperID)

		var authors []S2Author
		for _, auth := range item.Authors {
			if auth.AuthorID == "" {
				continue
			}
			authors = append(authors, S2Author{AuthorID: auth.AuthorID, Name: auth.Name})
		}

		var pdfURL *string
		if item.OpenAccessPdf != nil && item.OpenAccessPdf.URL != "" {
			pdfURL = &item.OpenAccessPdf.URL
		}

		var pubDate *time.Time
		if item.PublicationDate != "" {
			if t, err := time.Parse("2006-01-02", item.PublicationDate); err == nil {
				pubDate = &t
			}
		}

		papers = append(papers, S2Paper{
			PaperID:                  item.PaperID,
			Title:                    item.Title,
			Abstract:                 item.Abstract,
			Year:                     item.Year,
			CitationCount:            item.CitationCount,
			InfluentialCitationCount: item.InfluentialCitationCount,
			IsOpenAccess:             item.IsOpenAccess,
			PDFURL:                   pdfURL,
			PaperURL:                 &item.URL,
			ReferenceCount:           item.ReferenceCount,
			Venue:                    &item.Venue,
			PublicationDate:          pubDate,
			Authors:                  authors,
		})
	}

	// 2. Batch check database cache
	existingPapers := make(map[string]bool)
	if len(paperIDs) > 0 {
		rows, err := core.DB.QueryContext(ctx, "SELECT paper_id FROM s2_papers WHERE paper_id = ANY($1);", pq.Array(paperIDs))
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

	log.Printf("[DATABASE] Found %d/%d papers already cached in PostgreSQL database.", len(existingPapers), len(paperIDs))

	// 3. Trigger ingestion for missing papers
	var missingPapers []S2Paper
	var rawDocs []S2PaperAPI
	for idx, paper := range papers {
		if !existingPapers[paper.PaperID] {
			missingPapers = append(missingPapers, paper)
			rawDocs = append(rawDocs, apiResp.Data[idx])
		}
	}

	if len(missingPapers) > 0 {
		log.Printf("[INGESTION] Firing background ingestion for %d Semantic Scholar papers (non-blocking)", len(missingPapers))

		bgCtx := context.Background()
		go func(papersToIngest []S2Paper, rawList []S2PaperAPI) {
			var wg sync.WaitGroup
			for idx, p := range papersToIngest {
				wg.Add(1)
				go func(item S2Paper, apiItem S2PaperAPI) {
					defer wg.Done()
					c.ingestS2Paper(bgCtx, item, apiItem)
				}(p, rawList[idx])
			}
			wg.Wait()
			log.Printf("[INGESTION] Background ingestion completed for %d Semantic Scholar papers.", len(papersToIngest))
		}(missingPapers, rawDocs)
	}

	return &S2SearchResult{
		Query:         query,
		TotalResults:  apiResp.Total,
		ReturnedCount: len(papers),
		Papers:        papers,
	}, nil
}
