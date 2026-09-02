package pubmed

import (
	"net/http"
	"os"
	"time"

	"research_copilot/src/ingestion/extractor"
)

type PubMedClient struct {
	BaseSearchURL string
	BaseFetchURL  string
	APIKey        string
	Extractor     *extractor.ExtractorClient
	Timeout       time.Duration
	HTTPClient    *http.Client
}

func NewPubMedClient() *PubMedClient {
	apiKey := os.Getenv("PUBMED_API_KEY")
	return &PubMedClient{
		BaseSearchURL: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
		BaseFetchURL:  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
		APIKey:        apiKey,
		Extractor:     extractor.NewExtractorClient("http://localhost:8001/api/v1"),
		Timeout:       15 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}
