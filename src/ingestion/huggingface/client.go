package huggingface

import (
	"net/http"
	"time"

	"research_copilot/src/ingestion/extractor"
)

type HuggingFaceClient struct {
	BaseURL    string
	Extractor  *extractor.ExtractorClient
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewHuggingFaceClient() *HuggingFaceClient {
	return &HuggingFaceClient{
		BaseURL:   "https://huggingface.co/api/daily_papers",
		Extractor: extractor.NewExtractorClient("http://localhost:8001/api/v1"),
		Timeout:   30 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}
