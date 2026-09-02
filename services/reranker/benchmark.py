"""
Research Copilot — BGE Reranker ONNX Benchmark Script
"""

import time
import os
import sys
import resource

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from retrieval_service.reranker import init_reranker, rerank_candidates

def run_benchmark():
    mem_before_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0

    t_start = time.time()
    init_reranker()
    t_load = time.time() - t_start

    mem_after_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0

    query = "audio deepfake detection methods"
    candidates = [
        {"chunk_id": i, "content": f"Candidate research chunk #{i} discussing speech synthesis and deepfake detection algorithms with neural network architectures."}
        for i in range(1, 51)
    ]

    # First request
    t0 = time.time()
    res1 = rerank_candidates(query, candidates, top_k=10)
    t_first_ms = (time.time() - t0) * 1000

    # Subsequent requests (average over 5 runs)
    subsequent_times = []
    for _ in range(5):
        t_sub = time.time()
        _ = rerank_candidates(query, candidates, top_k=10)
        subsequent_times.append((time.time() - t_sub) * 1000)

    avg_subsequent_ms = sum(subsequent_times) / len(subsequent_times)

    print("========================================")
    print("BGE RERANKER ONNX PERFORMANCE REPORT")
    print("========================================")
    print(f"Model Load Time:           {t_load:.2f} seconds")
    print(f"First Request (50 chunks): {t_first_ms:.2f} ms")
    print(f"Subsequent Req (50 chunks): {avg_subsequent_ms:.2f} ms")
    print(f"Memory Overhead:           {mem_after_mb - mem_before_mb:.2f} MB")
    print(f"Total Max RAM:             {mem_after_mb:.2f} MB")
    print("========================================")

if __name__ == "__main__":
    run_benchmark()
