"""
Backward-compatible re-export of the modular `src.novelty` package.
All pipeline stages live under `src/novelty/`.
"""
from src.novelty import GraphNoveltyEngine, NoveltyItem, NoveltyPipeline, NoveltySynthesisResponse

__all__ = [
    "GraphNoveltyEngine",
    "NoveltyPipeline",
    "NoveltyItem",
    "NoveltySynthesisResponse",
]
