import io
import re
from typing import List, Optional
import httpx
from bs4 import BeautifulSoup
import pymupdf as fitz
from src.core.logger import logger
from src.core.schemas import PaperSection

class PDFSectionExtractor:
    """Extracts text and structured sections from PDF and HTML research papers."""

    SECTION_HEADERS = {
        "abstract": re.compile(r"^\s*(abstract|summary)\b", re.IGNORECASE),
        "intro": re.compile(r"^\s*(1\.?\s*)?(introduction|background|overview)\b", re.IGNORECASE),
        "methods": re.compile(r"^\s*(\d\.?\s*)?(method|methodology|approach|model architecture|proposed method)\b", re.IGNORECASE),
        "experiments": re.compile(r"^\s*(\d\.?\s*)?(experiment|experimental setup|evaluation|benchmarks?|datasets?)\b", re.IGNORECASE),
        "results": re.compile(r"^\s*(\d\.?\s*)?(results?|empirical results?|findings)\b", re.IGNORECASE),
        "discussion": re.compile(r"^\s*(\d\.?\s*)?(discussion|analysis|ablation study|ablations)\b", re.IGNORECASE),
        "limitations": re.compile(r"^\s*(\d\.?\s*)?(limitations?|broader impacts?|ethical considerations?)\b", re.IGNORECASE),
        "conclusion": re.compile(r"^\s*(\d\.?\s*)?(conclusion|conclusions and future work|summary)\b", re.IGNORECASE),
    }

    async def fetch_and_parse_pdf(self, pdf_url: str, timeout: float = 20.0) -> List[PaperSection]:
        """Download PDF from URL and extract structured sections."""
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(pdf_url)
                if resp.status_code != 200 or len(resp.content) < 1000:
                    logger.warning("Failed to download PDF from %s (status: %d)", pdf_url, resp.status_code)
                    return []
                return self.parse_pdf_bytes(resp.content)
        except Exception as e:
            logger.error("Error fetching PDF from %s: %s", pdf_url, e)
            return []

    def parse_pdf_bytes(self, pdf_bytes: bytes) -> List[PaperSection]:
        """Parse raw PDF bytes into section chunks."""
        sections: List[PaperSection] = []
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            full_text_lines = []
            for page in doc:
                text = page.get_text("text")
                for line in text.split("\n"):
                    clean = line.strip()
                    if clean:
                        full_text_lines.append(clean)
            
            # Segment lines into sections
            current_type = "intro"
            current_title = "Introduction"
            current_buffer = []

            for line in full_text_lines:
                matched_type = None
                for sec_type, pattern in self.SECTION_HEADERS.items():
                    if pattern.match(line) and len(line) < 60:
                        matched_type = sec_type
                        break

                if matched_type:
                    if current_buffer:
                        sections.append(PaperSection(
                            title=current_title,
                            content="\n".join(current_buffer),
                            section_type=current_type
                        ))
                        current_buffer = []
                    current_type = matched_type
                    current_title = line
                else:
                    current_buffer.append(line)

            if current_buffer:
                sections.append(PaperSection(
                    title=current_title,
                    content="\n".join(current_buffer),
                    section_type=current_type
                ))
        except Exception as e:
            logger.error("PyMuPDF parsing error: %s", e)
        return sections

    def parse_html_body(self, html_text: str) -> List[PaperSection]:
        """Parse HTML paper text into sections."""
        sections: List[PaperSection] = []
        soup = BeautifulSoup(html_text, "html.parser")
        headings = soup.find_all(["h1", "h2", "h3", "section"])
        if not headings:
            text = soup.get_text(separator="\n").strip()
            if text:
                sections.append(PaperSection(title="Full Text", content=text, section_type="other"))
            return sections

        for heading in headings:
            title = heading.get_text().strip()
            p_elems = heading.find_next_siblings("p")
            content = "\n".join(p.get_text().strip() for p in p_elems if p.get_text().strip())
            
            sec_type = "other"
            for t, pat in self.SECTION_HEADERS.items():
                if pat.search(title):
                    sec_type = t
                    break

            if content:
                sections.append(PaperSection(title=title, content=content, section_type=sec_type))
        return sections
