import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db
from src.core.models import ArtifactModel, ProjectModel, SessionModel, WorkspaceModel

router = APIRouter(prefix="/api/v1/workbench", tags=["Science Workbench"])

class WorkspaceCreate(BaseModel):
    title: str
    description: Optional[str] = ""

class WorkspaceOut(BaseModel):
    id: str
    title: str
    description: str
    created_at: str
    state_json: Optional[dict] = {}

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = ""

class ProjectOut(BaseModel):
    id: str
    title: str
    description: str

class SessionOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    query: str
    status: str
    state_json: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None

class SessionActiveUpdate(BaseModel):
    query: Optional[str] = None
    session_id: Optional[str] = None
    seed_paper: Optional[Dict[str, Any]] = None
    state_json: Optional[Dict[str, Any]] = None

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
            unique_sessions.append(
                SessionOut(
                    id=s.id,
                    project_id=s.project_id,
                    query=s.query,
                    status=s.status,
                    state_json=s.state_json or {},
                    created_at=s.created_at.isoformat() if s.created_at else None,
                )
            )
    return unique_sessions

@router.get("/sessions/active", response_model=Optional[SessionOut])
async def get_active_session(request: Request, db: AsyncSession = Depends(get_db)):
    """Fetch the active research session (from session cookie or newest SQLite record)."""
    active_id = None
    if hasattr(request, "session"):
        active_id = request.session.get("session_id")
    
    if active_id:
        sess = await db.get(SessionModel, active_id)
        if sess:
            return SessionOut(
                id=sess.id,
                project_id=sess.project_id,
                query=sess.query,
                status=sess.status,
                state_json=sess.state_json or {},
                created_at=sess.created_at.isoformat() if sess.created_at else None,
            )
            
    # Fallback: Latest active research session
    result = await db.execute(select(SessionModel).order_by(SessionModel.created_at.desc()).limit(1))
    latest = result.scalar_one_or_none()
    if latest:
        return SessionOut(
            id=latest.id,
            project_id=latest.project_id,
            query=latest.query,
            status=latest.status,
            state_json=latest.state_json or {},
            created_at=latest.created_at.isoformat() if latest.created_at else None,
        )
    return None

@router.post("/sessions/active", response_model=SessionOut)
async def set_active_session(req: SessionActiveUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    """Set or update the active research session with query and seed paper."""
    sid = req.session_id or (request.session.get("session_id") if hasattr(request, "session") else None) or f"sess-{uuid.uuid4().hex[:8]}"
    existing = await db.get(SessionModel, sid)
    
    current_state = dict(existing.state_json or {}) if existing else {}
    if req.state_json:
        current_state.update(req.state_json)
    if req.seed_paper:
        current_state["seed_paper"] = req.seed_paper
        
    query_text = req.query.strip() if req.query else (existing.query if existing else "Research Exploration")
    
    if not existing:
        existing = SessionModel(
            id=sid,
            query=query_text,
            status="active",
            state_json=current_state,
        )
        db.add(existing)
    else:
        if req.query:
            existing.query = req.query.strip()
        existing.state_json = current_state
        
    await db.commit()
    
    if hasattr(request, "session"):
        request.session["session_id"] = sid
        request.session["active_query"] = existing.query
        if current_state.get("seed_paper"):
            request.session["seed_paper"] = current_state["seed_paper"]
            
    return SessionOut(
        id=existing.id,
        project_id=existing.project_id,
        query=existing.query,
        status=existing.status,
        state_json=existing.state_json or {},
        created_at=existing.created_at.isoformat() if existing.created_at else None,
    )

@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session_by_id(session_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch details of a specific research session."""
    sess = await db.get(SessionModel, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return SessionOut(
        id=sess.id,
        project_id=sess.project_id,
        query=sess.query,
        status=sess.status,
        state_json=sess.state_json or {},
        created_at=sess.created_at.isoformat() if sess.created_at else None,
    )

@router.get("/artifacts/{session_id}")
async def list_session_artifacts(session_id: str, db: AsyncSession = Depends(get_db)):
    """List generated artifacts for a given research session."""
    result = await db.execute(select(ArtifactModel).where(ArtifactModel.session_id == session_id))
    artifacts = result.scalars().all()
    return [{"id": a.id, "kind": a.kind, "label": a.label, "path": a.path, "content": a.content} for a in artifacts]

@router.get("/workspaces", response_model=List[WorkspaceOut])
async def list_workspaces(db: AsyncSession = Depends(get_db)):
    """List all user research workspaces, sorted newest first."""
    result = await db.execute(select(WorkspaceModel).order_by(WorkspaceModel.created_at.desc()))
    workspaces = result.scalars().all()
    return [
        WorkspaceOut(
            id=w.id,
            title=w.title,
            description=w.description or "",
            created_at=w.created_at.isoformat() if w.created_at else "",
            state_json=w.state_json or {},
        )
        for w in workspaces
    ]

@router.post("/workspaces", response_model=WorkspaceOut)
async def create_workspace(req: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    """Create a new research workspace."""
    if not req.title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace title cannot be empty.")

    ws = WorkspaceModel(
        id=f"ws-{uuid.uuid4().hex[:8]}",
        title=req.title.strip(),
        description=req.description.strip() if req.description else "",
        state_json={},
    )
    db.add(ws)
    await db.commit()
    return WorkspaceOut(
        id=ws.id,
        title=ws.title,
        description=ws.description or "",
        created_at=ws.created_at.isoformat() if ws.created_at else "",
        state_json=ws.state_json or {},
    )

@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(workspace_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch details for a specific research workspace."""
    ws = await db.get(WorkspaceModel, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{workspace_id}' not found.")
    return WorkspaceOut(
        id=ws.id,
        title=ws.title,
        description=ws.description or "",
        created_at=ws.created_at.isoformat() if ws.created_at else "",
        state_json=ws.state_json or {},
    )

@router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a research workspace."""
    ws = await db.get(WorkspaceModel, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{workspace_id}' not found.")
    await db.delete(ws)
    await db.commit()
    return {"status": "deleted", "workspace_id": workspace_id}

CURATED_LIBRARY_PAPERS = [
    {
        "id": "1706.03762",
        "arxiv_id": "1706.03762",
        "title": "Attention Is All You Need",
        "authors": ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit", "Llion Jones", "Aidan N. Gomez", "Lukasz Kaiser", "Illia Polosukhin"],
        "year": 2017,
        "category": "Transformers & Attention",
        "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. We propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism to draw global dependencies between input and output.",
        "benchmarks": ["WMT 2014 English-to-German", "WMT 2014 English-to-French"],
        "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
    },
    {
        "id": "2312.00752",
        "arxiv_id": "2312.00752",
        "title": "Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
        "authors": ["Albert Gu", "Tri Dao"],
        "year": 2023,
        "category": "State Space Models",
        "abstract": "Foundation models, now powering most of the exciting applications in deep learning, are almost universally based on the Transformer architecture. We introduce Mamba, a selective state space model that achieves linear-time sequence modeling with selective state compression, matching Transformer quality at 5x higher throughput.",
        "benchmarks": ["Pile Pretraining", "Long Range Arena", "Audio Generation"],
        "pdf_url": "https://arxiv.org/pdf/2312.00752.pdf",
    },
    {
        "id": "2501.12948",
        "arxiv_id": "2501.12948",
        "title": "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning",
        "authors": ["DeepSeek-AI", "Daya Guo", "Dejian Yang", "Haowei Zhang", "Junxiao Song"],
        "year": 2025,
        "category": "LLM Reasoning & RL",
        "abstract": "We introduce DeepSeek-R1-Zero and DeepSeek-R1, models trained via large-scale reinforcement learning without prior supervised fine-tuning as a step to unlock autonomous reasoning, self-verification, and chain-of-thought expansion for complex mathematical and competitive programming problems.",
        "benchmarks": ["AIME 2024", "MATH-500", "Codeforces", "SWE-bench"],
        "pdf_url": "https://arxiv.org/pdf/2501.12948.pdf",
    },
    {
        "id": "2112.10752",
        "arxiv_id": "2112.10752",
        "title": "High-Resolution Image Synthesis with Latent Diffusion Models",
        "authors": ["Robin Rombach", "Andreas Blattmann", "Dominik Lorenz", "Patrick Esser", "Björn Ommer"],
        "year": 2021,
        "category": "Diffusion & Generative AI",
        "abstract": "By decomposing the image formation process into a sequential application of denoising autoencoders, diffusion models achieve state-of-the-art synthesis results on image data. We propose Latent Diffusion Models (LDM) operating in the latent space of powerful pretrained autoencoders, dramatically reducing computational complexity while retaining synthesis fidelity.",
        "benchmarks": ["ImageNet 256x256", "MS-COCO Text-to-Image", "CelebA-HQ"],
        "pdf_url": "https://arxiv.org/pdf/2112.10752.pdf",
    },
    {
        "id": "2001.08361",
        "arxiv_id": "2001.08361",
        "title": "Scaling Laws for Neural Language Models",
        "authors": ["Jared Kaplan", "Sam McCandlish", "Tom Henighan", "Tom B. Brown", "Benjamin Chess", "Rewon Child", "Scott Gray", "Alec Radford", "Jeffrey Wu", "Dario Amodei"],
        "year": 2020,
        "category": "Scaling & Optimization",
        "abstract": "We investigate empirical scaling laws for language model performance with cross-entropy loss. Loss scales as a power-law with model size, dataset size, and compute used for training, spanning more than seven orders of magnitude.",
        "benchmarks": ["WebText Validation Loss", "Parameter Scaling 10M-100B"],
        "pdf_url": "https://arxiv.org/pdf/2001.08361.pdf",
    },
    {
        "id": "2307.08691",
        "arxiv_id": "2307.08691",
        "title": "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning",
        "authors": ["Tri Dao"],
        "year": 2023,
        "category": "Efficiency & Hardware",
        "abstract": "FlashAttention is an exact attention algorithm that reduces memory IO between GPU HBM and SRAM. We introduce FlashAttention-2, optimizing work partitioning across thread blocks and warps to achieve 2x speedup over FlashAttention and reaching up to 73% of theoretical peak FLOPs on A100/H100 GPUs.",
        "benchmarks": ["A100 SXM4 80GB", "H100 SXM5 80GB", "Sequence Length 512-64k"],
        "pdf_url": "https://arxiv.org/pdf/2307.08691.pdf",
    },
    {
        "id": "2106.09685",
        "arxiv_id": "2106.09685",
        "title": "LoRA: Low-Rank Adaptation of Large Language Models",
        "authors": ["Edward J. Hu", "Yelong Shen", "Phillip Wallis", "Zeyuan Allen-Zhu", "Yuanzhi Li", "Shean Wang", "Lu Wang", "Weizhu Chen"],
        "year": 2021,
        "category": "Efficiency & Fine-Tuning",
        "abstract": "An important paradigm in NLP is fine-tuning large pre-trained language models. We propose Low-Rank Adaptation (LoRA), which freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture, greatly reducing trainable parameters with zero inference latency overhead.",
        "benchmarks": ["GLUE Benchmark", "E2E NLG Challenge", "GPT-3 175B Fine-Tuning"],
        "pdf_url": "https://arxiv.org/pdf/2106.09685.pdf",
    },
    {
        "id": "2005.11401",
        "arxiv_id": "2005.11401",
        "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
        "authors": ["Patrick Lewis", "Ethan Perez", "Aleksandra Piktus", "Fabio Petroni", "Vladimir Karpukhin", "Naman Goyal", "Heinrich Küttler", "Mike Lewis", "Wen-tau Yih", "Tim Rocktäschel", "Sebastian Riedel", "Douwe Kiela"],
        "year": 2020,
        "category": "RAG & Retrieval",
        "abstract": "Large pre-trained language models have been shown to store factual knowledge in their parameters. We explore general-purpose fine-tuning recipes for Retrieval-Augmented Generation (RAG) models combining pre-trained parametric and non-parametric memory for language generation.",
        "benchmarks": ["Natural Questions", "TriviaQA", "WebQuestions", "FEVER Fact Verification"],
        "pdf_url": "https://arxiv.org/pdf/2005.11401.pdf",
    },
    {
        "id": "2310.01405",
        "arxiv_id": "2310.01405",
        "title": "Towards Monosemanticity: Decomposing Language Models With Dictionary Learning",
        "authors": ["Trenton Bricken", "Adly Templeton", "Joshua Batson", "Brian Chen", "Adam Jermyn", "Tom Conerly", "Nick Turner", "Cem Anil", "Carson Denison", "Amanda Askell", "Robert Lasenby", "Yifan Wu", "Shauna Kravec", "Nicholas Schiefer", "Todd Phillips", "Alex Tamkin", "Michael Tao", "Kevin Roose", "Nelson Elhage", "Tom Brown", "Dario Amodei", "Chris Olah"],
        "year": 2023,
        "category": "Mechanistic Interpretability",
        "abstract": "Neural network representations are notoriously difficult to understand because individual neurons often respond to unrelated concepts (polysemanticity). We apply sparse autoencoders (SAEs) as an unsupervised dictionary learning technique to extract monosemantic features from residual stream activations.",
        "benchmarks": ["Sparse Autoencoder Reconstruction Loss", "Monosemantic Feature Interpretability"],
        "pdf_url": "https://arxiv.org/pdf/2310.01405.pdf",
    },
    {
        "id": "2006.04439",
        "arxiv_id": "2006.04439",
        "title": "Liquid Time-Constant Networks",
        "authors": ["Ramin Hasani", "Mathias Lechner", "Alexander Amini", "Daniela Rus", "Radu Grosu"],
        "year": 2020,
        "category": "Liquid & Dynamic Networks",
        "abstract": "We introduce Liquid Time-Constant (LTC) neural networks, a class of continuous-time recurrent neural networks with varying hidden state dynamics. LTC models exhibit high expressive power and robustness in continuous-time modeling and robotics control benchmarks.",
        "benchmarks": ["Half-Cheetah Autonomous Control", "Medical Time Series Forecasting"],
        "pdf_url": "https://arxiv.org/pdf/2006.04439.pdf",
    },
]


@router.get("/library")
async def get_curated_library(db: AsyncSession = Depends(get_db)):
    """Fetch curated foundation papers and cached research publications for the Create Library explorer."""
    return {
        "status": "success",
        "total": len(CURATED_LIBRARY_PAPERS),
        "papers": CURATED_LIBRARY_PAPERS,
    }

