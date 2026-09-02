"""
Research Copilot — Dynamic Chunking Engine
Port: 8103 (health endpoint only)

Polls paper_content_versions for active PDF/FULL_TEXT extractions,
applies the structure-aware adaptive chunking algorithm (target 200-300 words),
and inserts generated chunks into the paper_chunks table.
"""

import json
import logging
import os
import re
import sys
import time
import psycopg2
import psycopg2.extras
from typing import List, Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.logger import get_logger, log_info, log_success, log_warn, log_error, log_pipeline

logger = get_logger("CHUNKER")

POLL_INTERVAL = 5  # seconds between polls
BATCH_SIZE = 10

ABBREVIATIONS = {'e.g.', 'i.e.', 'al.', 'vs.', 'fig.', 'ref.', 'dr.', 'prof.', 'vol.', 'ed.'}
SECTION_REGEX = re.compile(r'^(?:\d+(?:\.\d+)*\s+)?(abstract|introduction|related work|methodology|methods|dataset|experiments|results|discussion|conclusion|references)$', re.IGNORECASE)


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
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    return conn


def split_sentences(text: str) -> List[str]:
    """Split text into sentences while preserving common abbreviations."""
    candidates = re.split(r'(?<=[.!?])\s+', text)
    sentences = []
    curr = []
    for cand in candidates:
        curr.append(cand)
        words = cand.strip().split()
        if words:
            last_word = words[-1].lower()
            clean_last = last_word.rstrip('.,?!:;')
            if last_word in ABBREVIATIONS or clean_last in {a.rstrip('.') for a in ABBREVIATIONS}:
                continue
        sentences.append(" ".join(curr))
        curr = []
    if curr:
        sentences.append(" ".join(curr))
    return [s for s in sentences if s.strip()]


def chunk_text(text: str) -> List[Dict]:
    """Adaptive structural chunker."""
    paragraphs = text.split("\n\n")
    chunks = []
    chunk_index = 0
    current_section = None

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # Section Heading Detection
        lines = para.split("\n")
        first_line = lines[0].strip()
        if len(first_line) < 60:
            m = SECTION_REGEX.match(first_line)
            if m:
                current_section = first_line
                # If paragraph was only the section heading, do not process further
                if len(para) == len(first_line):
                    continue

        words = para.split()
        word_count = len(words)

        # Standard Paragraph size (under 350 words) -> Keep intact
        if word_count <= 350:
            chunks.append({
                "chunk_index": chunk_index,
                "content": para,
                "section_name": current_section,
                "word_count": word_count,
                "token_count": int(word_count * 1.33),
                "chunk_type": "PARAGRAPH"
            })
            chunk_index += 1
            continue

        # Large Paragraph -> Split at sentence boundaries
        sentences = split_sentences(para)
        curr_words = []
        
        for sentence in sentences:
            sent_words = sentence.split()
            if not sent_words:
                continue

            if curr_words and len(curr_words) + len(sent_words) > 300:
                chunk_content = " ".join(curr_words)
                chunks.append({
                    "chunk_index": chunk_index,
                    "content": chunk_content,
                    "section_name": current_section,
                    "word_count": len(curr_words),
                    "token_count": int(len(curr_words) * 1.33),
                    "chunk_type": "PARAGRAPH"
                })
                chunk_index += 1
                curr_words = []

            curr_words.extend(sent_words)

        if curr_words:
            chunk_content = " ".join(curr_words)
            chunks.append({
                "chunk_index": chunk_index,
                "content": chunk_content,
                "section_name": current_section,
                "word_count": len(curr_words),
                "token_count": int(len(curr_words) * 1.33),
                "chunk_type": "PARAGRAPH"
            })
            chunk_index += 1

    return chunks


import hashlib

def sync_arxiv_papers_to_versions(conn):
    """Finds cached papers in arxiv_papers and ensures they have a content version in paper_content_versions."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Select papers in arxiv_papers that don't have a content version yet, matching existing research_papers
        cur.execute("""
            SELECT a.paper_id, a.full_text, a.pdf_url
            FROM arxiv_papers a
            JOIN research_papers r ON a.paper_id = r.id
            WHERE a.full_text IS NOT NULL AND length(a.full_text) > 100
              AND NOT EXISTS (
                  SELECT 1 FROM paper_content_versions 
                  WHERE paper_id = a.paper_id AND content_type = 'PDF'
              )
            LIMIT %s
        """, (BATCH_SIZE,))
        rows = cur.fetchall()

    if not rows:
        return 0

    synced = 0
    for row in rows:
        paper_id = row["paper_id"]
        full_text = row["full_text"]
        pdf_url = row["pdf_url"] or ""
        
        content_hash = hashlib.sha256(full_text.encode('utf-8')).hexdigest()

        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO paper_content_versions (
                        paper_id, content_type, source_url, source_type, 
                        extraction_method, content, content_hash, quality_score, 
                        validation_status, is_active
                    ) VALUES (%s, 'PDF', %s, 'arxiv', 'default_extractor', %s, %s, 1.00, 'VALID', true)
                    ON CONFLICT (paper_id, content_type, content_hash) DO UPDATE SET is_active = true
                """, (paper_id, pdf_url, full_text, content_hash))
            conn.commit()
            synced += 1
            logger.info(f"Synced cached arxiv_paper {paper_id[:16]} to paper_content_versions")
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to sync cached paper {paper_id} to content version: {e}")

    return synced


def process_chunking(conn):
    """Finds unchunked active PDF/FULL_TEXT extractions and chunks them."""
    # First ensure cached arxiv_papers are synced
    sync_arxiv_papers_to_versions(conn)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Find versions that do not have any chunks registered
        cur.execute("""
            SELECT id, paper_id, content
            FROM paper_content_versions
            WHERE is_active = true 
              AND content_type IN ('PDF', 'FULL_TEXT')
              AND NOT EXISTS (
                  SELECT 1 FROM paper_chunks WHERE content_version_id = paper_content_versions.id
              )
            LIMIT %s
        """, (BATCH_SIZE,))
        rows = cur.fetchall()

    if not rows:
        return 0

    processed = 0
    for row in rows:
        version_id = row["id"]
        paper_id = row["paper_id"]
        content = row["content"] or ""

        if not content.strip():
            # Skip empty content by inserting a sentinel chunk to prevent infinite retries
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO paper_chunks (paper_id, content_version_id, chunk_index, content, word_count, token_count, embedding_status)
                    VALUES (%s, %s, 0, '[empty content version]', 0, 0, 'FAILED')
                    ON CONFLICT DO NOTHING
                """, (paper_id, version_id))
            conn.commit()
            continue

        try:
            chunks = chunk_text(content)
            
            with conn.cursor() as cur:
                # Ensure idempotency
                cur.execute("DELETE FROM paper_chunks WHERE content_version_id = %s", (version_id,))
                
                for chunk in chunks:
                    cur.execute("""
                        INSERT INTO paper_chunks (
                            paper_id, content_version_id, chunk_index, content,
                            section_name, word_count, token_count, chunk_type, embedding_status
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'PENDING')
                        ON CONFLICT (content_version_id, chunk_index) DO NOTHING
                    """, (
                        paper_id,
                        version_id,
                        chunk["chunk_index"],
                        chunk["content"],
                        chunk["section_name"],
                        chunk["word_count"],
                        chunk["token_count"],
                        chunk["chunk_type"]
                    ))
            conn.commit()
            processed += 1
            logger.info(f"Chunked version {version_id} (paper={paper_id[:16]}) into {len(chunks)} chunks")
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to chunk content version {version_id}: {e}")

    return processed


def run_health_server():
    """Minimal HTTP health endpoint on port 8103."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import threading

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "service": "chunker"}).encode())
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("0.0.0.0", 8103), Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    logger.info("Health server running on :8103/health")


if __name__ == "__main__":
    run_health_server()
    logger.info("Chunking worker service started.")

    conn = None
    while True:
        try:
            if conn is None or conn.closed:
                conn = get_db_conn()
                logger.info("Connected to PostgreSQL")

            count = process_chunking(conn)
            if count > 0:
                logger.info(f"Processed {count} content versions this cycle")
            else:
                time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            logger.info("Shutdown requested")
            break
        except Exception as e:
            logger.error(f"Error in chunking loop: {e}")
            if conn:
                try:
                    conn.close()
                except:
                    pass
            conn = None
            time.sleep(10)
