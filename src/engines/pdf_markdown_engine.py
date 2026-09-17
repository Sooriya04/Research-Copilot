import os
import re
from typing import Any, Dict, List, Optional
import pymupdf as fitz
import pymupdf4llm
from src.core.logger import logger

# Base directory for extracted markdown and images
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DUMP_EXTRACT_DIR = os.path.join(PROJECT_ROOT, "dump_extract")
IMAGES_DIR = os.path.join(DUMP_EXTRACT_DIR, "images")
MARKDOWN_DIR = os.path.join(DUMP_EXTRACT_DIR, "markdown")

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(MARKDOWN_DIR, exist_ok=True)


class PDFMarkdownEngine:
    """Extracts publication-grade structured Markdown and images from PDF documents using PyMuPDF4LLM,

    persisting extracted files directly into dump_extract/ and serving them to the frontend.
    """

    def __init__(self, max_images: int = 24):
        self.max_images = max_images

    def convert_pdf_to_markdown(self, pdf_bytes: bytes, filename: Optional[str] = None) -> Dict[str, Any]:
        """Convert PDF bytes into high-fidelity Markdown, writing images and markdown to dump_extract/."""
        if not pdf_bytes or len(pdf_bytes) < 100:
            return {
                "title": filename or "Untitled Document",
                "authors": [],
                "year": 2024,
                "abstract": "",
                "markdown": "# Document\n\nNo readable content could be extracted from this PDF.",
                "sections": [],
                "figures": [],
                "total_pages": 0,
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
                "total_pages": 0,
            }

        total_pages = len(doc)
        clean_name = re.sub(r"[^a-zA-Z0-9]+", "_", (filename or "paper").replace(".pdf", "").lower()).strip("_")[:30] or "paper"
        logger.info("[PDFMarkdownEngine] Extracting PDF '%s' (%d pages) to dump_extract/", clean_name, total_pages)

        # 1. Run PyMuPDF4LLM with image writing directed into dump_extract/images/
        #    Set the doc name so pymupdf4llm generates image filenames from clean_name
        #    (avoids leading-dash filenames like "-0004-00.png" when opened from bytes)
        try:
            doc.name = clean_name
        except Exception:
            pass
        markdown_text = ""
        try:
            markdown_text = pymupdf4llm.to_markdown(
                doc,
                write_images=True,
                image_path=IMAGES_DIR,
                use_ocr=False,
            )
        except Exception as err1:
            logger.warning("[PDFMarkdownEngine] pymupdf4llm layout extraction failed (%s), falling back to RAG...", err1)
            try:
                markdown_text = pymupdf4llm.helpers.pymupdf_rag.to_markdown(
                    doc,
                    write_images=True,
                    image_path=IMAGES_DIR,
                )
            except Exception as err2:
                logger.error("[PDFMarkdownEngine] pymupdf4llm RAG extraction failed: %s", err2)
                text_parts = [p.get_text() for p in doc]
                markdown_text = "\n\n".join(text_parts)

        # 2. Extract any additional images from PDF xrefs that PyMuPDF4LLM might have missed
        extracted_figures: List[Dict[str, Any]] = []
        try:
            fig_counter = 1
            for p_idx in range(min(total_pages, 50)):
                if len(extracted_figures) >= self.max_images:
                    break
                page = doc[p_idx]
                img_list = page.get_images(full=True)
                for img_info in img_list:
                    if len(extracted_figures) >= self.max_images:
                        break
                    xref = img_info[0]
                    base_img = doc.extract_image(xref)
                    if base_img and base_img.get("image"):
                        img_bytes = base_img["image"]
                        if len(img_bytes) > 2048:
                            ext = base_img.get("ext", "png")
                            extra_filename = f"{clean_name}-p{p_idx+1}-{fig_counter}.{ext}"
                            extra_path = os.path.join(IMAGES_DIR, extra_filename)
                            if not os.path.exists(extra_path):
                                with open(extra_path, "wb") as f_img:
                                    f_img.write(img_bytes)

                            img_url = f"/dump_extract/images/{extra_filename}"
                            extracted_figures.append({
                                "figure_id": f"fig-{fig_counter}",
                                "page": p_idx + 1,
                                "caption": f"Figure {fig_counter}: Diagram from Page {p_idx + 1}",
                                "url": img_url,
                                "width": base_img.get("width", 0),
                                "height": base_img.get("height", 0),
                            })
                            fig_counter += 1
        except Exception as img_err:
            logger.warning("[PDFMarkdownEngine] Direct xref image extraction warning: %s", img_err)

        # 3. Normalize all image markdown paths to absolute web paths: /dump_extract/images/<filename>
        markdown_text = re.sub(
            r"!\[(.*?)\]\((?:(?:/)?dump_extract/)?images/([^)]+)\)",
            r"![\1](/dump_extract/images/\2)",
            markdown_text
        )
        # Also catch any raw filename references without folder prefix
        markdown_text = re.sub(
            r"!\[(.*?)\]\((?!http|/|data:)([^)]+\.(?:png|jpe?g|webp|gif))\)",
            r"![\1](/dump_extract/images/\2)",
            markdown_text
        )

        # 4. Alignment & Text Flow Sanitization:
        # a) Repair words broken with hyphens across page breaks
        markdown_text = re.sub(
            r"(\b[a-zA-Z]{2,})-\s*\n+\s*(?:\d+\s*\n+)?([a-zA-Z]{2,}\b)",
            r"\1\2",
            markdown_text
        )
        # b) Remove completely isolated page numbers (a paragraph that is only 1-3 digits)
        markdown_text = re.sub(r"\n\n\s*\d{1,3}\s*\n\n", r"\n\n", markdown_text)
        # Also catch page numbers mid-flow (between text sentences)
        markdown_text = re.sub(
            r"(?<=[a-zA-Z,.:;])\s*\n+\s*\d{1,3}\s*\n+\s*(?=[a-zA-Z])",
            r" ",
            markdown_text
        )
        # c) Remove leading affiliation/footnote numbers from lines like "1Instituto Superior..."
        #    pymupdf4llm extracts superscript digits as line-leading plain digits
        markdown_text = re.sub(
            r"^(\d{1,2})([A-Z][a-zA-Z])",
            r"\2",
            markdown_text,
            flags=re.MULTILINE
        )
        # d) Demote author/affiliation lines incorrectly promoted to ## headings.
        #    A ## line that has no section-like structure is almost certainly an author byline.
        def _demote_if_not_section(m):
            content = m.group(1).strip()
            # Keep as heading if it starts with a digit (section number like "1 Introduction")
            if re.match(r"^\d+[\s\.]", content):
                return m.group(0)
            # Keep if it contains common section keywords
            if re.search(
                r"\b(abstract|introduction|method|result|conclusion|experiment|related|"
                r"appendix|discussion|evaluation|background|setup|analysis|approach|"
                r"framework|model|system|dataset|baseline|limitation|future)\b",
                content, re.IGNORECASE
            ):
                return m.group(0)
            # Otherwise demote to a plain paragraph (author/affiliation/byline)
            return f"\n{content}\n"
        markdown_text = re.sub(r"\n## ([^\n]+)\n", _demote_if_not_section, markdown_text)

        # e) Ensure images have clean spacing before and after
        markdown_text = re.sub(r"([^\n])\n(!\[[^\]]*\]\(/dump_extract/images/[^)]+\))", r"\1\n\n\2", markdown_text)
        markdown_text = re.sub(r"(!\[[^\]]*\]\(/dump_extract/images/[^)]+\))\n([^\n])", r"\1\n\n\2", markdown_text)
        # f) Collapse excessive empty lines
        markdown_text = re.sub(r"\n{3,}", r"\n\n", markdown_text)
        # g) Join soft-wrapped lines within paragraphs:
        #    pymupdf4llm hard-wraps at ~80 chars with a single \n inside a paragraph.
        #    Replace a single \n NOT followed by: blank line, heading, list item, blockquote, image, table row
        markdown_text = re.sub(
            r"(?<!\n)\n(?!\n)(?!#{1,6} )(?![-*+] )(?!\d+\. )(?!> )(?!!\[)(?!\|)",
            " ",
            markdown_text,
        )

        # 5. If PyMuPDF4LLM embedded 0 images into text, append extracted figures cleanly in-between
        images_in_md = re.findall(r"!\[.*?\]\(/dump_extract/images/[^)]+\)", markdown_text)
        if len(images_in_md) == 0 and extracted_figures:
            logger.info("[PDFMarkdownEngine] PyMuPDF4LLM had 0 inline figures; inserting %d extracted figures", len(extracted_figures))
            fig_section = ["\n\n## Extracted Figures & Architecture Diagrams\n"]
            for fig in extracted_figures:
                fig_section.append(f"\n![{fig['caption']}]({fig['url']})\n\n*{fig['caption']}*\n")
            markdown_text += "\n".join(fig_section)

        # 6. Save the generated Markdown to dump_extract/ for permanence and inspection
        paper_md_path = os.path.join(DUMP_EXTRACT_DIR, "paper.md")
        slug_md_path = os.path.join(MARKDOWN_DIR, f"{clean_name}.md")
        try:
            with open(paper_md_path, "w", encoding="utf-8") as f_out:
                f_out.write(markdown_text)
            with open(slug_md_path, "w", encoding="utf-8") as f_out:
                f_out.write(markdown_text)
            logger.info("[PDFMarkdownEngine] Saved Markdown to %s and %s", paper_md_path, slug_md_path)
        except Exception as f_err:
            logger.warning("[PDFMarkdownEngine] Could not save markdown file: %s", f_err)

        # 7. Extract Document Metadata (Title, Authors, Year, Abstract)
        meta = doc.metadata or {}
        first_page_text = doc[0].get_text() if total_pages > 0 else ""
        first_lines = [l.strip() for l in first_page_text.split("\n") if l.strip()]

        title = meta.get("title") or ""
        if not title or len(title) < 5 or title.lower().endswith(".pdf"):
            h1_match = re.search(r"^#\s+(.+)$", markdown_text, re.MULTILINE)
            if h1_match and len(h1_match.group(1).strip()) > 5:
                title = h1_match.group(1).strip()
            elif first_lines:
                candidates = [l for l in first_lines[:5] if len(l) > 10 and not l.lower().startswith("arxiv")]
                title = candidates[0] if candidates else (filename or "Research Publication")
        title = re.sub(r"\s+", " ", title).strip()

        author_meta = meta.get("author") or ""
        authors = [a.strip() for a in re.split(r"[,;]| and ", author_meta) if a.strip()]
        if not authors and len(first_lines) > 1:
            for line in first_lines[1:4]:
                if line != title and len(line) < 120 and not line.lower().startswith("abstract"):
                    parsed_a = [a.strip() for a in re.split(r"[,;]| and |\*|\†", line) if len(a.strip()) > 2]
                    if parsed_a:
                        authors = parsed_a
                        break

        year = 2024
        year_match = re.search(r"\b(201\d|202\d)\b", first_page_text[:1000])
        if year_match:
            try:
                year = int(year_match.group(1))
            except Exception:
                year = 2024

        abstract = ""
        ab_match = re.search(r"##\s*Abstract\s*\n+([\s\S]+?)(?=\n+##|\Z)", markdown_text, re.IGNORECASE)
        if ab_match:
            abstract = ab_match.group(1).strip()
            abstract = re.sub(r"^>\s*", "", abstract, flags=re.MULTILINE).strip()
        elif first_lines:
            ab_idx = -1
            for idx, line in enumerate(first_lines):
                if re.match(r"^\s*abstract\b", line, re.IGNORECASE):
                    ab_idx = idx
                    break
            if ab_idx != -1:
                abstract_buffer = []
                for line in first_lines[ab_idx + 1:ab_idx + 20]:
                    if re.match(r"^\s*(1\.?\s*)?(introduction|index terms)\b", line, re.IGNORECASE):
                        break
                    abstract_buffer.append(line)
                abstract = " ".join(abstract_buffer).strip()
                abstract = re.sub(r"^(abstract[\s:—–-]+)", "", abstract, flags=re.IGNORECASE).strip()

        # 8. Extract Section List for Navigation
        sections = []
        heading_matches = list(re.finditer(r"^(#{1,3})\s+(.+)$", markdown_text, re.MULTILINE))
        for i, match in enumerate(heading_matches):
            h_title = match.group(2).strip()
            start_pos = match.end()
            end_pos = heading_matches[i + 1].start() if i + 1 < len(heading_matches) else len(markdown_text)
            body = markdown_text[start_pos:end_pos].strip()
            sections.append({
                "title": h_title,
                "type": re.sub(r"[^a-z0-9]+", "-", h_title.lower()).strip("-"),
                "content": body[:500] if len(body) > 500 else body,
            })

        return {
            "title": title,
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "markdown": markdown_text,
            "sections": sections,
            "figures": extracted_figures,
            "total_pages": total_pages,
            "markdown_file": f"/dump_extract/markdown/{clean_name}.md",
        }
