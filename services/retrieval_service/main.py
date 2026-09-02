"""
Research Copilot — Python Hybrid Retrieval & ONNX BGE Reranker Service (Agentic RAG Engine)
Port: 8104

Combines:
1. Dense Retrieval using Ollama nomic-embed-text (768-dim embeddings) and exact cosine similarity.
2. Sparse Retrieval using PostgreSQL full-text search (websearch_to_tsquery + stored tsvector GIN index).
3. Reciprocal Rank Fusion (RRF k=60) for candidate pooling.
4. Direct In-Process ONNX BGE Reranking (NO PyTorch, NO separate microservice overhead).
"""

import json
import math
import os
import sys
import urllib.request
from typing import List, Dict, Optional
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.logger import get_logger, log_info, log_success, log_warn, log_error
from reranker import init_reranker, rerank_candidates, is_ready, MODEL_NAME

logger = get_logger("RETRIEVAL-SERVICE")

app = FastAPI(title="Research Copilot - Hybrid Retrieval & BGE Reranker Engine", version="3.2.0")

OLLAMA_URL = os.environ.get("OLLAMA_EMBED_URL", "http://127.0.0.1:11434/api/embeddings")
EMBED_MODEL = "nomic-embed-text:latest"

_db_conn = None


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

@app.on_event("startup")
def startup_event():
    init_reranker()


def get_db_conn():
    global _db_conn
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    if _db_conn is None or getattr(_db_conn, "closed", 1) != 0:
        _db_conn = psycopg2.connect(db_url)
    else:
        try:
            with _db_conn.cursor() as cur:
                cur.execute("SELECT 1;")
        except Exception:
            _db_conn = psycopg2.connect(db_url)

    return _db_conn

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


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes exact Cosine Similarity between two 768-dim floating point vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


def execute_dense_search(conn, request_id: str, query_vec: List[float], limit: int) -> List[Dict]:
    """Retrieves chunks for the session request_id, calculates vector similarity, and ranks top candidates."""
    query = """
        SELECT c.id, c.paper_id, c.content, COALESCE(c.section_name, '') as section_name,
               c.word_count, c.token_count, c.embedding, r.title, r.source, r.authors
        FROM paper_chunks c
        JOIN research_papers r ON c.paper_id = r.id
        WHERE r.request_id = %s
          AND c.embedding IS NOT NULL;
    """
    candidates = []
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, (request_id,))
            rows = cur.fetchall()
            for row in rows:
                chunk_vec = row["embedding"]
                if not chunk_vec:
                    continue

                sim = cosine_similarity(query_vec, chunk_vec)
                authors = []
                if row["authors"]:
                    try:
                        authors = json.loads(row["authors"]) if isinstance(row["authors"], str) else row["authors"]
                    except Exception:
                        pass

                candidates.append({
                    "chunk_id": row["id"],
                    "paper_id": row["paper_id"],
                    "content": row["content"],
                    "section_name": row["section_name"],
                    "word_count": row["word_count"],
                    "token_count": row["token_count"],
                    "dense_score": round(float(sim), 4),
                    "metadata": {
                        "title": row["title"],
                        "source": row["source"],
                        "authors": authors
                    }
                })

        candidates.sort(key=lambda x: x["dense_score"], reverse=True)
        top_candidates = candidates[:limit]

        for idx, item in enumerate(top_candidates):
            item["dense_rank"] = idx + 1

        return top_candidates
    except Exception as e:
        logger.error(f"Dense vector search error: {e}")
        return []


def execute_sparse_search(conn, request_id: str, query_text: str, limit: int) -> List[Dict]:
    """Retrieves candidates using PostgreSQL websearch_to_tsquery over stored search_vector GIN index."""
    query = """
        SELECT c.id, c.paper_id, c.content, COALESCE(c.section_name, '') as section_name,
               c.word_count, c.token_count, r.title, r.source, r.authors,
               ts_rank_cd(c.search_vector, websearch_to_tsquery('english', %s)) as score
        FROM paper_chunks c
        JOIN research_papers r ON c.paper_id = r.id
        WHERE r.request_id = %s
          AND c.search_vector @@ websearch_to_tsquery('english', %s)
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
                    except Exception:
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


def compute_rrf(dense_list: List[Dict], sparse_list: List[Dict], rrf_k: int = 60, pool_limit: int = 50) -> List[Dict]:
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
        r["rrf_rank"] = idx + 1
        r["rrf_score"] = round(r["rrf_score"], 5)

    return results[:pool_limit]


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

    # 1. Query Embedding
    vec = get_query_embedding(req.query)

    # 2. Dense Search
    dense_candidates = execute_dense_search(conn, req.request_id, vec, dense_k) if vec else []

    # 3. Sparse FTS Search
    sparse_candidates = execute_sparse_search(conn, req.request_id, req.query, sparse_k)

    # 4. RRF Candidate Pool (Top 30-50)
    candidate_pool = compute_rrf(dense_candidates, sparse_candidates, rrf_k, pool_limit=50)

    # 5. Direct In-Process ONNX BGE Reranking
    final_results = rerank_candidates(req.query, candidate_pool, top_k)

    return {
        "request_id": req.request_id,
        "query": req.query,
        "results": final_results,
        "retrieval": {
            "dense_candidates": len(dense_candidates),
            "sparse_candidates": len(sparse_candidates),
            "rrf_candidates": len(candidate_pool),
            "fusion": "rrf+bge-onnx",
            "reranker": MODEL_NAME if is_ready() else "disabled"
        }
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "python_retrieval_engine",
        "port": 8104,
        "reranker_ready": is_ready(),
        "reranker_model": MODEL_NAME,
        "pytorch_installed": False,
        "transformers_installed": False
    }


@app.get("/ready")
async def ready():
    return {"status": "ready", "reranker_ready": is_ready()}


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Python Hybrid Retrieval & BGE Reranker Service on port 8104...")
    uvicorn.run(app, host="0.0.0.0", port=8104, log_level="info")
