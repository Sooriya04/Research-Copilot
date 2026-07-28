package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func handleDownload(req *DownloadRequest) (*DownloadResponse, error) {
	if req.ID == "" || req.PDFURL == "" {
		return nil, fmt.Errorf("missing required fields 'id' or 'pdf_url'")
	}

	tmpDir := os.TempDir()
	localPath := filepath.Join(tmpDir, fmt.Sprintf("%s.pdf", req.ID))

	// Download PDF from arXiv or external provider
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(req.PDFURL)
	if err != nil {
		return nil, fmt.Errorf("failed to execute download request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download endpoint returned status %d", resp.StatusCode)
	}

	out, err := os.Create(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create local file: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to write PDF body: %w", err)
	}

	return &DownloadResponse{
		ID:        req.ID,
		LocalPath: localPath,
	}, nil
}
