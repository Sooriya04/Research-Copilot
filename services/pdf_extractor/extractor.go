package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/dslipak/pdf"
)

func handleExtract(localPath string) (*ExtractResponse, error) {
	fileInfo, err := os.Stat(localPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	file, err := os.Open(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// PDF Validation (Header check)
	header := make([]byte, 5)
	if _, err := file.Read(header); err != nil {
		return nil, fmt.Errorf("failed to read file header: %w", err)
	}
	if !bytes.Equal(header, []byte("%PDF-")) {
		return nil, fmt.Errorf("invalid PDF format: file header signature mismatch")
	}

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	r, err := pdf.NewReader(file, fileInfo.Size())
	if err != nil {
		return nil, fmt.Errorf("failed to initialize PDF reader: %w", err)
	}

	numPages := r.NumPage()
	var paragraphs []Paragraph
	wordCount := 0
	paragraphIndex := 0

	for pageNum := 1; pageNum <= numPages; pageNum++ {
		page := r.Page(pageNum)
		if page.V.IsNull() {
			continue
		}

		fonts := make(map[string]*pdf.Font)
		plainText, err := page.GetPlainText(fonts)
		if err != nil {
			log.Printf("Warning: failed to extract text from page %d: %v", pageNum, err)
			continue
		}

		// Parse plainText into paragraphs split by double newlines
		rawParagraphs := strings.Split(plainText, "\n\n")
		for _, rawP := range rawParagraphs {
			cleaned := strings.TrimSpace(rawP)
			cleaned = strings.ReplaceAll(cleaned, "\n", " ") // Normalize single newlines to spaces
			cleaned = reNormalizeSpaces(cleaned)

			if len(cleaned) < 5 { // Skip trivial segments
				continue
			}

			// Count words
			words := strings.Fields(cleaned)
			wordCount += len(words)

			paragraphs = append(paragraphs, Paragraph{
				ParagraphIndex: paragraphIndex,
				PageNumber:     pageNum,
				Text:           cleaned,
			})
			paragraphIndex++
		}
	}

	id := strings.TrimSuffix(filepath.Base(localPath), ".pdf")

	return &ExtractResponse{
		ID:         id,
		Status:     "success",
		PageCount:  numPages,
		WordCount:  wordCount,
		Paragraphs: paragraphs,
	}, nil
}

func reNormalizeSpaces(s string) string {
	return strings.Join(strings.Fields(s), " ")
}
