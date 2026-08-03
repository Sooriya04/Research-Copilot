package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func writeJSONError(w http.ResponseWriter, status int, errMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/v1/graph/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy", "service": "omnigraph"})
	})

	mux.HandleFunc("/api/v1/graph/generate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
			return
		}

		var req GraphGenerateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
			return
		}

		log.Printf("[OMNIGRAPH] Generating Knowledge Graph for request_id: '%s', query: '%s', papers count: %d", req.RequestID, req.Query, len(req.Papers))

		kg := BuildKnowledgeGraph(req.Query, req.Papers)

		resp := GraphGenerateResponse{
			RequestID:  req.RequestID,
			NodeCount:  len(kg.Nodes),
			EdgeCount:  len(kg.Edges),
			Graph:      kg,
		}

		log.Printf("[OMNIGRAPH] Knowledge Graph successfully generated (%d nodes, %d edges)", len(kg.Nodes), len(kg.Edges))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	port := "8002"
	log.Printf("Starting OmniGraph Knowledge Graph microservice on port %s...", port)
	handler := corsMiddleware(mux)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("OmniGraph server failed to start: %v", err)
	}
}
