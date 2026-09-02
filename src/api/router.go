package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"research_copilot/src/core"
	"research_copilot/src/ingestion/arxiv"
	"research_copilot/src/ingestion/crossref"
	"research_copilot/src/ingestion/github"
	"research_copilot/src/ingestion/huggingface"
	"research_copilot/src/ingestion/kaggle"
	"research_copilot/src/ingestion/openalex"
	"research_copilot/src/ingestion/paperswithcode"
	"research_copilot/src/ingestion/pubmed"
	"research_copilot/src/ingestion/semanticscholar"
	"research_copilot/src/retrieval"
)

var arxivClient = arxiv.NewArxivClient()
var githubClient = github.NewGithubClient()
var hfClient = huggingface.NewHuggingFaceClient()
var s2Client = semanticscholar.NewS2Client()
var kaggleClient = kaggle.NewKaggleClient()
var openAlexClient = openalex.NewOpenAlexClient()
var crossrefClient = crossref.NewCrossrefClient()
var pwcClient = paperswithcode.NewPWCClient()
var pubmedClient = pubmed.NewPubMedClient()
var hybridEngine = retrieval.NewHybridEngine()

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
	mux.HandleFunc("/api/v1/search/pubmed", handleSearchPubMed)
	mux.HandleFunc("/api/v1/search/unified", handleSearchUnified)
	mux.HandleFunc("/api/v1/retrieval/hybrid", handleHybridRetrieval)
	mux.HandleFunc("/api/v1/search/sessions", handleGetSearchSessions)
	mux.HandleFunc("/api/v1/papers/by-request/", handleGetPapersByRequestID)
	mux.HandleFunc("/api/v1/knowledge-graph", handleGetKnowledgeGraph)

	// Serve static files from public/ directory on root URL
	fs := http.FileServer(http.Dir("./public"))
	mux.Handle("/", fs)
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

func handleGetKnowledgeGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	kgPath := ".ua/knowledge-graph.json"
	data, err := os.ReadFile(kgPath)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Knowledge graph file not found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func handleSearchPubMed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
		return
	}

	if req.Query == "" {
		writeJSONError(w, http.StatusBadRequest, "Missing query parameter")
		return
	}

	if req.TopK <= 0 {
		req.TopK = 5
	}

	res, err := pubmedClient.Search(r.Context(), req.Query, req.TopK)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "PubMed API search failed: "+err.Error())
		return
	}

	if err := pubmed.IngestPubMedSearchResult(r.Context(), core.DB, res); err != nil {
		log.Printf("[API] Failed to ingest PubMed search results into DB: %v", err)
	}

	writeJSONResponse(w, http.StatusOK, res)
}

func handleHybridRetrieval(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method Not Allowed")
		return
	}

	// Proxy request to Python Agentic RAG Retrieval Service (Port 8104)
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), "POST", "http://localhost:8104/retrieval/hybrid", r.Body)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to proxy retrieval request: "+err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "Python Retrieval Service unreachable: "+err.Error())
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}



