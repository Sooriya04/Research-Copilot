import math
import re
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.config import settings
from src.core.logger import logger
from src.core.models import PaperChunkModel
from src.rag.embeddings import BaseEmbeddingProvider, get_embedding_provider


class BM25Ranker:
    """Lightweight in-memory BM25 ranker for chunk keyword relevance."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b

    def tokenize(self, text: str) -> List[str]:
        return re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text.lower())

    def score_corpus(self, query: str, documents: List[str]) -> List[float]:
        q_tokens = self.tokenize(query)
        if not q_tokens or not documents:
            return [0.0] * len(documents)

        doc_tokens = [self.tokenize(d) for d in documents]
        N = len(documents)
        doc_lens = [len(dt) for dt in doc_tokens]
        avgdl = sum(doc_lens) / max(1, N)

        # Document frequencies for query terms
        df = {}
        for qt in set(q_tokens):
            df[qt] = sum(1 for dt in doc_tokens if qt in dt)

        scores = []
        for i, dt in enumerate(doc_tokens):
            score = 0.0
            dl = doc_lens[i]
            tf_map = {}
            for t in dt:
                tf_map[t] = tf_map.get(t, 0) + 1

            for qt in q_tokens:
                if qt not in tf_map:
                    continue
                tf = tf_map[qt]
                doc_freq = df.get(qt, 0)
                # Lucene-style IDF
                idf = math.log(1 + (N - doc_freq + 0.5) / (doc_freq + 0.5))
                denom = tf + self.k1 * (1 - self.b + self.b * (dl / max(1.0, avgdl)))
                score += idf * (tf * (self.k1 + 1)) / max(0.001, denom)
            scores.append(score)

        return scores


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Calculate cosine similarity between two float vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b
    if norm_a <= 0 or norm_b <= 0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


class HybridRetriever:
    """Hybrid vector + BM25 retriever for paper chunks with Redis active-cache support."""

    def __init__(
        self,
        embedding_provider: Optional[BaseEmbeddingProvider] = None,
        active_cache: Optional[Any] = None,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4,
    ):
        self.embedding_provider = embedding_provider or get_embedding_provider()
        if active_cache is not None:
            self.active_cache = active_cache
        else:
            from src.rag.active_cache import get_active_paper_cache
            self.active_cache = get_active_paper_cache()
        self.vector_weight = vector_weight
        self.bm25_weight = bm25_weight
        self.bm25 = BM25Ranker()

    async def retrieve(
        self,
        paper_id: str,
        query: str,
        db: AsyncSession,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve most relevant chunks for a paper using combined vector & keyword search.
        
        Prioritizes Redis active-paper chunks cache to eliminate SQLite I/O overhead.
        """
        import time
        limit = top_k or getattr(settings, "rag_top_k", 5)

        # 1. Check Redis Active Paper Cache
        t_fetch = time.perf_counter()
        retrieval_source = "sqlite"
        chunks_list: List[Dict[str, Any]] = []

        if self.active_cache:
            try:
                cached_chunks = await self.active_cache.get_chunks(paper_id)
                if cached_chunks:
                    retrieval_source = "redis"
                    chunks_list = cached_chunks
            except Exception as e:
                logger.warning("[HybridRetriever] Redis fetch exception: %s", e)

        # Fall back to SQLite if not in Redis
        if not chunks_list:
            stmt = (
                select(PaperChunkModel)
                .where(PaperChunkModel.paper_id == paper_id)
                .order_by(PaperChunkModel.chunk_index)
            )
            res = await db.execute(stmt)
            db_chunks = res.scalars().all()
            chunks_list = [
                {
                    "chunk_id": c.id,
                    "paper_id": c.paper_id,
                    "chunk_index": c.chunk_index,
                    "content": c.content,
                    "page_number": c.page_number,
                    "section": c.section,
                    "token_count": c.token_count,
                    "embedding_json": c.embedding_json,
                    "metadata": c.metadata_json or {},
                }
                for c in db_chunks
            ]

        fetch_latency = round((time.perf_counter() - t_fetch) * 1000, 2)

        if not chunks_list:
            logger.info("[HybridRetriever] No chunks found for paper_id='%s'", paper_id)
            return []

        # 2. Vector search (Semantic)
        t_vec = time.perf_counter()
        query_vec = await self.embedding_provider.embed_text(query)
        vector_scores: List[float] = []
        for c in chunks_list:
            chunk_vec = c.get("embedding_json")
            if chunk_vec and isinstance(chunk_vec, list):
                sim = cosine_similarity(query_vec, chunk_vec)
                vector_scores.append(max(0.0, sim))
            else:
                vector_scores.append(0.0)

        # 3. BM25 search (Keyword)
        chunk_texts = [c.get("content", "") for c in chunks_list]
        bm25_raw_scores = self.bm25.score_corpus(query, chunk_texts)

        # Normalize scores to [0, 1]
        max_vec = max(vector_scores) if vector_scores else 1.0
        max_bm25 = max(bm25_raw_scores) if bm25_raw_scores else 1.0

        scored_items = []
        for i, chunk in enumerate(chunks_list):
            norm_vec = (vector_scores[i] / max_vec) if max_vec > 0 else 0.0
            norm_bm25 = (bm25_raw_scores[i] / max_bm25) if max_bm25 > 0 else 0.0

            # Combined hybrid score
            hybrid = (self.vector_weight * norm_vec) + (self.bm25_weight * norm_bm25)

            scored_items.append({
                "chunk_id": chunk.get("chunk_id", f"{paper_id}_c{i}"),
                "paper_id": chunk.get("paper_id", paper_id),
                "chunk_index": chunk.get("chunk_index", i),
                "content": chunk.get("content", ""),
                "page_number": chunk.get("page_number", 1),
                "section": chunk.get("section", "General"),
                "score": round(hybrid, 4),
                "vector_score": round(norm_vec, 4),
                "bm25_score": round(norm_bm25, 4),
                "retrieval_source": retrieval_source,
                "fetch_latency_ms": fetch_latency,
            })

        # Sort descending by hybrid score
        scored_items.sort(key=lambda x: x["score"], reverse=True)
        return scored_items[:limit]
