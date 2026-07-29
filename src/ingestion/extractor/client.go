package extractor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

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

type ResponseMetadata struct {
	DownloadMS int64 `json:"download_ms"`
	ExtractMS  int64 `json:"extract_ms"`
}

type ExtractResponse struct {
	ID         string           `json:"id"`
	Status     string           `json:"status"`
	PageCount  int              `json:"page_count"`
	WordCount  int              `json:"word_count"`
	Paragraphs []Paragraph      `json:"paragraphs"`
	Metadata   ResponseMetadata `json:"metadata"`
}

type ExtractorClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewExtractorClient(baseURL string) *ExtractorClient {
	return &ExtractorClient{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// Download requests the PDF Extractor microservice to download a PDF file from a URL.
func (c *ExtractorClient) Download(ctx context.Context, id, pdfURL string) (string, error) {
	reqBody, err := json.Marshal(DownloadRequest{ID: id, PDFURL: pdfURL})
	if err != nil {
		return "", fmt.Errorf("failed to marshal download request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/download", c.BaseURL), bytes.NewBuffer(reqBody))
	if err != nil {
		return "", fmt.Errorf("failed to create download request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download service returned status %d", resp.StatusCode)
	}

	var data DownloadResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", fmt.Errorf("failed to decode download response: %w", err)
	}

	return data.LocalPath, nil
}

// Extract requests the PDF Extractor microservice to parse/extract paragraphs and text from a local PDF file.
func (c *ExtractorClient) Extract(ctx context.Context, localPath string) (*ExtractResponse, error) {
	reqBody, err := json.Marshal(ExtractRequest{Path: localPath})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal extract request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/extract", c.BaseURL), bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create extract request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("extract HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("extract service returned status %d", resp.StatusCode)
	}

	var data ExtractResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to decode extract response: %w", err)
	}

	return &data, nil
}
