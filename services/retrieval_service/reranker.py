"""
Research Copilot — Lightweight In-Process BGE Reranker Engine (ONNX Runtime)
NO PyTorch, NO Transformers, NO Sentence-Transformers at runtime.
"""

import json
import math
import os
import time
from typing import List, Dict, Optional
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from shared.logger import get_logger

logger = get_logger("BGE-RERANKER")

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "reranker", "model"))
MODEL_PATH = os.environ.get("RERANKER_MODEL_PATH", os.path.join(MODEL_DIR, "model_int8.onnx"))
TOKENIZER_PATH = os.path.join(MODEL_DIR, "tokenizer.json")
MAX_LENGTH = int(os.environ.get("RERANKER_MAX_TOKENS", "512"))
MODEL_NAME = "BAAI/bge-reranker-base (ONNX INT8)"

_session: Optional[ort.InferenceSession] = None
_tokenizer: Optional[Tokenizer] = None
_load_time_sec: float = 0.0


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def is_ready() -> bool:
    return _session is not None and _tokenizer is not None


def init_reranker():
    global _session, _tokenizer, _load_time_sec
    if _session is not None:
        return

    start_t = time.time()
    logger.info(f"Initializing in-process ONNX BGE Reranker from {MODEL_PATH}...")

    if not os.path.exists(TOKENIZER_PATH):
        logger.warning(f"Tokenizer file not found at {TOKENIZER_PATH}. Reranker will be disabled.")
        return

    if not os.path.exists(MODEL_PATH):
        logger.warning(f"ONNX Model file not found at {MODEL_PATH}. Reranker will be disabled.")
        return

    try:
        _tokenizer = Tokenizer.from_file(TOKENIZER_PATH)
        _tokenizer.enable_truncation(max_length=MAX_LENGTH)
        # Dynamic padding: pads to longest sequence in each batch, not fixed MAX_LENGTH
        # This is critical for CPU performance — fixed padding to 512 wastes ~3-5x compute
        _tokenizer.enable_padding()

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = min(4, os.cpu_count() or 2)

        _session = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=['CPUExecutionProvider'])
        _load_time_sec = time.time() - start_t
        logger.info(f"✅ Loaded ONNX BGE Reranker model in {_load_time_sec:.2f}s")
    except Exception as e:
        logger.error(f"Failed to load ONNX Reranker model: {e}")


def rerank_candidates(query: str, candidates: List[Dict], top_k: int) -> List[Dict]:
    """Reranks candidates directly in-memory using ONNX BGE Reranker."""
    if not candidates:
        return []

    if not is_ready():
        init_reranker()

    if not is_ready():
        logger.warning("BGE Reranker not available. Returning raw RRF candidate list.")
        return candidates[:top_k]

    t0 = time.time()
    pairs = [(query, c.get("content", "")) for c in candidates]
    encodings = _tokenizer.encode_batch(pairs)

    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

    input_feed = {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
    }

    input_names = [inp.name for inp in _session.get_inputs()]
    if "token_type_ids" in input_names:
        token_type_ids = np.array([e.type_ids for e in encodings], dtype=np.int64)
        input_feed["token_type_ids"] = token_type_ids

    outputs = _session.run(None, input_feed)
    logits = outputs[0].flatten()

    reranked = []
    for idx, c in enumerate(candidates):
        raw_score = float(logits[idx])
        norm_score = round(sigmoid(raw_score), 4)
        item = dict(c)
        item["bge_score"] = norm_score
        reranked.append(item)

    reranked.sort(key=lambda x: x["bge_score"], reverse=True)

    top_results = reranked[:top_k]
    for rank_idx, item in enumerate(top_results):
        item["bge_rank"] = rank_idx + 1
        item["rank"] = rank_idx + 1

    elapsed_ms = round((time.time() - t0) * 1000, 2)
    logger.info(f"Reranked {len(candidates)} candidates down to {len(top_results)} in {elapsed_ms}ms via ONNX BGE")
    return top_results
