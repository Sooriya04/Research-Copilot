"""
Provider Settings Helper - Persistent storage and resolution of LLM API keys in SQLite.
"""
from typing import Optional, Dict, Any
from sqlalchemy import select, delete
from src.core.database import get_db_session
from src.core.models import UserSettingsModel
from src.core.config import settings
from src.core.logger import logger
import os


def mask_api_key(key: Optional[str]) -> Optional[str]:
    """Return a masked representation of an API key for safe UI display."""
    if not key:
        return None
    key_str = key.strip()
    if len(key_str) <= 10:
        return "***"
    return f"{key_str[:6]}...{key_str[-4:]}"


async def get_saved_provider_config(provider_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve saved API key, model, and base_url from SQLite user_settings table."""
    p_id = (provider_id or "").lower().strip()
    try:
        async with get_db_session() as session:
            stmt = select(UserSettingsModel).where(
                UserSettingsModel.id == "default",
                UserSettingsModel.provider_id == p_id,
            )
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row:
                return {
                    "provider_id": row.provider_id,
                    "api_key": row.api_key,
                    "base_url": row.base_url,
                    "model": row.model,
                    "api_key_masked": mask_api_key(row.api_key),
                    "has_key": bool(row.api_key),
                }
    except Exception as e:
        logger.warning("[ProviderSettings] Failed reading SQLite settings for '%s': %s", p_id, e)
    return None


DEFAULT_PROVIDER_MODELS = {
    "gemini": "gemini-3.5-flash-lite",
    "groq": "qwen/qwen3.8-27b",
    "ollama": "phi4-mini",
    "openrouter": "anthropic/claude-3.5-sonnet",
    "openai": "gpt-4o",
    "nvidia": "meta/llama-3.3-70b-instruct",
    "deepseek": "deepseek-chat",
}


async def save_provider_config(
    provider_id: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Save or update API key, base_url, or model in SQLite user_settings table."""
    p_id = (provider_id or "").lower().strip()
    default_model = DEFAULT_PROVIDER_MODELS.get(p_id)
    clean_model = model.strip() if (model and model.strip()) else None

    try:
        async with get_db_session() as session:
            stmt = select(UserSettingsModel).where(
                UserSettingsModel.id == "default",
                UserSettingsModel.provider_id == p_id,
            )
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row:
                if api_key is not None:
                    row.api_key = api_key.strip() if api_key else None
                if base_url is not None:
                    row.base_url = base_url.strip() if base_url else None
                if clean_model is not None:
                    row.model = clean_model
                elif not row.model and default_model:
                    row.model = default_model
            else:
                row = UserSettingsModel(
                    id="default",
                    provider_id=p_id,
                    api_key=api_key.strip() if api_key else None,
                    base_url=base_url.strip() if base_url else None,
                    model=clean_model or default_model,
                )
                session.add(row)
            await session.commit()
            logger.info("✅ [ProviderSettings] Successfully saved settings for '%s' to SQLite DB (model: %s)", p_id, row.model)
            return {
                "success": True,
                "provider_id": p_id,
                "has_key": bool(row.api_key or (p_id == "ollama" and row.base_url)),
                "api_key_masked": mask_api_key(row.api_key),
                "base_url": row.base_url,
                "model": row.model,
            }
    except Exception as e:
        logger.error("❌ [ProviderSettings] Error saving settings for '%s' to SQLite: %s", p_id, e)
        return {"success": False, "error": str(e), "provider_id": p_id}


async def delete_provider_config(provider_id: str) -> bool:
    """Delete provider settings from SQLite user_settings table."""
    p_id = (provider_id or "").lower().strip()
    try:
        async with get_db_session() as session:
            stmt = delete(UserSettingsModel).where(
                UserSettingsModel.id == "default",
                UserSettingsModel.provider_id == p_id,
            )
            await session.execute(stmt)
            await session.commit()
            logger.info("🗑️ [ProviderSettings] Deleted settings for '%s' from SQLite DB", p_id)
            return True
    except Exception as e:
        logger.warning("[ProviderSettings] Failed deleting settings for '%s': %s", p_id, e)
        return False


async def resolve_provider_credentials(
    provider_id: str,
    explicit_key: Optional[str] = None,
    explicit_model: Optional[str] = None,
    explicit_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Hierarchically resolves credentials for a provider:
    1. Explicit values passed in the immediate request
    2. Stored persistent values in SQLite DB (user_settings table)
    3. Environment variables / settings config
    """
    p_id = (provider_id or "gemini").lower().strip()
    db_config = await get_saved_provider_config(p_id) or {}

    # 1. Resolve API Key
    resolved_key = (explicit_key or "").strip()
    key_source = "request"
    if not resolved_key and db_config.get("api_key"):
        resolved_key = db_config["api_key"]
        key_source = "sqlite"
    if not resolved_key:
        if p_id == "gemini":
            resolved_key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
        elif p_id == "groq":
            resolved_key = (
                settings.groq_api_key
                or os.getenv("GROQ_API_KEY", "")
                or os.getenv("grok_API", "")
                or os.getenv("GROK_API", "")
            )
        elif p_id == "openrouter":
            resolved_key = settings.openrouter_api_key or os.getenv("OPENROUTER_API_KEY", "")
        elif p_id == "openai":
            resolved_key = settings.openai_api_key or os.getenv("OPENAI_API_KEY", "")
        elif p_id == "nvidia":
            resolved_key = getattr(settings, "nvidia_api_key", None) or os.getenv("NVIDIA_API_KEY", "")
        elif p_id == "deepseek":
            resolved_key = getattr(settings, "deepseek_api_key", None) or os.getenv("DEEPSEEK_API_KEY", "")
        if resolved_key:
            key_source = "env"

    # 2. Resolve Base URL
    resolved_base_url = (explicit_base_url or "").strip()
    if not resolved_base_url and db_config.get("base_url"):
        resolved_base_url = db_config["base_url"]
    if not resolved_base_url:
        if p_id == "ollama":
            resolved_base_url = settings.ollama_base_url or "http://localhost:11434"
        elif p_id == "openrouter":
            resolved_base_url = "https://openrouter.ai/api/v1"
        elif p_id == "openai":
            resolved_base_url = "https://api.openai.com/v1"
        elif p_id == "nvidia":
            resolved_base_url = "https://integrate.api.nvidia.com/v1"
        elif p_id == "deepseek":
            resolved_base_url = getattr(settings, "deepseek_base_url", None) or "https://api.deepseek.com"

    # 3. Resolve Model
    resolved_model = (explicit_model or "").strip()
    if not resolved_model and db_config.get("model"):
        resolved_model = db_config["model"]
    if not resolved_model:
        if p_id == "gemini":
            resolved_model = "gemini-3.5-flash-lite"
        elif p_id == "groq":
            resolved_model = "qwen/qwen3.8-27b"
        elif p_id == "ollama":
            resolved_model = getattr(settings, "ollama_model", "phi4-mini")
        elif p_id == "openrouter":
            resolved_model = "anthropic/claude-3.5-sonnet"
        elif p_id == "openai":
            resolved_model = "gpt-4o"
        elif p_id == "nvidia":
            resolved_model = "meta/llama-3.3-70b-instruct"
        elif p_id == "deepseek":
            resolved_model = getattr(settings, "deepseek_model", None) or "deepseek-chat"

    return {
        "provider_id": p_id,
        "api_key": resolved_key,
        "key_source": key_source if resolved_key else "none",
        "has_key": bool(resolved_key or (p_id == "ollama" and resolved_base_url)),
        "api_key_masked": mask_api_key(resolved_key),
        "base_url": resolved_base_url,
        "model": resolved_model or DEFAULT_PROVIDER_MODELS.get(p_id),
        "stored_in_db": bool(db_config.get("api_key") or db_config.get("base_url") or db_config.get("model")),
    }
