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
from src.core.provider_settings import resolve_provider_credentials, mask_api_key
from src.providers.gemini import GeminiFlashLiteProvider
from src.providers.groq import GroqProvider
from src.providers.llm import LocalOllamaProvider
from src.providers.openrouter import OpenRouterProvider

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])

KNOWN_PROVIDERS = ["openai", "gemini", "nvidia", "groq", "ollama", "openrouter"]


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
        if row and (row.api_key or row.base_url or row.model):
            out.append({
                "provider_id": p_id,
                "api_key_masked": mask_api_key(row.api_key),
                "base_url": row.base_url,
                "model": row.model,
                "has_key": bool(row.api_key or row.base_url),
                "stored_in_db": True,
                "key_source": "sqlite",
            })
        else:
            # Check env fallback
            creds = await resolve_provider_credentials(p_id)
            has_env = creds["key_source"] == "env" or (p_id == "ollama" and bool(creds.get("base_url")))
            out.append({
                "provider_id": p_id,
                "api_key_masked": creds["api_key_masked"] if has_env else None,
                "base_url": creds.get("base_url"),
                "model": creds.get("model"),
                "has_key": bool(creds.get("has_key") or (p_id == "ollama" and bool(creds.get("base_url")))),
                "stored_in_db": False,
                "key_source": creds["key_source"],
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
    if row:
        if config.api_key is not None:
            row.api_key = config.api_key
        if config.base_url is not None:
            row.base_url = config.base_url
        if config.model is not None:
            row.model = config.model
    else:
        row = UserSettingsModel(
            id="default",
            provider_id=p_id,
            api_key=config.api_key,
            base_url=config.base_url,
            model=config.model,
        )
        db.add(row)
    await db.commit()
    logger.info("Saved settings for provider: %s", p_id)
    return {"ok": True, "provider_id": p_id}


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
    if not api_key:
        return {"success": False, "latency_ms": 0.0, "error": "OpenAI API key is missing."}
    start = time.perf_counter()
    url = (base_url or "https://api.openai.com/v1").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{url}/models", headers=headers)
            latency = round((time.perf_counter() - start) * 1000, 2)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                models = [m.get("id") for m in data if m.get("id")]
                return {
                    "success": True,
                    "latency_ms": latency,
                    "message": f"Connected to OpenAI ({len(models)} models available)",
                    "models": models[:10],
                }
            elif resp.status_code == 401:
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": "Authentication failed: Invalid OpenAI API key (HTTP 401).",
                }
            return {
                "success": False,
                "latency_ms": latency,
                "error": f"OpenAI check failed (HTTP {resp.status_code}): {resp.text[:120]}",
            }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 2)
        return {"success": False, "latency_ms": latency, "error": f"Failed reaching OpenAI: {str(e)}"}


async def _test_nvidia(api_key: str, base_url: str = "", model: str = "") -> Dict[str, Any]:
    if not api_key:
        return {"success": False, "latency_ms": 0.0, "error": "NVIDIA API key is missing."}
    start = time.perf_counter()
    url = (base_url or "https://integrate.api.nvidia.com/v1").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{url}/models", headers=headers)
            latency = round((time.perf_counter() - start) * 1000, 2)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                models = [m.get("id") for m in data if m.get("id")]
                return {
                    "success": True,
                    "latency_ms": latency,
                    "message": f"Connected to NVIDIA NIM ({len(models)} models available)",
                    "models": models[:10],
                }
            elif resp.status_code == 401:
                return {
                    "success": False,
                    "latency_ms": latency,
                    "error": "Authentication failed: Invalid NVIDIA API key (HTTP 401).",
                }
            return {
                "success": False,
                "latency_ms": latency,
                "error": f"NVIDIA check failed (HTTP {resp.status_code}): {resp.text[:120]}",
            }
    except Exception as e:
        latency = round((time.perf_counter() - start) * 1000, 2)
        return {"success": False, "latency_ms": latency, "error": f"Failed reaching NVIDIA NIM: {str(e)}"}


@router.post("/test-connection")
async def test_provider_connection_endpoint(req: TestConnectionRequest):
    """Test connectivity to any configured provider and measure round-trip latency."""
    p_id = req.provider_id.lower().strip()
    logger.info("📡 [SettingsAPI] Testing connection for provider '%s'...", p_id)

    creds = await resolve_provider_credentials(
        provider_id=p_id,
        explicit_key=req.api_key,
        explicit_model=req.model,
        explicit_base_url=req.base_url,
    )
    api_key = creds.get("api_key") or ""
    base_url = creds.get("base_url") or ""
    model = creds.get("model") or ""

    if p_id == "gemini":
        prov = GeminiFlashLiteProvider(api_key=api_key, model=model or "gemini-3.5-flash-lite")
        res = await prov.test_connection()
    elif p_id == "groq":
        prov = GroqProvider(api_key=api_key, model=model or "qwen/qwen3.8-27b")
        res = await prov.test_connection()
    elif p_id == "ollama":
        prov = LocalOllamaProvider(base_url=base_url, model=model)
        res = await prov.test_connection()
    elif p_id == "openrouter":
        prov = OpenRouterProvider(api_key=api_key, model=model, base_url=base_url)
        res = await prov.test_connection()
    elif p_id == "openai":
        res = await _test_openai(api_key=api_key, base_url=base_url, model=model)
    elif p_id == "nvidia":
        res = await _test_nvidia(api_key=api_key, base_url=base_url, model=model)
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
