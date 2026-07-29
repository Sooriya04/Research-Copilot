package huggingface

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

// FetchDailyPapers fetches daily trending papers from Hugging Face.
// It also checks existing records in PostgreSQL, triggers asynchronous background ingestion for missing ones,
// and merges cached fields for immediate return.
func (c *HuggingFaceClient) FetchDailyPapers(ctx context.Context, date string) (*HFSearchResult, error) {
	reqURL := c.BaseURL
	if date != "" {
		reqURL = fmt.Sprintf("%s?date=%s", c.BaseURL, date)
	}

	log.Printf("[HUGGINGFACE] Querying Hugging Face daily papers API: %s", reqURL)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Hugging Face API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Hugging Face API returned HTTP %d", resp.StatusCode)
	}

	var items []HFResponseItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, fmt.Errorf("failed to decode Hugging Face API response: %w", err)
	}

	var papers []HFPaper
	var paperIDs []string

	for _, item := range items {
		pAPI := item.Paper
		if pAPI.ID == "" {
			continue
		}
		paperIDs = append(paperIDs, pAPI.ID)

		var authors []string
		for _, auth := range pAPI.Authors {
			authors = append(authors, auth.Name)
		}

		// Parse times
		var publishedAt, submittedOnDailyAt *time.Time
		if pAPI.PublishedAt != "" {
			if t, err := time.Parse(time.RFC3339, pAPI.PublishedAt); err == nil {
				publishedAt = &t
			} else if t, err := time.Parse("2006-01-02T15:04:05Z", pAPI.PublishedAt); err == nil {
				publishedAt = &t
			}
		}
		if pAPI.SubmittedOnDailyAt != "" {
			if t, err := time.Parse(time.RFC3339, pAPI.SubmittedOnDailyAt); err == nil {
				submittedOnDailyAt = &t
			} else if t, err := time.Parse("2006-01-02T15:04:05Z", pAPI.SubmittedOnDailyAt); err == nil {
				submittedOnDailyAt = &t
			}
		}

		submittedBy := pAPI.SubmittedOnDailyBy.Fullname
		if submittedBy == "" {
			submittedBy = pAPI.SubmittedOnDailyBy.User
		}

		url := fmt.Sprintf("https://huggingface.co/papers/%s", pAPI.ID)

		paper := HFPaper{
			PaperID:            pAPI.ID,
			Title:              pAPI.Title,
			Summary:            pAPI.Summary,
			PublishedAt:        publishedAt,
			SubmittedOnDailyAt: submittedOnDailyAt,
			SubmittedBy:        &submittedBy,
			Upvotes:            pAPI.Upvotes,
			DiscussionID:       &pAPI.DiscussionID,
			GithubRepo:         pAPI.GithubRepo,
			GithubStars:        pAPI.GithubStars,
			URL:                url,
			Authors:            authors,
		}
		papers = append(papers, paper)
	}

	// 2. Batch check duplicate IDs in PostgreSQL to merge cached data
	existingPapers := make(map[string]*HFPaper)
	if len(paperIDs) > 0 {
		rows, err := core.DB.QueryContext(ctx, "SELECT paper_id, title, summary, ai_summary FROM hf_papers WHERE paper_id = ANY($1);", pq.Array(paperIDs))
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var cachedID, title, summary string
				var aiSummary sql.NullString
				if err := rows.Scan(&cachedID, &title, &summary, &aiSummary); err == nil {
					cachedPaper := &HFPaper{
						PaperID: cachedID,
						Title:   title,
						Summary: summary,
					}
					if aiSummary.Valid {
						cachedPaper.AISummary = &aiSummary.String
					}
					existingPapers[cachedID] = cachedPaper
				}
			}
		}
	}

	log.Printf("[DATABASE] Found %d/%d papers already cached in PostgreSQL database.", len(existingPapers), len(paperIDs))

	// 3. Identify papers that need background ingestion
	var missingPapers []HFPaper
	var rawDocsToSave []HFResponseItem

	for idx, paper := range papers {
		if _, cached := existingPapers[paper.PaperID]; !cached {
			missingPapers = append(missingPapers, paper)
			rawDocsToSave = append(rawDocsToSave, items[idx])
		}
	}

	if len(missingPapers) > 0 {
		log.Printf("[INGESTION] Firing background ingestion for %d Hugging Face papers (non-blocking)", len(missingPapers))

		bgCtx := context.Background()
		go func(papersToIngest []HFPaper, rawDocs []HFResponseItem) {
			for idx, p := range papersToIngest {
				c.ingestHFPaper(bgCtx, p, rawDocs[idx])
			}
			log.Printf("[INGESTION] Background ingestion completed for %d Hugging Face papers.", len(papersToIngest))
		}(missingPapers, rawDocsToSave)
	}

	// 4. Merge only already-cached results into response
	for i, paper := range papers {
		if cached, exists := existingPapers[paper.PaperID]; exists {
			papers[i].AISummary = cached.AISummary
		}
	}

	result := &HFSearchResult{
		Date:          date,
		ReturnedCount: len(papers),
		Papers:        papers,
	}
	return result, nil
}

// Search queries Hugging Face models and datasets by query/topic and limits to topK.
func (c *HuggingFaceClient) Search(ctx context.Context, query string, topK int) (*HFSearchResult, error) {
	if query == "" {
		return c.FetchDailyPapers(ctx, "")
	}

	log.Printf("[HUGGINGFACE] Querying models search for query: '%s' (limit: %d)", query, topK)
	models, err := c.searchModels(ctx, query, topK)
	if err != nil {
		log.Printf("[HUGGINGFACE] Warning: models search failed: %v", err)
	}

	log.Printf("[HUGGINGFACE] Querying datasets search for query: '%s' (limit: %d)", query, topK)
	datasets, err := c.searchDatasets(ctx, query, topK)
	if err != nil {
		log.Printf("[HUGGINGFACE] Warning: datasets search failed: %v", err)
	}

	// Trigger background ingestion (non-blocking DB upserts)
	bgCtx := context.Background()
	go func(mds []HFModel, dts []HFDataset) {
		c.ingestModelsAndDatasets(bgCtx, mds, dts)
	}(models, datasets)

	result := &HFSearchResult{
		Query:         query,
		ReturnedCount: len(models) + len(datasets),
		Models:        models,
		Datasets:      datasets,
	}

	return result, nil
}
