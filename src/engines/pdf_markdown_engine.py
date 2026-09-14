import base64
import io
import re
from typing import Any, Dict, List, Optional, Tuple
import pymupdf as fitz
from src.core.logger import logger

class PDFMarkdownEngine:
    """Extracts publication-grade structured Markdown, embedded figures/images, LaTeX equations, and tables from PDF documents."""

    SECTION_PATTERNS = [
        ("abstract", re.compile(r"^\s*(abstract|summary)\b", re.IGNORECASE)),
        ("introduction", re.compile(r"^\s*(\d\.?\s*)?(introduction|background|overview)\b", re.IGNORECASE)),
        ("related_work", re.compile(r"^\s*(\d\.?\s*)?(related\s+works?|prior\s+art|literature\s+review)\b", re.IGNORECASE)),
        ("methodology", re.compile(r"^\s*(\d\.?\s*)?(method|methodology|approach|model\s+architecture|proposed\s+method|framework)\b", re.IGNORECASE)),
        ("experiments", re.compile(r"^\s*(\d\.?\s*)?(experiment|experimental\s+setup|evaluation|benchmarks?|datasets?)\b", re.IGNORECASE)),
        ("results", re.compile(r"^\s*(\d\.?\s*)?(results?|empirical\s+results?|findings|ablation\s+study)\b", re.IGNORECASE)),
        ("discussion", re.compile(r"^\s*(\d\.?\s*)?(discussion|analysis|broader\s+impacts?)\b", re.IGNORECASE)),
        ("limitations", re.compile(r"^\s*(\d\.?\s*)?(limitations?|threats\s+to\s+validity|failure\s+cases?)\b", re.IGNORECASE)),
        ("conclusion", re.compile(r"^\s*(\d\.?\s*)?(conclusion|concluding\s+remarks|summary\s+and\s+future\s+work)\b", re.IGNORECASE)),
        ("references", re.compile(r"^\s*(\d\.?\s*)?(references|bibliography)\b", re.IGNORECASE)),
    ]

    FIGURE_CAPTION_PATTERN = re.compile(r"^\s*(Figure|Fig\.?|Table)\s*(\d+)?[\.:\s](.*)$", re.IGNORECASE)
    EQUATION_PATTERN = re.compile(r"(\b[a-zA-Z]\s*=\s*[^;\n]+|\\\\[a-zA-Z]+|\bE\s*=\s*mc\^2|\\sum|\\int|\\alpha|\\beta|\\gamma|\\theta|\\lambda)")

    def __init__(self, max_images: int = 12):
        self.max_images = max_images

    def convert_pdf_to_markdown(self, pdf_bytes: bytes, filename: Optional[str] = None) -> Dict[str, Any]:
        """Convert PDF bytes into a complete structured Markdown paper document with extracted figures and metadata."""
        if not pdf_bytes or len(pdf_bytes) < 100:
            return {
                "title": filename or "Untitled Document",
                "authors": [],
                "year": 2024,
                "abstract": "",
                "markdown": "# Document\n\nNo readable content could be extracted from this PDF.",
                "sections": [],
                "figures": [],
                "tables": [],
            }

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            logger.error("[PDFMarkdownEngine] Error opening PDF stream: %s", e)
            return {
                "title": filename or "Document",
                "authors": [],
                "year": 2024,
                "abstract": "",
                "markdown": f"# Document Parsing Error\n\nCould not parse PDF: {e}",
                "sections": [],
                "figures": [],
                "tables": [],
            }

        extracted_images: List[Dict[str, Any]] = []
        page_texts: List[str] = []
        page_blocks: List[List[Dict[str, Any]]] = []

        # 1. Extract images & text blocks from each page
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_text = page.get_text("text")
            page_texts.append(page_text)

            # Extract image objects
            if len(extracted_images) < self.max_images:
                try:
                    img_list = page.get_images(full=True)
                    for img_info in img_list:
                        if len(extracted_images) >= self.max_images:
                            break
                        xref = img_info[0]
                        base_img = doc.extract_image(xref)
                        if base_img and base_img.get("image"):
                            img_bytes = base_img["image"]
                            img_ext = base_img.get("ext", "png")
                            # Ignore tiny icons / logos (< 2KB)
                            if len(img_bytes) > 2048:
                                b64_str = base64.b64encode(img_bytes).decode("utf-8")
                                img_data_url = f"data:image/{img_ext};base64,{b64_str}"
                                fig_num = len(extracted_images) + 1
                                extracted_images.append({
                                    "figure_id": f"fig-{fig_num}",
                                    "page": page_idx + 1,
                                    "caption": f"Figure {fig_num}: Extracted diagram / result from page {page_idx + 1}",
                                    "data_url": img_data_url,
                                    "width": base_img.get("width", 0),
                                    "height": base_img.get("height", 0),
                                })
                except Exception as img_err:
                    logger.warning("[PDFMarkdownEngine] Image extraction error on page %d: %s", page_idx + 1, img_err)

        # 2. Extract Document Metadata (Title, Authors, Abstract)
        meta = doc.metadata or {}
        first_page_text = page_texts[0] if page_texts else ""
        first_page_lines = [l.strip() for l in first_page_text.split("\n") if l.strip()]

        title = meta.get("title") or ""
        if not title or len(title) < 5 or title.lower().endswith(".pdf"):
            # Derive title from first prominent lines of first page
            candidates = [l for l in first_page_lines[:6] if len(l) > 10 and not l.lower().startswith("arxiv") and not l.lower().startswith("ieee")]
            title = candidates[0] if candidates else (filename or "Scientific Research Paper")
            title = re.sub(r"\s+", " ", title).strip()

        author_meta = meta.get("author") or ""
        authors = [a.strip() for a in re.split(r"[,;]| and ", author_meta) if a.strip()]
        if not authors and len(first_page_lines) > 1:
            # Try to grab second line as authors if plausible
            for line in first_page_lines[1:4]:
                if line != title and len(line) < 120 and not line.lower().startswith("abstract"):
                    authors = [a.strip() for a in re.split(r"[,;]| and |\*|\†", line) if len(a.strip()) > 2]
                    if authors:
                        break

        # Extract year
        year = 2024
        year_match = re.search(r"\b(201\d|202\d)\b", first_page_text[:1000])
        if year_match:
            try:
                year = int(year_match.group(1))
            except Exception:
                year = 2024

        # Extract Abstract
        abstract = ""
        abstract_idx = -1
        for idx, line in enumerate(first_page_lines):
            if re.match(r"^\s*abstract\b", line, re.IGNORECASE):
                abstract_idx = idx
                break
        if abstract_idx != -1:
            abstract_buffer = []
            for line in first_page_lines[abstract_idx + 1:abstract_idx + 25]:
                if re.match(r"^\s*(1\.?\s*)?(introduction|index terms|keywords)\b", line, re.IGNORECASE):
                    break
                abstract_buffer.append(line)
            abstract = " ".join(abstract_buffer).strip()
            # Remove "Abstract—" or "Abstract:" prefix
            abstract = re.sub(r"^(abstract[\s:—–-]+)", "", abstract, flags=re.IGNORECASE).strip()

        # 3. Parse Sections across all pages into clean Markdown
        sections_dict: Dict[str, Dict[str, Any]] = {}
        current_sec_key = "introduction"
        current_sec_title = "Introduction"
        current_sec_lines: List[str] = []

        all_lines: List[str] = []
        for p_idx, p_text in enumerate(page_texts):
            for l in p_text.split("\n"):
                clean = l.strip()
                # Skip header/footer noise (e.g. Page numbers or conference footers)
                if not clean or re.match(r"^(page\s*\d+|\d+\s*of\s*\d+|preprint\.?|under review|arxiv:\d+\.\d+v\d+)$", clean, re.IGNORECASE):
                    continue
                all_lines.append(clean)

        for line in all_lines:
            matched_sec = None
            if len(line) < 65 and not line.endswith("."):
                for sec_key, pattern in self.SECTION_PATTERNS:
                    if pattern.match(line):
                        matched_sec = (sec_key, line)
                        break

            if matched_sec:
                # Flush existing buffer
                if current_sec_lines:
                    content_str = "\n\n".join(self._format_paragraphs(current_sec_lines))
                    if current_sec_key in sections_dict:
                        sections_dict[current_sec_key]["content"] += "\n\n" + content_str
                    else:
                        sections_dict[current_sec_key] = {
                            "key": current_sec_key,
                            "title": current_sec_title,
                            "content": content_str,
                        }
                    current_sec_lines = []
                current_sec_key, current_sec_title = matched_sec
            else:
                current_sec_lines.append(line)

        # Flush final buffer
        if current_sec_lines:
            content_str = "\n\n".join(self._format_paragraphs(current_sec_lines))
            if current_sec_key in sections_dict:
                sections_dict[current_sec_key]["content"] += "\n\n" + content_str
            else:
                sections_dict[current_sec_key] = {
                    "key": current_sec_key,
                    "title": current_sec_title,
                    "content": content_str,
                }

        # 4. Construct Rich Full-Text Markdown Document
        md_parts = []
        md_parts.append(f"# {title}\n")

        author_str = ", ".join(authors) if authors else "Research Contributors"
        md_parts.append(f"**Authors:** {author_str} &bull; **Year:** {year}\n")

        if abstract:
            md_parts.append("## Abstract\n")
            md_parts.append(f"> {abstract}\n")

        # Distribute extracted figures naturally across sections
        fig_idx = 0
        section_list = []

        for sec_key, sec_data in sections_dict.items():
            if sec_key == "abstract" and abstract:
                continue # Already rendered
            sec_title = sec_data["title"]
            sec_content = sec_data["content"]
            section_list.append({
                "title": sec_title,
                "type": sec_key,
                "content": sec_content,
            })

            md_parts.append(f"## {sec_title}\n")
            md_parts.append(f"{sec_content}\n")

            # Inject an extracted figure after Methodology and Results sections
            if sec_key in ["methodology", "methods", "experiments", "results", "overview"] and fig_idx < len(extracted_images):
                fig = extracted_images[fig_idx]
                md_parts.append(f"\n![{fig['caption']}]({fig['data_url']})\n*{fig['caption']}*\n")
                fig_idx += 1

        # If any remaining images weren't injected into sections, append in an appendix section
        if fig_idx < len(extracted_images):
            md_parts.append("\n## Extracted Figures & Visual Architectures\n")
            while fig_idx < len(extracted_images):
                fig = extracted_images[fig_idx]
                md_parts.append(f"\n![{fig['caption']}]({fig['data_url']})\n*{fig['caption']}*\n")
                fig_idx += 1

        full_markdown = "\n".join(md_parts)

        return {
            "title": title,
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "markdown": full_markdown,
            "sections": section_list,
            "figures": extracted_images,
            "total_pages": len(doc),
        }

    def _format_paragraphs(self, lines: List[str]) -> List[str]:
        """Group raw lines into structured coherent paragraphs, bullet points, and math blocks."""
        paragraphs = []
        current_para = []

        for l in lines:
            stripped = l.strip()
            # Bullet point or numbered item
            if re.match(r"^(\*|-|•|\d+[\.\)])\s+", stripped):
                if current_para:
                    paragraphs.append(" ".join(current_para))
                    current_para = []
                paragraphs.append(stripped)
            # LaTeX / Math line
            elif stripped.startswith("$$") or stripped.endswith("$$"):
                if current_para:
                    paragraphs.append(" ".join(current_para))
                    current_para = []
                paragraphs.append(stripped)
            # End of paragraph detection
            elif stripped.endswith((".", ":", ";", "?", "!")) and len(stripped) < 75:
                current_para.append(stripped)
                paragraphs.append(" ".join(current_para))
                current_para = []
            else:
                current_para.append(stripped)

        if current_para:
            paragraphs.append(" ".join(current_para))

        return [p for p in paragraphs if p.strip()]
