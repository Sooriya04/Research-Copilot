package main

// GraphNode represents an entity in the Knowledge Graph (Paper, Author, Dataset, Model, Topic)
type GraphNode struct {
	ID         string                 `json:"id"`
	Label      string                 `json:"label"`      // Node name or title
	Type       string                 `json:"type"`       // "paper", "author", "dataset", "model", "topic"
	Attributes map[string]interface{} `json:"attributes"` // Additional metadata
}

// GraphEdge represents a directional relationship between two nodes
type GraphEdge struct {
	ID       string `json:"id"`
	SourceID string `json:"source_id"`
	TargetID string `json:"target_id"`
	Relation string `json:"relation"` // "WRITTEN_BY", "USES_DATASET", "USES_MODEL", "HAS_TOPIC", "CITES"
}

// KnowledgeGraph represents the entire graph structure
type KnowledgeGraph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// PaperInput represents paper data submitted for graph generation
type PaperInput struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Abstract  string   `json:"abstract"`
	Source    string   `json:"source"`
	Authors   []string `json:"authors"`
	Datasets  []string `json:"datasets,omitempty"`
	Models    []string `json:"models,omitempty"`
	Topics    []string `json:"topics,omitempty"`
	Citation  int      `json:"citation_count,omitempty"`
}

// GraphGenerateRequest represents input for graph creation
type GraphGenerateRequest struct {
	Query     string       `json:"query"`
	RequestID string       `json:"request_id"`
	Papers    []PaperInput `json:"papers"`
}

// GraphGenerateResponse represents the generated graph output
type GraphGenerateResponse struct {
	RequestID  string         `json:"request_id"`
	NodeCount  int            `json:"node_count"`
	EdgeCount  int            `json:"edge_count"`
	Graph      KnowledgeGraph `json:"graph"`
}
