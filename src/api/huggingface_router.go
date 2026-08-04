package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"research_copilot/src/ingestion/huggingface"
)

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
