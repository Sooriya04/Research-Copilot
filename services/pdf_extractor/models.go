package main

type DownloadRequest struct {
	ID     string `json:"id"`
	PDFURL string `json:"pdf_url"`
}

type DownloadResponse struct {
	ID        string `json:"id"`
	LocalPath string `json:"local_path"`
}

type ExtractRequest struct {
	Path string `json:"path"`
}

type Paragraph struct {
	ParagraphIndex int    `json:"paragraph_index"`
	PageNumber     int    `json:"page_number"`
	Text           string `json:"text"`
}

type ExtractResponseMetadata struct {
	DownloadMS int64 `json:"download_ms"`
	ExtractMS  int64 `json:"extract_ms"`
}

type ExtractResponse struct {
	ID         string                  `json:"id"`
	Status     string                  `json:"status"`
	PageCount  int                     `json:"page_count"`
	WordCount  int                     `json:"word_count"`
	Paragraphs []Paragraph             `json:"paragraphs"`
	Metadata   ExtractResponseMetadata `json:"metadata"`
}

type ErrorResponse struct {
	Error  string `json:"error"`
	Detail string `json:"detail,omitempty"`
}
