import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes_chat import router as chat_router
from src.api.routes_graph import router as graph_router
from src.api.routes_intelligence import router as intelligence_router
from src.api.routes_litgraph import router as litgraph_router
from src.api.routes_manuscript import router as manuscript_router
from src.api.routes_paper_intelligence import router as paper_intelligence_router
from src.api.routes_rank import router as rank_router
from src.api.routes_search import router as search_router
from src.api.routes_workbench import router as workbench_router
from src.core.config import settings
from src.core.database import init_db
from src.core.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    logger.info("Starting Research Copilot API Server (v%s)...", settings.app_version)
    await init_db()
    yield
    logger.info("Shutting down Research Copilot API Server...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Autonomous AI Research Engineering Platform API",
        lifespan=lifespan,
    )

    # CORS Configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # FastAPI / Starlette Session Middleware for server-side & cookie session tracking
    app.add_middleware(
        SessionMiddleware,
        secret_key=os.environ.get("SESSION_SECRET_KEY", "research-copilot-secure-session-key-2026-prod"),
        session_cookie="rc_session",
        max_age=86400 * 14,
        same_site="lax",
        https_only=False,
    )

    # Health Check Endpoint
    @app.get("/api/v1/health", tags=["Health"])
    async def health_check():
        return {"status": "healthy", "version": settings.app_version}

    # Register All API Routers
    app.include_router(paper_intelligence_router)
    app.include_router(rank_router)
    app.include_router(search_router)
    app.include_router(intelligence_router)
    app.include_router(manuscript_router)
    app.include_router(graph_router)
    app.include_router(litgraph_router)
    app.include_router(workbench_router)
    app.include_router(chat_router)

    # Static Assets for Extracted Markdown & Images
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    dump_dir = os.path.join(project_root, "dump_extract")
    os.makedirs(dump_dir, exist_ok=True)
    os.makedirs(os.path.join(dump_dir, "images"), exist_ok=True)
    os.makedirs(os.path.join(dump_dir, "markdown"), exist_ok=True)
    app.mount("/dump_extract", StaticFiles(directory=dump_dir), name="dump_extract")

    # Static Assets & React SPA Frontend Serving
    dist_dir = os.path.join(project_root, "public_dist")
    assets_dir = os.path.join(dist_dir, "assets")

    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str, request: Request):
        if full_path.startswith("api/") or full_path.startswith("dump_extract/"):
            return None
        dist_index = os.path.join(dist_dir, "index.html")
        if os.path.exists(dist_index):
            return FileResponse(dist_index)
        return {"message": "Research Copilot API"}

    return app


app = create_app()
