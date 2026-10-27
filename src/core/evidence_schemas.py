"""
Unified Evidence and Audit Pydantic Schemas for Research-Copilot.
Provides data structures for page-indexed PDF ingestion, coordinate overlays,
mathematically verified claims, metrics, glossary, figures, and audit health.
"""

from typing import Dict, List, Optional, Any
from enum import Enum
from pydantic import BaseModel, Field

class HighlightRect(BaseModel):
    """Normalized bounding box coordinates (0.0 to 1.0) relative to page width/height."""
    x: float = Field(..., description="Normalized left coordinate [0.0 - 1.0]")
    y: float = Field(..., description="Normalized top coordinate [0.0 - 1.0]")
    width: float = Field(..., description="Normalized width [0.0 - 1.0]")
    height: float = Field(..., description="Normalized height [0.0 - 1.0]")

class WordBox(BaseModel):
    """Single word extracted from PDF with absolute point coordinates."""
    text: str
    x_min: float
    y_min: float
    x_max: float
    y_max: float

class PageBlock(BaseModel):
    """Text block on a page preserving reading order and bounding box."""
    block_index: int
    text: str
    bbox: List[float] = Field(default_factory=list, description="[x0, y0, x1, y1] in points")

class PageData(BaseModel):
    """Page-indexed representation with layout coordinates and words."""
    page_number: int  # 1-indexed
    width: float
    height: float
    text: str
    words: List[WordBox] = Field(default_factory=list)
    blocks: List[PageBlock] = Field(default_factory=list)

class PageIndexedDocument(BaseModel):
    """Complete document structured into page-indexed coordinate slices."""
    paper_id: str
    title: Optional[str] = None
    page_count: int
    pages: List[PageData] = Field(default_factory=list)

class SourceReference(BaseModel):
    """Deterministic reference to source paper page and excerpt."""
    source_id: str = "paper"
    page: Optional[int] = 1
    excerpt: str
    locator: Optional[str] = None  # e.g., "Section 3.2, Paragraph 1"
    exact_match: bool = False
    highlight_rects: List[HighlightRect] = Field(default_factory=list)

class ClaimKind(str, Enum):
    REPORTED_RESULT = "reported-result"
    AUTHOR_INTERPRETATION = "author-interpretation"
    METHOD = "method"
    BACKGROUND = "background"
    LIMITATION = "limitation"

class ClaimConfidence(str, Enum):
    VERIFIED = "verified"
    NEEDS_REVIEW = "needs-review"

class ClaimReviewStatus(str, Enum):
    UNREVIEWED = "unreviewed"
    ACCEPTED = "accepted"
    FLAGGED = "flagged"

class ClaimItem(BaseModel):
    """Atomic scientific claim with source grounding and verification status."""
    id: str
    statement: str
    kind: ClaimKind = ClaimKind.REPORTED_RESULT
    confidence: ClaimConfidence = ClaimConfidence.NEEDS_REVIEW
    source_refs: List[SourceReference] = Field(default_factory=list)
    review_status: ClaimReviewStatus = ClaimReviewStatus.UNREVIEWED
    reviewer_note: Optional[str] = None

class MetricItem(BaseModel):
    """Quantitative evaluation metric with value, unit, and source excerpt."""
    id: str
    label: str
    value: Optional[float] = None
    display_value: str
    unit: str = ""
    context: str = ""
    source_ref: Optional[SourceReference] = None

class GlossaryItem(BaseModel):
    """Domain term, acronym, or concept defined with paper grounding."""
    term: str
    definition: str
    source_ref: Optional[SourceReference] = None

class LimitationItem(BaseModel):
    """Documented limitation, boundary of validity, or unstated assumption."""
    id: str
    statement: str
    kind: str = "author-stated"  # "author-stated" | "detected-constraint" | "assumption"
    source_ref: Optional[SourceReference] = None

class FigureAsset(BaseModel):
    """Extracted diagram, plot, architecture, or table asset from PDF."""
    id: str
    label: str  # e.g. "Figure 1", "Table 2"
    caption: str
    why_it_matters: str = ""
    page: int
    asset_type: str = "figure"  # "figure" | "table" | "architecture" | "plot"
    image_data_url: Optional[str] = None  # data:image/png;base64,...
    asset_path: Optional[str] = None  # relative URL or file path
    bbox: Optional[List[float]] = None  # [x0, y0, x1, y1]
    claim_ids: List[str] = Field(default_factory=list)

class TimelineStage(BaseModel):
    """Progression node in paper narrative from problem to conclusion."""
    stage: str  # "problem" | "hypothesis" | "method" | "experiment" | "result" | "conclusion"
    title: str
    description: str
    page: Optional[int] = None
    claim_ids: List[str] = Field(default_factory=list)

class EvidenceAuditResult(BaseModel):
    """Mechanical audit metrics assessing evidence integrity across the document."""
    checked_at: str
    paper_id: str
    page_count: int
    total_claims: int = 0
    verified_claims: int = 0
    needs_review_claims: int = 0
    quote_match_rate: float = 0.0  # 0.0 - 1.0
    page_coverage_rate: float = 0.0  # Fraction of pages with >= 1 cited claim
    cited_pages: List[int] = Field(default_factory=list)
    unreached_pages: List[int] = Field(default_factory=list)
    thin_sections: List[str] = Field(default_factory=list)
    unlocated_items: List[Dict[str, Any]] = Field(default_factory=list)


class CodeAvailability(BaseModel):
    """Details regarding open-source code availability, dependencies, and environment."""
    has_repo: bool = False
    repo_url: Optional[str] = None
    framework: Optional[str] = None
    has_checkpoints: bool = False
    dependencies: List[str] = Field(default_factory=list)
    license: Optional[str] = None


class ComputeBudget(BaseModel):
    """Hardware requirements, accelerator models, and compute duration."""
    hardware_mentioned: bool = False
    gpu_type: Optional[str] = None
    gpu_count: Optional[int] = None
    estimated_hours: Optional[float] = None
    notes: Optional[str] = None


class DatasetChecklist(BaseModel):
    """Accessibility, download links, and preparation requirements for target datasets."""
    name: str
    access_type: str = "public"  # public | gated | private
    download_url: Optional[str] = None
    preprocessing_notes: Optional[str] = None


class ReproductionStep(BaseModel):
    """Actionable reproduction workflow step across setup, data prep, training, and evaluation."""
    step_number: int
    phase: str  # setup | data_prep | training | eval
    action: str
    suggested_command: Optional[str] = None
    verification_criteria: str


class ReproductionMap(BaseModel):
    """Complete research paper reproduction map, friction assessment, and actionable roadmap."""
    paper_id: str
    reproducibility_score: float = Field(..., ge=0.0, le=100.0)
    code_availability: CodeAvailability
    compute_budget: ComputeBudget
    dataset_checklist: List[DatasetChecklist] = Field(default_factory=list)
    steps: List[ReproductionStep] = Field(default_factory=list)
    missing_critical_elements: List[str] = Field(default_factory=list)
    friction_summary: str


class PaperEvidencePackage(BaseModel):
    """Complete grounded evidence substrate for a scientific paper."""
    paper_id: str
    title: str
    thesis: str
    plain_summary: str
    research_question: str
    methods: List[str] = Field(default_factory=list)
    findings: List[str] = Field(default_factory=list)
    claims: List[ClaimItem] = Field(default_factory=list)
    metrics: List[MetricItem] = Field(default_factory=list)
    glossary: List[GlossaryItem] = Field(default_factory=list)
    limitations: List[LimitationItem] = Field(default_factory=list)
    figures: List[FigureAsset] = Field(default_factory=list)
    timeline: List[TimelineStage] = Field(default_factory=list)
    audit: Optional[EvidenceAuditResult] = None
    reproduction_map: Optional[ReproductionMap] = None
