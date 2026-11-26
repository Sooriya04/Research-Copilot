"""
Package: src/novelty

What this package does:
Modular 8-stage Scientific Novelty & Gap Analysis engine for Research Copilot.

Exports:
- NoveltyPipeline: End-to-end 8-stage orchestrator.
- GraphNoveltyEngine: Backward-compatible facade for routes, MCP tools, and tests.
- NoveltyItem, NoveltySynthesisResponse: Primary proposal and response schemas.
"""
from src.novelty.pipeline import GraphNoveltyEngine, NoveltyPipeline
from src.novelty.schemas import NoveltyItem, NoveltySynthesisResponse

__all__ = [
    "NoveltyPipeline",
    "GraphNoveltyEngine",
    "NoveltyItem",
    "NoveltySynthesisResponse",
]
