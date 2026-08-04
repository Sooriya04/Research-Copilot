package paperswithcode

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

// Search queries Papers With Code papers search API and fetches repositories and benchmark results.
func (c *PWCClient) Search(ctx context.Context, query string, limit int) (*PWCSearchResult, error) {
	reqURL := fmt.Sprintf("%s/papers/?q=%s&items_per_page=%d", c.BaseURL, url.QueryEscape(query), limit)
	log.Printf("[PAPERSWITHCODE] Querying Papers With Code API: %s", reqURL)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0")
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		log.Printf("[PAPERSWITHCODE] ⚠️ API request failed: %v. Falling back to local DB cache.", err)
		return c.searchFallbackDB(ctx, query, limit)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[PAPERSWITHCODE] ⚠️ API returned non-OK status: %d. Falling back to local DB cache.", resp.StatusCode)
		return c.searchFallbackDB(ctx, query, limit)
	}

	var apiResp PWCPapersResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	var detailsList []PWCPaperDetails
	var paperIDs []string

	for _, p := range apiResp.Results {
		if p.ID == "" {
			continue
		}
		paperIDs = append(paperIDs, p.ID)

		// Fetch repositories for this paper
		repos, _ := c.FetchRepositories(ctx, p.ID)

		// Fetch benchmark results for this paper
		results, _ := c.FetchResults(ctx, p.ID)

		detailsList = append(detailsList, PWCPaperDetails{
			Paper:        p,
			Repositories: repos,
			Results:      results,
		})
	}

	// Batch check cache
	existingPapers := make(map[string]bool)
	if len(paperIDs) > 0 {
		rows, err := core.DB.QueryContext(ctx, "SELECT paper_id FROM pwc_papers WHERE paper_id = ANY($1);", pq.Array(paperIDs))
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

	// Trigger ingestion for missing papers
	var missingPapers []PWCPaperDetails
	for _, details := range detailsList {
		if !existingPapers[details.Paper.ID] {
			missingPapers = append(missingPapers, details)
		}
	}

	if len(missingPapers) > 0 {
		log.Printf("[INGESTION] Firing background ingestion for %d Papers With Code papers (non-blocking)", len(missingPapers))
		bgCtx := context.Background()
		go func(items []PWCPaperDetails) {
			var wg sync.WaitGroup
			for _, item := range items {
				wg.Add(1)
				go func(details PWCPaperDetails) {
					defer wg.Done()
					c.ingestPWCPaper(bgCtx, details)
				}(item)
			}
			wg.Wait()
			log.Printf("[INGESTION] Background ingestion completed for %d Papers With Code papers.", len(items))
		}(missingPapers)
	}

	return &PWCSearchResult{
		Query:         query,
		TotalResults:  apiResp.Count,
		ReturnedCount: len(detailsList),
		Papers:        detailsList,
	}, nil
}

func (c *PWCClient) FetchRepositories(ctx context.Context, paperID string) ([]PWCRepository, error) {
	reqURL := fmt.Sprintf("%s/papers/%s/repositories/", c.BaseURL, paperID)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("repos API returned status %d", resp.StatusCode)
	}

	var apiResp PWCRepositoriesResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}

	return apiResp.Results, nil
}

func (c *PWCClient) FetchResults(ctx context.Context, paperID string) ([]PWCResult, error) {
	reqURL := fmt.Sprintf("%s/papers/%s/results/", c.BaseURL, paperID)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("results API returned status %d", resp.StatusCode)
	}

	var apiResp PWCResultsResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}

	return apiResp.Results, nil
}

func (c *PWCClient) searchFallbackDB(ctx context.Context, query string, limit int) (*PWCSearchResult, error) {
	if core.DB == nil {
		return nil, fmt.Errorf("database connection not initialized")
	}

	likeQuery := "%" + query + "%"
	rows, err := core.DB.QueryContext(ctx, `
		SELECT paper_id, title, COALESCE(abstract, ''), tasks
		FROM pwc_papers
		WHERE title ILIKE $1 OR abstract ILIKE $1
		LIMIT $2
	`, likeQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("DB fallback search failed: %w", err)
	}
	defer rows.Close()

	var detailsList []PWCPaperDetails
	for rows.Next() {
		var p PWCPaper
		var tasksJSON string
		err := rows.Scan(&p.ID, &p.Title, &p.Abstract, &tasksJSON)
		if err != nil {
			continue
		}

		// Load repositories
		repoRows, err := core.DB.QueryContext(ctx, "SELECT repo_url, framework, stars, is_official FROM pwc_repositories WHERE paper_id = $1", p.ID)
		var repos []PWCRepository
		if err == nil {
			for repoRows.Next() {
				var r PWCRepository
				if err := repoRows.Scan(&r.URL, &r.Framework, &r.Stars, &r.IsOfficial); err == nil {
					repos = append(repos, r)
				}
			}
			repoRows.Close()
		}

		// Load results
		resRows, err := core.DB.QueryContext(ctx, "SELECT dataset, task, metric, value FROM pwc_results WHERE paper_id = $1", p.ID)
		var results []PWCResult
		if err == nil {
			for resRows.Next() {
				var res PWCResult
				if err := resRows.Scan(&res.Dataset, &res.Task, &res.Metric, &res.Value); err == nil {
					results = append(results, res)
				}
			}
			resRows.Close()
		}

		detailsList = append(detailsList, PWCPaperDetails{
			Paper:        p,
			Repositories: repos,
			Results:      results,
		})
	}

	log.Printf("[PAPERSWITHCODE] ℹ️ DB Fallback search returned %d cached papers for query '%s'", len(detailsList), query)

	return &PWCSearchResult{
		Query:         query,
		TotalResults:  len(detailsList),
		ReturnedCount: len(detailsList),
		Papers:        detailsList,
	}, nil
}
