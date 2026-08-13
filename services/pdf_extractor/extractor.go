package main

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/dslipak/pdf"
)

// sanitizeText strips null bytes and normalizes whitespace.
// PostgreSQL UTF-8 rejects 0x00 null bytes; PDF binary streams often embed them.
func sanitizeText(s string) string {
	// Strip null bytes
	s = strings.ReplaceAll(s, "\x00", "")
	// Normalize excessive whitespace
	return strings.TrimSpace(s)
}

// extractWithPopplerPdftotext uses the system pdftotext binary (poppler-utils)
// for high-quality text extraction with correct word spacing.
func extractWithPopplerPdftotext(localPath string) (string, error) {
	cmd := exec.Command("pdftotext", "-layout", localPath, "-")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pdftotext failed: %v | stderr: %s", err, stderr.String())
	}

	return sanitizeText(stdout.String()), nil
}

func handleExtract(localPath string) (*ExtractResponse, error) {
	fileInfo, err := os.Stat(localPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	// Verify PDF signature (%PDF-)
	f, err := os.Open(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file for signature check: %w", err)
	}
	sig := make([]byte, 4)
	_, readErr := f.Read(sig)
	f.Close()

	if readErr != nil {
		return nil, fmt.Errorf("failed to read file signature: %w", readErr)
	}
	if string(sig) != "%PDF" {
		// Clean up the invalid file to save space and prevent future retries of corrupted cache
		_ = os.Remove(localPath)
		return nil, fmt.Errorf("invalid PDF signature: got %q (likely HTML/text error page)", string(sig))
	}

	// Try pdftotext first (best quality, correct word spacing)
	fullText, popplerErr := extractWithPopplerPdftotext(localPath)
	if popplerErr != nil {
		log.Printf("[EXTRACT] pdftotext failed for %s (%v), falling back to Go PDF parser", localPath, popplerErr)
		fullText = ""
	}

	if fullText != "" {
		// pdftotext succeeded: split into paragraphs by double newlines
		log.Printf("[EXTRACT] pdftotext extracted text from %s (%d chars)", localPath, len(fullText))

		rawParagraphs := strings.Split(fullText, "\n\n")
		var paragraphs []Paragraph
		wordCount := 0
		paragraphIndex := 0
		pageNum := 1

		for _, rawP := range rawParagraphs {
			cleaned := sanitizeText(rawP)
			cleaned = strings.ReplaceAll(cleaned, "\n", " ")
			cleaned = reNormalizeSpaces(cleaned)

			// pdftotext uses \f (form feed) as page separator
			if strings.ContainsRune(cleaned, '\f') {
				pageNum++
				cleaned = strings.ReplaceAll(cleaned, "\f", " ")
				cleaned = reNormalizeSpaces(cleaned)
			}

			if len(cleaned) < 5 {
				continue
			}

			words := strings.Fields(cleaned)
			wordCount += len(words)

			paragraphs = append(paragraphs, Paragraph{
				ParagraphIndex: paragraphIndex,
				PageNumber:     pageNum,
				Text:           cleaned,
			})
			paragraphIndex++
		}

		id := strings.TrimSuffix(filepath.Base(localPath), ".pdf")
		return &ExtractResponse{
			ID:         id,
			Status:     "success",
			PageCount:  pageNum,
			WordCount:  wordCount,
			Paragraphs: paragraphs,
		}, nil
	}

	// Fallback: Go dslipak/pdf parser
	log.Printf("[EXTRACT] Using Go PDF parser (fallback) for %s", localPath)

	file, err := os.Open(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

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
			log.Printf("[EXTRACT] failed to extract text from page %d: %v", pageNum, err)
			continue
		}

		rawParagraphs := strings.Split(plainText, "\n\n")
		for _, rawP := range rawParagraphs {
			cleaned := sanitizeText(rawP)
			cleaned = strings.ReplaceAll(cleaned, "\n", " ")
			cleaned = reNormalizeSpaces(cleaned)

			if len(cleaned) < 5 {
				continue
			}

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
