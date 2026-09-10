import pytest
import pytest_asyncio
from src.core.database import init_db

@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    await init_db()
    yield
