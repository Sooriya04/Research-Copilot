package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

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
