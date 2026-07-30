package openalex

import (
	"net/http"
	"os"
	"time"

	"research_copilot/src/ingestion/extractor"
)

type OpenAlexClient struct {
	BaseURL    string
	APIKey     string
	Extractor  *extractor.ExtractorClient
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewOpenAlexClient() *OpenAlexClient {
	apiKey := os.Getenv("OPENALEX_API_KEY")
	return &OpenAlexClient{
		BaseURL:   "https://api.openalex.org",
		APIKey:    apiKey,
		Extractor: extractor.NewExtractorClient("http://localhost:8001/api/v1"),
		Timeout:   15 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}
