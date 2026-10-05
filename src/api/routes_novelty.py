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
from src.providers.openrouter import OpenRouterProvider
from src.providers.nvidia import NvidiaProvider

from src.core.provider_settings import (
    resolve_provider_credentials,
    save_provider_config,
    delete_provider_config,
    get_saved_provider_config,
)

router = APIRouter(prefix="/api/v1/novelty", tags=["Novelty Studio"])

_novelty_engine = GraphNoveltyEngine()


class NoveltyStudioRequest(BaseModel):
    topic: Optional[str] = "Literature Synthesis"
    workspace_id: Optional[str] = None
    paper_ids: List[str] = Field(default_factory=list)
    provider: str = Field(default="gemini", description="gemini | groq | ollama | openrouter | nvidia | all")
    providers: Optional[List[str]] = Field(default=None, description="List of providers for multi-model synthesis")
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    force_refresh: bool = False


class ProviderTestRequest(BaseModel):
    provider: str = "gemini"
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class SaveProviderKeyRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


class AddNoveltyToGraphRequest(BaseModel):
    workspace_id: Optional[str] = None
    topic: Optional[str] = "Literature Synthesis"
    novelty: Dict[str, Any]


@router.get("/providers-status")
async def get_providers_status():
    """Returns live connection and configuration status for Gemini, Groq, and Ollama with SQLite DB persistence indicators."""
    gemini_creds = await resolve_provider_credentials("gemini")
    groq_creds = await resolve_provider_credentials("groq")
    ollama_creds = await resolve_provider_credentials("ollama")
    openrouter_creds = await resolve_provider_credentials("openrouter")
    nvidia_creds = await resolve_provider_credentials("nvidia")

    # Probe Groq dynamic models if key is present
    groq_models = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"]
    if groq_creds.get("has_key"):
        try:
            gp = GroqProvider(api_key=groq_creds["api_key"])
            live_models = await gp.list_models()
            if live_models:
                groq_models = live_models
        except Exception:
            pass

    # Probe Ollama locally
    ollama_url = ollama_creds.get("base_url") or settings.ollama_base_url
    ollama_provider = LocalOllamaProvider(base_url=ollama_url)
    ollama_check = await ollama_provider.test_connection()
    ollama_models = ollama_check.get("models", []) if ollama_check.get("success") else []
    phi_match = next((m for m in ollama_models if "phi4" in m.lower()), None)
    default_ollama = ollama_creds.get("model") or phi_match or (ollama_models[0] if ollama_models else "phi4-mini")

    return {
        "providers": {
            "gemini": {
                "name": "Google Gemini",
                "configured": gemini_creds["has_key"],
                "has_key": gemini_creds["has_key"],
                "stored_in_db": gemini_creds["stored_in_db"],
                "key_source": gemini_creds["key_source"],
                "api_key_masked": gemini_creds["api_key_masked"],
                "default_model": gemini_creds.get("model") or "gemini-3.5-flash-lite",
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
                "configured": groq_creds["has_key"],
                "has_key": groq_creds["has_key"],
                "stored_in_db": groq_creds["stored_in_db"],
                "key_source": groq_creds["key_source"],
                "api_key_masked": groq_creds["api_key_masked"],
                "default_model": groq_creds.get("model") or (groq_models[0] if groq_models else "qwen/qwen3.8-27b"),
                "supported_models": groq_models,
                "badge": "Ultra Speed",
            },
            "ollama": {
                "name": "Local Ollama",
                "configured": ollama_check.get("success", False),
                "online": ollama_check.get("success", False),
                "stored_in_db": ollama_creds["stored_in_db"],
                "base_url": ollama_url,
                "default_model": default_ollama,
                "supported_models": ollama_models if ollama_models else ["phi4-mini", "llama3", "mistral", "qwen2.5"],
                "latency_ms": ollama_check.get("latency_ms"),
                "badge": "Local & Private",
            },
            "openrouter": {
                "name": "OpenRouter",
                "configured": openrouter_creds["has_key"],
                "has_key": openrouter_creds["has_key"],
                "stored_in_db": openrouter_creds["stored_in_db"],
                "key_source": openrouter_creds["key_source"],
                "api_key_masked": openrouter_creds["api_key_masked"],
                "default_model": openrouter_creds.get("model") or "anthropic/claude-3.5-sonnet",
                "supported_models": [
                    "anthropic/claude-3.5-sonnet",
                    "deepseek/deepseek-r1",
                    "meta-llama/llama-3.3-70b-instruct",
                    "google/gemini-2.0-flash-001",
                    "openai/gpt-4o-mini",
                ],
                "badge": "Universal Frontier",
            },
            "nvidia": {
                "name": "NVIDIA NIM",
                "configured": nvidia_creds["has_key"],
                "has_key": nvidia_creds["has_key"],
                "stored_in_db": nvidia_creds["stored_in_db"],
                "key_source": nvidia_creds["key_source"],
                "api_key_masked": nvidia_creds["api_key_masked"],
                "default_model": nvidia_creds.get("model") or "meta/llama-3.3-70b-instruct",
                "supported_models": [
                    "meta/llama-3.3-70b-instruct",
                    "nvidia/llama-3.1-nemotron-70b-instruct",
                    "deepseek-ai/deepseek-r1",
                    "mistralai/mixtral-8x22b-instruct-v0.1",
                    "meta/llama-3.1-405b-instruct",
                    "meta/llama-3.1-8b-instruct",
                ],
                "badge": "Enterprise NIM",
            },
        },
        "system_time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@router.post("/save-provider-key")
async def save_provider_key_endpoint(req: SaveProviderKeyRequest):
    """Save provider API key, base URL, and/or model into SQLite user_settings table."""
    p_name = req.provider.lower().strip()
    logger.info("💾 [NoveltyAPI] Storing credentials in SQLite DB for provider '%s'...", p_name)
    save_res = await save_provider_config(
        provider_id=p_name,
        api_key=req.api_key,
        base_url=req.base_url,
        model=req.model,
    )
    if not save_res.get("success"):
        raise HTTPException(status_code=500, detail=f"Failed saving key for {p_name}: {save_res.get('error')}")

    # Immediately probe connection to give instant feedback
    latency_ms = None
    online = False
    try:
        if p_name == "groq":
            prov = GroqProvider(api_key=req.api_key, model=req.model)
            t_res = await prov.test_connection()
            online = t_res.get("success", False)
            latency_ms = t_res.get("latency_ms")
        elif p_name == "gemini":
            prov = GeminiFlashLiteProvider(api_key=req.api_key, model=req.model or "gemini-3.5-flash-lite")
            t_res = await prov.test_connection()
            online = t_res.get("success", False)
            latency_ms = t_res.get("latency_ms")
        elif p_name == "ollama":
            prov = LocalOllamaProvider(base_url=req.base_url, model=req.model)
            t_res = await prov.test_connection()
            online = t_res.get("success", False)
            latency_ms = t_res.get("latency_ms")
        elif p_name == "openrouter":
            prov = OpenRouterProvider(api_key=req.api_key, model=req.model, base_url=req.base_url)
            t_res = await prov.test_connection(model=req.model)
            online = t_res.get("success", False)
            latency_ms = t_res.get("latency_ms")
        elif p_name == "nvidia":
            prov = NvidiaProvider(api_key=req.api_key, model=req.model, base_url=req.base_url)
            t_res = await prov.test_connection(model=req.model)
            online = t_res.get("success", False)
            latency_ms = t_res.get("latency_ms")
    except Exception as e:
        logger.warning("[NoveltyAPI] Post-save probe error for '%s': %s", p_name, e)

    return {
        "success": True,
        "provider": p_name,
        "stored_in_db": True,
        "has_key": save_res.get("has_key", False),
        "api_key_masked": save_res.get("api_key_masked"),
        "model": save_res.get("model"),
        "base_url": save_res.get("base_url"),
        "online": online,
        "latency_ms": latency_ms,
        "message": f"Successfully stored credentials for {p_name.upper()} in SQLite database.",
    }


@router.delete("/remove-provider-key/{provider}")
async def remove_provider_key_endpoint(provider: str):
    """Remove provider settings from SQLite database."""
    p_name = provider.lower().strip()
    logger.info("🗑️ [NoveltyAPI] Removing SQLite credentials for provider '%s'...", p_name)
    ok = await delete_provider_config(p_name)
    return {"success": ok, "provider": p_name, "message": f"Removed {p_name} settings from SQLite database."}


@router.post("/test-connection")
async def test_provider_connection(req: ProviderTestRequest):
    """Test connectivity to a selected LLM provider and measure latency."""
    p_name = req.provider.lower().strip()
    logger.info("📡 [NoveltyAPI] Testing connection to provider '%s'...", p_name)

    creds = await resolve_provider_credentials(
        provider_id=p_name,
        explicit_key=req.api_key,
        explicit_model=req.model,
        explicit_base_url=req.base_url,
    )

    target_model = req.model or creds["model"]

    if p_name == "groq":
        provider = GroqProvider(api_key=creds["api_key"], model=target_model or "qwen/qwen3.8-27b")
        res = await provider.test_connection(model=target_model)
        res["provider"] = "groq"
        res["key_source"] = creds["key_source"]
        res["stored_in_db"] = creds["stored_in_db"]
        return res
    elif p_name == "ollama":
        provider = LocalOllamaProvider(base_url=creds["base_url"], model=target_model)
        res = await provider.test_connection(model=target_model)
        res["provider"] = "ollama"
        res["stored_in_db"] = creds["stored_in_db"]
        return res
    elif p_name == "openrouter":
        provider = OpenRouterProvider(api_key=creds["api_key"], model=target_model, base_url=creds["base_url"])
        res = await provider.test_connection(model=target_model)
        res["provider"] = "openrouter"
        res["key_source"] = creds["key_source"]
        res["stored_in_db"] = creds["stored_in_db"]
        return res
    elif p_name == "nvidia":
        provider = NvidiaProvider(api_key=creds["api_key"], model=target_model, base_url=creds["base_url"])
        res = await provider.test_connection(model=target_model)
        res["provider"] = "nvidia"
        res["key_source"] = creds["key_source"]
        res["stored_in_db"] = creds["stored_in_db"]
        return res
    else:
        provider = GeminiFlashLiteProvider(api_key=creds["api_key"], model=target_model or "gemini-3.5-flash-lite")
        res = await provider.test_connection(model=target_model)
        res["provider"] = "gemini"
        res["key_source"] = creds["key_source"]
        res["stored_in_db"] = creds["stored_in_db"]
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
    Main Novelty Studio synthesis endpoint supporting Gemini, Groq, Ollama, OpenRouter, NVIDIA, or Multi-Model concurrent runs.
    Returns synthesized proposals with live telemetry and execution timing.
    """
    start_time = time.perf_counter()
    logger.info(
        "⚡ [NoveltyAPI] Received synthesis request: provider='%s', providers=%s, model='%s', papers_count=%d, topic='%s', force_refresh=%s",
        req.provider,
        req.providers,
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
            providers=req.providers,
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
