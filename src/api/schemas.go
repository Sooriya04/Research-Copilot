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

type CrossrefSearchRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}

type UnifiedSearchRequest struct {
	Query   string   `json:"query"`
	TopK    int      `json:"top_k"`
	Sources []string `json:"sources,omitempty"`
}

type UnifiedResearchPaper struct {
	ID              string                 `json:"id"`
	RequestID       string                 `json:"request_id"`
	Source          string                 `json:"source"`
	ExternalID      string                 `json:"external_id"`
	Title           string                 `json:"title"`
	Abstract        string                 `json:"abstract"`
	Authors         []string               `json:"authors"`
	URL             string                 `json:"url"`
	PDFURL          string                 `json:"pdf_url"`
	CitationCount   int                    `json:"citation_count"`
	RawMetadata     map[string]interface{} `json:"raw_metadata"`
	CodeRepository  string                 `json:"code_repository,omitempty"`
	Frameworks      []string               `json:"frameworks"`
	Tasks           []string               `json:"tasks"`
	Benchmarks      []map[string]string    `json:"benchmarks"`
	Hyperparameters map[string]interface{} `json:"hyperparameters,omitempty"`
	CreatedAt       string                 `json:"created_at"`
	PDFText         string                 `json:"pdf_text,omitempty"`
}

type UnifiedSearchResponse struct {
	RequestID    string                 `json:"request_id"`
	Query        string                 `json:"query"`
	TotalCount   int                    `json:"total_count"`
	SourceCounts map[string]int         `json:"source_counts"`
	Papers       []UnifiedResearchPaper `json:"papers"`
}





