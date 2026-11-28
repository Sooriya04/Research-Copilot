"""
Module: src/novelty/schemas.py

What this file does:
Defines all Pydantic data models and enumerations used across the 8-stage
Scientific Novelty & Gap Analysis pipeline.

Classes & Functions:
- PriorArtStatus: Enum of honest prior-art verification states (never claims absolute novelty).
- GapType: Enum of scientific gap categories (methodological, performance, theoretical, empirical, contradiction, future_direction).
- GroundedPaper: Normalized paper record with provenance and full-text/abstract availability.
- StructuredPaperAnalysis: Stage 2 output capturing problem, contributions, methods, assumptions, limitations, and provenance.
- ExtractedGap: Stage 3 output representing an evidence-backed research gap with source references.
- NoveltyCandidate: Stage 4 output representing a deduplicated candidate idea tied to gaps and strategy.
- PriorArtAssessment: Stage 5 output recording search queries, overlapping components, distinct contributions, and verification status.
- QualityAssessment: Stage 7 output scoring grounding, falsifiability, feasibility, and technical clarity.
- NoveltyItem: Final structured research proposal schema (backward-compatible with legacy fields + rich Stage 1-7 metadata).
- NoveltySynthesisResponse: Top-level response returned by synthesis and pipeline endpoints.
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PriorArtStatus(str, Enum):
    NOT_ASSESSED = "not_assessed"
    POTENTIAL_OVERLAP = "potential_overlap"
    SUBSTANTIAL_OVERLAP = "substantial_overlap"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    NO_CLOSE_MATCH = "no_close_match"


class GapType(str, Enum):
    METHODOLOGICAL = "methodological"
    PERFORMANCE_SCALABILITY = "performance_scalability"
    THEORETICAL = "theoretical"
    EMPIRICAL = "empirical"
    UNRESOLVED_QUESTION = "unresolved_question"
    CONTRADICTION = "contradiction"
    FUTURE_DIRECTION = "future_direction"


class EvidenceClaim(BaseModel):
    paper_id: str
    section: Optional[str] = None
    page: Optional[int] = None
    claim: str
    source_type: str = Field(default="author_statement", description="author_statement | llm_interpretation")


class GroundedPaper(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    authors: List[str] = Field(default_factory=list)
    abstract: str = ""
    full_text: Optional[str] = None
    has_full_text: bool = False
    methods: List[str] = Field(default_factory=list)
    datasets: List[str] = Field(default_factory=list)
    source: str = "graph"


class GroundingContext(BaseModel):
    workspace_id: str
    topic: str
    papers: List[GroundedPaper] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    content_hash: str = ""
    graph_version: str = "v1"


class StructuredPaperAnalysis(BaseModel):
    paper_id: str
    title: str
    research_problem: str = ""
    main_contributions: List[str] = Field(default_factory=list)
    methodology: str = ""
    mechanisms: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    experimental_findings: List[str] = Field(default_factory=list)
    future_directions: List[str] = Field(default_factory=list)
    evidence_availability: str = "abstract_only"  # full_text | abstract_only | metadata_only


class ExtractedGap(BaseModel):
    id: str
    gap_type: GapType = GapType.METHODOLOGICAL
    title: str
    description: str
    supporting_paper_ids: List[str] = Field(default_factory=list)
    evidence_excerpts: List[EvidenceClaim] = Field(default_factory=list)
    evidence_availability: str = "abstract_only"


class NoveltyCandidate(BaseModel):
    id: str
    title: str
    strategy: Optional[str] = None  # recombination | contradiction_resolution | limitation_inversion | gap_realization
    core_contribution: str
    target_gap_ids: List[str] = Field(default_factory=list)
    supporting_paper_ids: List[str] = Field(default_factory=list)
    rationale: str = ""


class PriorArtAssessment(BaseModel):
    candidate_id: str
    status: PriorArtStatus = PriorArtStatus.NOT_ASSESSED
    queries_used: List[str] = Field(default_factory=list)
    closest_papers: List[Dict[str, Any]] = Field(default_factory=list)
    overlapping_components: List[str] = Field(default_factory=list)
    distinct_contributions: List[str] = Field(default_factory=list)
    summary: str = "Not yet assessed."


class QualityAssessment(BaseModel):
    grounding_score: float = 0.0
    falsifiability_score: float = 0.0
    specificity_score: float = 0.0
    issues: List[str] = Field(default_factory=list)
    passed: bool = True


class NoveltyItem(BaseModel):
    id: str
    title: str
    mechanism: str = Field(
        default="recombination",
        description="Optional strategy: recombination, contradiction_resolution, limitation_inversion, gap_realization",
    )
    engine: str = "gemini"
    model_name: Optional[str] = None
    pitch: str = ""
    problem_statement: str = ""
    research_motivation: str = ""
    identified_gap: str = ""
    novelty_statement: str = ""
    technical_methodology: str = ""
    algorithmic_approach: str = ""
    grounded_paper_ids: List[str] = Field(default_factory=list)
    grounded_paper_titles: List[str] = Field(default_factory=list)
    structured_evidence: List[EvidenceClaim] = Field(default_factory=list)
    mathematical_formulation: str = ""
    testable_hypothesis: str = ""
    target_datasets: List[str] = Field(default_factory=list)
    baselines_to_beat: List[str] = Field(default_factory=list)
    expected_metrics: List[str] = Field(default_factory=list)
    potential_limitations: str = ""
    prior_art_status: str = PriorArtStatus.NOT_ASSESSED.value
    prior_art_check: Optional[PriorArtAssessment] = None
    quality_assessment: Optional[QualityAssessment] = None
    baseline_figure_data_url: Optional[str] = Field(
        default=None,
        description="Base64 data URL (e.g. data:image/png;base64,...) of the baseline architecture diagram from paper-drift",
    )
    baseline_figure_caption: Optional[str] = Field(
        default=None,
        description="Caption associated with the extracted baseline architecture figure",
    )
    evidence_status: str = "abstract_only"
    confidence_score: float = 0.75


class NoveltySynthesisResponse(BaseModel):
    status: str
    workspace_id: Optional[str] = None
    topic: Optional[str] = None
    cached: bool = False
    llm_called: bool = False
    papers_count: int = 0
    gaps_count: int = 0
    novelties: List[NoveltyItem] = Field(default_factory=list)
