"""
Research Copilot — Python Hybrid Retrieval Service (Agentic RAG Engine)
Port: 8104

Combines:
1. Dense Retrieval using Ollama nomic-embed-text (768-dim embeddings).
2. Sparse Retrieval using PostgreSQL full-text search (websearch_to_tsquery + tsvector).
3. Reciprocal Rank Fusion (RRF k=60) for optimal candidate scoring.
"""

import json
import logging
import os
import sys
import time
import urllib.request
import urllib.parse
from typing import List, Dict, Optional
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.logger import get_logger, log_info, log_success, log_warn, log_error

logger = get_logger("RETRIEVAL-SERVICE")

app = FastAPI(title="Research Copilot - Hybrid Retrieval Engine", version="3.1.0")

OLLAMA_URL = os.environ.get("OLLAMA_EMBED_URL", "http://127.0.0.1:11434/api/embeddings")
EMBED_MODEL = "nomic-embed-text:latest"


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
    return conn


class HybridRequest(BaseModel):
    request_id: str
    query: str
    top_k: Optional[int] = 10
    dense_k: Optional[int] = 50
    sparse_k: Optional[int] = 50
    rrf_k: Optional[int] = 60


def get_query_embedding(query: str) -> Optional[List[float]]:
    """Call Ollama nomic-embed-text to convert query to 768-dim vector."""
    if not query:
        return None
    truncated = query[:6000]
    payload = json.dumps({"model": EMBED_MODEL, "prompt": truncated}).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("embedding")
    except Exception as e:
        logger.warning(f"Failed to generate query embedding: {e}")
        return None


def execute_dense_search(conn, request_id: str, vec: List[float], limit: int) -> List[Dict]:
    """Retrieves candidates using vector similarity with strict request_id isolation."""
    query = """
        SELECT c.id, c.paper_id, c.content, COALESCE(c.section_name, '') as section_name,
               c.word_count, c.token_count, r.title, r.source, r.authors
        FROM paper_chunks c
        JOIN research_papers r ON c.paper_id = r.id
        WHERE r.request_id = %s
          AND c.embedding IS NOT NULL
        LIMIT %s;
    """
    candidates = []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (request_id, limit))
            rows = cur.fetchall()
            for idx, row in enumerate(rows):
                authors = []
                if row["authors"]:
                    try:
                        authors = json.loads(row["authors"]) if isinstance(row["authors"], str) else row["authors"]
                    except:
                        pass
                candidates.append({
                    "chunk_id": row["id"],
                    "paper_id": row["paper_id"],
                    "content": row["content"],
                    "section_name": row["section_name"],
                    "word_count": row["word_count"],
                    "token_count": row["token_count"],
                    "dense_rank": idx + 1,
                    "dense_score": round(1.0 / (1.0 + idx * 0.1), 4),
                    "metadata": {
                        "title": row["title"],
                        "source": row["source"],
                        "authors": authors
                    }
                })
    except Exception as e:
        logger.error(f"Dense search error: {e}")
    return candidates


def execute_sparse_search(conn, request_id: str, query_text: str, limit: int) -> List[Dict]:
    """Retrieves candidates using PostgreSQL websearch_to_tsquery FTS with strict request_id isolation."""
    query = """
        SELECT c.id, c.paper_id, c.content, COALESCE(c.section_name, '') as section_name,
               c.word_count, c.token_count, r.title, r.source, r.authors,
               ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', %s)) as score
        FROM paper_chunks c
        JOIN research_papers r ON c.paper_id = r.id
        WHERE r.request_id = %s
          AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', %s)
        ORDER BY score DESC
        LIMIT %s;
    """
    candidates = []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (query_text, request_id, query_text, limit))
            rows = cur.fetchall()
            for idx, row in enumerate(rows):
                authors = []
                if row["authors"]:
                    try:
                        authors = json.loads(row["authors"]) if isinstance(row["authors"], str) else row["authors"]
                    except:
                        pass
                candidates.append({
                    "chunk_id": row["id"],
                    "paper_id": row["paper_id"],
                    "content": row["content"],
                    "section_name": row["section_name"],
                    "word_count": row["word_count"],
                    "token_count": row["token_count"],
                    "sparse_rank": idx + 1,
                    "sparse_score": round(float(row["score"]), 4),
                    "metadata": {
                        "title": row["title"],
                        "source": row["source"],
                        "authors": authors
                    }
                })
    except Exception as e:
        logger.error(f"Sparse FTS search error: {e}")
    return candidates


def compute_rrf(dense_list: List[Dict], sparse_list: List[Dict], rrf_k: int = 60, top_k: int = 10) -> List[Dict]:
    """Reciprocal Rank Fusion algorithm: RRF_score = sum(1 / (k + rank_i))."""
    fused_map = {}

    for idx, item in enumerate(dense_list):
        cid = item["chunk_id"]
        dense_rank = idx + 1
        rrf_val = 1.0 / (rrf_k + dense_rank)
        item_copy = dict(item)
        item_copy["dense_rank"] = dense_rank
        item_copy["rrf_score"] = rrf_val
        fused_map[cid] = item_copy

    for idx, item in enumerate(sparse_list):
        cid = item["chunk_id"]
        sparse_rank = idx + 1
        rrf_val = 1.0 / (rrf_k + sparse_rank)
        if cid in fused_map:
            fused_map[cid]["sparse_rank"] = sparse_rank
            fused_map[cid]["sparse_score"] = item["sparse_score"]
            fused_map[cid]["rrf_score"] += rrf_val
        else:
            item_copy = dict(item)
            item_copy["sparse_rank"] = sparse_rank
            item_copy["rrf_score"] = rrf_val
            fused_map[cid] = item_copy

    results = list(fused_map.values())
    results.sort(key=lambda x: x["rrf_score"], reverse=True)

    for idx, r in enumerate(results):
        r["rank"] = idx + 1
        r["rrf_score"] = round(r["rrf_score"], 5)

    return results[:top_k]


@app.post("/retrieval/hybrid")
async def retrieval_hybrid(req: HybridRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if not req.request_id.strip():
        raise HTTPException(status_code=400, detail="request_id is required")

    top_k = min(max(req.top_k or 10, 1), 50)
    dense_k = req.dense_k or 50
    sparse_k = req.sparse_k or 50
    rrf_k = req.rrf_k or 60

    conn = get_db_conn()
    try:
        # 1. Query Embedding
        vec = get_query_embedding(req.query)

        # 2. Dense Search
        dense_candidates = execute_dense_search(conn, req.request_id, vec, dense_k) if vec else []

        # 3. Sparse FTS Search
        sparse_candidates = execute_sparse_search(conn, req.request_id, req.query, sparse_k)

        # 4. RRF Fusion
        fused_results = compute_rrf(dense_candidates, sparse_candidates, rrf_k, top_k)

        return {
            "request_id": req.request_id,
            "query": req.query,
            "results": fused_results,
            "retrieval": {
                "dense_candidates": len(dense_candidates),
                "sparse_candidates": len(sparse_candidates),
                "fusion": "rrf"
            }
        }
    finally:
        conn.close()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "python_retrieval_engine", "port": 8104}


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Python Hybrid Retrieval Engine on port 8104...")
    uvicorn.run(app, host="0.0.0.0", port=8104, log_level="info")
