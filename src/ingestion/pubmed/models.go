package pubmed

import "time"

type PubMedAuthor struct {
	LastName string `json:"last_name"`
	ForeName string `json:"fore_name"`
	FullName string `json:"full_name"`
}

type PubMedPaper struct {
	PaperID         string         `json:"paper_id"` // PMID
	PMID            string         `json:"pmid"`
	PMCID           *string        `json:"pmcid,omitempty"`
	DOI             *string        `json:"doi,omitempty"`
	Title           string         `json:"title"`
	Abstract        string         `json:"abstract"`
	Journal         string         `json:"journal"`
	PublicationDate *time.Time     `json:"publication_date,omitempty"`
	Year            int            `json:"year,omitempty"`
	PDFURL          *string        `json:"pdf_url,omitempty"`
	PaperURL        *string        `json:"paper_url,omitempty"`
	IsOpenAccess    bool           `json:"is_open_access"`
	Authors         []PubMedAuthor `json:"authors"`
}

type PubMedSearchResult struct {
	Query      string        `json:"query"`
	TotalCount int           `json:"total_count"`
	Papers     []PubMedPaper `json:"papers"`
}
