package retrieval

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

type HybridSearchRequest struct {
	RequestID string `json:"request_id"`
	Query     string `json:"query"`
	TopK      int    `json:"top_k"`
	DenseK    int    `json:"dense_k,omitempty"`
	SparseK   int    `json:"sparse_k,omitempty"`
	RRFK      int    `json:"rrf_k,omitempty"`
}

type RetrievalStats struct {
	DenseCandidates  int    `json:"dense_candidates"`
	SparseCandidates int    `json:"sparse_candidates"`
	Fusion           string `json:"fusion"`
}

type HybridSearchResponse struct {
	RequestID string         `json:"request_id"`
	Query     string         `json:"query"`
	Results   []Candidate    `json:"results"`
	Retrieval RetrievalStats `json:"retrieval"`
}

type HybridEngine struct {
	ollamaEmbedURL string
	httpClient     *http.Client
}

func NewHybridEngine() *HybridEngine {
	ollamaURL := os.Getenv("OLLAMA_EMBED_URL")
	if ollamaURL == "" {
		ollamaURL = "http://127.0.0.1:11434/api/embeddings"
	}
	return &HybridEngine{
		ollamaEmbedURL: ollamaURL,
		httpClient:     &http.Client{Timeout: 30 * time.Second},
	}
}

// GenerateQueryEmbedding calls Ollama nomic-embed-text to convert query to 768-dim vector
func (e *HybridEngine) GenerateQueryEmbedding(ctx context.Context, query string) ([]float64, error) {
	if len(query) > 6000 {
		query = query[:6000]
	}
	payload, _ := json.Marshal(map[string]string{
		"model":  "nomic-embed-text:latest",
		"prompt": query,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", e.ollamaEmbedURL, bytes.NewBuffer(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to create embedding request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama embedding HTTP call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama embedding service returned status %d", resp.StatusCode)
	}

	var res struct {
		Embedding []float64 `json:"embedding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("failed to decode embedding response: %w", err)
	}

	if len(res.Embedding) == 0 {
		return nil, fmt.Errorf("empty embedding returned")
	}

	return res.Embedding, nil
}

// SearchDense retrieves candidates using cosine distance over 768-dim embeddings with strict request_id isolation
func (e *HybridEngine) SearchDense(ctx context.Context, reqID string, vec []float64, limit int) ([]Candidate, error) {
	query := `
		SELECT c.id, c.paper_id, c.content, COALESCE(c.section_name, ''), c.word_count, c.token_count,
		       r.title, r.source, r.authors,
		       (
		           SELECT SUM(val)
		           FROM (
		               SELECT (val_a - val_b) * (val_a - val_b) as val
		               FROM unnest(c.embedding, $1::float8[]) WITH ORDINALITY AS t(val_a, ord_a)
		               JOIN unnest($1::float8[]) WITH ORDINALITY AS t2(val_b, ord_b) ON ord_a = ord_b
		           ) diffs
		       ) as distance
		FROM paper_chunks c
		JOIN research_papers r ON c.paper_id = r.id
		WHERE r.request_id = $2
		  AND c.embedding IS NOT NULL
		ORDER BY distance ASC
		LIMIT $3;
	`

	rows, err := core.DB.QueryContext(ctx, query, pq.Array(vec), reqID, limit)
	if err != nil {
		return nil, fmt.Errorf("dense retrieval query failed: %w", err)
	}
	defer rows.Close()

	var candidates []Candidate
	for rows.Next() {
		var c Candidate
		var authorsRaw string
		var dist float64
		if err := rows.Scan(&c.ChunkID, &c.PaperID, &c.Content, &c.SectionName, &c.WordCount, &c.TokenCount,
			&authorsRaw, &dist, &c.DenseScore); err != nil {
			// Scan mapping
			var title, source, authorsJSON string
			if errScan := rows.Scan(&c.ChunkID, &c.PaperID, &c.Content, &c.SectionName, &c.WordCount, &c.TokenCount,
				&title, &source, &authorsJSON, &dist); errScan == nil {
				var authors []string
				_ = json.Unmarshal([]byte(authorsJSON), &authors)
				c.Metadata = map[string]interface{}{
					"title":   title,
					"source":  source,
					"authors": authors,
				}
				// Convert squared euclidean / cosine approximation distance to similarity score
				c.DenseScore = 1.0 / (1.0 + dist)
				candidates = append(candidates, c)
			}
		}
	}

	return candidates, nil
}

// SearchSparse retrieves candidates using PostgreSQL websearch_to_tsquery FTS with strict request_id isolation
func (e *HybridEngine) SearchSparse(ctx context.Context, reqID string, queryText string, limit int) ([]Candidate, error) {
	query := `
		SELECT c.id, c.paper_id, c.content, COALESCE(c.section_name, ''), c.word_count, c.token_count,
		       r.title, r.source, r.authors,
		       ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', $1)) as score
		FROM paper_chunks c
		JOIN research_papers r ON c.paper_id = r.id
		WHERE r.request_id = $2
		  AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', $1)
		ORDER BY score DESC
		LIMIT $3;
	`

	rows, err := core.DB.QueryContext(ctx, query, queryText, reqID, limit)
	if err != nil {
		return nil, fmt.Errorf("sparse retrieval query failed: %w", err)
	}
	defer rows.Close()

	var candidates []Candidate
	for rows.Next() {
		var c Candidate
		var title, source, authorsJSON string
		var score float64
		if err := rows.Scan(&c.ChunkID, &c.PaperID, &c.Content, &c.SectionName, &c.WordCount, &c.TokenCount,
			&title, &source, &authorsJSON, &score); err == nil {
			var authors []string
			_ = json.Unmarshal([]byte(authorsJSON), &authors)
			c.Metadata = map[string]interface{}{
				"title":   title,
				"source":  source,
				"authors": authors,
			}
			c.SparseScore = score
			candidates = append(candidates, c)
		}
	}

	return candidates, nil
}

// ExecuteHybridSearch orchestrates parallel dense/sparse search and RRF fusion
func (e *HybridEngine) ExecuteHybridSearch(ctx context.Context, req HybridSearchRequest) (*HybridSearchResponse, error) {
	if strings.TrimSpace(req.Query) == "" {
		return nil, fmt.Errorf("query cannot be empty")
	}
	if strings.TrimSpace(req.RequestID) == "" {
		return nil, fmt.Errorf("request_id is required")
	}

	if req.TopK <= 0 {
		req.TopK = 10
	}
	if req.TopK > 50 {
		req.TopK = 50
	}
	if req.DenseK <= 0 {
		req.DenseK = 50
	}
	if req.SparseK <= 0 {
		req.SparseK = 50
	}
	if req.RRFK <= 0 {
		req.RRFK = 60
	}

	// 1. Generate query embedding
	vec, err := e.GenerateQueryEmbedding(ctx, req.Query)
	var denseCandidates []Candidate
	var denseErr error

	var wg sync.WaitGroup
	var sparseCandidates []Candidate
	var sparseErr error

	// Run Dense search if embedding succeeded
	if err == nil && len(vec) > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			denseCandidates, denseErr = e.SearchDense(ctx, req.RequestID, vec, req.DenseK)
		}()
	} else {
		core.LogWarn("[RETRIEVAL] Query embedding generation failed or unavailable: %v", err)
	}

	// Run Sparse FTS search concurrently
	wg.Add(1)
	go func() {
		defer wg.Done()
		sparseCandidates, sparseErr = e.SearchSparse(ctx, req.RequestID, req.Query, req.SparseK)
	}()

	wg.Wait()

	if denseErr != nil {
		core.LogWarn("[RETRIEVAL] Dense search error: %v", denseErr)
	}
	if sparseErr != nil {
		core.LogWarn("[RETRIEVAL] Sparse search error: %v", sparseErr)
	}

	// 2. Perform Reciprocal Rank Fusion
	fusedResults := ComputeRRF(denseCandidates, sparseCandidates, req.RRFK, req.TopK)

	if fusedResults == nil {
		fusedResults = []Candidate{}
	}

	return &HybridSearchResponse{
		RequestID: req.RequestID,
		Query:     req.Query,
		Results:   fusedResults,
		Retrieval: RetrievalStats{
			DenseCandidates:  len(denseCandidates),
			SparseCandidates: len(sparseCandidates),
			Fusion:           "rrf",
		},
	}, nil
}
