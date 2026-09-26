"""
Settings API - store and retrieve provider API keys in SQLite.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from src.core.database import get_db
from src.core.models import UserSettingsModel
from src.core.logger import logger

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


class ProviderConfig(BaseModel):
    provider_id: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


@router.get("/providers")
async def get_providers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserSettingsModel))
    rows = result.scalars().all()
    out = []
    for row in rows:
        masked = None
        if row.api_key:
            masked = row.api_key[:8] + "..." if len(row.api_key) > 8 else "..."
        out.append({
            "provider_id": row.provider_id,
            "api_key_masked": masked,
            "base_url": row.base_url,
            "model": row.model,
            "has_key": bool(row.api_key or row.base_url),
        })
    return {"providers": out}


@router.post("/providers")
async def save_provider(config: ProviderConfig, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserSettingsModel).where(
            UserSettingsModel.id == "default",
            UserSettingsModel.provider_id == config.provider_id,
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
            provider_id=config.provider_id,
            api_key=config.api_key,
            base_url=config.base_url,
            model=config.model,
        )
        db.add(row)
    await db.commit()
    logger.info("Saved settings for provider: %s", config.provider_id)
    return {"ok": True, "provider_id": config.provider_id}


@router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(
        delete(UserSettingsModel).where(
            UserSettingsModel.id == "default",
            UserSettingsModel.provider_id == provider_id,
        )
    )
    await db.commit()
    logger.info("Deleted settings for provider: %s", provider_id)
    return {"ok": True}


@router.get("/providers/{provider_id}/key")
async def get_provider_key(provider_id: str, db: AsyncSession = Depends(get_db)):
    """Raw key for server-side LLM calls only."""
    result = await db.execute(
        select(UserSettingsModel).where(
            UserSettingsModel.id == "default",
            UserSettingsModel.provider_id == provider_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"No config for provider: {provider_id}")
    return {"provider_id": provider_id, "api_key": row.api_key, "base_url": row.base_url, "model": row.model}
