package openalex

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

// Search queries the OpenAlex works API.
// It also checks existing records in PostgreSQL, triggers asynchronous background ingestion for missing ones,
// and returns immediately.
func (c *OpenAlexClient) Search(ctx context.Context, query string, limit int) (*OpenAlexSearchResult, error) {
	reqURL := fmt.Sprintf("%s/works?search=%s&per_page=%d", c.BaseURL, url.QueryEscape(query), limit)
	if c.APIKey != "" {
		reqURL = fmt.Sprintf("%s&api_key=%s", reqURL, c.APIKey)
	}

	log.Printf("[OPENALEX] Querying OpenAlex API: %s", reqURL)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("OpenAlex API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAlex API returned error code %d", resp.StatusCode)
	}

	var apiResp OpenAlexAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	var papers []OpenAlexPaper
	var paperIDs []string

	for _, item := range apiResp.Results {
		if item.ID == "" {
			continue
		}
		// OpenAlex IDs are URLs like "https://openalex.org/W2741809807". Extract only the ID "W2741809807".
		parts := strings.Split(item.ID, "/")
		cleanID := parts[len(parts)-1]
		paperIDs = append(paperIDs, cleanID)

		var authors []OpenAlexAuthor
		for _, authship := range item.Authorships {
			if authship.Author.ID == "" {
				continue
			}
			authParts := strings.Split(authship.Author.ID, "/")
			cleanAuthID := authParts[len(authParts)-1]
			authors = append(authors, OpenAlexAuthor{
				AuthorID: cleanAuthID,
				Name:     authship.Author.DisplayName,
			})
		}

		var pdfURL *string
		var isOpenAccess bool
		if item.OpenAccess != nil {
			isOpenAccess = item.OpenAccess.IsOA
			if item.OpenAccess.OAURL != "" {
				pdfURL = &item.OpenAccess.OAURL
			}
		}

		var pubDate *time.Time
		if item.PublicationDate != "" {
			if t, err := time.Parse("2006-01-02", item.PublicationDate); err == nil {
				pubDate = &t
			}
		}

		paperURL := item.DOI
		if paperURL == "" {
			paperURL = item.ID
		}

		var tasks []string
		for _, concept := range item.Concepts {
			if concept.Level >= 1 {
				tasks = append(tasks, concept.DisplayName)
			}
		}

		papers = append(papers, OpenAlexPaper{
			PaperID:       cleanID,
			Title:         item.Title,
			Abstract:      ReconstructAbstract(item.AbstractInvertedIndex),
			Year:          item.PublicationYear,
			CitationCount: item.CitedByCount,
			IsOpenAccess:  isOpenAccess,
			PDFURL:        pdfURL,
			PaperURL:      &paperURL,
			PublicationDate: pubDate,
			Authors:       authors,
			Tasks:         tasks,
		})
	}

	// 2. Batch check database cache
	existingPapers := make(map[string]bool)
	if len(paperIDs) > 0 {
		rows, err := core.DB.QueryContext(ctx, "SELECT paper_id FROM openalex_papers WHERE paper_id = ANY($1);", pq.Array(paperIDs))
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
	var missingPapers []OpenAlexPaper
	var rawDocs []OpenAlexWorkAPI
	for idx, paper := range papers {
		if !existingPapers[paper.PaperID] {
			missingPapers = append(missingPapers, paper)
			rawDocs = append(rawDocs, apiResp.Results[idx])
		}
	}

	if len(missingPapers) > 0 {
		log.Printf("[INGESTION] Firing background ingestion for %d OpenAlex papers (non-blocking)", len(missingPapers))

		bgCtx := context.Background()
		go func(papersToIngest []OpenAlexPaper, rawList []OpenAlexWorkAPI) {
			for idx, p := range papersToIngest {
				c.ingestOpenAlexPaper(bgCtx, p, rawList[idx])
				if idx < len(papersToIngest)-1 {
					time.Sleep(1200 * time.Millisecond) // Respect rate limits
				}
			}
			log.Printf("[INGESTION] Background ingestion completed for %d OpenAlex papers.", len(papersToIngest))
		}(missingPapers, rawDocs)
	}

	return &OpenAlexSearchResult{
		Query:         query,
		TotalResults:  apiResp.Meta.Count,
		ReturnedCount: len(papers),
		Papers:        papers,
	}, nil
}
