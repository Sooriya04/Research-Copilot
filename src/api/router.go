package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"research_copilot/src/core"
	"research_copilot/src/ingestion/arxiv"
	"research_copilot/src/ingestion/crossref"
	"research_copilot/src/ingestion/huggingface"
	"research_copilot/src/ingestion/kaggle"
	"research_copilot/src/ingestion/openalex"
	"research_copilot/src/ingestion/semanticscholar"
)


var arxivClient = arxiv.NewArxivClient()
var hfClient = huggingface.NewHuggingFaceClient()
var s2Client = semanticscholar.NewS2Client()
var kaggleClient = kaggle.NewKaggleClient()
var openAlexClient = openalex.NewOpenAlexClient()
var crossrefClient = crossref.NewCrossrefClient()

// RegisterRoutes registers the handlers on the given HTTP ServeMux
func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/health", handleHealth)
	mux.HandleFunc("/api/v1/search/arxiv", handleSearchArxiv)
	mux.HandleFunc("/api/v1/papers/arxiv/", handleGetPaperByID)
	mux.HandleFunc("/api/v1/search/huggingface", handleSearchHuggingFace)
	mux.HandleFunc("/api/v1/search/semanticscholar", handleSearchSemanticScholar)
	mux.HandleFunc("/api/v1/search/kaggle", handleSearchKaggle)
	mux.HandleFunc("/api/v1/search/openalex", handleSearchOpenAlex)
	mux.HandleFunc("/api/v1/search/crossref", handleSearchCrossref)
	mux.HandleFunc("/api/v1/search/unified", handleSearchUnified)
	mux.HandleFunc("/api/v1/papers/by-request/", handleGetPapersByRequestID)
}


func writeJSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, status int, errMsg string) {
	writeJSONResponse(w, status, map[string]string{"error": errMsg})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}
	log.Println("[API] Health check endpoint queried")
	writeJSONResponse(w, http.StatusOK, HealthResponse{Status: "healthy"})
}

func handleSearchArxiv(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
		return
	}

	if req.TopK == 0 {
		req.TopK = 5
	}
	if req.SortBy == "" {
		req.SortBy = "relevance"
	}
	if req.SortOrder == "" {
		req.SortOrder = "descending"
	}

	log.Printf("[API] Received arXiv search request via HTTP POST. Query: '%s', Top K: %d", req.Query, req.TopK)
	startTime := time.Now()

	results, err := arxivClient.Search(r.Context(), req.Query, req.TopK, 0, req.SortBy, req.SortOrder)
	if err != nil {
		log.Printf("[API] ❌ Exception occurred while searching arXiv: %v", err)
		// Return empty search result rather than crashing
		writeJSONResponse(w, http.StatusOK, arxiv.ArxivSearchResult{
			Query:        req.Query,
			TotalResults: 0,
			Papers:       []arxiv.ArxivPaper{},
		})
		return
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d papers for query '%s' in %v (total matched: %d)",
		results.ReturnedCount, req.Query, duration, results.TotalResults)

	writeJSONResponse(w, http.StatusOK, results)
}

func handleGetPaperByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	// Extract arxiv_id from url path e.g. "/api/v1/papers/arxiv/1706.03762"
	pathParts := strings.Split(r.URL.Path, "/api/v1/papers/arxiv/")
	if len(pathParts) < 2 || pathParts[1] == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing arXiv ID in path")
		return
	}
	arxivID := pathParts[1]

	log.Printf("[API] Received request to fetch paper by ID: '%s'", arxivID)

	results, err := arxivClient.Search(r.Context(), "id:"+arxivID, 1, 0, "relevance", "descending")
	if err != nil || len(results.Papers) == 0 {
		log.Printf("[API] ⚠️ Paper with arXiv ID '%s' not found.", arxivID)
		writeJSONError(w, http.StatusNotFound, "Paper with arXiv ID "+arxivID+" not found.")
		return
	}

	log.Printf("[API] Successfully fetched paper details for ID: '%s'", arxivID)
	writeJSONResponse(w, http.StatusOK, results.Papers[0])
}

func handleSearchHuggingFace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req HuggingFaceSearchRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	var results *huggingface.HFSearchResult
	var err error
	startTime := time.Now()

	if req.Query != "" {
		log.Printf("[API] Received Hugging Face search request. Query: '%s', Top K: %d", req.Query, req.TopK)
		results, err = hfClient.Search(r.Context(), req.Query, req.TopK)
	} else {
		log.Printf("[API] Received Hugging Face daily papers request. Date: '%s'", req.Date)
		results, err = hfClient.FetchDailyPapers(r.Context(), req.Date)
	}

	if err != nil {
		log.Printf("[API] Exception occurred during Hugging Face query: %v", err)
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d Hugging Face results in %v", results.ReturnedCount, duration)
	writeJSONResponse(w, http.StatusOK, results)
}

func handleSearchSemanticScholar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req SemanticScholarSearchRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	log.Printf("[API] Received Semantic Scholar search request. Query: '%s', Top K: %d", req.Query, req.TopK)
	startTime := time.Now()

	results, err := s2Client.Search(r.Context(), req.Query, req.TopK)
	if err != nil {
		log.Printf("[API] Exception occurred during Semantic Scholar search: %v", err)
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d Semantic Scholar results in %v", results.ReturnedCount, duration)
	writeJSONResponse(w, http.StatusOK, results)
}

func handleSearchKaggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req KaggleSearchRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	log.Printf("[API] Received Kaggle search request. Query: '%s', Top K: %d", req.Query, req.TopK)
	startTime := time.Now()

	results, err := kaggleClient.Search(r.Context(), req.Query, req.TopK)
	if err != nil {
		log.Printf("[API] Exception occurred during Kaggle search: %v", err)
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d Kaggle results in %v", results.ReturnedCount, duration)
	writeJSONResponse(w, http.StatusOK, results)
}

func handleSearchOpenAlex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req OpenAlexSearchRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	log.Printf("[API] Received OpenAlex search request. Query: '%s', Top K: %d", req.Query, req.TopK)
	startTime := time.Now()

	results, err := openAlexClient.Search(r.Context(), req.Query, req.TopK)
	if err != nil {
		log.Printf("[API] Exception occurred during OpenAlex search: %v", err)
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d OpenAlex results in %v", results.ReturnedCount, duration)
	writeJSONResponse(w, http.StatusOK, results)
}

func handleSearchCrossref(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req CrossrefSearchRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	log.Printf("[API] Received Crossref search request. Query: '%s', Top K: %d", req.Query, req.TopK)
	startTime := time.Now()

	results, err := crossrefClient.Search(r.Context(), req.Query, req.TopK)
	if err != nil {
		log.Printf("[API] Exception occurred during Crossref search: %v", err)
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d Crossref results in %v", results.ReturnedCount, duration)
	writeJSONResponse(w, http.StatusOK, results)
}

func extractArxivAuthors(authors []arxiv.Author) []string {
	res := make([]string, len(authors))
	for i, a := range authors {
		res[i] = a.Name
	}
	return res
}

func extractOpenAlexAuthors(authors []openalex.OpenAlexAuthor) []string {
	res := make([]string, len(authors))
	for i, a := range authors {
		res[i] = a.Name
	}
	return res
}

func extractS2Authors(authors []semanticscholar.S2Author) []string {
	res := make([]string, len(authors))
	for i, a := range authors {
		res[i] = a.Name
	}
	return res
}

func strVal(s *string) string {
	if s != nil {
		return *s
	}
	return ""
}

func timeStrVal(t *time.Time) string {
	if t != nil {
		return t.Format(time.RFC3339)
	}
	return ""
}

func handleSearchUnified(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req UnifiedSearchRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	requestID := uuid.New().String()
	log.Printf("[API] Received Unified search request. RequestID: '%s', Query: '%s', Top K: %d", requestID, req.Query, req.TopK)
	startTime := time.Now()

	// Insert search session if DB is initialized
	if core.DB != nil {
		_, _ = core.DB.Exec("INSERT INTO search_sessions (request_id, query) VALUES ($1, $2) ON CONFLICT DO NOTHING", requestID, req.Query)
	}

	var unifiedPapers []UnifiedResearchPaper

	// 1. Fetch arXiv
	arxivRes, err := arxivClient.Search(r.Context(), req.Query, req.TopK, 0, "relevance", "descending")
	if err == nil && arxivRes != nil {
		for _, p := range arxivRes.Papers {
			authorNames := extractArxivAuthors(p.Authors)
			authorsJSON, _ := json.Marshal(authorNames)
			up := UnifiedResearchPaper{
				ID:            uuid.New().String(),
				RequestID:     requestID,
				Source:        "arxiv",
				ExternalID:    p.ArxivID,
				Title:         p.Title,
				Abstract:      p.Abstract,
				Authors:       authorNames,
				URL:           p.PDFURL,
				PDFURL:        p.PDFURL,
				PublishedAt:   p.PublishedDate,
				CitationCount: 0,
				RawMetadata:   map[string]interface{}{"journal_ref": strVal(p.JournalRef)},
				CreatedAt:     time.Now().Format(time.RFC3339),
			}
			unifiedPapers = append(unifiedPapers, up)

			if core.DB != nil {
				_, _ = core.DB.Exec(`INSERT INTO research_papers (id, request_id, source, external_id, title, abstract, authors, url, pdf_url, raw_metadata)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
					up.ID, up.RequestID, up.Source, up.ExternalID, up.Title, up.Abstract, string(authorsJSON), up.URL, up.PDFURL, "{}")
			}
		}
	}

	// 2. Fetch OpenAlex
	openAlexRes, err := openAlexClient.Search(r.Context(), req.Query, req.TopK)
	if err == nil && openAlexRes != nil {
		for _, p := range openAlexRes.Papers {
			authorNames := extractOpenAlexAuthors(p.Authors)
			authorsJSON, _ := json.Marshal(authorNames)
			up := UnifiedResearchPaper{
				ID:            uuid.New().String(),
				RequestID:     requestID,
				Source:        "openalex",
				ExternalID:    p.PaperID,
				Title:         p.Title,
				Abstract:      p.Abstract,
				Authors:       authorNames,
				URL:           strVal(p.PaperURL),
				PDFURL:        strVal(p.PDFURL),
				PublishedAt:   timeStrVal(p.PublicationDate),
				CitationCount: p.CitationCount,
				RawMetadata:   map[string]interface{}{"is_open_access": p.IsOpenAccess},
				CreatedAt:     time.Now().Format(time.RFC3339),
			}
			unifiedPapers = append(unifiedPapers, up)

			if core.DB != nil {
				_, _ = core.DB.Exec(`INSERT INTO research_papers (id, request_id, source, external_id, title, abstract, authors, url, pdf_url, citation_count, raw_metadata)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
					up.ID, up.RequestID, up.Source, up.ExternalID, up.Title, up.Abstract, string(authorsJSON), up.URL, up.PDFURL, up.CitationCount, "{}")
			}
		}
	}

	// 3. Fetch Semantic Scholar
	s2Res, err := s2Client.Search(r.Context(), req.Query, req.TopK)
	if err == nil && s2Res != nil {
		for _, p := range s2Res.Papers {
			authorNames := extractS2Authors(p.Authors)
			authorsJSON, _ := json.Marshal(authorNames)
			up := UnifiedResearchPaper{
				ID:            uuid.New().String(),
				RequestID:     requestID,
				Source:        "semanticscholar",
				ExternalID:    p.PaperID,
				Title:         p.Title,
				Abstract:      p.Abstract,
				Authors:       authorNames,
				URL:           strVal(p.PaperURL),
				PDFURL:        strVal(p.PDFURL),
				PublishedAt:   timeStrVal(p.PublicationDate),
				CitationCount: p.CitationCount,
				RawMetadata:   map[string]interface{}{"venue": strVal(p.Venue), "influential_citations": p.InfluentialCitationCount},
				CreatedAt:     time.Now().Format(time.RFC3339),
			}
			unifiedPapers = append(unifiedPapers, up)

			if core.DB != nil {
				_, _ = core.DB.Exec(`INSERT INTO research_papers (id, request_id, source, external_id, title, abstract, authors, url, pdf_url, citation_count, raw_metadata)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
					up.ID, up.RequestID, up.Source, up.ExternalID, up.Title, up.Abstract, string(authorsJSON), up.URL, up.PDFURL, up.CitationCount, "{}")
			}
		}
	}

	duration := time.Since(startTime)
	log.Printf("[API] Successfully fetched %d unified papers across sources for request_id '%s' in %v", len(unifiedPapers), requestID, duration)

	resp := UnifiedSearchResponse{
		RequestID:  requestID,
		Query:      req.Query,
		TotalCount: len(unifiedPapers),
		Papers:     unifiedPapers,
	}

	writeJSONResponse(w, http.StatusOK, resp)
}


func handleGetPapersByRequestID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	pathParts := strings.Split(r.URL.Path, "/api/v1/papers/by-request/")
	if len(pathParts) < 2 || pathParts[1] == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing request_id in path")
		return
	}
	reqID := pathParts[1]

	log.Printf("[API] Querying unified research_papers for request_id: '%s'", reqID)

	var papers []UnifiedResearchPaper

	if core.DB != nil {
		rows, err := core.DB.Query(`SELECT id, request_id, source, external_id, title, COALESCE(abstract, ''), authors, COALESCE(url, ''), COALESCE(pdf_url, ''), citation_count, created_at FROM research_papers WHERE request_id = $1`, reqID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var p UnifiedResearchPaper
				var authorsRaw string
				var createdAt time.Time
				if err := rows.Scan(&p.ID, &p.RequestID, &p.Source, &p.ExternalID, &p.Title, &p.Abstract, &authorsRaw, &p.URL, &p.PDFURL, &p.CitationCount, &createdAt); err == nil {
					_ = json.Unmarshal([]byte(authorsRaw), &p.Authors)
					p.CreatedAt = createdAt.Format(time.RFC3339)
					papers = append(papers, p)
				}
			}
		}
	}

	if papers == nil {
		papers = []UnifiedResearchPaper{}
	}

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"request_id":  reqID,
		"total_count": len(papers),
		"papers":      papers,
	})
}






