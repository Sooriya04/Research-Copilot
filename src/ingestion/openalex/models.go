package openalex

import (
	"strings"
	"time"
)

type OpenAlexAuthorAPI struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
}

type OpenAlexAuthorshipAPI struct {
	Author OpenAlexAuthorAPI `json:"author"`
}

type OpenAlexOpenAccessAPI struct {
	IsOA  bool   `json:"is_oa"`
	OAURL string `json:"oa_url"`
}

type OpenAlexWorkAPI struct {
	ID                    string                 `json:"id"`
	Title                 string                 `json:"title"`
	DOI                   string                 `json:"doi"`
	PublicationYear       *int                   `json:"publication_year"`
	PublicationDate       string                 `json:"publication_date"`
	Authorships           []OpenAlexAuthorshipAPI `json:"authorships"`
	CitedByCount          int                    `json:"cited_by_count"`
	OpenAccess            *OpenAlexOpenAccessAPI `json:"open_access"`
	AbstractInvertedIndex map[string][]int       `json:"abstract_inverted_index"`
}

type OpenAlexMeta struct {
	Count int `json:"count"`
}

type OpenAlexAPIResponse struct {
	Meta    OpenAlexMeta      `json:"meta"`
	Results []OpenAlexWorkAPI `json:"results"`
}

type OpenAlexAuthor struct {
	AuthorID string `json:"author_id"`
	Name     string `json:"name"`
}

type OpenAlexPaper struct {
	PaperID       string     `json:"paper_id"`
	Title         string     `json:"title"`
	Abstract      string     `json:"abstract"`
	Year          *int       `json:"year"`
	CitationCount int        `json:"citation_count"`
	IsOpenAccess  bool       `json:"is_open_access"`
	PDFURL        *string    `json:"pdf_url"`
	PaperURL      *string    `json:"paper_url"`
	PublicationDate *time.Time `json:"publication_date"`
	Authors       []OpenAlexAuthor `json:"authors"`
}

type OpenAlexSearchResult struct {
	Query         string          `json:"query"`
	TotalResults  int             `json:"total_results"`
	ReturnedCount int             `json:"returned_count"`
	Papers        []OpenAlexPaper `json:"papers"`
}

// ReconstructAbstract converts the OpenAlex inverted index map back to plain text.
func ReconstructAbstract(index map[string][]int) string {
	if len(index) == 0 {
		return ""
	}

	maxPos := 0
	for _, positions := range index {
		for _, pos := range positions {
			if pos > maxPos {
				maxPos = pos
			}
		}
	}

	abstract := make([]string, maxPos+1)
	for word, positions := range index {
		for _, pos := range positions {
			if pos >= 0 && pos <= maxPos {
				abstract[pos] = word
			}
		}
	}

	return strings.Join(abstract, " ")
}
