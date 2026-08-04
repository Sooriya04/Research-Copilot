package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"research_copilot/src/ingestion/arxiv"
)

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
