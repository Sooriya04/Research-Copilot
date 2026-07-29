package arxiv

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"research_copilot/src/ingestion/extractor"
)

type ArxivClient struct {
	BaseURLs  []string
	Extractor *extractor.ExtractorClient
	Timeout   time.Duration
	Retries   int
}

func NewArxivClient() *ArxivClient {
	return &ArxivClient{
		BaseURLs: []string{
			"https://export.arxiv.org/api/query",
			"http://export.arxiv.org/api/query",
		},
		Extractor: extractor.NewExtractorClient("http://localhost:8001/api/v1"),
		Timeout:   30 * time.Second,
		Retries:   4,
	}
}

func (c *ArxivClient) cleanText(text string) string {
	cleaned := regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(cleaned)
}

func (c *ArxivClient) extractArxivID(rawID string) string {
	re := regexp.MustCompile(`arxiv\.org/abs/([^/]+)$`)
	matches := re.FindStringSubmatch(rawID)
	if len(matches) > 1 {
		return matches[1]
	}
	parts := strings.Split(rawID, "/")
	return parts[len(parts)-1]
}

func (c *ArxivClient) formatSearchQuery(query string) string {
	words := strings.Fields(query)
	if len(words) == 0 {
		return "all:all"
	}
	phrase := strings.Join(words, "+")
	return fmt.Sprintf("all:%s", phrase)
}
