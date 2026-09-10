from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship
from src.core.models import Base

def utcnow():
    return datetime.now(timezone.utc)

class NormalizedPaperModel(Base):
    """Normalized canonical scientific papers table."""
    __tablename__ = "canonical_papers"

    canonical_id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    abstract = Column(Text, default="")
    doi = Column(String, index=True, nullable=True)
    arxiv_id = Column(String, index=True, nullable=True)
    openalex_id = Column(String, index=True, nullable=True)
    publication_date = Column(String, nullable=True)
    year = Column(Integer, nullable=True, index=True)
    venue = Column(String, nullable=True)
    pdf_url = Column(String, nullable=True)
    is_open_access = Column(Boolean, default=False)
    citation_count = Column(Integer, default=0)
    authors_json = Column(JSON, default=list)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Normalized 1-to-many relationships
    sources = relationship("PaperSourceModel", back_populates="paper", cascade="all, delete-orphan")
    sections = relationship("PaperSectionModel", back_populates="paper", cascade="all, delete-orphan", order_by="PaperSectionModel.order_index")
    benchmarks = relationship("BenchmarkModel", back_populates="paper", cascade="all, delete-orphan")
    code_repositories = relationship("CodeRepositoryModel", back_populates="paper", cascade="all, delete-orphan")
    summaries = relationship("PaperSummaryModel", back_populates="paper", cascade="all, delete-orphan")
    research_gaps = relationship("ResearchGapModel", back_populates="paper", cascade="all, delete-orphan")

class PaperSourceModel(Base):
    """Normalized external source metadata."""
    __tablename__ = "paper_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, ForeignKey("canonical_papers.canonical_id"), nullable=False, index=True)
    source_name = Column(String, nullable=False)  # openalex, arxiv, paperswithcode, etc.
    external_id = Column(String, nullable=False)
    url = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False)
    raw_metadata_json = Column(JSON, default=dict)

    paper = relationship("NormalizedPaperModel", back_populates="sources")

class PaperSectionModel(Base):
    """Normalized structured sections extracted from PDFs."""
    __tablename__ = "paper_sections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, ForeignKey("canonical_papers.canonical_id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    section_type = Column(String, nullable=False, index=True)  # problem, method, experiments, limitations, etc.
    content = Column(Text, nullable=False)
    order_index = Column(Integer, default=0)
    token_count = Column(Integer, default=0)

    paper = relationship("NormalizedPaperModel", back_populates="sections")

class BenchmarkModel(Base):
    """Normalized benchmark evaluations from Papers With Code."""
    __tablename__ = "benchmarks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, ForeignKey("canonical_papers.canonical_id"), nullable=False, index=True)
    source = Column(String, default="paperswithcode")
    task = Column(String, nullable=False, index=True)
    dataset = Column(String, nullable=False, index=True)
    metric = Column(String, nullable=False)
    value = Column(String, nullable=False)
    model = Column(String, nullable=True)
    split = Column(String, default="test")
    repository_url = Column(String, nullable=True)

    paper = relationship("NormalizedPaperModel", back_populates="benchmarks")

class CodeRepositoryModel(Base):
    """Normalized code repository links."""
    __tablename__ = "code_repositories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, ForeignKey("canonical_papers.canonical_id"), nullable=False, index=True)
    url = Column(String, nullable=False)
    is_official = Column(Boolean, default=True)
    framework = Column(String, nullable=True)
    stars = Column(Integer, default=0)
    license = Column(String, nullable=True)

    paper = relationship("NormalizedPaperModel", back_populates="code_repositories")

class PaperSummaryModel(Base):
    """Normalized structured LLM paper summaries."""
    __tablename__ = "paper_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, ForeignKey("canonical_papers.canonical_id"), nullable=False, index=True)
    problem = Column(Text, nullable=False)
    methodology = Column(Text, nullable=False)
    experiments = Column(Text, nullable=False)
    contributions_json = Column(JSON, default=list)
    limitations_json = Column(JSON, default=list)
    open_questions_json = Column(JSON, default=list)
    claims_json = Column(JSON, default=list)
    model_used = Column(String, default="gemini-2.0-flash-lite")
    created_at = Column(DateTime, default=utcnow)

    paper = relationship("NormalizedPaperModel", back_populates="summaries")

class ResearchGapModel(Base):
    """Normalized research gaps and limitations."""
    __tablename__ = "research_gaps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(String, ForeignKey("canonical_papers.canonical_id"), nullable=False, index=True)
    category = Column(String, nullable=False, index=True)  # compute_bottleneck, ood_generalization, etc.
    description = Column(Text, nullable=False)
    evidence_text = Column(Text, nullable=True)
    proposed_direction = Column(Text, nullable=True)

    paper = relationship("NormalizedPaperModel", back_populates="research_gaps")
