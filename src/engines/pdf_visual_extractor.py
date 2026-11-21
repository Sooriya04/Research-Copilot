"""
PDF Visual Extractor Stub for Research-Copilot.
Avoids heavy raster image slicing and base64 memory overhead during ingestion.
"""

from typing import List
from src.core.evidence_schemas import FigureAsset


class PDFVisualExtractor:
    """Lightweight visual asset handler without heavy raster cropping."""

    def extract_visual_assets(
        self,
        pdf_bytes: bytes,
        paper_id: str,
        max_assets: int = 12,
    ) -> List[FigureAsset]:
        """Return empty list safely to bypass costly raster slicing and base64 bloat."""
        return []
