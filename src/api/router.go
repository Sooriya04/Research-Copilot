package api

import (
	"encoding/json"
	"log"
	"net/http"

	"research_copilot/src/ingestion/arxiv"
	"research_copilot/src/ingestion/crossref"
	"research_copilot/src/ingestion/github"
	"research_copilot/src/ingestion/huggingface"
	"research_copilot/src/ingestion/kaggle"
	"research_copilot/src/ingestion/openalex"
	"research_copilot/src/ingestion/paperswithcode"
	"research_copilot/src/ingestion/semanticscholar"
)

var arxivClient = arxiv.NewArxivClient()
var githubClient = github.NewGithubClient()
var hfClient = huggingface.NewHuggingFaceClient()
var s2Client = semanticscholar.NewS2Client()
var kaggleClient = kaggle.NewKaggleClient()
var openAlexClient = openalex.NewOpenAlexClient()
var crossrefClient = crossref.NewCrossrefClient()
var pwcClient = paperswithcode.NewPWCClient()

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
	mux.HandleFunc("/api/v1/search/paperswithcode", handleSearchPapersWithCode)
	mux.HandleFunc("/api/v1/search/unified", handleSearchUnified)
	mux.HandleFunc("/api/v1/search/sessions", handleGetSearchSessions)
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
