package crossref

import (
	"net/http"
	"os"
	"time"

	"research_copilot/src/ingestion/extractor"
)

type CrossrefClient struct {
	BaseURL    string
	Email      string
	Extractor  *extractor.ExtractorClient
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewCrossrefClient() *CrossrefClient {
	email := os.Getenv("CROSSREF_EMAIL")
	return &CrossrefClient{
		BaseURL:   "https://api.crossref.org",
		Email:     email,
		Extractor: extractor.NewExtractorClient("http://localhost:8001/api/v1"),
		Timeout:   15 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}
