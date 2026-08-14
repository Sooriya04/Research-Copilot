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
import time
import urllib.request
import psycopg2
import psycopg2.extras
from typing import List, Optional

logging.basicConfig(level=logging.INFO, format="[EMBED-WORKER] %(message)s")
logger = logging.getLogger(__name__)

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


def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(db_url)


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


def process_batch(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT id, title, abstract
            FROM research_papers
            WHERE embedding IS NULL
            LIMIT %s
        """, (BATCH_SIZE,))
        rows = cur.fetchall()

    if not rows:
        return 0

    processed = 0
    for row in rows:
        paper_id = row["id"]
        title = row["title"] or ""
        abstract = row["abstract"] or ""
        # Combine title + abstract for richer embedding
        text_to_embed = f"{title}. {abstract}".strip()
        if not text_to_embed or text_to_embed == ".":
            # Mark as skipped with a sentinel — avoid re-processing empty papers
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

        # Store as JSON array (FLOAT[] column) — works without pgvector
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
