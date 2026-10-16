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
        r"^(?:[\s\n]*)(Fig(?:ure|\.)\s*([0-9IVXLCDM]+[a-zA-Z]?))(?:\s*[:.\—–-]\s*|\s{2,}|\n)(.+)",
        re.IGNORECASE
    )
    TABLE_CAPTION_REGEX = re.compile(
        r"^(?:[\s\n]*)(Table\s*([0-9IVXLCDM]+[a-zA-Z]?))(?:\s*[:.\—–-]\s*|\s{2,}|\n)(.+)",
        re.IGNORECASE
    )
    VERB_STARTS = ("summarize", "show", "compare", "illustrate", "present", "depict", "give", "list", "provide", "is ", "are ")

    def extract_visual_assets(
        self,
        pdf_bytes: bytes,
        paper_id: str,
        max_assets: int = 12,
    ) -> List[FigureAsset]:
        """
        Scan PDF for figure and table captions, cropping raster or vector graphics
        into standalone base64 PNG assets with high visual fidelity.
        """
        if not pdf_bytes or len(pdf_bytes) < 1000:
            return []

        assets: List[FigureAsset] = []
        seen_labels: set = set()

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page_idx in range(len(doc)):
                if len(assets) >= max_assets:
                    break

                page = doc[page_idx]
                page_num = page_idx + 1
                page_rect = page.rect
                text_blocks = page.get_text("blocks") or []

                # Find any structured tables via fitz find_tables
                page_tables = []
                try:
                    tabs_result = page.find_tables()
                    if tabs_result and tabs_result.tables:
                        page_tables = tabs_result.tables
                except Exception as ex:
                    logger.debug("find_tables note on page %d: %s", page_num, ex)

                # Scan blocks for figure and table captions
                for b in text_blocks:
                    if len(assets) >= max_assets:
                        break

                    b_text = b[4].strip() if len(b) > 4 else ""
                    if not b_text or len(b_text) < 8:
                        continue

                    lines = [ln.strip() for ln in b_text.split("\n") if ln.strip()]
                    if not lines:
                        continue

                    first_line = lines[0]
                    fig_match = self.FIGURE_CAPTION_REGEX.search(first_line)
                    tbl_match = self.TABLE_CAPTION_REGEX.search(first_line)

                    if not fig_match and not tbl_match:
                        continue

                    is_table = bool(tbl_match)
                    match = tbl_match if is_table else fig_match
                    cap_body = match.group(3).strip().lower()

                    # Filter out narrative sentence citations
                    if any(cap_body.startswith(v) for v in self.VERB_STARTS):
                        continue

                    raw_label = match.group(1).strip()
                    norm_label = re.sub(r"\s+", " ", raw_label).title()
                    label_key = f"{norm_label}-{page_num}"
                    if label_key in seen_labels:
                        continue
                    seen_labels.add(label_key)

                    caption_text = b_text.replace("\n", " ").strip()
                    caption_rect = fitz.Rect(b[0], b[1], b[2], b[3])

                    # Determine crop region
                    crop_rect = None

                    # If table, first check if find_tables found an exact matching table box
                    if is_table and page_tables:
                        best_tab = None
                        min_dist = float("inf")
                        for tab in page_tables:
                            tbox = fitz.Rect(tab.bbox)
                            # Table is usually right below or right above caption
                            dist = min(abs(tbox.y0 - caption_rect.y1), abs(caption_rect.y0 - tbox.y1))
                            if dist < min_dist:
                                min_dist = dist
                                best_tab = tbox

                        if best_tab and min_dist < 400:
                            # Expand slightly to include borders and headers
                            crop_rect = fitz.Rect(
                                max(20, best_tab.x0 - 8),
                                max(20, min(caption_rect.y0 - 5, best_tab.y0 - 5)),
                                min(page_rect.width - 20, best_tab.x1 + 8),
                                min(page_rect.height - 20, max(caption_rect.y1 + 5, best_tab.y1 + 5))
                            )

                    # Standard column/page-spanning heuristic for figures and unlocated tables
                    if not crop_rect:
                        # Determine if column or full page width
                        is_wide = (caption_rect.width > (page_rect.width * 0.6))
                        margin_left = 30 if is_wide else max(30, min(caption_rect.x0 - 20, page_rect.width * 0.5 - 20))
                        margin_right = page_rect.width - 30 if is_wide else min(page_rect.width - 30, max(caption_rect.x1 + 20, page_rect.width * 0.5 + 20))

                        if is_table:
                            # Table body is usually directly below caption
                            crop_rect = fitz.Rect(
                                margin_left,
                                max(20, caption_rect.y0 - 5),
                                margin_right,
                                min(page_rect.height - 20, caption_rect.y1 + 300)
                            )
                        else:
                            # Figure graphic is usually directly above caption
                            crop_rect = fitz.Rect(
                                margin_left,
                                max(20, caption_rect.y0 - 320),
                                margin_right,
                                min(page_rect.height - 20, caption_rect.y1 + 10)
                            )

                    # Ensure crop_rect has valid positive dimensions
                    if crop_rect.width <= 10 or crop_rect.height <= 10:
                        continue

                    # Render crisp 2x high-DPI pixmap
                    extracted_image_bytes = None
                    try:
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
                            label=norm_label,
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
