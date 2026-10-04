import datetime
import os
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.core.config import settings
from src.core.logger import logger
from src.graph.novelty_engine import GraphNoveltyEngine, NoveltyItem
from src.graph.schema import NodeType
from src.graph.store import ResearchGraphStore
from src.providers.gemini import GeminiFlashLiteProvider
from src.providers.groq import GroqProvider
from src.providers.llm import LocalOllamaProvider

router = APIRouter(prefix="/api/v1/novelty", tags=["Novelty Studio"])

_novelty_engine = GraphNoveltyEngine()


class NoveltyStudioRequest(BaseModel):
    topic: Optional[str] = "Literature Synthesis"
    workspace_id: Optional[str] = None
    paper_ids: List[str] = Field(default_factory=list)
    provider: str = Field(default="gemini", description="gemini | groq | ollama | all")
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    force_refresh: bool = False


class ProviderTestRequest(BaseModel):
    provider: str = "gemini"
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class AddNoveltyToGraphRequest(BaseModel):
    workspace_id: Optional[str] = None
    topic: Optional[str] = "Literature Synthesis"
    novelty: Dict[str, Any]


@router.get("/providers-status")
async def get_providers_status():
    """Returns live connection and configuration status for Gemini, Groq, and Ollama."""
    gemini_key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
    groq_key = settings.groq_api_key or os.getenv("GROQ_API_KEY", "")

    # Probe Ollama locally
    ollama_provider = LocalOllamaProvider(base_url=settings.ollama_base_url)
    ollama_check = await ollama_provider.test_connection()
    ollama_models = ollama_check.get("models", []) if ollama_check.get("success") else []

    return {
        "providers": {
            "gemini": {
                "name": "Google Gemini",
                "configured": bool(gemini_key),
                "has_key": bool(gemini_key),
                "default_model": "gemini-3.5-flash-lite",
                "supported_models": [
                    "gemini-3.5-flash-lite",
                    "gemini-2.5-flash-lite",
                    "gemini-1.5-flash",
                    "gemini-1.5-pro",
                ],
                "badge": "Cloud Fast",
            },
            "groq": {
                "name": "Groq LPU",
                "configured": bool(groq_key),
                "has_key": bool(groq_key),
                "default_model": "llama-3.3-70b-versatile",
                "supported_models": [
                    "llama-3.3-70b-versatile",
                    "llama-3.1-8b-instant",
                    "deepseek-r1-distill-llama-70b",
                    "mixtral-8x7b-32768",
                ],
                "badge": "Ultra Speed",
            },
            "ollama": {
                "name": "Local Ollama",
                "configured": ollama_check.get("success", False),
                "online": ollama_check.get("success", False),
                "base_url": settings.ollama_base_url,
                "default_model": ollama_models[0] if ollama_models else "llama3",
                "supported_models": ollama_models if ollama_models else ["llama3", "mistral", "qwen2.5", "deepseek-r1"],
                "latency_ms": ollama_check.get("latency_ms"),
                "badge": "Local & Private",
            },
        },
        "system_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@router.post("/test-connection")
async def test_provider_connection(req: ProviderTestRequest):
    """Test connectivity to a selected LLM provider and measure latency."""
    p_name = req.provider.lower().strip()
    logger.info("📡 [NoveltyAPI] Testing connection to provider '%s'...", p_name)

    if p_name == "groq":
        provider = GroqProvider(api_key=req.api_key, model=req.model or "llama-3.3-70b-versatile")
        res = await provider.test_connection()
        res["provider"] = "groq"
        return res
    elif p_name == "ollama":
        provider = LocalOllamaProvider(base_url=req.base_url)
        res = await provider.test_connection()
        res["provider"] = "ollama"
        return res
    else:
        provider = GeminiFlashLiteProvider(api_key=req.api_key, model=req.model or "gemini-3.5-flash-lite")
        res = await provider.test_connection()
        res["provider"] = "gemini"
        return res


@router.get("/workspace-papers")
async def get_workspace_papers(workspace_id: Optional[str] = None):
    """Get active papers loaded in the knowledge graph for novelty synthesis."""
    await _novelty_engine.store._ensure_initialized()
    paper_nodes = []
    for nid in _novelty_engine.store.graph.nodes:
        n = await _novelty_engine.store.get_node(nid)
        if n and getattr(n, "node_type", None) == NodeType.PAPER:
            p_dict = n.model_dump() if hasattr(n, "model_dump") else getattr(n, "__dict__", {})
            paper_nodes.append({
                "id": n.id,
                "title": p_dict.get("title") or n.id,
                "year": p_dict.get("year"),
                "authors": p_dict.get("authors") or [],
                "methods": p_dict.get("methods") or [],
                "datasets": p_dict.get("datasets") or [],
            })
    return {"papers": paper_nodes, "count": len(paper_nodes)}


@router.post("/synthesize")
async def synthesize_novelties_endpoint(req: NoveltyStudioRequest):
    """
    Main Novelty Studio synthesis endpoint supporting Gemini, Groq, Ollama, or Multi-Model concurrent runs.
    Returns synthesized proposals with live telemetry and execution timing.
    """
    start_time = time.perf_counter()
    logger.info(
        "⚡ [NoveltyAPI] Received synthesis request: provider='%s', model='%s', papers_count=%d, topic='%s', force_refresh=%s",
        req.provider,
        req.model or "default",
        len(req.paper_ids),
        req.topic,
        req.force_refresh,
    )

    try:
        result = await _novelty_engine.synthesize_novelties(
            workspace_id=req.workspace_id,
            topic=req.topic,
            paper_ids=req.paper_ids,
            provider_name=req.provider,
            model=req.model,
            api_key=req.api_key,
            base_url=req.base_url,
            force_refresh=req.force_refresh,
        )
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Attach telemetry data for frontend diagnostics HUD
        result["telemetry"] = {
            "received_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "duration_ms": elapsed_ms,
            "status": "OK",
            "provider_used": result.get("provider", req.provider),
            "model_used": result.get("model", req.model or "default"),
            "papers_processed": len(req.paper_ids),
            "proposals_generated": len(result.get("novelties", [])),
            "cached": result.get("cached", False),
        }

        logger.info(
            "✅ [NoveltyAPI] Synthesis completed in %.2fms (status=%s, proposals=%d)",
            elapsed_ms,
            result.get("status"),
            len(result.get("novelties", [])),
        )
        return result

    except Exception as e:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error("❌ [NoveltyAPI] Synthesis failed after %.2fms: %s", elapsed_ms, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": str(e),
                "telemetry": {
                    "received_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "duration_ms": elapsed_ms,
                    "status": "ERROR",
                    "provider": req.provider,
                },
            },
        )


@router.post("/add-to-graph")
async def add_novelty_to_graph_endpoint(req: AddNoveltyToGraphRequest):
    """Inject a novelty proposal directly as a candidate node into the knowledge graph store."""
    try:
        result = await _novelty_engine.add_novelty_candidate_node(
            workspace_id=req.workspace_id or "global",
            novelty=req.novelty,
        )
        return result
    except Exception as e:
        logger.error("[NoveltyAPI] Failed to add candidate node to graph: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
