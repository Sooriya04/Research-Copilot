package main

type NodeType string

const (
	NodeFile      NodeType = "file"
	NodeFunction  NodeType = "function"
	NodeClass     NodeType = "class"
	NodeModule    NodeType = "module"
	NodeConcept   NodeType = "concept"
	NodeConfig    NodeType = "config"
	NodeDocument  NodeType = "document"
	NodeService   NodeType = "service"
	NodeTable     NodeType = "table"
	NodeEndpoint  NodeType = "endpoint"
	NodePipeline  NodeType = "pipeline"
	NodeSchema    NodeType = "schema"
	NodeResource  NodeType = "resource"
	NodeDomain    NodeType = "domain"
	NodeFlow      NodeType = "flow"
	NodeStep      NodeType = "step"
	NodeArticle   NodeType = "article"
	NodeEntity    NodeType = "entity"
	NodeTopic     NodeType = "topic"
	NodeClaim     NodeType = "claim"
	NodeSource    NodeType = "source"
)

type EdgeType string

const (
	EdgeImports          EdgeType = "imports"
	EdgeExports          EdgeType = "exports"
	EdgeContains         EdgeType = "contains"
	EdgeInherits         EdgeType = "inherits"
	EdgeImplements       EdgeType = "implements"
	EdgeCalls            EdgeType = "calls"
	EdgeSubscribes       EdgeType = "subscribes"
	EdgePublishes        EdgeType = "publishes"
	EdgeMiddleware       EdgeType = "middleware"
	EdgeReadsFrom        EdgeType = "reads_from"
	EdgeWritesTo         EdgeType = "writes_to"
	EdgeTransforms       EdgeType = "transforms"
	EdgeValidates        EdgeType = "validates"
	EdgeDependsOn        EdgeType = "depends_on"
	EdgeTestedBy         EdgeType = "tested_by"
	EdgeConfigures       EdgeType = "configures"
	EdgeRelated          EdgeType = "related"
	EdgeSimilarTo        EdgeType = "similar_to"
	EdgeDeploys          EdgeType = "deploys"
	EdgeServes           EdgeType = "serves"
	EdgeProvisions       EdgeType = "provisions"
	EdgeTriggers         EdgeType = "triggers"
	EdgeMigrates         EdgeType = "migrates"
	EdgeDocuments        EdgeType = "documents"
	EdgeRoutes           EdgeType = "routes"
	EdgeDefinesSchema    EdgeType = "defines_schema"
	EdgeContainsFlow     EdgeType = "contains_flow"
	EdgeFlowStep         EdgeType = "flow_step"
	EdgeCrossDomain      EdgeType = "cross_domain"
	EdgeCites            EdgeType = "cites"
	EdgeContradicts      EdgeType = "contradicts"
	EdgeBuildsOn         EdgeType = "builds_on"
	EdgeExemplifies      EdgeType = "exemplifies"
	EdgeCategorizedUnder EdgeType = "categorized_under"
	EdgeAuthoredBy       EdgeType = "authored_by"
)

type GraphNode struct {
	ID        string    `json:"id"`
	Type      NodeType  `json:"type"`
	Name      string    `json:"name"`
	FilePath  string    `json:"filePath,omitempty"`
	Summary   string    `json:"summary"`
	Tags      []string  `json:"tags"`
	Complexity string   `json:"complexity"`
}

type GraphEdge struct {
	Source      string   `json:"source"`
	Target      string   `json:"target"`
	Type        EdgeType `json:"type"`
	Direction   string   `json:"direction"`
	Description string   `json:"description,omitempty"`
	Weight      float64  `json:"weight"`
}

type Layer struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	NodeIDs     []string `json:"nodeIds"`
}

type TourStep struct {
	Order       int      `json:"order"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	NodeIDs     []string `json:"nodeIds"`
}

type ProjectMeta struct {
	Name          string   `json:"name"`
	Languages     []string `json:"languages"`
	Frameworks    []string `json:"frameworks"`
	Description   string   `json:"description"`
	AnalyzedAt    string   `json:"analyzedAt"`
	GitCommitHash string   `json:"gitCommitHash"`
}

type KnowledgeGraph struct {
	Version string       `json:"version"`
	Kind    string       `json:"kind"`
	Project ProjectMeta  `json:"project"`
	Nodes   []GraphNode  `json:"nodes"`
	Edges   []GraphEdge  `json:"edges"`
	Layers  []Layer      `json:"layers"`
	Tour    []TourStep   `json:"tour"`
}

// Database representations
type DBNode struct {
	ID         string
	RequestID  string
	Type       string
	Label      string
	Properties string
}

type DBEdge struct {
	ID          string
	RequestID   string
	Source      string
	Target      string
	Relation    string
	Weight      float64
	Description string
}

type DBResearchPaper struct {
	ID             string
	RequestID      string
	Source         string
	ExternalID     string
	Title          string
	Abstract       string
	Authors        string
	URL            string
	PDFURL         string
	CitationCount  int
	CodeRepository string
	Frameworks     string
	Tasks          string
	Benchmarks     string
	Hyperparameters string
}
