package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

// Thread-safe map for download durations
var (
	downloadTimers = make(map[string]time.Duration)
	timersMutex    sync.RWMutex
)

func writeJSONError(w http.ResponseWriter, status int, errMsg string, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorResponse{Error: errMsg, Detail: detail})
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/download", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed", "Use POST")
			return
		}

		var req DownloadRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Invalid JSON Request", err.Error())
			return
		}

		t0 := time.Now()
		resp, err := handleDownload(&req)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Download Failed", err.Error())
			return
		}
		duration := time.Since(t0)

		timersMutex.Lock()
		downloadTimers[req.ID] = duration
		timersMutex.Unlock()

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	mux.HandleFunc("/api/v1/extract", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed", "Use POST")
			return
		}

		var req ExtractRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Invalid JSON Request", err.Error())
			return
		}

		t0 := time.Now()
		resp, err := handleExtract(req.Path)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Extraction Failed", err.Error())
			return
		}
		extractDuration := time.Since(t0)

		id := resp.ID
		timersMutex.Lock()
		downloadDuration := downloadTimers[id]
		delete(downloadTimers, id) // Clean up memory
		timersMutex.Unlock()

		resp.Metadata = ExtractResponseMetadata{
			DownloadMS: downloadDuration.Milliseconds(),
			ExtractMS:  extractDuration.Milliseconds(),
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	port := "8001"
	log.Printf("🚀 Starting stateless Go PDF Extractor service on port %s...", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Go server failed to start: %v", err)
	}
}
