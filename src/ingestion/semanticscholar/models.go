package semanticscholar

import (
	"time"
)

type S2AuthorAPI struct {
	AuthorID string `json:"authorId"`
	Name     string `json:"name"`
}

type S2OpenAccessPdfAPI struct {
	URL    string `json:"url"`
	Status string `json:"status"`
}

type S2PaperAPI struct {
	PaperID                  string              `json:"paperId"`
	Title                    string              `json:"title"`
	Abstract                 string              `json:"abstract"`
	Authors                  []S2AuthorAPI       `json:"authors"`
	Year                     *int                `json:"year"`
	CitationCount            int                 `json:"citationCount"`
	InfluentialCitationCount int                 `json:"influentialCitationCount"`
	IsOpenAccess             bool                `json:"isOpenAccess"`
	OpenAccessPdf            *S2OpenAccessPdfAPI `json:"openAccessPdf"`
	URL                      string              `json:"url"`
	ReferenceCount           int                 `json:"referenceCount"`
	Venue                    string              `json:"venue"`
	PublicationDate          string              `json:"publicationDate"`
}

type S2APIResponse struct {
	Total   int          `json:"total"`
	Next    int          `json:"next"`
	Data    []S2PaperAPI `json:"data"`
	Message string       `json:"message,omitempty"`
}

type S2Author struct {
	AuthorID string `json:"author_id"`
	Name     string `json:"name"`
}

type S2Paper struct {
	PaperID                  string     `json:"paper_id"`
	Title                    string     `json:"title"`
	Abstract                 string     `json:"abstract"`
	Year                     *int       `json:"year"`
	CitationCount            int        `json:"citation_count"`
	InfluentialCitationCount int        `json:"influential_citation_count"`
	IsOpenAccess             bool       `json:"is_open_access"`
	PDFURL                   *string    `json:"pdf_url"`
	PaperURL                 *string    `json:"paper_url"`
	ReferenceCount           int        `json:"reference_count"`
	Venue                    *string    `json:"venue"`
	PublicationDate          *time.Time `json:"publication_date"`
	Authors                  []S2Author `json:"authors"`
}

type S2SearchResult struct {
	Query         string    `json:"query"`
	TotalResults  int       `json:"total_results"`
	ReturnedCount int       `json:"returned_count"`
	Papers        []S2Paper `json:"papers"`
}
