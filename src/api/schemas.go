package api

type HealthResponse struct {
	Status string `json:"status"`
}

type SearchRequest struct {
	Query     string `json:"query"`
	TopK      int    `json:"top_k"`
	SortBy    string `json:"sort_by"`
	SortOrder string `json:"sort_order"`
}

type HuggingFaceSearchRequest struct {
	Query string `json:"query"`
	Date  string `json:"date"`
	TopK  int    `json:"top_k"`
}

type SemanticScholarSearchRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}

type KaggleSearchRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}

type OpenAlexSearchRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}




