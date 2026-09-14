import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db
from src.core.models import ArtifactModel, ProjectModel, SessionModel

router = APIRouter(prefix="/api/v1/workbench", tags=["Science Workbench"])

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = ""

class ProjectOut(BaseModel):
    id: str
    title: str
    description: str

class SessionOut(BaseModel):
    id: str
    project_id: Optional[str]
    query: str
    status: str

@router.get("/projects", response_model=List[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    """List all science workbench projects."""
    result = await db.execute(select(ProjectModel))
    projects = result.scalars().all()
    return [ProjectOut(id=p.id, title=p.title, description=p.description or "") for p in projects]

@router.post("/projects", response_model=ProjectOut)
async def create_project(req: ProjectCreate, db: AsyncSession = Depends(get_db)):
    """Create a new workbench project."""
    project = ProjectModel(
        id=f"proj-{uuid.uuid4().hex[:8]}",
        title=req.title,
        description=req.description or ""
    )
    db.add(project)
    await db.commit()
    return ProjectOut(id=project.id, title=project.title, description=project.description)

@router.get("/sessions", response_model=List[SessionOut])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """List all research sessions stored in SQLite, sorted newest first and deduplicated by query."""
    result = await db.execute(select(SessionModel).order_by(SessionModel.created_at.desc()))
    sessions = result.scalars().all()
    
    seen_queries = set()
    unique_sessions = []
    ignored_dummy_queries = {"string", "test", "dummy", "null", "undefined", "foo", "bar"}
    for s in sessions:
        q_norm = (s.query or "").strip().lower()
        if q_norm and q_norm not in ignored_dummy_queries and q_norm not in seen_queries:
            seen_queries.add(q_norm)
            unique_sessions.append(SessionOut(id=s.id, project_id=s.project_id, query=s.query, status=s.status))
    return unique_sessions

@router.get("/artifacts/{session_id}")
async def list_session_artifacts(session_id: str, db: AsyncSession = Depends(get_db)):
    """List generated artifacts for a given research session."""
    result = await db.execute(select(ArtifactModel).where(ArtifactModel.session_id == session_id))
    artifacts = result.scalars().all()
    return [{"id": a.id, "kind": a.kind, "label": a.label, "path": a.path, "content": a.content} for a in artifacts]
