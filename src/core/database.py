from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from src.core.config import settings
from src.core.models import Base
from src.core.logger import logger

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

async def init_db() -> None:
    """Initialize database tables asynchronously."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized successfully at %s", settings.database_url)

@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for acquiring an async database session."""
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error("Database transaction rolled back: %s", e)
        raise
    finally:
        await session.close()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI Dependency for database sessions."""
    async with get_db_session() as session:
        yield session
