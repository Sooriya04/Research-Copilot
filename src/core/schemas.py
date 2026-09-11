from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

# --- Enums & Literals ---

class ResearchJob(str, Enum):
    DISCOVERING_PRIOR_ART = "discovering_prior_art"
    READING_PAPER_CONTENT = "reading_paper_content"
    EXTRACTING_RESEARCH_ENTITIES = "extracting_research_entities"
    RANKING_EVIDENCE = "ranking_evidence"
    VERIFYING_CLAIMS = "verifying_claims"
    PLANNING_REPRODUCTION = "planning_reproduction"
    RUNNING_RESEARCH_EXPERIMENTS = "running_research_experiments"
    SYNTHESIZING_ARTIFACTS = "synthesizing_artifacts"
    VISUALIZING_RESEARCH_STRUCTURE = "visualizing_research_structure"
    IMPROVING_RESEARCH_LOOP = "improving_research_loop"

class ResearchRunStatus(str, Enum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL = "partial"
    BLOCKED = "blocked"
    FAILED = "failed"

class VerificationState(str, Enum):
    NOT_CHECKED = "not_checked"
    INFERRED = "inferred"
    PARTIAL = "partial"
    VERIFIED = "verified"
    BLOCKED = "blocked"
    FAILED = "failed"

class ResearchArtifactKind(str, Enum):
    REPORT = "report"
    JSON = "json"
    JSONL = "jsonl"
    GRAPH = "graph"
    HTML = "html"
    AUDIT = "audit"
    PROVENANCE = "provenance"
    TEMPLATE = "template"
    PROMPT = "prompt"
    MODEL_OUTPUT = "model_output"
    LEDGER = "ledger"
    PLAN = "plan"
    MANIFEST = "manifest"

# --- Core Data Models ---

class Author(BaseModel):
    name: str
    affiliation: Optional[str] = None
    author_id: Optional[str] = None
    orcid: Optional[str] = None

class ScoreBreakdown(BaseModel):
    topical_relevance: float = 0.0
    citation_impact: float = 0.0
    graph_prestige: float = 0.0
    citation_velocity: float = 0.0
    methodology_quality: float = 0.0
    reproducibility: float = 0.0
    total_score: float = 0.0

class ChecklistRubric(BaseModel):
    has_ablation: bool = False
    has_baselines: bool = False
    has_benchmarks: bool = False
    has_empirical_eval: bool = False
    has_uncertainty_quant: bool = False
    has_code_repo: bool = False
    code_url: Optional[str] = None
    has_dataset_link: bool = False
    has_compute_budget: bool = False
    compute_details: Optional[str] = None
    has_limitations: bool = False
    rubric_score: float = 0.0

class PaperSection(BaseModel):
    title: str
    content: str
    section_type: str = "other"  # abstract, intro, methods, experiments, results, discussion, limitations, conclusion

class Paper(BaseModel):
    id: str
    title: str
    abstract: str = ""
    authors: List[Author] = Field(default_factory=list)
    year: Optional[int] = None
    publication_date: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    pmid: Optional[str] = None
    pmcid: Optional[str] = None
    openalex_id: Optional[str] = None
    primary_source: str = "openalex"
    url: Optional[str] = None
    pdf_url: Optional[str] = None
    is_open_access: bool = False
    citation_count: int = 0
    referenced_works: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    score: Optional[float] = None
    score_breakdown: Optional[ScoreBreakdown] = None
    checklist: Optional[ChecklistRubric] = None
    sections: List[PaperSection] = Field(default_factory=list)
    critique_strengths: List[str] = Field(default_factory=list)
    critique_concerns: List[str] = Field(default_factory=list)
    critique_questions: List[str] = Field(default_factory=list)

class PaperIntelligence(BaseModel):
    id: str
    title: str
    abstract: str = ""
    year: Optional[int] = None
    venue: Optional[str] = None
    authors: List[Any] = Field(default_factory=list)
    methods: List[Any] = Field(default_factory=list)
    datasets: List[Any] = Field(default_factory=list)
    metrics: Any = Field(default_factory=dict)
    claims: List[Any] = Field(default_factory=list)
    limitations: List[Any] = Field(default_factory=list)
    cited_papers: List[str] = Field(default_factory=list)
    referenced_works: List[str] = Field(default_factory=list)
    benchmarks: List[Any] = Field(default_factory=list)
    summary: Optional[Any] = None

class ResearchArtifact(BaseModel):
    id: str
    kind: ResearchArtifactKind
    path: str
    label: str
    role: str
    primary: bool = False
    format: str = "markdown"
    content: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ResearchEntity(BaseModel):
    id: str
    kind: str  # dataset, model, metric, method, author, institution
    value: str
    paper_id: Optional[str] = None
    confidence: float = 1.0
    evidence: Optional[str] = None
    status: str = "extracted"

# --- Graph & Loop Engine Models ---

class NodeStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

class ExecutionStepLog(BaseModel):
    step_id: str
    node_name: str
    iteration: int
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    duration_ms: float = 0.0
    status: NodeStatus = NodeStatus.RUNNING
    message: str = ""
    error: Optional[str] = None

class ResearchGraphState(BaseModel):
    session_id: str
    query: str
    iteration: int = 0
    max_iterations: int = 5
    papers: Dict[str, Paper] = Field(default_factory=dict)
    ranked_paper_ids: List[str] = Field(default_factory=list)
    citation_graph: Dict[str, List[str]] = Field(default_factory=dict)
    entities: List[ResearchEntity] = Field(default_factory=list)
    artifacts: List[ResearchArtifact] = Field(default_factory=list)
    synthesis_markdown: Optional[str] = None
    is_finished: bool = False
    execution_history: List[ExecutionStepLog] = Field(default_factory=list)
    custom_context: Dict[str, Any] = Field(default_factory=dict)

# --- API Request / Response DTOs ---

class RankRequest(BaseModel):
    query: str
    limit: int = 25
    expand_citations: int = 0
    full_text_top: int = 0
    critique_top: int = 0
    synthesize: bool = False
    weights: Optional[Dict[str, float]] = None

class RankResponse(BaseModel):
    query: str
    run_id: str
    total_found: int
    papers: List[Paper]
    synthesis: Optional[str] = None
    execution_time_ms: float
    graph_nodes: int = 0
    graph_edges: int = 0

class PaperAccessRequest(BaseModel):
    identifier: str  # DOI, arXiv, OpenAlex, PMID, or query
    fetch_full_text: bool = False

class PaperAccessCandidate(BaseModel):
    source: str
    url: str
    format: str  # pdf, html, xml
    is_legal_oa: bool = True
    priority: int = 1

class PaperAccessResponse(BaseModel):
    identifier: str
    paper: Optional[Paper] = None
    candidates: List[PaperAccessCandidate] = Field(default_factory=list)
    full_text_extracted: bool = False
    sections_count: int = 0

class GraphRunRequest(BaseModel):
    query: str
    max_iterations: int = 3
    enable_full_text: bool = True
    enable_critique: bool = True
    enable_synthesis: bool = True
    custom_params: Dict[str, Any] = Field(default_factory=dict)

class GraphRunResponse(BaseModel):
    session_id: str
    status: str
    iterations_completed: int
    total_papers: int
    synthesis: Optional[str]
    artifacts: List[ResearchArtifact]
    execution_history: List[ExecutionStepLog]
