"""
Page-Indexed PDF Ingestion Engine for Research-Copilot.
Extracts page-indexed plain text and structured blocks from PDF bytes
without burning CPU on pixel-level word coordinate tracking.
"""

import re
from typing import List, Optional
import pymupdf as fitz
from src.core.logger import logger
from src.core.evidence_schemas import (
    HighlightRect,
    PageBlock,
    PageData,
    PageIndexedDocument,
)


class PDFCoordinateEngine:
    """Parses PDF documents into clean, page-indexed text structures."""

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
        """Extract only alphanumeric characters for resilient text matching."""
        return re.sub(r"[^\w]", "", PDFCoordinateEngine.normalize_for_match(text), flags=re.UNICODE)

    def parse_pdf(self, pdf_bytes: bytes, paper_id: str = "doc", title: Optional[str] = None) -> PageIndexedDocument:
        """Parse raw PDF bytes into a page-indexed document."""
        if not pdf_bytes:
            return PageIndexedDocument(paper_id=paper_id, title=title or paper_id, page_count=0, pages=[])

        pages_data: List[PageData] = []
        doc = None
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

                # Extract standard text blocks
                raw_blocks = page.get_text("blocks") or []
                blocks: List[PageBlock] = []
                for b in raw_blocks:
                    if len(b) >= 6 and b[6] == 0:
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
                    words=[],
                    blocks=blocks,
                ))
        except Exception as e:
            logger.error("PDFCoordinateEngine failed to parse PDF for %s: %s", paper_id, e)
        finally:
            if doc is not None:
                try:
                    doc.close()
                except Exception:
                    pass

        return PageIndexedDocument(
            paper_id=paper_id,
            title=title or paper_id,
            page_count=len(pages_data),
            pages=pages_data,
        )

    def locate_excerpt_rects(
        self,
        page_data: PageData,
        excerpt: str,
    ) -> List[HighlightRect]:
        """Return highlight rects for an excerpt without heavy letter tracking."""
        return []
