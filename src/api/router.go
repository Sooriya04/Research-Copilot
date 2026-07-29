package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"research_copilot/src/ingestion/arxiv"
	"research_copilot/src/ingestion/huggingface"
)

var arxivClient = arxiv.NewArxivClient()
var hfClient = huggingface.NewHuggingFaceClient()

// RegisterRoutes registers the handlers on the given HTTP ServeMux
func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/health", handleHealth)
	mux.HandleFunc("/api/v1/search/arxiv", handleSearchArxiv)
	mux.HandleFunc("/api/v1/papers/arxiv/", handleGetPaperByID)
	mux.HandleFunc("/api/v1/search/huggingface", handleSearchHuggingFace)
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

