package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func handleGenerateGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req struct {
		RequestID string `json:"request_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid Request Body")
		return
	}

	if req.RequestID == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing request_id parameter")
		return
	}

	log.Printf("[API] Received graph generation request for ID: %s", req.RequestID)

	graph, err := buildGraph(req.RequestID)
	if err != nil {
		log.Printf("[API] ❌ Failed to generate graph: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "Graph generation failed: "+err.Error())
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]interface{}{
		"status":      "success",
		"nodes_count": len(graph.Nodes),
		"edges_count": len(graph.Edges),
	})
}

func writeJSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSONResponse(w, status, map[string]string{"error": message})
}
