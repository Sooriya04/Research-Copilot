"""
PDF Figure & Table Visual Extraction Engine for Research-Copilot.
Identifies, crops, and extracts diagrams, architectures, plots, and tables
directly from PDF vector and image streams, pairing each visual asset with
its original caption and page coordinates.
"""

import base64
import io
import re
from typing import List, Optional, Tuple
import pymupdf as fitz
from src.core.logger import logger
from src.core.evidence_schemas import FigureAsset

class PDFVisualExtractor:
    """Extracts visual assets (figures, tables, architectures, charts) from PDF pages."""

    FIGURE_CAPTION_REGEX = re.compile(
        r"^(Fig(?:ure|\.)\s*(\d+[a-zA-Z]?))[:.\s—–-]\s*(.+)",
        re.IGNORECASE | re.MULTILINE
    )
    TABLE_CAPTION_REGEX = re.compile(
        r"^(Table\s*(\d+[a-zA-Z]?))[:.\s—–-]\s*(.+)",
        re.IGNORECASE | re.MULTILINE
    )

    def extract_visual_assets(
        self,
        pdf_bytes: bytes,
        paper_id: str,
        max_assets: int = 8,
    ) -> List[FigureAsset]:
        """
        Scan PDF for figure and table captions, cropping raster or vector graphics
        into standalone base64 PNG assets.
        """
        if not pdf_bytes or len(pdf_bytes) < 1000:
            return []

        assets: List[FigureAsset] = []
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page_idx in range(len(doc)):
                if len(assets) >= max_assets:
                    break

                page = doc[page_idx]
                page_num = page_idx + 1
                page_rect = page.rect
                text_blocks = page.get_text("blocks") or []

                # Find captions in page blocks
                for b in text_blocks:
                    if len(assets) >= max_assets:
                        break

                    b_text = b[4].strip() if len(b) > 4 else ""
                    if not b_text or len(b_text) < 10:
                        continue

                    fig_match = self.FIGURE_CAPTION_REGEX.search(b_text)
                    tbl_match = self.TABLE_CAPTION_REGEX.search(b_text)

                    if not fig_match and not tbl_match:
                        continue

                    is_table = bool(tbl_match)
                    match = tbl_match if is_table else fig_match
                    label = match.group(1).title()  # e.g. "Figure 1", "Table 2"
                    caption_text = b_text.replace("\n", " ").strip()
                    caption_rect = fitz.Rect(b[0], b[1], b[2], b[3])

                    # Determine crop region
                    # For figures: Graphic is typically directly ABOVE the caption
                    # For tables: Table body is typically directly BELOW the caption
                    if is_table:
                        crop_rect = fitz.Rect(
                            max(0, caption_rect.x0 - 20),
                            caption_rect.y0,
                            min(page_rect.width, caption_rect.x1 + 20),
                            min(page_rect.height, caption_rect.y1 + 260)
                        )
                    else:
                        crop_rect = fitz.Rect(
                            max(0, caption_rect.x0 - 20),
                            max(0, caption_rect.y0 - 280),
                            min(page_rect.width, caption_rect.x1 + 20),
                            caption_rect.y1 + 10
                        )

                    # Check if page has embedded raster images that overlap or sit near caption
                    page_images = page.get_images()
                    extracted_image_bytes = None

                    if not is_table and page_images:
                        for img_info in page_images:
                            xref = img_info[0]
                            try:
                                img_dict = doc.extract_image(xref)
                                if img_dict and img_dict.get("image"):
                                    # Ensure decent resolution, filter out 1x1 tracking pixels
                                    if img_dict.get("width", 0) >= 120 and img_dict.get("height", 0) >= 80:
                                        img_bytes = img_dict["image"]
                                        extracted_image_bytes = img_bytes
                                        break
                            except Exception:
                                pass

                    # If no raster image found or if table/vector graphic, render crisp crop pixmap
                    if not extracted_image_bytes:
                        try:
                            # 2x zoom for high-DPI rendering
                            matrix = fitz.Matrix(2.0, 2.0)
                            pixmap = page.get_pixmap(matrix=matrix, clip=crop_rect)
                            extracted_image_bytes = pixmap.tobytes("png")
                        except Exception as e:
                            logger.debug("Failed to render pixmap crop: %s", e)

                    if extracted_image_bytes:
                        b64_str = base64.b64encode(extracted_image_bytes).decode("ascii")
                        data_url = f"data:image/png;base64,{b64_str}"

                        asset_id = f"{'tbl' if is_table else 'fig'}-p{page_num}-{len(assets) + 1}"
                        assets.append(FigureAsset(
                            id=asset_id,
                            label=label,
                            caption=caption_text[:300],
                            why_it_matters=f"Core visual empirical evidence on page {page_num}.",
                            page=page_num,
                            asset_type="table" if is_table else "figure",
                            image_data_url=data_url,
                            bbox=[round(crop_rect.x0, 2), round(crop_rect.y0, 2), round(crop_rect.x1, 2), round(crop_rect.y1, 2)],
                            claim_ids=[]
                        ))

            doc.close()
        except Exception as e:
            logger.error("PDFVisualExtractor failed to extract visual assets for %s: %s", paper_id, e)

        return assets
