"""
Research Copilot — Embedding Worker
Port: 8102 (health endpoint only)

Polls research_papers for rows where embedding IS NULL,
generates 768-dim vectors using nomic-embed-text via Ollama,
and stores them back in the DB.
"""

import json
import logging
import os
import sys
import time
import urllib.request
import psycopg2
import psycopg2.extras
from typing import List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.logger import get_logger, log_info, log_success, log_warn, log_error

logger = get_logger("EMBED-WORKER")

OLLAMA_URL = "http://127.0.0.1:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text:latest"
BATCH_SIZE = 10
POLL_INTERVAL = 5  # seconds between polls


def load_env():
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"\''))


load_env()


def ensure_schema(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE research_papers
                ADD COLUMN IF NOT EXISTS embedding double precision[],
                ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
                ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMP;
            """)
        conn.commit()
    except Exception as e:
        logger.warning(f"Schema auto-migration notice: {e}")

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    ensure_schema(conn)
    return conn


def embed_text(text: str) -> Optional[List[float]]:
    """Call Ollama nomic-embed-text and return a 768-dim vector."""
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text}).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("embedding")
    except Exception as e:
        logger.error(f"Ollama embedding error: {e}")
        return None


def process_batch(conn) -> int:
    """Processes both research_papers (paper-level) and paper_chunks (chunk-level)."""
    processed = 0

    # 1. Process paper-level embeddings
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT id, title, abstract
            FROM research_papers
            WHERE embedding IS NULL
            LIMIT %s
        """, (BATCH_SIZE,))
        rows = cur.fetchall()

    if rows:
        for row in rows:
            paper_id = row["id"]
            title = row["title"] or ""
            abstract = row["abstract"] or ""
            text_to_embed = f"{title}. {abstract}".strip()
            if not text_to_embed or text_to_embed == ".":
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE research_papers
                        SET embedding_model = 'skipped-empty', embedded_at = NOW()
                        WHERE id = %s
                    """, (paper_id,))
                conn.commit()
                continue

            vector = embed_text(text_to_embed)
            if vector is None:
                logger.warning(f"Failed to embed paper {paper_id}, will retry next cycle")
                continue

            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE research_papers
                    SET embedding = %s::float[],
                        embedding_model = %s,
                        embedded_at = NOW()
                    WHERE id = %s
                """, (vector, EMBED_MODEL, paper_id))
            conn.commit()
            processed += 1
            logger.info(f"Embedded paper {paper_id[:16]}... ({len(vector)}-dim)")

    # 2. Process chunk-level embeddings (Agentic RAG Chunks)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Claim chunks atomically to avoid concurrent worker conflicts
        cur.execute("""
            UPDATE paper_chunks
            SET embedding_status = 'PROCESSING', updated_at = NOW()
            WHERE id IN (
                SELECT id FROM paper_chunks
                WHERE embedding_status = 'PENDING'
                LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, content, paper_id;
        """, (BATCH_SIZE,))
        chunks = cur.fetchall()

    if chunks:
        for chunk in chunks:
            chunk_id = chunk["id"]
            content = chunk["content"] or ""
            paper_id = chunk["paper_id"]

            if not content.strip():
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE paper_chunks
                        SET embedding_status = 'FAILED', updated_at = NOW()
                        WHERE id = %s
                    """, (chunk_id,))
                conn.commit()
                continue

            vector = embed_text(content)
            if vector is None:
                logger.warning(f"Failed to embed chunk {chunk_id} of paper {paper_id[:16]}, setting to FAILED")
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE paper_chunks
                        SET embedding_status = 'FAILED', updated_at = NOW()
                        WHERE id = %s
                    """, (chunk_id,))
                conn.commit()
                continue

            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE paper_chunks
                    SET embedding = %s::float[],
                        embedding_model = %s,
                        embedding_status = 'COMPLETED',
                        updated_at = NOW()
                    WHERE id = %s
                """, (vector, EMBED_MODEL, chunk_id))
            conn.commit()
            processed += 1
            logger.info(f"Embedded chunk {chunk_id} of paper {paper_id[:16]} ({len(vector)}-dim)")

    return processed


def run_health_server():
    """Minimal HTTP health endpoint on port 8102."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import threading

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "model": EMBED_MODEL}).encode())
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args):
            pass  # Suppress HTTP access logs

    server = HTTPServer(("0.0.0.0", 8102), Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    logger.info("Health server running on :8102/health")


if __name__ == "__main__":
    run_health_server()
    logger.info(f"Embedding worker started. Model={EMBED_MODEL}, Batch={BATCH_SIZE}")

    conn = None
    while True:
        try:
            if conn is None or conn.closed:
                conn = get_db_conn()
                logger.info("Connected to PostgreSQL")

            count = process_batch(conn)
            if count > 0:
                logger.info(f"Processed {count} papers this cycle")
            else:
                time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("Shutdown requested")
            break
        except Exception as e:
            logger.error(f"Error in embedding loop: {e}")
            if conn:
                try:
                    conn.close()
                except:
                    pass
            conn = None
            time.sleep(10)
