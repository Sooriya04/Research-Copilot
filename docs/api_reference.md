# API Reference

Interactive Swagger documentation is available at `http://localhost:8000/docs`.

---

## 📡 Key Endpoints

### 1. PaperRank
`POST /api/v1/rank`
- Request:
```json
{
  "query": "mechanistic interpretability sparse autoencoders",
  "limit": 10,
  "expand_citations": 2,
  "full_text_top": 3
}
```
- Response: Returns prioritized list of papers with score breakdowns, methodology checklists, and graph prestige.

### 2. Paper Access Resolver
`GET /api/v1/paper/{identifier}`
- Supports: `10.1038/...` (DOI), `2401.12345` (arXiv), `W2741809807` (OpenAlex), `PMID:1234567`.
- Response: Returns metadata, abstract, and legal open-access download candidates.

### 3. Loop + Graph Execution
`POST /api/v1/graph/run`
- Request:
```json
{
  "query": "scaling laws for neural language models",
  "max_iterations": 3
}
```
- Response: Executes multi-stage graph loop, stores session in SQLite, and returns generated synthesis report and execution step logs.

### 4. Science Workbench
- `GET /api/v1/workbench/projects` — List research projects.
- `POST /api/v1/workbench/projects` — Create a new project.
- `GET /api/v1/workbench/artifacts/{session_id}` — Retrieve session artifacts.

### 5. Chat Streaming
`POST /api/v1/chat/stream`
- Server-Sent Events (SSE) endpoint for token-by-token research assistant responses.
