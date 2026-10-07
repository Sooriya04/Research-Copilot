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
    """Initialize database tables asynchronously and migrate missing columns if needed."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        def _migrate_columns(sync_conn):
            try:
                cursor = sync_conn.connection.cursor()
                cursor.execute("PRAGMA table_info(benchmarks)")
                cols = {row[1] for row in cursor.fetchall()}
                if cols and "rank" not in cols:
                    cursor.execute("ALTER TABLE benchmarks ADD COLUMN rank VARCHAR")
                if cols and "methodology" not in cols:
                    cursor.execute("ALTER TABLE benchmarks ADD COLUMN methodology TEXT")
                if cols and "methods_json" not in cols:
                    cursor.execute("ALTER TABLE benchmarks ADD COLUMN methods_json JSON")
            except Exception as e:
                logger.debug("Column migration note: %s", e)
        await conn.run_sync(_migrate_columns)
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
