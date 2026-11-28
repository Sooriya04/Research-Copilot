"""
PaperDriftClient: Lightweight HTTP client for paper-drift sidecar (:7490).

Provides AST-aware semantic RAG chunking, GFM Markdown conversion, and lossless
Base64 diagram/vector figure extraction with guaranteed graceful fallback.
"""
import time
from typing import Any, Dict, List, Optional
import httpx
from src.core.config import settings
from src.core.logger import logger


class PaperDriftClient:
    """HTTP Client for the paper-drift WebAssembly daemon."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        enabled: Optional[bool] = None,
        max_chunk_chars: Optional[int] = None,
    ):
        raw_url = base_url or getattr(settings, "paper_drift_base_url", "http://127.0.0.1:7490")
        self.base_url = raw_url.rstrip("/")
        self.timeout = timeout or getattr(settings, "paper_drift_timeout", 30.0)
        self.enabled = enabled if enabled is not None else getattr(settings, "paper_drift_enabled", True)
        self.max_chunk_chars = max_chunk_chars or getattr(settings, "paper_drift_max_chunk_chars", 1500)
        self._last_health_check = 0.0
        self._is_alive = False

    async def is_available(self, force_refresh: bool = False) -> bool:
        """Cached health check against GET /api/health with a 1.0s connection timeout."""
        if not self.enabled:
            return False

        now = time.perf_counter()
        if not force_refresh and (now - self._last_health_check < 5.0):
            return self._is_alive

        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                res = await client.get(f"{self.base_url}/api/health")
                self._is_alive = (res.status_code == 200)
        except Exception:
            self._is_alive = False

        self._last_health_check = now
        return self._is_alive

    async def chunk_pdf(
        self,
        pdf_bytes: bytes,
        max_chunk_chars: Optional[int] = None,
        pages: str = "all",
    ) -> Optional[List[Dict[str, Any]]]:
        """Perform AST-aware semantic RAG chunking.
        
        Returns a list of structured chunk dicts, or None if the daemon is unavailable or fails.
        """
        if not pdf_bytes or not await self.is_available():
            return None

        chunk_limit = max_chunk_chars or self.max_chunk_chars
        url = f"{self.base_url}/api/chunk-rag?max_chunk_chars={chunk_limit}&pages={pages}"

        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(
                    url,
                    content=pdf_bytes,
                    headers={"Content-Type": "application/pdf"},
                )
                if res.status_code == 200:
                    chunks = res.json()
                    latency = round((time.perf_counter() - t0) * 1000, 2)
                    logger.info("[PaperDrift] Extracted %d semantic RAG chunks in %.1fms", len(chunks), latency)
                    return chunks
                else:
                    logger.warning("[PaperDrift] HTTP %d from %s: %s", res.status_code, url, res.text[:120])
                    return None
        except httpx.ConnectError:
            logger.warning("[PaperDrift] Daemon unreachable at %s. Falling back to pymupdf.", self.base_url)
            self._is_alive = False
            return None
        except httpx.TimeoutException:
            logger.warning("[PaperDrift] Request timed out after %.1fs. Falling back to pymupdf.", self.timeout)
            return None
        except Exception as e:
            logger.warning("[PaperDrift] Unexpected chunking error: %s. Falling back.", e)
            return None

    async def convert_to_markdown(
        self,
        pdf_bytes: bytes,
        pages: str = "all",
    ) -> Optional[Dict[str, Any]]:
        """Convert PDF to publication-grade GFM Markdown with formula detection."""
        if not pdf_bytes or not await self.is_available():
            return None

        url = f"{self.base_url}/api/convert-markdown?pages={pages}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(
                    url,
                    content=pdf_bytes,
                    headers={"Content-Type": "application/pdf"},
                )
                if res.status_code == 200:
                    return res.json()
                return None
        except Exception as e:
            logger.warning("[PaperDrift] Markdown conversion error: %s", e)
            return None

    async def extract_figures(
        self,
        pdf_bytes: bytes,
        pages: str = "all",
        scale: float = 2.0,
    ) -> Optional[List[Dict[str, Any]]]:
        """Extract detected architecture diagrams, vector figures, and Base64 images."""
        if not pdf_bytes or not await self.is_available():
            return None

        url = f"{self.base_url}/api/parse-full?images=true&scale={scale}&pages={pages}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(
                    url,
                    content=pdf_bytes,
                    headers={"Content-Type": "application/pdf"},
                )
                if res.status_code == 200:
                    data = res.json()
                    figures = []
                    for page in data.get("pages", []):
                        page_num = page.get("pageNumber", 1)
                        # Extract detected sub-region vector figures
                        for fig in page.get("figures", []):
                            figures.append({
                                "page": page_num,
                                "type": fig.get("type", "figure"),
                                "caption": fig.get("caption") or f"Figure on page {page_num}",
                                "data_url": fig.get("dataUrl"),
                                "box": fig.get("box"),
                            })
                        # Fallback to page-level Base64 dataUrl if no isolated figures detected
                        if not page.get("figures") and page.get("dataUrl"):
                            figures.append({
                                "page": page_num,
                                "type": "page_overview",
                                "caption": f"Page {page_num} Overview",
                                "data_url": page.get("dataUrl"),
                                "box": None,
                            })
                    return figures
                return None
        except Exception as e:
            logger.warning("[PaperDrift] Figure extraction error: %s", e)
            return None

    async def extract_first_diagram(
        self,
        pdf_bytes: bytes,
    ) -> Optional[Dict[str, Any]]:
        """Convenience method: Extract the primary architecture diagram from the first 5 pages."""
        figures = await self.extract_figures(pdf_bytes, pages="1-5")
        if not figures:
            return None
        # Return first figure with a non-null data_url
        for f in figures:
            if f.get("data_url"):
                return f
        return figures[0] if figures else None
