"""
Page-Indexed PDF Ingestion & Coordinate Engine for Research-Copilot.
Extracts page-indexed data structures preserving page numbers, raw text blocks,
reading order, and bounding-box coordinates for deterministic citations and visual overlays.
"""

import re
from typing import Dict, List, Optional, Tuple
import pymupdf as fitz
from src.core.logger import logger
from src.core.evidence_schemas import (
    HighlightRect,
    WordBox,
    PageBlock,
    PageData,
    PageIndexedDocument,
)

class PDFCoordinateEngine:
    """Parses PDF documents into page-indexed coordinate data structures."""

    @staticmethod
    def normalize_for_match(text: str) -> str:
        """Strip ligatures, dehyphenate linebreaks, and collapse whitespace for matching."""
        if not text:
            return ""
        ligatures = {
            "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl",
            "–": "-", "—": "-", "“": "\"", "”": "\"", "‘": "'", "’": "'",
        }
        for lig, repl in ligatures.items():
            text = text.replace(lig, repl)
        text = re.sub(r"(\b[A-Za-z0-9]+)-\s*\n\s*([A-Za-z0-9]+\b)", r"\1\2", text)
        text = re.sub(r"[\r\n\t]+", " ", text)
        return re.sub(r"\s+", " ", text).strip().lower()

    @staticmethod
    def letters_only(text: str) -> str:
        """Extract only alphanumeric characters for resilient layout matching."""
        return re.sub(r"[^\w]", "", PDFCoordinateEngine.normalize_for_match(text), flags=re.UNICODE)

    def parse_pdf(self, pdf_bytes: bytes, paper_id: str = "doc", title: Optional[str] = None) -> PageIndexedDocument:
        """Parse raw PDF bytes into a page-indexed document with word coordinates."""
        if not pdf_bytes:
            return PageIndexedDocument(paper_id=paper_id, title=title or paper_id, page_count=0, pages=[])

        pages_data: List[PageData] = []
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)

            for i in range(page_count):
                page = doc[i]
                page_num = i + 1
                rect = page.rect
                width = float(rect.width)
                height = float(rect.height)
                page_text = page.get_text("text") or ""

                # Extract words with coordinates: (x0, y0, x1, y1, word, block_no, line_no, word_no)
                raw_words = page.get_text("words") or []
                words: List[WordBox] = []
                for w in raw_words:
                    if len(w) >= 5:
                        words.append(WordBox(
                            x_min=float(w[0]),
                            y_min=float(w[1]),
                            x_max=float(w[2]),
                            y_max=float(w[3]),
                            text=str(w[4])
                        ))

                # Extract text blocks: (x0, y0, x1, y1, text, block_no, block_type)
                raw_blocks = page.get_text("blocks") or []
                blocks: List[PageBlock] = []
                for b in raw_blocks:
                    if len(b) >= 6 and b[6] == 0:  # Text block
                        blocks.append(PageBlock(
                            block_index=int(b[5]),
                            text=str(b[4]).strip(),
                            bbox=[float(b[0]), float(b[1]), float(b[2]), float(b[3])]
                        ))

                pages_data.append(PageData(
                    page_number=page_num,
                    width=width,
                    height=height,
                    text=page_text,
                    words=words,
                    blocks=blocks
                ))

            doc.close()
        except Exception as e:
            logger.error("PDFCoordinateEngine failed to parse PDF for %s: %s", paper_id, e)

        return PageIndexedDocument(
            paper_id=paper_id,
            title=title or paper_id,
            page_count=len(pages_data),
            pages=pages_data
        )

    def locate_excerpt_rects(
        self,
        page_data: PageData,
        excerpt: str,
    ) -> List[HighlightRect]:
        """
        Locate words matching an excerpt on a page and merge consecutive words into
        normalized bounding box rectangles [0.0 .. 1.0].
        """
        if not page_data or not excerpt or not page_data.words:
            return []

        words = page_data.words
        page_width = max(page_data.width, 1.0)
        page_height = max(page_data.height, 1.0)

        # Build letter-indexed haystack mapping each character back to its word index
        haystack = ""
        owner: List[int] = []
        for idx, w in enumerate(words):
            letters = self.letters_only(w.text)
            haystack += letters
            owner.extend([idx] * len(letters))

        # Split excerpt into fragments by ellipsis (e.g., "..." or "…")
        fragments = [
            self.letters_only(f)
            for f in re.split(r"\s*(?:\.{3}|…|\[\.{3}\])\s*", excerpt)
            if len(self.letters_only(f)) >= 6
        ]
        if not fragments:
            frag = self.letters_only(excerpt)
            if len(frag) >= 6:
                fragments = [frag]

        if not fragments:
            return []

        matched_word_indices = set()
        for frag in fragments:
            start = haystack.find(frag)
            if start != -1:
                for pos in range(start, start + len(frag)):
                    matched_word_indices.add(owner[pos])
            else:
                # Try finding a substantial sub-window if exact fragment has a character discrepancy
                if len(frag) > 20:
                    sub_frag = frag[:20]
                    sub_start = haystack.find(sub_frag)
                    if sub_start != -1:
                        for pos in range(sub_start, min(sub_start + len(frag), len(owner))):
                            matched_word_indices.add(owner[pos])

        if not matched_word_indices:
            return []

        matched_words = [words[i] for i in sorted(matched_word_indices)]

        # Merge consecutive words on the same line into horizontal line rectangles
        lines: List[Dict[str, float]] = []
        for word in matched_words:
            if lines:
                last_line = lines[-1]
                word_h = max(word.y_max - word.y_min, 1.0)
                same_line = (
                    abs(last_line["y_min"] - word.y_min) < word_h * 0.75
                    and word.x_min >= last_line["x_min"] - 5.0
                )
                if same_line:
                    last_line["x_max"] = max(last_line["x_max"], word.x_max)
                    last_line["y_min"] = min(last_line["y_min"], word.y_min)
                    last_line["y_max"] = max(last_line["y_max"], word.y_max)
                    continue

            lines.append({
                "x_min": word.x_min,
                "y_min": word.y_min,
                "x_max": word.x_max,
                "y_max": word.y_max
            })

        # Normalize to 0.0 - 1.0
        highlight_rects: List[HighlightRect] = []
        for line in lines:
            x = max(0.0, min(1.0, line["x_min"] / page_width))
            y = max(0.0, min(1.0, line["y_min"] / page_height))
            w = max(0.001, min(1.0 - x, (line["x_max"] - line["x_min"]) / page_width))
            h = max(0.001, min(1.0 - y, (line["y_max"] - line["y_min"]) / page_height))
            highlight_rects.append(HighlightRect(x=round(x, 4), y=round(y, 4), width=round(w, 4), height=round(h, 4)))

        return highlight_rects
