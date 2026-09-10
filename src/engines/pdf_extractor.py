import io
from typing import List, Optional
import httpx
import pymupdf as fitz
from src.core.logger import logger

class PDFExtractor:
    """Extracts raw text pages and layout blocks from PDF documents with malformed-PDF resilience."""

    def __init__(self, timeout: float = 25.0):
        self.timeout = timeout

    async def fetch_pdf_bytes(self, pdf_url: str) -> Optional[bytes]:
        """Download raw PDF bytes safely."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                resp = await client.get(pdf_url)
                if resp.status_code == 200 and len(resp.content) > 500:
                    return resp.content
                logger.warning("[PDFExtractor] Failed to download PDF from %s (status: %d)", pdf_url, resp.status_code)
        except Exception as e:
            logger.error("[PDFExtractor] Error downloading PDF from %s: %s", pdf_url, e)
        return None

    def extract_pages(self, pdf_bytes: bytes) -> List[str]:
        """Extract text page by page from PDF bytes."""
        pages_text: List[str] = []
        if not pdf_bytes or len(pdf_bytes) < 100:
            return pages_text

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")
                if text and text.strip():
                    pages_text.append(text)
        except Exception as e:
            logger.error("[PDFExtractor] PyMuPDF extraction error (malformed PDF?): %s", e)

        return pages_text
