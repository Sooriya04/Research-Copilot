package crossref

import (
	"regexp"
	"strings"
	"time"
)

type CrossrefAuthorAPI struct {
	Given  string `json:"given"`
	Family string `json:"family"`
}

type CrossrefDateAPI struct {
	DateParts [][]int `json:"date-parts"`
}

type CrossrefLinkAPI struct {
	URL         string `json:"URL"`
	ContentType string `json:"content-type"`
}

type CrossrefWorkAPI struct {
	DOI             string              `json:"DOI"`
	Title           []string            `json:"title"`
	Abstract        string              `json:"abstract"`
	Author          []CrossrefAuthorAPI `json:"author"`
	PublishedPrint  *CrossrefDateAPI    `json:"published-print"`
	PublishedOnline *CrossrefDateAPI    `json:"published-online"`
	Created         *CrossrefDateAPI    `json:"created"`
	Link            []CrossrefLinkAPI   `json:"link"`
	IsReferencedBy  int                 `json:"is-referenced-by-count"`
}

type CrossrefMessage struct {
	TotalResults int               `json:"total-results"`
	Items        []CrossrefWorkAPI `json:"items"`
}

type CrossrefAPIResponse struct {
	Status  string          `json:"status"`
	Message CrossrefMessage `json:"message"`
}

type CrossrefAuthor struct {
	GivenName  string `json:"given_name"`
	FamilyName string `json:"family_name"`
	FullName   string `json:"full_name"`
}

type CrossrefPaper struct {
	PaperID       string            `json:"paper_id"` // Stores DOI
	Title         string            `json:"title"`
	Abstract      string            `json:"abstract"`
	Year          *int              `json:"year"`
	CitationCount int               `json:"citation_count"`
	IsOpenAccess  bool              `json:"is_open_access"`
	PDFURL        *string           `json:"pdf_url"`
	PaperURL      *string           `json:"paper_url"`
	PublicationDate *time.Time       `json:"publication_date"`
	Authors       []CrossrefAuthor  `json:"authors"`
}

type CrossrefSearchResult struct {
	Query         string          `json:"query"`
	TotalResults  int             `json:"total_results"`
	ReturnedCount int             `json:"returned_count"`
	Papers        []CrossrefPaper `json:"papers"`
}

// CleanXMLAbstract strips JATS XML tags (e.g. <jats:p>) from abstracts.
func CleanXMLAbstract(text string) string {
	if text == "" {
		return ""
	}
	re := regexp.MustCompile("<[^>]+>")
	cleaned := re.ReplaceAllString(text, " ")
	
	// Collapse multiple spaces
	spaceRe := regexp.MustCompile(`\s+`)
	cleaned = spaceRe.ReplaceAllString(cleaned, " ")
	
	return strings.TrimSpace(cleaned)
}
