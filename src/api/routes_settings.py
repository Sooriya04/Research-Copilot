"""
Settings API - store and retrieve provider API keys in SQLite,
and test live connectivity across all AI model providers.
"""
import time
from typing import Optional, Dict, Any, List
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.core.database import get_db
from src.core.models import UserSettingsModel
from src.core.logger import logger
from src.core.provider_settings import (
    resolve_provider_credentials,
    mask_api_key,
    DEFAULT_PROVIDER_MODELS,
)
from src.providers.gemini import GeminiFlashLiteProvider
from src.providers.groq import GroqProvider
from src.providers.llm import LocalOllamaProvider
from src.providers.openrouter import OpenRouterProvider
from src.providers.deepseek import DeepSeekProvider

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])

KNOWN_PROVIDERS = ["openai", "gemini", "nvidia", "deepseek", "groq", "ollama", "openrouter"]


class ProviderConfig(BaseModel):
    provider_id: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


class TestConnectionRequest(BaseModel):
    provider_id: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


@router.get("/providers")
async def get_providers(db: AsyncSession = Depends(get_db)):
    """Retrieve all provider settings, merging SQLite stored records and .env defaults."""
    result = await db.execute(select(UserSettingsModel))
    rows = result.scalars().all()
    sqlite_map = {row.provider_id: row for row in rows}

    out: List[Dict[str, Any]] = []
    seen = set()

    # 1. Process all known providers
    for p_id in KNOWN_PROVIDERS:
        seen.add(p_id)
        row = sqlite_map.get(p_id)
        creds = await resolve_provider_credentials(p_id)
        default_model = DEFAULT_PROVIDER_MODELS.get(p_id)
        effective_model = (row.model if row and row.model else None) or creds.get("model") or default_model
        effective_base_url = (row.base_url if row and row.base_url else None) or creds.get("base_url")
        is_stored = bool(row and (row.api_key or row.base_url or row.model))
        has_key = bool((row and row.api_key) or creds.get("has_key") or (p_id == "ollama" and effective_base_url))

        out.append({
            "provider_id": p_id,
            "api_key_masked": mask_api_key(row.api_key) if (row and row.api_key) else creds.get("api_key_masked"),
            "base_url": effective_base_url,
            "model": effective_model,
            "has_key": has_key,
            "stored_in_db": is_stored,
            "key_source": "sqlite" if (row and row.api_key) else creds.get("key_source", "none"),
        })

    # 2. Append any custom user-added providers
    for row in rows:
        if row.provider_id not in seen:
            out.append({
                "provider_id": row.provider_id,
                "api_key_masked": mask_api_key(row.api_key),
                "base_url": row.base_url,
                "model": row.model,
                "has_key": bool(row.api_key or row.base_url),
                "stored_in_db": True,
                "key_source": "sqlite",
            })

    return {"providers": out}


@router.post("/providers")
async def save_provider(config: ProviderConfig, db: AsyncSession = Depends(get_db)):
    p_id = config.provider_id.lower().strip()
    result = await db.execute(
        select(UserSettingsModel).where(
            UserSettingsModel.id == "default",
            UserSettingsModel.provider_id == p_id,
        )
    )
    row = result.scalar_one_or_none()
    default_model = DEFAULT_PROVIDER_MODELS.get(p_id)
    clean_model = config.model.strip() if (config.model and config.model.strip()) else None

    if row:
        if config.api_key is not None:
            row.api_key = config.api_key.strip() if config.api_key else None
        if config.base_url is not None:
            row.base_url = config.base_url.strip() if config.base_url else None
        if clean_model is not None:
            row.model = clean_model
        elif not row.model and default_model:
            row.model = default_model
    else:
        row = UserSettingsModel(
            id="default",
            provider_id=p_id,
            api_key=config.api_key.strip() if config.api_key else None,
            base_url=config.base_url.strip() if config.base_url else None,
            model=clean_model or default_model,
        )
        db.add(row)
    await db.commit()
    logger.info("Saved settings for provider: %s (model: %s)", p_id, row.model)
    return {"ok": True, "provider_id": p_id, "model": row.model}


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    p_id = provider_id.lower().strip()
    await db.execute(
        delete(UserSettingsModel).where(
            UserSettingsModel.id == "default",
            UserSettingsModel.provider_id == p_id,
        )
    )
    await db.commit()
    logger.info("Deleted settings for provider: %s", p_id)
    return {"ok": True}


@router.get("/providers/{provider_id}/key")
async def get_provider_key(provider_id: str, db: AsyncSession = Depends(get_db)):
    """Raw key for server-side LLM calls only."""
    p_id = provider_id.lower().strip()
    result = await db.execute(
        select(UserSettingsModel).where(
            UserSettingsModel.id == "default",
            UserSettingsModel.provider_id == p_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"No config for provider: {p_id}")
    return {"provider_id": p_id, "api_key": row.api_key, "base_url": row.base_url, "model": row.model}


# ---------------------------------------------------------------------------
# Provider Connection Testing
# ---------------------------------------------------------------------------

async def _test_openai(api_key: str, base_url: str = "", model: str = "") -> Dict[str, Any]:
    target_model = (model or "gpt-4o").strip()
    if not api_key:
        return {"success": False, "latency_ms": 0.0, "error": "OpenAI API key is missing.", "model": target_model}
    start = time.perf_counter()
    url = (base_url or "https://api.openai.com/v1").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": target_model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{url}/chat/completions", headers=headers, json=payload)
            latency = round((time.perf_counter() - start) * 1000, 2)
            if resp.status_code == 200:
                return {
                    "success": True,
                    "latency_ms": latency,
                    "message": f"Connected & verified OpenAI model '{target_model}'",
                    "model": target_model,
                }
            elif resp.status_code == 401:
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": "Authentication failed: Invalid OpenAI API key (HTTP 401).",
                    "model": target_model,
                }
            else:
                err_msg = resp.text[:120]
                try:
                    err_msg = resp.json().get("error", {}).get("message") or err_msg
                except Exception:
                    pass
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": f"OpenAI model '{target_model}' check failed: {err_msg}",
                    "model": target_model,
                }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 2)
        return {"success": False, "latency_ms": latency, "error": f"Failed reaching OpenAI: {str(e)}", "model": target_model}


async def _test_nvidia(api_key: str, base_url: str = "", model: str = "") -> Dict[str, Any]:
    target_model = (model or "meta/llama-3.3-70b-instruct").strip()
    if not api_key:
        return {"success": False, "latency_ms": 0.0, "error": "NVIDIA API key is missing.", "model": target_model}
    start = time.perf_counter()
    url = (base_url or "https://integrate.api.nvidia.com/v1").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": target_model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{url}/chat/completions", headers=headers, json=payload)
            latency = round((time.perf_counter() - start) * 1000, 2)
            if resp.status_code == 200:
                return {
                    "success": True,
                    "latency_ms": latency,
                    "message": f"Connected & verified NVIDIA NIM model '{target_model}'",
                    "model": target_model,
                }
            elif resp.status_code == 401:
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": "Authentication failed: Invalid NVIDIA API key (HTTP 401).",
                    "model": target_model,
                }
            else:
                err_msg = resp.text[:120]
                try:
                    err_msg = resp.json().get("error", {}).get("message") or err_msg
                except Exception:
                    pass
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": f"NVIDIA model '{target_model}' check failed: {err_msg}",
                    "model": target_model,
                }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 2)
        return {"success": False, "latency_ms": latency, "error": f"Failed reaching NVIDIA NIM: {str(e)}", "model": target_model}


@router.post("/test-connection")
async def test_provider_connection_endpoint(req: TestConnectionRequest):
    """Test connectivity to any configured provider and measure round-trip latency."""
    p_id = req.provider_id.lower().strip()
    logger.info("📡 [SettingsAPI] Testing connection for provider '%s' with model '%s'...", p_id, req.model)

    creds = await resolve_provider_credentials(
        provider_id=p_id,
        explicit_key=req.api_key,
        explicit_model=req.model,
        explicit_base_url=req.base_url,
    )
    api_key = creds.get("api_key") or ""
    base_url = creds.get("base_url") or ""
    model = (req.model or creds.get("model") or "").strip()

    if p_id == "gemini":
        prov = GeminiFlashLiteProvider(api_key=api_key, model=model or "gemini-3.5-flash-lite")
        res = await prov.test_connection(model=model)
    elif p_id == "groq":
        prov = GroqProvider(api_key=api_key, model=model or "qwen/qwen3.8-27b")
        res = await prov.test_connection(model=model)
    elif p_id == "ollama":
        prov = LocalOllamaProvider(base_url=base_url, model=model)
        res = await prov.test_connection(model=model)
    elif p_id == "openrouter":
        prov = OpenRouterProvider(api_key=api_key, model=model, base_url=base_url)
        res = await prov.test_connection(model=model)
    elif p_id == "openai":
        res = await _test_openai(api_key=api_key, base_url=base_url, model=model)
    elif p_id == "nvidia":
        res = await _test_nvidia(api_key=api_key, base_url=base_url, model=model)
    elif p_id == "deepseek":
        prov = DeepSeekProvider(api_key=api_key, model=model or "deepseek-chat", base_url=base_url)
        res = await prov.test_connection(model=model)
    else:
        res = {
            "success": False,
            "latency_ms": 0.0,
            "error": f"Unsupported provider: '{p_id}'",
        }

    res["provider_id"] = p_id
    res["key_source"] = creds["key_source"]
    res["stored_in_db"] = creds["stored_in_db"]
    res["model"] = model
    return res
