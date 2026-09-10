from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

def utcnow():
    return datetime.now(timezone.utc)

class VerificationStatus(str, Enum):
    VERIFIED = "verified"
    INFERRED = "inferred"
    UNVERIFIED = "unverified"
    CONTRADICTED = "contradicted"

class PaperSectionType(str, Enum):
    ABSTRACT = "abstract"
    PROBLEM = "problem"          # Introduction / Motivation / Problem Statement
    RELATED_WORK = "related_work" # Related Work / Prior Art / Background
    METHOD = "method"            # Method / Methodology / Approach / Architecture
    EXPERIMENTS = "experiments"  # Experiments / Evaluation / Results
    LIMITATIONS = "limitations"  # Limitations / Discussion / Threats to Validity / Future Work
    CONCLUSION = "conclusion"    # Conclusion / Summary
    OTHER = "other"

class AuthorEntity(BaseModel):
    name: str
    affiliation: Optional[str] = None
    author_id: Optional[str] = None
    orcid: Optional[str] = None

class SourceMetadata(BaseModel):
    source_name: str  # "openalex", "arxiv", "paperswithcode", "crossref", "europepmc"
    external_id: str
    url: Optional[str] = None
    is_primary: bool = False
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)
    fetched_at: datetime = Field(default_factory=utcnow)

class BenchmarkEvidence(BaseModel):
    source: str = "paperswithcode"
    task: str
    dataset: str
    metric: str
    value: str
    model: Optional[str] = None
    split: Optional[str] = "test"
    paper_title: Optional[str] = None
    repository_url: Optional[str] = None

class CodeRepository(BaseModel):
    url: str
    is_official: bool = True
    framework: Optional[str] = None
    stars: Optional[int] = None
    license: Optional[str] = None

class PaperSectionEntity(BaseModel):
    title: str
    section_type: PaperSectionType
    content: str
    order_index: int = 0
    token_count: int = 0

class ExtractedClaim(BaseModel):
    claim: str
    evidence: str = ""
    section: Optional[str] = None
    metric: Optional[str] = None
    value: Optional[str] = None
    baseline: Optional[str] = None
    confidence: float = 0.0
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    verification_notes: Optional[str] = None

class ResearchGapEntity(BaseModel):
    category: str  # compute_bottleneck, ood_generalization, dataset_bias, theoretical_bound, scaling_limit
    description: str
    evidence_text: Optional[str] = None
    proposed_direction: Optional[str] = None

class StructuredPaperSummary(BaseModel):
    problem: str
    contributions: List[str] = Field(default_factory=list)
    methodology: str
    experiments: str
    limitations: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    claims: List[ExtractedClaim] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=utcnow)
    model_used: str = "gemini-2.0-flash-lite"

class CanonicalPaper(BaseModel):
    canonical_id: str  # e.g., "doi:10.1038/..." or "arxiv:2309.00667" or "openalex:W..."
    title: str
    abstract: str = ""
    authors: List[AuthorEntity] = Field(default_factory=list)
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    openalex_id: Optional[str] = None
    publication_date: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    pdf_url: Optional[str] = None
    is_open_access: bool = False
    citation_count: int = 0
    sources: List[SourceMetadata] = Field(default_factory=list)
    sections: List[PaperSectionEntity] = Field(default_factory=list)
    benchmarks: List[BenchmarkEvidence] = Field(default_factory=list)
    code_repositories: List[CodeRepository] = Field(default_factory=list)
    summary: Optional[StructuredPaperSummary] = None
    research_gaps: List[ResearchGapEntity] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

class PaperSummarizeRequest(BaseModel):
    identifier: str
    force_refresh: bool = False

class PaperSummarizeResponse(BaseModel):
    canonical_paper: CanonicalPaper
    cached: bool = False
    execution_time_ms: float = 0.0
