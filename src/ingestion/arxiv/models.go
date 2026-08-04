package arxiv

type Author struct {
	Name        string  `json:"name"`
	Affiliation *string `json:"affiliation"`
}

type ArxivPaper struct {
	ArxivID         string    `json:"arxiv_id"`
	Title           string    `json:"title"`
	Abstract        string    `json:"abstract"`
	Authors         []Author  `json:"authors"`
	PublishedDate   string    `json:"published_date"`
	UpdatedDate     *string   `json:"updated_date"`
	PDFURL          string    `json:"pdf_url"`
	EntryID         string    `json:"entry_id"`
	PrimaryCategory string    `json:"primary_category"`
	Categories      []string  `json:"categories"`
	DOI             *string   `json:"doi"`
	JournalRef      *string   `json:"journal_ref"`
	Comment         *string   `json:"comment"`
	FullText        *string   `json:"full_text"`
	Paragraphs      []string  `json:"paragraphs"`
}

type ArxivSearchResult struct {
	Query        string       `json:"query"`
	TotalResults int          `json:"total_results"`
	ReturnedCount int         `json:"returned_count"`
	Papers       []ArxivPaper `json:"papers"`
}
