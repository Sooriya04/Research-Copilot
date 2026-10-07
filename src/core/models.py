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

class WorkspaceModel(Base):
    """User research workspace."""
    __tablename__ = "workspaces"
    
    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    state_json = Column(JSON, default=dict)

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

class UserSettingsModel(Base):
    """User API key settings stored securely in SQLite."""
    __tablename__ = "user_settings"
    
    id = Column(String, primary_key=True, default="default")  # single-row singleton
    provider_id = Column(String, primary_key=True)             # openai / gemini / nvidia / groq / ollama
    api_key = Column(Text, nullable=True)
    base_url = Column(Text, nullable=True)                     # for ollama
    model = Column(String, nullable=True)                      # user-selected model
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

class WorkspaceMemoryModel(Base):
    """Structured long-term research memory for workspaces (decisions, hypotheses, constraints, findings)."""
    __tablename__ = "workspace_memories"
    
    id = Column(String, primary_key=True, index=True)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String, nullable=False)  # decision, hypothesis, constraint, finding
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String, default="active")  # active, confirmed, refuted, archived
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class PaperDocumentModel(Base):
    """Persistent paper entity for RAG and literature indexing."""
    __tablename__ = "papers"

    id = Column(String, primary_key=True, index=True)
    doi = Column(String, index=True, nullable=True)
    arxiv_id = Column(String, index=True, nullable=True)
    title = Column(String, nullable=False)
    authors_json = Column(JSON, default=list)
    abstract = Column(Text, default="")
    page_count = Column(Integer, default=1)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    chunks = relationship("PaperChunkModel", back_populates="paper", cascade="all, delete-orphan", order_by="PaperChunkModel.chunk_index")


class PaperChunkModel(Base):
    """Section- and page-grounded paper chunk with vector embeddings."""
    __tablename__ = "chunks"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False, index=True)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=False, index=True)
    section = Column(String, default="General", index=True)
    token_count = Column(Integer, default=0)
    embedding_json = Column(JSON, nullable=True)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    paper = relationship("PaperDocumentModel", back_populates="chunks")


class GraphEntityModel(Base):
    """Knowledge graph entities extracted from research papers."""
    __tablename__ = "graph_entities"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=False, index=True)
    description = Column(Text, default="")
    source_chunk_id = Column(String, nullable=True, index=True)
    page_number = Column(Integer, default=1, index=True)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


class GraphRelationshipModel(Base):
    """Directed knowledge graph relationships linking paper research entities."""
    __tablename__ = "graph_relationships"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    source_entity_id = Column(String, ForeignKey("graph_entities.id", ondelete="CASCADE"), nullable=False, index=True)
    relationship = Column(String, nullable=False, index=True)
    target_entity_id = Column(String, ForeignKey("graph_entities.id", ondelete="CASCADE"), nullable=False, index=True)
    source_chunk_id = Column(String, nullable=True, index=True)
    page_number = Column(Integer, default=1, index=True)
    confidence = Column(Float, default=1.0)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)
