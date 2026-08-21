package main

import (
	_ "github.com/joho/godotenv/autoload"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"research_copilot/src/api"
	"research_copilot/src/core"
)

var (
	queryHistory      = make(map[string]time.Time)
	queryHistoryMutex sync.Mutex
	totalQueries      int
	duplicateQueries  int
)

// duplicationMonitorMiddleware monitors incoming search requests for query duplication.
func duplicationMonitorMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only monitor POST search requests
		if r.Method == http.MethodPost && (r.URL.Path == "/api/v1/search/arxiv" || r.URL.Path == "/api/v1/search/huggingface" || r.URL.Path == "/api/v1/search/semanticscholar" || r.URL.Path == "/api/v1/search/kaggle" || r.URL.Path == "/api/v1/search/openalex" || r.URL.Path == "/api/v1/search/crossref") {
			// Read body to extract query
			bodyBytes, err := io.ReadAll(r.Body)
			if err == nil {
				// Restore body so downstream handlers can read it
				r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

				// Decode query field
				var payload struct {
					Query string `json:"query"`
				}
				if err := json.Unmarshal(bodyBytes, &payload); err == nil && payload.Query != "" {
					queryKey := r.URL.Path + ":" + payload.Query

					queryHistoryMutex.Lock()
					totalQueries++
					lastSeen, exists := queryHistory[queryKey]
					isDuplicate := false

					if exists && time.Since(lastSeen) < 30*time.Second {
						duplicateQueries++
						isDuplicate = true
					}
					queryHistory[queryKey] = time.Now()

					// Calculate stats
					dupRate := (float64(duplicateQueries) / float64(totalQueries)) * 100.0
					log.Printf("[MONITOR] Query duplication check: path=%s query='%s' duplicate=%t | total=%d dup=%d rate=%.1f%%",
						r.URL.Path, payload.Query, isDuplicate, totalQueries, duplicateQueries, dupRate)
					queryHistoryMutex.Unlock()
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

// corsMiddleware adds standard CORS headers to all HTTP responses
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		// If OPTIONS preflight request, return immediately
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	core.SetupGlobalLogger()
	log.Println("Initializing Research Copilot server logging...")

	// 1. Initialize core PostgreSQL connection pool
	if err := core.InitDB(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}

	// 2. Register REST router routes
	mux := http.NewServeMux()
	api.RegisterRoutes(mux)

	// Wrap in CORS and duplication monitoring middleware
	handler := duplicationMonitorMiddleware(corsMiddleware(mux))

	port := "8000"
	log.Printf("Starting Research Copilot Go Server on http://0.0.0.0:%s ...", port)
	log.Printf("Interactive OpenAPI docs not natively available in pure Go, use Postman to test endpoints.")

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Go server failed to start: %v", err)
	}
}
