package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"research_copilot/src/core"
)

const queryExpansionURL = "http://localhost:8100/expand"

type queryExpansionResponse struct {
	Queries []string `json:"queries"`
	Method  string   `json:"method"`
}

func expandQuery(query string) []string {
	payload, _ := json.Marshal(map[string]string{
		"query": query,
	})

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(queryExpansionURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		log.Printf("[EXPANSION] Python expansion server unreachable, using original query only: %v", err)
		return []string{query}
	}
	defer resp.Body.Close()

	var result queryExpansionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[EXPANSION] Failed to decode expansion response, using original query only: %v", err)
		return []string{query}
	}

	finalQueries := []string{query}
	for _, q := range result.Queries {
		q = strings.TrimSpace(q)
		if q != "" && q != query {
			finalQueries = append(finalQueries, q)
		}
	}

	log.Printf("[EXPANSION] Expanded '%s' using %s to: %v", query, result.Method, finalQueries)
	return finalQueries
}


func handleSearchUnified(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req UnifiedSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
		return
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}
	if req.TopK > 50 {
		req.TopK = 50
	}

	requestID := uuid.New().String()
	log.Printf("[API] Starting Unified Multi-Source search. RequestID: %s, Query: '%s'", requestID, req.Query)

	// Save search session
	_, err := core.DB.ExecContext(r.Context(), "INSERT INTO search_sessions (request_id, query) VALUES ($1, $2);", requestID, req.Query)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to start search session: "+err.Error())
		return
	}

	queriesToSearch := expandQuery(req.Query)
	log.Printf("[API] Query expansion generated %d queries to execute.", len(queriesToSearch))

	var wg sync.WaitGroup
	var mu sync.Mutex
	var rawPapers []UnifiedResearchPaper

	// Launch searches in parallel
	sources := []string{"arxiv", "openalex", "semanticscholar", "crossref", "huggingface", "paperswithcode", "github", "pubmed"}
	if len(req.Sources) > 0 {
		var active []string
		reqSet := make(map[string]bool)
		for _, s := range req.Sources {
			reqSet[strings.ToLower(strings.TrimSpace(s))] = true
		}
		for _, s := range sources {
			if reqSet[s] {
				active = append(active, s)
			}
		}
		if len(active) > 0 {
			sources = active
		}
	}
	for _, q := range queriesToSearch {
		for _, source := range sources {
			wg.Add(1)
			go func(src string, searchQuery string) {
				defer wg.Done()
				var srcPapers []UnifiedResearchPaper

				switch src {
				case "pubmed":
					res, err := pubmedClient.Search(r.Context(), searchQuery, req.TopK)
					if err == nil {
						for _, p := range res.Papers {
							var authors []string
							for _, a := range p.Authors {
								authors = append(authors, a.FullName)
							}
							repo := core.ExtractGitHubURL(p.Title, p.Abstract)
							frameworks := core.ExtractFrameworks(p.Title, p.Abstract)
							hparams := extractHyperparameters(p.Abstract)

							pdfURL := ""
							if p.PDFURL != nil {
								pdfURL = *p.PDFURL
							}
							paperURL := ""
							if p.PaperURL != nil {
								paperURL = *p.PaperURL
							}

							srcPapers = append(srcPapers, UnifiedResearchPaper{
								Source:          "pubmed",
								ExternalID:      p.PMID,
								Title:           p.Title,
								Abstract:        p.Abstract,
								Authors:         authors,
								URL:             paperURL,
								PDFURL:          pdfURL,
								CodeRepository:  repo,
								Frameworks:      frameworks,
								Hyperparameters: hparams,
							})
						}
					}
				case "arxiv":
					res, err := arxivClient.Search(r.Context(), searchQuery, req.TopK, 0, "relevance", "descending")
					if err == nil {
						for _, p := range res.Papers {
							var authors []string
							for _, a := range p.Authors {
								authors = append(authors, a.Name)
							}
							// Extract repo and frameworks
							repo := core.ExtractGitHubURL(p.Title, p.Abstract)
							if p.Comment != nil && repo == "" {
								repo = core.ExtractGitHubURL(*p.Comment)
							}
							frameworks := core.ExtractFrameworks(p.Title, p.Abstract)
							hparams := extractHyperparameters(p.Abstract)

							srcPapers = append(srcPapers, UnifiedResearchPaper{
								Source:          "arxiv",
								ExternalID:      p.ArxivID,
								Title:           p.Title,
								Abstract:        p.Abstract,
								Authors:         authors,
								URL:             p.EntryID,
								PDFURL:          p.PDFURL,
								CodeRepository:  repo,
								Frameworks:      frameworks,
								Hyperparameters: hparams,
							})
						}
					}
				case "openalex":
				res, err := openAlexClient.Search(r.Context(), searchQuery, req.TopK)
				if err == nil {
					for _, p := range res.Papers {
						var authors []string
						for _, a := range p.Authors {
							authors = append(authors, a.Name)
						}
						repo := core.ExtractGitHubURL(p.Title, p.Abstract)
						frameworks := core.ExtractFrameworks(p.Title, p.Abstract)
						hparams := extractHyperparameters(p.Abstract)

						srcPapers = append(srcPapers, UnifiedResearchPaper{
							Source:          "openalex",
							ExternalID:      p.PaperID,
							Title:           p.Title,
							Abstract:        p.Abstract,
							Authors:         authors,
							URL:             safeString(p.PaperURL),
							PDFURL:          safeString(p.PDFURL),
							CitationCount:   p.CitationCount,
							Tasks:           p.Tasks,
							CodeRepository:  repo,
							Frameworks:      frameworks,
							Hyperparameters: hparams,
						})
					}
				}
			case "semanticscholar":
				res, err := s2Client.Search(r.Context(), searchQuery, req.TopK)
				if err == nil {
					for _, p := range res.Papers {
						var authors []string
						for _, a := range p.Authors {
							authors = append(authors, a.Name)
						}
						repo := core.ExtractGitHubURL(p.Title, p.Abstract)
						frameworks := core.ExtractFrameworks(p.Title, p.Abstract)
						hparams := extractHyperparameters(p.Abstract)

						srcPapers = append(srcPapers, UnifiedResearchPaper{
							Source:          "semanticscholar",
							ExternalID:      p.PaperID,
							Title:           p.Title,
							Abstract:        p.Abstract,
							Authors:         authors,
							URL:             safeString(p.PaperURL),
							PDFURL:          safeString(p.PDFURL),
							CitationCount:   p.CitationCount,
							Tasks:           p.Tasks,
							CodeRepository:  repo,
							Frameworks:      frameworks,
							Hyperparameters: hparams,
						})
					}
				}
			case "crossref":
				res, err := crossrefClient.Search(r.Context(), searchQuery, req.TopK)
				if err == nil {
					for _, p := range res.Papers {
						var authors []string
						for _, a := range p.Authors {
							authors = append(authors, a.FullName)
						}
						repo := core.ExtractGitHubURL(p.Title, p.Abstract)
						frameworks := core.ExtractFrameworks(p.Title, p.Abstract)
						hparams := extractHyperparameters(p.Abstract)

						srcPapers = append(srcPapers, UnifiedResearchPaper{
							Source:          "crossref",
							ExternalID:      p.PaperID,
							Title:           p.Title,
							Abstract:        p.Abstract,
							Authors:         authors,
							URL:             safeString(p.PaperURL),
							PDFURL:          safeString(p.PDFURL),
							CitationCount:   p.CitationCount,
							CodeRepository:  repo,
							Frameworks:      frameworks,
							Hyperparameters: hparams,
						})
					}
				}
			case "huggingface":
				res, err := hfClient.Search(r.Context(), searchQuery, req.TopK)
				if err == nil {
					for _, p := range res.Papers {
						repo := ""
						if p.GithubRepo != nil {
							repo = "https://github.com/" + *p.GithubRepo
						} else {
							repo = core.ExtractGitHubURL(p.Title, p.Summary)
						}
						frameworks := core.ExtractFrameworks(p.Title, p.Summary)
						hparams := extractHyperparameters(p.Summary)

						srcPapers = append(srcPapers, UnifiedResearchPaper{
							Source:          "huggingface",
							ExternalID:      p.PaperID,
							Title:           p.Title,
							Abstract:        p.Summary,
							Authors:         p.Authors,
							URL:             p.URL,
							CitationCount:   p.Upvotes,
							CodeRepository:  repo,
							Frameworks:      frameworks,
							Hyperparameters: hparams,
						})
					}
				}
			case "paperswithcode":
				res, err := pwcClient.Search(r.Context(), searchQuery, req.TopK)
				if err == nil {
					for _, p := range res.Papers {
						var repos []string
						var frameworks []string
						for _, r := range p.Repositories {
							repos = append(repos, r.URL)
							if r.Framework != "" {
								frameworks = append(frameworks, r.Framework)
							}
						}
						var benchmarks []map[string]string
						for _, b := range p.Results {
							benchmarks = append(benchmarks, map[string]string{
								"dataset": b.Dataset,
								"task":    b.Task,
								"metric":  b.Metric,
								"value":   fmt.Sprintf("%v", b.Value),
							})
						}
						primaryRepo := ""
						if len(repos) > 0 {
							primaryRepo = repos[0]
						}
						hparams := extractHyperparameters(p.Paper.Abstract)

						srcPapers = append(srcPapers, UnifiedResearchPaper{
							Source:          "paperswithcode",
							ExternalID:      p.Paper.ID,
							Title:           p.Paper.Title,
							Abstract:        p.Paper.Abstract,
							Authors:         p.Paper.Authors,
							URL:             safeString(p.Paper.URLSource),
							PDFURL:          safeString(p.Paper.URLPDF),
							CodeRepository:  primaryRepo,
							Frameworks:      frameworks,
							Benchmarks:      benchmarks,
							Hyperparameters: hparams,
						})
					}
				}
			case "github":
				res, err := githubClient.Search(r.Context(), searchQuery, req.TopK)
				if err == nil {
					for _, r := range res.Items {
						var authors []string
						if r.Owner.Login != "" {
							authors = append(authors, r.Owner.Login)
						}
						
						var frameworks []string
						if r.Language != "" {
							frameworks = append(frameworks, r.Language)
						}
						frameworks = append(frameworks, r.Topics...)

						srcPapers = append(srcPapers, UnifiedResearchPaper{
							Source:          "github",
							ExternalID:      fmt.Sprintf("%d", r.ID),
							Title:           r.FullName,
							Abstract:        r.Description,
							Authors:         authors,
							URL:             r.HTMLURL,
							CitationCount:   r.StargazersCount,
							CodeRepository:  r.HTMLURL,
							Frameworks:      frameworks,
						})
					}
				}
			}

			mu.Lock()
			rawPapers = append(rawPapers, srcPapers...)
			mu.Unlock()
		}(source, q)
	}
}

	wg.Wait()

	// Deduplicate papers across sources using normalized title mapping
	mergedPapersMap := make(map[string]UnifiedResearchPaper)
	for _, p := range rawPapers {
		normTitle := normalizeTitle(p.Title)
		if normTitle == "" {
			continue
		}

		existing, ok := mergedPapersMap[normTitle]
		if !ok {
			mergedPapersMap[normTitle] = p
			continue
		}

		if len(p.Abstract) > len(existing.Abstract) {
			existing.Abstract = p.Abstract
		}
		if existing.PDFURL == "" && p.PDFURL != "" {
			existing.PDFURL = p.PDFURL
		}
		if existing.CodeRepository == "" && p.CodeRepository != "" {
			existing.CodeRepository = p.CodeRepository
		}
		existing.Frameworks = uniqueStrings(append(existing.Frameworks, p.Frameworks...))
		existing.Tasks = uniqueStrings(append(existing.Tasks, p.Tasks...))
		existing.Benchmarks = mergeBenchmarks(existing.Benchmarks, p.Benchmarks)
		existing.Hyperparameters = mergeHyperparameters(existing.Hyperparameters, p.Hyperparameters)

		mergedPapersMap[normTitle] = existing
	}

	// Prepare results
	var finalPapers []UnifiedResearchPaper
	for _, p := range mergedPapersMap {
		p.ID = computeSHA256(p.Title)
		p.RequestID = requestID

		// Try to fetch PDF text if the paper exists in our cache from a previous run
		var pdfText string
		err := core.DB.QueryRowContext(r.Context(), "SELECT COALESCE(full_text, '') FROM arxiv_papers WHERE LOWER(title) = LOWER($1) LIMIT 1;", p.Title).Scan(&pdfText)
		if err == nil && pdfText != "" {
			p.PDFText = pdfText
		}

		authorsJSON, _ := json.Marshal(p.Authors)
		frameworksJSON, _ := json.Marshal(p.Frameworks)
		tasksJSON, _ := json.Marshal(p.Tasks)
		benchmarksJSON, _ := json.Marshal(p.Benchmarks)
		hparamsJSON, _ := json.Marshal(p.Hyperparameters)

		_, err = core.DB.ExecContext(context.Background(), `
			INSERT INTO research_papers (
				id, request_id, source, external_id, title, abstract, authors, url, pdf_url, 
				citation_count, code_repository, frameworks, tasks, benchmarks, hyperparameters, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
			ON CONFLICT (id) DO UPDATE SET
				request_id = EXCLUDED.request_id,
				code_repository = EXCLUDED.code_repository,
				frameworks = EXCLUDED.frameworks,
				tasks = EXCLUDED.tasks,
				benchmarks = EXCLUDED.benchmarks,
				hyperparameters = EXCLUDED.hyperparameters;
		`, p.ID, p.RequestID, p.Source, p.ExternalID, p.Title, p.Abstract, string(authorsJSON), p.URL, p.PDFURL,
			p.CitationCount, p.CodeRepository, string(frameworksJSON), string(tasksJSON), string(benchmarksJSON), string(hparamsJSON))
		if err != nil {
			log.Printf("[API] ⚠️ Failed to insert paper '%s' into DB: %v", p.Title, err)
		}

		// Phase 8: Detection Workflow - Trigger Repair Jobs (flood-guard: skip if active job exists)
		abstractVal := core.ValidateContent(p.Abstract, p.Title)
		if !abstractVal.Valid {
			_, err = core.DB.ExecContext(context.Background(), `
				INSERT INTO content_repair_jobs (paper_id, content_type, reason, priority, status, attempts)
				VALUES ($1::VARCHAR(255), 'ABSTRACT', $2, 10, 'QUEUED', 0)
				ON CONFLICT (paper_id, content_type) DO NOTHING;
			`, p.ID, abstractVal.Reason)
			if err != nil {
				log.Printf("[API] ⚠️ Failed to queue abstract repair for paper '%s': %v", p.Title, err)
			}
		}

		if p.PDFURL == "" {
			_, err = core.DB.ExecContext(context.Background(), `
				INSERT INTO content_repair_jobs (paper_id, content_type, reason, priority, status, attempts)
				VALUES ($1::VARCHAR(255), 'PDF', 'CONTENT_NULL', 10, 'QUEUED', 0)
				ON CONFLICT (paper_id, content_type) DO NOTHING;
			`, p.ID)
			if err != nil {
				log.Printf("[API] ⚠️ Failed to queue pdf repair for paper '%s': %v", p.Title, err)
			}
		}

		finalPapers = append(finalPapers, p)
	}

	// Count retrieved items by source
	sourceCounts := make(map[string]int)
	for _, p := range finalPapers {
		sourceCounts[p.Source]++
	}

	response := UnifiedSearchResponse{
		RequestID:    requestID,
		Query:        req.Query,
		TotalCount:   len(finalPapers),
		SourceCounts: sourceCounts,
		Papers:       finalPapers,
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func handleGetSearchSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	rows, err := core.DB.QueryContext(r.Context(), "SELECT request_id, query, created_at FROM search_sessions ORDER BY created_at DESC;")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type Session struct {
		RequestID string `json:"request_id"`
		Query     string `json:"query"`
		CreatedAt string `json:"created_at"`
	}

	var sessions []Session
	for rows.Next() {
		var s Session
		var t time.Time
		if err := rows.Scan(&s.RequestID, &s.Query, &t); err == nil {
			s.CreatedAt = t.Format(time.RFC3339)
			sessions = append(sessions, s)
		}
	}

	writeJSONResponse(w, http.StatusOK, sessions)
}

func handleGetPapersByRequestID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	pathParts := strings.Split(r.URL.Path, "/api/v1/papers/by-request/")
	if len(pathParts) < 2 || pathParts[1] == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing request ID in path")
		return
	}
	reqID := pathParts[1]

	rows, err := core.DB.QueryContext(r.Context(), `
		SELECT id, request_id, source, external_id, title, abstract, authors, url, pdf_url, 
		       citation_count, COALESCE(code_repository, ''), frameworks, tasks, benchmarks, hyperparameters, created_at 
		FROM research_papers 
		WHERE request_id = $1;
	`, reqID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var papers []UnifiedResearchPaper
	for rows.Next() {
		var p UnifiedResearchPaper
		var authsJSON, fworksJSON, tasksJSON, benchJSON, hparamsJSON string
		var t time.Time
		err := rows.Scan(&p.ID, &p.RequestID, &p.Source, &p.ExternalID, &p.Title, &p.Abstract, &authsJSON, &p.URL, &p.PDFURL,
			&p.CitationCount, &p.CodeRepository, &fworksJSON, &tasksJSON, &benchJSON, &hparamsJSON, &t)
		if err != nil {
			continue
		}

		_ = json.Unmarshal([]byte(authsJSON), &p.Authors)
		_ = json.Unmarshal([]byte(fworksJSON), &p.Frameworks)
		_ = json.Unmarshal([]byte(tasksJSON), &p.Tasks)
		_ = json.Unmarshal([]byte(benchJSON), &p.Benchmarks)
		_ = json.Unmarshal([]byte(hparamsJSON), &p.Hyperparameters)
		p.CreatedAt = t.Format(time.RFC3339)

		papers = append(papers, p)
	}

	writeJSONResponse(w, http.StatusOK, papers)
}

