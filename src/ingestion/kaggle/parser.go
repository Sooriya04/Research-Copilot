package kaggle

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"
)

// Search queries Kaggle datasets and models in parallel.
func (c *KaggleClient) Search(ctx context.Context, query string, limit int) (*KaggleSearchResult, error) {
	if query == "" {
		return nil, fmt.Errorf("empty search query")
	}

	var datasets []KaggleDatasetAPI
	var models []KaggleModelAPI
	var wg sync.WaitGroup
	var errDatasets, errModels error

	wg.Add(2)
	go func() {
		defer wg.Done()
		datasets, errDatasets = c.searchDatasets(ctx, query, limit)
	}()

	go func() {
		defer wg.Done()
		models, errModels = c.searchModels(ctx, query, limit)
	}()

	wg.Wait()

	if errDatasets != nil {
		log.Printf("[KAGGLE] Warning: datasets search failed: %v", errDatasets)
	}
	if errModels != nil {
		log.Printf("[KAGGLE] Warning: models search failed: %v", errModels)
	}

	// Trigger background ingestion (non-blocking DB upserts)
	bgCtx := context.Background()
	go func(ds []KaggleDatasetAPI, ms []KaggleModelAPI) {
		c.ingestKaggleData(bgCtx, ds, ms)
	}(datasets, models)

	return &KaggleSearchResult{
		Query:         query,
		ReturnedCount: len(datasets) + len(models),
		Datasets:      datasets,
		Models:        models,
	}, nil
}

func (c *KaggleClient) searchDatasets(ctx context.Context, query string, limit int) ([]KaggleDatasetAPI, error) {
	reqURL := fmt.Sprintf("%s/datasets/list?search=%s", c.BaseURL, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	if c.APIToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIToken)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP error %d", resp.StatusCode)
	}

	var results []KaggleDatasetAPI
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

func (c *KaggleClient) searchModels(ctx context.Context, query string, limit int) ([]KaggleModelAPI, error) {
	reqURL := fmt.Sprintf("%s/models/list?search=%s", c.BaseURL, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	if c.APIToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIToken)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP error %d", resp.StatusCode)
	}

	var wrappers struct {
		Models []KaggleModelWrapperAPI `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&wrappers); err != nil {
		return nil, err
	}

	var results []KaggleModelAPI
	for _, w := range wrappers.Models {
		framework := "unknown"
		fineTunable := false
		if len(w.Instances) > 0 {
			framework = w.Instances[0].Framework
			fineTunable = w.Instances[0].FineTunable
		}

		results = append(results, KaggleModelAPI{
			Ref:         w.Ref,
			Title:       w.Title,
			Subtitle:    w.Subtitle,
			Framework:   framework,
			FineTunable: fineTunable,
			VoteCount:   w.VoteCount,
			URL:         w.URL,
			Tags:        w.Tags,
		})
	}

	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}
