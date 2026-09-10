from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def utcnow():
    return datetime.now(timezone.utc)

class ProjectModel(Base):
    """Workbench research projects."""
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    metadata_json = Column(JSON, default=dict)
    
    sessions = relationship("SessionModel", back_populates="project", cascade="all, delete-orphan")

class SessionModel(Base):
    """Research sessions and query states."""
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    query = Column(Text, nullable=False)
    status = Column(String, default="active")  # active, completed, failed
    created_at = Column(DateTime, default=utcnow)
    state_json = Column(JSON, default=dict)
    
    project = relationship("ProjectModel", back_populates="sessions")
    artifacts = relationship("ArtifactModel", back_populates="session", cascade="all, delete-orphan")
    graph_runs = relationship("GraphRunModel", back_populates="session", cascade="all, delete-orphan")

class ArtifactModel(Base):
    """Generated research artifacts (reports, JSON ledgers, LaTeX drafts, HTML)."""
    __tablename__ = "artifacts"
    
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    kind = Column(String, nullable=False)  # report, json, html, graph, prompt
    path = Column(String, nullable=False)
    label = Column(String, nullable=False)
    role = Column(String, default="")
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    
    session = relationship("SessionModel", back_populates="artifacts")

class GraphRunModel(Base):
    """Graph loop execution records."""
    __tablename__ = "graph_runs"
    
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    iteration_count = Column(Integer, default=0)
    status = Column(String, default="completed")
    execution_time_ms = Column(Float, default=0.0)
    summary = Column(Text, nullable=True)
    state_snapshot = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)
    
    session = relationship("SessionModel", back_populates="graph_runs")

class PaperCacheModel(Base):
    """Cached paper metadata and full-text extractions in SQLite."""
    __tablename__ = "paper_cache"
    
    id = Column(String, primary_key=True, index=True)
    doi = Column(String, index=True, nullable=True)
    arxiv_id = Column(String, index=True, nullable=True)
    openalex_id = Column(String, index=True, nullable=True)
    title = Column(String, nullable=False)
    abstract = Column(Text, default="")
    authors_json = Column(JSON, default=list)
    year = Column(Integer, nullable=True)
    citation_count = Column(Integer, default=0)
    data_json = Column(JSON, default=dict)
    full_text = Column(Text, nullable=True)
    sections_json = Column(JSON, default=list)
    score = Column(Float, nullable=True)
    score_breakdown_json = Column(JSON, default=dict)
    checklist_json = Column(JSON, default=dict)
    cached_at = Column(DateTime, default=utcnow)

class CitationEdgeModel(Base):
    """Directed citation graph edges stored in SQLite."""
    __tablename__ = "citation_edges"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_paper_id = Column(String, index=True, nullable=False)
    target_paper_id = Column(String, index=True, nullable=False)
    created_at = Column(DateTime, default=utcnow)
