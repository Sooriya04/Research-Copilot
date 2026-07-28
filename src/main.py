import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.router import router as api_router

# Configure standard logging to output to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("research_copilot")
logger.info("Initializing Research Copilot server logging...")


app = FastAPI(
    title="Research Copilot API",
    description="Autonomous AI Research Engineering Platform - Literature Ingestion & RAG Services",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(api_router)


@app.get("/", tags=["Root"])
async def root():
    return {
        "title": "Research Copilot API 🚀",
        "description": "Autonomous AI Research Engineering Platform",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_check": "/api/v1/health",
        "search_endpoint": "/api/v1/search/arxiv?query=attention+is+all+you+need&top_k=5",
    }


if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
