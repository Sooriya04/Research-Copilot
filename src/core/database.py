import os
import psycopg2
from contextlib import contextmanager
from dotenv import load_dotenv

# Load env variables from root .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set or .env file is missing.")

@contextmanager
def get_db_connection():
    """Context manager to yield a PostgreSQL database connection."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()
