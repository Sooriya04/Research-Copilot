package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"
)

type GithubClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewGithubClient() *GithubClient {
	return &GithubClient{
		BaseURL: "https://api.github.com",
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *GithubClient) Search(ctx context.Context, query string, topK int) (*GithubSearchResponse, error) {
	if query == "" {
		return nil, fmt.Errorf("empty query")
	}

	searchURL := fmt.Sprintf("%s/search/repositories?q=%s&sort=stars&order=desc&per_page=%d", c.BaseURL, url.QueryEscape(query), topK)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Research-Copilot")

	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "token "+token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github api request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned status: %s", resp.Status)
	}

	var searchResp GithubSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(searchResp.Items) > topK {
		searchResp.Items = searchResp.Items[:topK]
	}

	return &searchResp, nil
}
