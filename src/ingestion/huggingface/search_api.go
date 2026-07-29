package huggingface

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func (c *HuggingFaceClient) searchModels(ctx context.Context, query string, limit int) ([]HFModel, error) {
	reqURL := fmt.Sprintf("%s?search=%s&limit=%d", c.ModelsURL, url.QueryEscape(query), limit)
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
		return nil, fmt.Errorf("HTTP error %d", resp.StatusCode)
	}

	var results []HFModel
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	// Set URL and sanitize inputs
	for idx, model := range results {
		results[idx].URL = fmt.Sprintf("https://huggingface.co/%s", model.ModelID)
		results[idx].ModelID = strings.ReplaceAll(model.ModelID, "\x00", "")
		results[idx].PipelineTag = strings.ReplaceAll(model.PipelineTag, "\x00", "")
		results[idx].LibraryName = strings.ReplaceAll(model.LibraryName, "\x00", "")
		for tIdx, tag := range model.Tags {
			results[idx].Tags[tIdx] = strings.ReplaceAll(tag, "\x00", "")
		}
	}

	return results, nil
}

func (c *HuggingFaceClient) searchDatasets(ctx context.Context, query string, limit int) ([]HFDataset, error) {
	reqURL := fmt.Sprintf("%s?search=%s&limit=%d", c.DatasetsURL, url.QueryEscape(query), limit)
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
		return nil, fmt.Errorf("HTTP error %d", resp.StatusCode)
	}

	var results []HFDataset
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	// Set URL and sanitize inputs
	for idx, dataset := range results {
		results[idx].URL = fmt.Sprintf("https://huggingface.co/datasets/%s", dataset.DatasetID)
		results[idx].DatasetID = strings.ReplaceAll(dataset.DatasetID, "\x00", "")
		results[idx].Author = strings.ReplaceAll(dataset.Author, "\x00", "")
		results[idx].Description = strings.ReplaceAll(dataset.Description, "\x00", "")
		for tIdx, tag := range dataset.Tags {
			results[idx].Tags[tIdx] = strings.ReplaceAll(tag, "\x00", "")
		}
	}

	return results, nil
}
