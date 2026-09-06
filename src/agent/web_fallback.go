package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"github.com/google/uuid"

	"research_copilot/src/core"
)

type WebFallbackRequest struct {
	Query     string `json:"query"`
	MaxPapers int    `json:"max_papers"`
}

type WebFallbackResponse struct {
	Status          string                   `json:"status"`
	Query           string                   `json:"query"`
	Discovered      int                      `json:"discovered"`
	Ingested        int                      `json:"ingested"`
	SkippedExisting int                      `json:"skipped_existing"`
	Failed          int                      `json:"failed"`
	Papers          []map[string]interface{} `json:"papers"`
}

func ExecuteWebFallback(ctx context.Context, db *sql.DB, req WebFallbackRequest) (*WebFallbackResponse, error) {
	agent := NewRepairAgent()
	if req.MaxPapers <= 0 {
		req.MaxPapers = 2
	}

	core.LogInfo("[WebSentinel] Triggered fallback for query: '%s'", req.Query)

	// 1. Search Multiple Sources
	var candidates []map[string]string
	
	searxCandidates := agent.searchSearxNG(ctx, req.Query, nil)
	candidates = append(candidates, searxCandidates...)
	
	arxivCandidates := agent.searchArxivAPI(ctx, req.Query, nil)
	candidates = append(candidates, arxivCandidates...)
	
	s2Candidates := agent.searchSemanticScholar(ctx, req.Query)
	candidates = append(candidates, s2Candidates...)
	
	// 2. Rank Candidates
	ranked := agent.rankSources(candidates, nil)
	
	resp := &WebFallbackResponse{
		Status:     "completed",
		Query:      req.Query,
		Discovered: len(ranked),
		Papers:     []map[string]interface{}{},
	}

	ingested := 0
	skipped := 0
	failed := 0

	for _, src := range ranked {
		if ingested >= req.MaxPapers {
			break
		}
		
		// Dedup check in DB
		var exists int
		err := db.QueryRowContext(ctx, "SELECT 1 FROM research_papers WHERE pdf_url = $1 LIMIT 1", src.URL).Scan(&exists)
		if err == nil {
			core.LogInfo("[WebSentinel] Skipping %s, already exists in DB", src.URL)
			skipped++
			continue
		}

		// Download
		downClient := &http.Client{Timeout: 60 * time.Second}
		paperID := uuid.New().String()
		downPayload, _ := json.Marshal(map[string]string{"id": paperID, "pdf_url": src.URL})
		
		downResp, err := downClient.Post("http://localhost:8001/api/v1/download", "application/json", bytes.NewReader(downPayload))
		if err != nil || downResp.StatusCode != 200 {
			if downResp != nil { downResp.Body.Close() }
			failed++
			continue
		}
		
		var downRes struct { LocalPath string `json:"local_path"` }
		json.NewDecoder(downResp.Body).Decode(&downRes)
		downResp.Body.Close()
		
		if downRes.LocalPath == "" {
			failed++
			continue
		}

		// Extract
		extClient := &http.Client{Timeout: 60 * time.Second}
		extPayload, _ := json.Marshal(map[string]string{"path": downRes.LocalPath})
		extResp, err := extClient.Post("http://localhost:8001/api/v1/extract", "application/json", bytes.NewReader(extPayload))
		if err != nil || extResp.StatusCode != 200 {
			if extResp != nil { extResp.Body.Close() }
			failed++
			continue
		}

		var extRes struct {
			Status     string `json:"status"`
			Paragraphs []struct {
				Text string `json:"text"`
			} `json:"paragraphs"`
		}
		json.NewDecoder(extResp.Body).Decode(&extRes)
		extResp.Body.Close()

		if extRes.Status != "success" || len(extRes.Paragraphs) == 0 {
			failed++
			continue
		}

		var parts []string
		for _, p := range extRes.Paragraphs {
			if p.Text != "" {
				parts = append(parts, p.Text)
			}
		}
		fullContent := strings.Join(parts, "\n\n")

		// Insert pseudo-paper
		title := req.Query + " (Web Discovery)"
		_, err = db.ExecContext(ctx, `
			INSERT INTO research_papers (
				id, request_id, source, external_id, title, pdf_url, full_text, pdf_content_status, created_at
			) VALUES ($1, $2, 'web_search', $3, $4, $5, $6, 'VALID', NOW())
		`, paperID, paperID, paperID, title, src.URL, fullContent)
		
		if err != nil {
			core.LogError("[WebSentinel] Failed to insert pseudo-paper: %v", err)
			failed++
			continue
		}

		// Insert chunks (simple naive chunking for now, Python pipeline will re-chunk or we just use full_text. 
		// Actually, standard ingestion flow requires chunks. Let's just chunk it here, or we can just insert paragraphs).
		for i, p := range extRes.Paragraphs {
			if p.Text != "" {
				db.ExecContext(ctx, `
					INSERT INTO paper_chunks (id, paper_id, chunk_index, content)
					VALUES ($1, $2, $3, $4)
				`, uuid.New().String(), paperID, i, p.Text)
			}
		}

		ingested++
		resp.Papers = append(resp.Papers, map[string]interface{}{
			"paper_id": paperID,
			"title":    title,
			"source":   "web_search",
			"url":      src.URL,
		})
	}

	resp.Ingested = ingested
	resp.SkippedExisting = skipped
	resp.Failed = failed
	
	core.LogInfo("[WebSentinel] Fallback completed. Discovered: %d, Ingested: %d, Skipped: %d, Failed: %d", 
		resp.Discovered, resp.Ingested, resp.SkippedExisting, resp.Failed)

	return resp, nil
}
