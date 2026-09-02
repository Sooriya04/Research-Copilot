package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"research_copilot/src/core"
)

type RepairRequest struct {
	PaperID       string   `json:"paper_id"`
	Title         string   `json:"title"`
	ContentType   string   `json:"content_type"`
	FailureReason string   `json:"failure_reason"`
	ExistingURLs  []string `json:"existing_urls"`
	Authors       []string `json:"authors"`
}

type RankedSource struct {
	URL        string  `json:"url"`
	SourceType string  `json:"source_type"`
	Rank       int     `json:"rank"`
	Score      float64 `json:"score"`
}

type RepairResponse struct {
	PaperID        string        `json:"paper_id"`
	SelectedSource *RankedSource `json:"selected_source"`
}

// RepairAgent provides native Go source discovery for repair jobs using multi-source fallbacks.
type RepairAgent struct {
	searxngURL string
	arxivURL   string
	s2URL      string
	httpClient *http.Client
}

func NewRepairAgent() *RepairAgent {
	searxng := os.Getenv("SEARXNG_URL")
	if searxng == "" {
		searxng = "http://localhost:7080"
	}
	return &RepairAgent{
		searxngURL: searxng,
		arxivURL:   "https://export.arxiv.org/api/query",
		s2URL:      "https://api.semanticscholar.org/graph/v1/paper/search",
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func classifyURL(rawURL string) string {
	if strings.Contains(rawURL, "arxiv.org") {
		return "arxiv"
	} else if strings.Contains(rawURL, "github.com") {
		return "github"
	} else if strings.Contains(rawURL, "acm.org") || strings.Contains(rawURL, "ieee.org") ||
		strings.Contains(rawURL, "springer.com") || strings.Contains(rawURL, "nature.com") ||
		strings.Contains(rawURL, "sciencedirect.com") || strings.Contains(rawURL, "semanticscholar.org") ||
		strings.Contains(rawURL, "aclanthology.org") {
		return "publisher"
	} else if strings.Contains(rawURL, ".edu") {
		return "institutional_repository"
	}
	return "other"
}

func getSourceScore(sourceType string, isPDF bool) float64 {
	score := 10.0
	switch sourceType {
	case "arxiv":
		score = 100.0
	case "publisher":
		score = 90.0
	case "institutional_repository":
		score = 80.0
	case "author_repository":
		score = 70.0
	case "github":
		score = 60.0
	}
	if isPDF {
		score += 5.0
	}
	return score
}

// DiscoverRepairSource executes candidate discovery across SearxNG, arXiv API, and Semantic Scholar.
func (a *RepairAgent) DiscoverRepairSource(ctx context.Context, req RepairRequest) (*RepairResponse, error) {
	core.LogInfo("[REPAIR-AGENT] Repair: paper=%s title='%s' reason=%s", req.PaperID, req.Title, req.FailureReason)
	var candidates []map[string]string

	// 1. SearxNG
	searxCandidates := a.searchSearxNG(ctx, req.Title, req.Authors)
	candidates = append(candidates, searxCandidates...)
	core.LogInfo("[REPAIR-AGENT] SearxNG: %d candidates", len(searxCandidates))

	// 2. arXiv API
	arxivCandidates := a.searchArxivAPI(ctx, req.Title, req.Authors)
	candidates = append(candidates, arxivCandidates...)
	core.LogInfo("[REPAIR-AGENT] arXiv API: %d candidates", len(arxivCandidates))

	// 3. Semantic Scholar API
	s2Candidates := a.searchSemanticScholar(ctx, req.Title)
	candidates = append(candidates, s2Candidates...)
	core.LogInfo("[REPAIR-AGENT] S2: %d candidates", len(s2Candidates))

	// Blacklist and rank
	ranked := a.rankSources(candidates, req.ExistingURLs)

	var top *RankedSource
	if len(ranked) > 0 {
		top = &ranked[0]
		core.LogInfo("[REPAIR-AGENT] Selected: %s (type=%s, score=%.1f)", top.URL, top.SourceType, top.Score)
	} else {
		core.LogWarn("[REPAIR-AGENT] No sources found for paper %s", req.PaperID)
	}

	return &RepairResponse{
		PaperID:        req.PaperID,
		SelectedSource: top,
	}, nil
}

func (a *RepairAgent) searchSearxNG(ctx context.Context, title string, authors []string) []map[string]string {
	query := title
	if len(authors) > 0 {
		query += " " + authors[0]
	}
	query += " pdf"

	reqURL := fmt.Sprintf("%s/search?q=%s&format=json&categories=science", a.searxngURL, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "ResearchCopilot/2.0")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if !strings.Contains(resp.Header.Get("Content-Type"), "json") {
		return nil
	}

	var data struct {
		Results []struct {
			URL string `json:"url"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	var candidates []map[string]string
	for i, r := range data.Results {
		if i >= 6 {
			break
		}
		if r.URL != "" {
			candidates = append(candidates, map[string]string{
				"url":  r.URL,
				"type": classifyURL(r.URL),
			})
		}
	}
	return candidates
}

func (a *RepairAgent) searchArxivAPI(ctx context.Context, title string, authors []string) []map[string]string {
	queryParts := []string{fmt.Sprintf("ti:\"%s\"", title)}
	if len(authors) > 0 {
		parts := strings.Fields(authors[0])
		if len(parts) > 0 {
			queryParts = append(queryParts, fmt.Sprintf("au:%s", parts[len(parts)-1]))
		}
	}
	q := strings.Join(queryParts, " AND ")
	reqURL := fmt.Sprintf("%s?search_query=%s&max_results=3&sortBy=relevance", a.arxivURL, url.QueryEscape(q))

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "ResearchCopilot/2.0")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var buf bytes.Buffer
	buf.ReadFrom(resp.Body)
	xmlStr := buf.String()

	var candidates []map[string]string
	// Extract direct PDF links from arXiv atom feed
	for _, line := range strings.Split(xmlStr, "\n") {
		if strings.Contains(line, "title=\"pdf\"") || (strings.Contains(line, "href=") && strings.Contains(line, "/pdf/")) {
			if idx := strings.Index(line, "href=\""); idx != -1 {
				sub := line[idx+6:]
				if endIdx := strings.Index(sub, "\""); endIdx != -1 {
					pdfURL := sub[:endIdx]
					candidates = append(candidates, map[string]string{
						"url":  pdfURL,
						"type": "arxiv",
					})
				}
			}
		}
	}
	return candidates
}

func (a *RepairAgent) searchSemanticScholar(ctx context.Context, title string) []map[string]string {
	reqURL := fmt.Sprintf("%s?query=%s&fields=openAccessPdf,title&limit=3", a.s2URL, url.QueryEscape(title))
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "ResearchCopilot/2.0")
	if key := os.Getenv("S2_API_KEY"); key != "" {
		req.Header.Set("x-api-key", key)
	}

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		Data []struct {
			OpenAccessPdf *struct {
				URL string `json:"url"`
			} `json:"openAccessPdf"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	var candidates []map[string]string
	for _, item := range data.Data {
		if item.OpenAccessPdf != nil && item.OpenAccessPdf.URL != "" {
			candidates = append(candidates, map[string]string{
				"url":  item.OpenAccessPdf.URL,
				"type": classifyURL(item.OpenAccessPdf.URL),
			})
		}
	}
	return candidates
}

func (a *RepairAgent) rankSources(candidates []map[string]string, blacklist []string) []RankedSource {
	seen := make(map[string]bool)
	for _, bURL := range blacklist {
		bURL = strings.TrimSpace(bURL)
		if bURL != "" {
			bURL = strings.ReplaceAll(bURL, "arxiv.org/abs/", "arxiv.org/pdf/")
			seen[bURL] = true
		}
	}

	var ranked []RankedSource
	for _, c := range candidates {
		u := strings.TrimSpace(c["url"])
		if u == "" {
			continue
		}
		u = strings.ReplaceAll(u, "arxiv.org/abs/", "arxiv.org/pdf/")
		if seen[u] {
			continue
		}
		seen[u] = true

		stype := c["type"]
		if stype == "" {
			stype = "other"
		}
		isPDF := strings.HasSuffix(strings.ToLower(u), ".pdf")
		score := getSourceScore(stype, isPDF)

		ranked = append(ranked, RankedSource{
			URL:        u,
			SourceType: stype,
			Score:      score,
		})
	}

	// Simple bubble sort descending by score
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].Score > ranked[i].Score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}

	for i := range ranked {
		ranked[i].Rank = i + 1
	}

	return ranked
}

// StartRepairAgentServer starts a HTTP server on port 8101 serving /discover-repair-source
func StartRepairAgentServer(port int) {
	agent := NewRepairAgent()
	http.HandleFunc("/discover-repair-source", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		var req RepairRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		res, err := agent.DiscoverRepairSource(r.Context(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "version": "2.0.0-go"})
	})

	core.LogInfo("[REPAIR-AGENT] Native Go Repair Agent running on port %d...", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), nil); err != nil {
		core.LogError("[REPAIR-AGENT] Server failed: %v", err)
	}
}

// Sentinel monitors for research papers with empty/null content and opportunistically
// repairs them asynchronously without blocking HTTP search requests.
type Sentinel struct {
	db        *sql.DB
	batchSize int

	mu      sync.Mutex
	running bool
}

func NewSentinel(db *sql.DB) *Sentinel {
	return &Sentinel{
		db:        db,
		batchSize: 10,
	}
}

func (s *Sentinel) Trigger() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}()

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		s.runOnce(ctx)
	}()
}

func (s *Sentinel) runOnce(ctx context.Context) {
	emptyPapers, err := s.fetchEmptyPapers(ctx)
	if err != nil {
		core.LogError("[Sentinel] Failed to query empty papers: %v", err)
		return
	}

	if len(emptyPapers) == 0 {
		return
	}

	core.LogInfo("[Sentinel] Found %d paper(s) missing content. Dispatching Sentinel repair...", len(emptyPapers))

	if err := s.repairPapers(ctx, emptyPapers); err != nil {
		core.LogError("[Sentinel] Repair cycle error: %v", err)
	}
}

func (s *Sentinel) fetchEmptyPapers(ctx context.Context) ([]RepairRequest, error) {
	query := `
		SELECT id, title, 
		       CASE WHEN (abstract IS NULL OR abstract = '') THEN 'ABSTRACT' ELSE 'PDF' END as content_type
		FROM research_papers
		WHERE (abstract IS NULL OR abstract = '' OR pdf_url IS NULL OR pdf_url = '')
		LIMIT $1;`

	rows, err := s.db.QueryContext(ctx, query, s.batchSize)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var papers []RepairRequest
	for rows.Next() {
		var p RepairRequest
		if err := rows.Scan(&p.PaperID, &p.Title, &p.ContentType); err != nil {
			continue
		}
		p.FailureReason = "SENTINEL_DIRECT_REPAIR"
		papers = append(papers, p)
	}

	return papers, rows.Err()
}

func (s *Sentinel) repairPapers(ctx context.Context, papers []RepairRequest) error {
	agent := NewRepairAgent()
	repaired := 0

	for _, paper := range papers {
		// Fetch attempted URLs
		var attemptedURLs []string
		rows, err := s.db.QueryContext(ctx, "SELECT source_url FROM repair_attempts WHERE job_id IN (SELECT id FROM content_repair_jobs WHERE paper_id = $1)", paper.PaperID)
		if err == nil {
			for rows.Next() {
				var u string
				if err := rows.Scan(&u); err == nil && u != "" {
					attemptedURLs = append(attemptedURLs, u)
				}
			}
			rows.Close()
		}
		paper.ExistingURLs = attemptedURLs

		res, err := agent.DiscoverRepairSource(ctx, paper)
		if err != nil || res.SelectedSource == nil || res.SelectedSource.URL == "" {
			continue
		}

		sourceURL := res.SelectedSource.URL
		downClient := &http.Client{Timeout: 60 * time.Second}
		downPayload, _ := json.Marshal(map[string]string{"id": paper.PaperID, "pdf_url": sourceURL})

		downResp, err := downClient.Post("http://localhost:8001/api/v1/download", "application/json", bytes.NewReader(downPayload))
		if err != nil || downResp.StatusCode != 200 {
			if downResp != nil {
				downResp.Body.Close()
			}
			continue
		}

		var downRes struct {
			LocalPath string `json:"local_path"`
		}
		json.NewDecoder(downResp.Body).Decode(&downRes)
		downResp.Body.Close()

		if downRes.LocalPath == "" {
			continue
		}

		extClient := &http.Client{Timeout: 60 * time.Second}
		extPayload, _ := json.Marshal(map[string]string{"path": downRes.LocalPath})
		extResp, err := extClient.Post("http://localhost:8001/api/v1/extract", "application/json", bytes.NewReader(extPayload))
		if err != nil || extResp.StatusCode != 200 {
			if extResp != nil {
				extResp.Body.Close()
			}
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
			continue
		}

		var parts []string
		for _, p := range extRes.Paragraphs {
			if p.Text != "" {
				parts = append(parts, p.Text)
			}
		}
		fullContent := strings.Join(parts, "\n\n")

		valResult := core.ValidateContent(fullContent, paper.Title)
		if !valResult.Valid {
			continue
		}

		statusField := "abstract_status"
		if paper.ContentType == "PDF" || paper.ContentType == "FULL_TEXT" {
			statusField = "pdf_content_status"
		}

		query := fmt.Sprintf(`
			UPDATE research_papers 
			SET %s = 'VALID', last_extraction_at = NOW(), last_validation_at = NOW()
			WHERE id = $1;`, statusField)

		if _, err := s.db.ExecContext(ctx, query, paper.PaperID); err == nil {
			repaired++
		}
	}

	core.LogInfo("[Sentinel] Repaired %d/%d paper(s) total.", repaired, len(papers))
	return nil
}
