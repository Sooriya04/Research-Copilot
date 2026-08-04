package paperswithcode

type PWCPaper struct {
	ID        string   `json:"id"`
	ArxivID   *string  `json:"arxiv_id"`
	Title     string   `json:"title"`
	Abstract  string   `json:"abstract"`
	URLPDF    *string  `json:"url_pdf"`
	URLSource *string  `json:"url_source"`
	Published *string  `json:"published"`
	Authors   []string `json:"authors"`
}

type PWCPapersResponse struct {
	Count    int         `json:"count"`
	Next     *string     `json:"next"`
	Previous *string     `json:"previous"`
	Results  []PWCPaper  `json:"results"`
}

type PWCRepository struct {
	URL        string  `json:"url"`
	IsOfficial bool    `json:"is_official"`
	Stars      int     `json:"stars"`
	Framework  string  `json:"framework"`
}

type PWCRepositoriesResponse struct {
	Count    int             `json:"count"`
	Next     *string         `json:"next"`
	Previous *string         `json:"previous"`
	Results  []PWCRepository `json:"results"`
}

type PWCResult struct {
	Dataset string      `json:"dataset"`
	Task    string      `json:"task"`
	Metric  string      `json:"metric"`
	Value   interface{} `json:"value"` // Can be float or string
}

type PWCResultsResponse struct {
	Count    int         `json:"count"`
	Next     *string     `json:"next"`
	Previous *string     `json:"previous"`
	Results  []PWCResult `json:"results"`
}

type PWCPaperDetails struct {
	Paper        PWCPaper
	Repositories []PWCRepository
	Results      []PWCResult
}

type PWCSearchResult struct {
	Query         string
	TotalResults  int
	ReturnedCount int
	Papers        []PWCPaperDetails
}
