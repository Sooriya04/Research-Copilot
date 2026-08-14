package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
	"research_copilot/src/core"
)

type DiscoverRequest struct {
	PaperID       string   `json:"paper_id"`
	Title         string   `json:"title"`
	ContentType   string   `json:"content_type"`
	FailureReason string   `json:"failure_reason"`
	ExistingURLs  []string `json:"existing_urls"`
}

type RankedSource struct {
	URL        string  `json:"url"`
	SourceType string  `json:"source_type"`
	Rank       int     `json:"rank"`
	Score      float64 `json:"score"`
}

type DiscoverResponse struct {
	PaperID        string        `json:"paper_id"`
	SelectedSource *RankedSource `json:"selected_source"`
}

func getPaperTitle(ctx context.Context, paperID string) string {
	var title string
	err := db.QueryRowContext(ctx, "SELECT title FROM research_papers WHERE id = $1", paperID).Scan(&title)
	if err != nil {
		return ""
	}
	return title
}

func discoverSource(ctx context.Context, job *RepairJob, title string) (*RankedSource, error) {
	reqBody := DiscoverRequest{
		PaperID:       job.PaperID,
		Title:         title,
		ContentType:   job.ContentType,
		FailureReason: job.Reason,
	}
	
	payload, _ := json.Marshal(reqBody)
	
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post("http://localhost:8101/discover-repair-source", "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to call repair agent: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("repair agent returned status %d", resp.StatusCode)
	}
	
	var res DiscoverResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}
	
	return res.SelectedSource, nil
}

func extractContent(sourceURL string, sourceType string, paperID string) (string, error) {
	log.Printf("[WORKER] Scraping from %s using pdf_extractor...", sourceURL)
	
	// 1. Download
	downReq := map[string]string{"id": paperID, "pdf_url": sourceURL}
	body, _ := json.Marshal(downReq)
	client := &http.Client{Timeout: 30 * time.Second}
	
	resp, err := client.Post("http://localhost:8001/api/v1/download", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("download failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("download API returned status %d", resp.StatusCode)
	}
	
	var downRes struct{ LocalPath string `json:"local_path"` }
	if err := json.NewDecoder(resp.Body).Decode(&downRes); err != nil {
		return "", fmt.Errorf("failed to decode download response: %v", err)
	}
	
	// 2. Extract
	extReq := map[string]string{"path": downRes.LocalPath}
	body, _ = json.Marshal(extReq)
	
	resp2, err := client.Post("http://localhost:8001/api/v1/extract", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("extract failed: %v", err)
	}
	defer resp2.Body.Close()
	
	if resp2.StatusCode != 200 {
		return "", fmt.Errorf("extract API returned status %d", resp2.StatusCode)
	}
	
	var extRes struct{ Text string `json:"text"` }
	if err := json.NewDecoder(resp2.Body).Decode(&extRes); err != nil {
		return "", fmt.Errorf("failed to decode extract response: %v", err)
	}
	
	return extRes.Text, nil
}

func generateHash(content string) string {
	h := sha256.New()
	h.Write([]byte(content))
	return hex.EncodeToString(h.Sum(nil))
}

func executePipeline(ctx context.Context, job *RepairJob) error {
	log.Printf("[PIPELINE] Starting pipeline for Job %d (Paper: %s)", job.ID, job.PaperID)
	
	title := getPaperTitle(ctx, job.PaperID)
	if title == "" {
		return completeJob(ctx, job.ID, "FAILED", "Paper not found or no title available")
	}
	
	// 1. Discover Source
	source, err := discoverSource(ctx, job, title)
	if err != nil {
		return completeJob(ctx, job.ID, "QUEUED", fmt.Sprintf("Source discovery failed: %v", err))
	}
	
	if source == nil {
		if job.Attempts >= job.MaxAttempts {
			return completeJob(ctx, job.ID, "FAILED", "No viable sources found after max attempts")
		}
		return completeJob(ctx, job.ID, "QUEUED", "No viable sources found")
	}
	
	// 2. Extract
	content, err := extractContent(source.URL, source.SourceType, job.PaperID)
	if err != nil {
		if job.Attempts >= job.MaxAttempts {
			return completeJob(ctx, job.ID, "FAILED", fmt.Sprintf("Extraction failed: %v", err))
		}
		return completeJob(ctx, job.ID, "QUEUED", fmt.Sprintf("Extraction error: %v", err))
	}
	
	// 3. Validate
	valResult := core.ValidateContent(content, title)
	
	// Record Attempt
	attemptStatus := "REJECTED"
	if valResult.Valid {
		attemptStatus = "ACCEPTED"
	}
	_, _ = db.ExecContext(ctx, `
		INSERT INTO repair_attempts (job_id, source_url, source_type, extraction_method, status, quality_score, error, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`, job.ID, source.URL, source.SourceType, "default_extractor",
		attemptStatus,
		valResult.QualityScore, valResult.Reason)
	
	if !valResult.Valid {
		if job.Attempts >= job.MaxAttempts {
			return completeJob(ctx, job.ID, "FAILED", fmt.Sprintf("Validation failed: %s", valResult.Reason))
		}
		return completeJob(ctx, job.ID, "QUEUED", fmt.Sprintf("Validation failed: %s", valResult.Reason))
	}
	
	// 4. Save Content Version & Make Active
	hash := generateHash(content)
	
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	var versionID int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO paper_content_versions (paper_id, content_type, source_url, source_type, extraction_method, content, content_hash, quality_score, validation_status, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
		ON CONFLICT (paper_id, content_type, content_hash) DO UPDATE SET is_active = true
		RETURNING id
	`, job.PaperID, job.ContentType, source.URL, source.SourceType, "default_extractor", content, hash, valResult.QualityScore, "VALID").Scan(&versionID)
	
	if err != nil {
		return completeJob(ctx, job.ID, "QUEUED", fmt.Sprintf("DB version insertion failed: %v", err))
	}
	
	// 5. Update research_papers status
	statusField := "abstract_status"
	if job.ContentType == "PDF" || job.ContentType == "FULL_TEXT" {
		statusField = "pdf_content_status"
	}
	
	_, err = tx.ExecContext(ctx, fmt.Sprintf(`
		UPDATE research_papers 
		SET %s = 'VALID', last_extraction_at = NOW(), last_validation_at = NOW(), extraction_attempts = extraction_attempts + 1
		WHERE id = $1
	`, statusField), job.PaperID)
	if err != nil {
		return err
	}
	
	// (Paragraph generation would go here)
	
	if err := tx.Commit(); err != nil {
		return err
	}
	
	return completeJob(ctx, job.ID, "COMPLETED", "")
}
