package semanticscholar

import (
	"net/http"
	"os"
	"time"

	"research_copilot/src/ingestion/extractor"
)

type S2Client struct {
	BaseURL    string
	APIKey     string
	Fields     string
	Extractor  *extractor.ExtractorClient
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewS2Client() *S2Client {
	apiKey := os.Getenv("S2_API_KEY")
	return &S2Client{
		BaseURL:   "https://api.semanticscholar.org/graph/v1",
		APIKey:    apiKey,
		Fields:    "paperId,title,abstract,authors,year,citationCount,influentialCitationCount,isOpenAccess,openAccessPdf,url,referenceCount,venue,publicationDate,s2FieldsOfStudy",
		Extractor: extractor.NewExtractorClient("http://localhost:8001/api/v1"),
		Timeout:   15 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}
