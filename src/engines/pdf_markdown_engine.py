import os
import re
from typing import Any, Dict, List, Optional, Tuple
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
    """Extracts publication-grade structured Markdown, academic metadata, and figures from research PDFs.

    Provides layout-aware sanitization, KaTeX math formatting, de-hyphenation, and Anara-style sections.
    """

    def __init__(self, max_images: int = 24):
        self.max_images = max_images

    def convert_pdf_to_markdown(self, pdf_bytes: bytes, filename: Optional[str] = None) -> Dict[str, Any]:
        """Convert PDF bytes into high-fidelity Markdown, writing images and markdown to dump_extract/."""
        if not pdf_bytes or len(pdf_bytes) < 100:
            return {
                "title": filename or "Untitled Document",
                "authors": [],
                "affiliations": [],
                "year": 2024,
                "abstract": "",
                "markdown": "# Document\n\nNo readable content could be extracted from this PDF.",
                "body_markdown": "No readable content could be extracted from this PDF.",
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
                "affiliations": [],
                "year": 2024,
                "abstract": "",
                "markdown": f"# Document Parsing Error\n\nCould not parse PDF: {e}",
                "body_markdown": f"Could not parse PDF: {e}",
                "sections": [],
                "figures": [],
                "total_pages": 0,
            }

        total_pages = len(doc)
        clean_name = re.sub(r"[^a-zA-Z0-9]+", "_", (filename or "paper").replace(".pdf", "").lower()).strip("_")[:30] or "paper"
        logger.info("[PDFMarkdownEngine] Extracting PDF '%s' (%d pages) to dump_extract/", clean_name, total_pages)

        # 1. Extract Academic Publication Metadata (Title, Authors, Affiliations, Abstract, Year)
        meta_info = self._extract_academic_metadata(doc, filename)

        # 2. Run PyMuPDF4LLM with image writing directed into dump_extract/images/
        try:
            doc.name = clean_name
        except Exception:
            pass

        markdown_text = ""
        try:
            markdown_text = pymupdf4llm.to_markdown(
                doc,
                filename=clean_name,
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

        # 3. Extract any additional images from PDF xrefs that PyMuPDF4LLM might have missed
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

        # 4. Alignment & Text Flow Sanitization
        markdown_text = self._sanitize_markdown(markdown_text)

        # 5. If PyMuPDF4LLM embedded 0 images into text, append extracted figures cleanly
        images_in_md = re.findall(r"!\[.*?\]\(/dump_extract/images/[^)]+\)", markdown_text)
        if len(images_in_md) == 0 and extracted_figures:
            logger.info("[PDFMarkdownEngine] PyMuPDF4LLM had 0 inline figures; inserting %d extracted figures", len(extracted_figures))
            fig_section = ["\n\n## Extracted Figures & Architecture Diagrams\n"]
            for fig in extracted_figures:
                fig_section.append(f"\n![{fig['caption']}]({fig['url']})\n\n*{fig['caption']}*\n")
            markdown_text += "\n".join(fig_section)

        # 6. Extract clean body markdown (starting at Section 1) and Table of Contents sections
        body_markdown, sections = self._extract_sections_and_body(markdown_text, meta_info["abstract"])

        # 7. Build publication-formatted full Markdown
        authors_display = ", ".join(meta_info["authors"]) if meta_info["authors"] else "Authors listed in publication"
        affils_display = "; ".join(meta_info["affiliations"]) if meta_info["affiliations"] else ""
        header_blocks = [f"# {meta_info['title']}\n"]
        if authors_display:
            header_blocks.append(f"**{authors_display}**\n")
        if affils_display:
            header_blocks.append(f"*{affils_display}*\n")
        if meta_info["abstract"]:
            header_blocks.append(f"\n> **Abstract**  \n> {meta_info['abstract']}\n")
        header_blocks.append("\n---\n")

        full_publication_markdown = "\n".join(header_blocks) + "\n\n" + body_markdown

        # 8. Save the generated Markdown to dump_extract/ for permanence and inspection
        paper_md_path = os.path.join(DUMP_EXTRACT_DIR, "paper.md")
        slug_md_path = os.path.join(MARKDOWN_DIR, f"{clean_name}.md")
        try:
            with open(paper_md_path, "w", encoding="utf-8") as f_out:
                f_out.write(full_publication_markdown)
            with open(slug_md_path, "w", encoding="utf-8") as f_out:
                f_out.write(full_publication_markdown)
            logger.info("[PDFMarkdownEngine] Saved publication Markdown to %s and %s", paper_md_path, slug_md_path)
        except Exception as f_err:
            logger.warning("[PDFMarkdownEngine] Could not save markdown file: %s", f_err)

        return {
            "title": meta_info["title"],
            "authors": meta_info["authors"],
            "affiliations": meta_info["affiliations"],
            "year": meta_info["year"],
            "abstract": meta_info["abstract"],
            "markdown": full_publication_markdown,
            "body_markdown": body_markdown,
            "sections": sections,
            "figures": extracted_figures,
            "total_pages": total_pages,
            "markdown_file": f"/dump_extract/markdown/{clean_name}.md",
        }

    def _extract_academic_metadata(self, doc: fitz.Document, filename: Optional[str]) -> Dict[str, Any]:
        """Extract title, authors, affiliations, year, and abstract using Page 1 layout and font analysis."""
        title = ""
        authors = []
        affiliations = []
        abstract = ""
        year = 2024

        if len(doc) == 0:
            return {"title": filename or "Untitled", "authors": [], "affiliations": [], "year": year, "abstract": ""}

        p1 = doc[0]
        page_width = p1.rect.width
        page_height = p1.rect.height

        try:
            blocks = p1.get_text("dict").get("blocks", [])
            content_blocks = []
            for b in blocks:
                if b.get("type") == 0:  # text block
                    bbox = b["bbox"]
                    # Filter out vertical left margin watermarks (e.g., arXiv margin banners)
                    if bbox[0] < 45 and bbox[2] < 55:
                        continue
                    # Filter out header/footer running lines
                    if bbox[1] < 28 or bbox[3] > page_height - 24:
                        continue

                    full_text = ""
                    max_size = 0.0
                    for l in b.get("lines", []):
                        for s in l.get("spans", []):
                            full_text += s.get("text", "") + " "
                            if s.get("size", 0) > max_size:
                                max_size = float(s.get("size", 0))
                    full_text = re.sub(r"\s+", " ", full_text).strip()
                    if full_text:
                        content_blocks.append({"text": full_text, "size": max_size, "bbox": bbox})

            # Identify Title: block with largest font size near top of page (y0 < page_height * 0.40)
            title_candidates = [b for b in content_blocks if b["bbox"][1] < page_height * 0.40]
            title_candidates.sort(key=lambda x: x["size"], reverse=True)
            main_title_blocks = []
            if title_candidates:
                max_s = title_candidates[0]["size"]
                # Group all title blocks within 1.2pt of max size that appear near the top
                main_title_blocks = [b for b in title_candidates if b["size"] >= max_s - 1.2]
                main_title_blocks.sort(key=lambda x: x["bbox"][1])
                title = " ".join(b["text"] for b in main_title_blocks)
                title = re.sub(r"\s+", " ", title).strip()

            # Locate Abstract block
            abstract_y = page_height
            for idx, b in enumerate(content_blocks):
                if b["text"].lower().startswith("abstract"):
                    abstract_y = b["bbox"][1]
                    ab_lines = [b["text"]]
                    for next_b in content_blocks[idx + 1:]:
                        if re.match(r"^(1\.?\s*)?(introduction|index terms)\b", next_b["text"], re.IGNORECASE):
                            break
                        ab_lines.append(next_b["text"])
                    abstract = " ".join(ab_lines)
                    abstract = re.sub(r"^(abstract[\s:—–\.\*]+(?:context:)?\s*)", "", abstract, flags=re.IGNORECASE).strip()
                    break

            # Content blocks between Title and Abstract are Authors & Affiliations
            if title_candidates:
                title_bottom = max(b["bbox"][3] for b in main_title_blocks) if main_title_blocks else title_candidates[0]["bbox"][3]
                author_blocks = [b for b in content_blocks if b["bbox"][1] > title_bottom and b["bbox"][1] < abstract_y]
                for b in author_blocks:
                    line = b["text"]
                    # If contains typical affiliation keywords or starts with number or email
                    if re.search(r"\b(university|universidade|institute|instituto|lab|laboratory|department|inesc|google|meta|microsoft|research|ericsson|inc|ltd|center|centre|school|faculty)\b", line, re.IGNORECASE) or re.match(r"^\d", line) or "@" in line:
                        clean_affil = re.sub(r"\{[^\}]+\}@[a-zA-Z0-9\.\-]+", "", line)
                        clean_affil = re.sub(r"[a-zA-Z0-9\.\-_]+@[a-zA-Z0-9\.\-]+", "", clean_affil)
                        clean_affil = re.sub(r"^\d+\s*", "", clean_affil).strip()
                        clean_affil = re.sub(r"[\s,;]+$", "", clean_affil).strip()
                        if clean_affil and clean_affil not in affiliations:
                            affiliations.append(clean_affil)
                    else:
                        names = re.split(r"[,;]|\band\b", line)
                        for n in names:
                            clean_n = re.sub(r"[\d\*\†\‡\s]+$", "", n).strip()
                            clean_n = re.sub(r"^\d+\s*", "", clean_n).strip()
                            if len(clean_n) > 2 and not re.search(r"\b(university|inesc|lab|department|ericsson)\b", clean_n, re.IGNORECASE):
                                if clean_n not in authors:
                                    authors.append(clean_n)
        except Exception as meta_err:
            logger.warning("[PDFMarkdownEngine] Spatial metadata extraction error: %s", meta_err)

        # Fallback to PDF metadata if spatial parse was blank
        meta = doc.metadata or {}
        if not title or len(title) < 5 or title.lower().endswith(".pdf"):
            title = meta.get("title") or filename or "Research Publication"
            title = re.sub(r"\s+", " ", title).strip()

        if not authors and meta.get("author"):
            authors = [a.strip() for a in re.split(r"[,;]| and ", meta.get("author", "")) if a.strip()]

        first_page_text = p1.get_text()
        year_match = re.search(r"\b(201\d|202\d)\b", first_page_text[:1200])
        if year_match:
            try:
                year = int(year_match.group(1))
            except Exception:
                year = 2024

        return {
            "title": title,
            "authors": authors,
            "affiliations": affiliations,
            "year": year,
            "abstract": abstract,
        }

    def _sanitize_markdown(self, markdown_text: str) -> str:
        """Clean up markdown flow, images, tables, hyphens, and page artifacts."""
        # 0. Strip messy OCR picture text blocks generated by pymupdf4llm
        markdown_text = re.sub(r"<!-- Start of picture text -->[\s\S]*?<!-- End of picture text -->", "", markdown_text)

        # 1. Normalize all image markdown paths to absolute web paths: /dump_extract/images/<filename>
        markdown_text = re.sub(
            r"!\[(.*?)\]\((?:(?:/)?dump_extract/)?images/([^)]+)\)",
            r"![\1](/dump_extract/images/\2)",
            markdown_text,
        )
        markdown_text = re.sub(
            r"!\[(.*?)\]\((?!http|/|data:)([^)]+\.(?:png|jpe?g|webp|gif|svg))\)",
            r"![\1](/dump_extract/images/\2)",
            markdown_text,
        )

        # 2. Merge trailing figure captions into image alt text
        markdown_text = re.sub(
            r"!\[(.*?)\]\((/dump_extract/images/[^)]+)\)\s*\n+\s*(\*?\*?Fig(?:ure)?\.?\s*\d+[\s\S]*?\*?\*?)(?=\n|$)",
            r"![\3](\2)\n\n\3",
            markdown_text,
        )

        # 3. Split words accidentally glued to Table/Figure captions across columns
        # (e.g., 'until comTable 1: ...' -> 'until com-\n\nTable 1: ...')
        markdown_text = re.sub(
            r"([a-z]{2,})(Table\s+\d+:?|Figure\s+\d+:?)",
            r"\1-\n\n\2",
            markdown_text,
        )

        # 4. Repair words broken with hyphens across lines/pages
        markdown_text = re.sub(
            r"(\b[a-zA-Z]{2,})-\s*\n+\s*(?:\d+\s*\n+)?([a-zA-Z]{2,}\b)",
            r"\1\2",
            markdown_text,
        )

        # 5. Remove isolated page numbers
        markdown_text = re.sub(r"\n\n\s*\d{1,3}\s*\n\n", r"\n\n", markdown_text)
        markdown_text = re.sub(
            r"(?<=[a-zA-Z,.:;])\s*\n+\s*\d{1,3}\s*\n+\s*(?=[a-zA-Z])",
            r" ",
            markdown_text,
        )

        # 6. Remove running arXiv margin watermarks
        markdown_text = re.sub(
            r"\narXiv:\d{4}\.\d{4,5}(?:v\d+)?\s+\[[a-zA-Z\.\-]+\]\s+\d+\s+[a-zA-Z]+\s+\d{4}\n",
            r"\n",
            markdown_text,
        )

        # 7. Remove leading affiliation/footnote superscript digits from lines like "1Instituto Superior..."
        markdown_text = re.sub(r"^(\d{1,2})([A-Z][a-zA-Z])", r"\2", markdown_text, flags=re.MULTILINE)

        # 8. Clean asterisks from headings so they never render literal **
        markdown_text = re.sub(r"^(#{1,6}\s+)\*\*(.*?)\*\*\s*$", r"\1\2", markdown_text, flags=re.MULTILINE)

        # 9. Remove running author/paper headers across page breaks
        markdown_text = re.sub(r"\n\n(?:\-\s*)?\d{1,3}\s+[A-Za-z\s\.,\-]+et al\.\s*\n\n", "\n\n", markdown_text)
        markdown_text = re.sub(r"\n\n(?:\-\s*)?[A-Za-z0-9\s,\-:–—]+et al\.(?:\s+\d{1,3})?\s*\n\n", "\n\n", markdown_text)
        markdown_text = re.sub(r"(?<=[a-zA-Z,–—\(\)])\s*\n\n\s*(?=[a-z])", " ", markdown_text)

        # 10. Demote author/affiliation lines incorrectly promoted to ## headings
        def _demote_if_not_section(m):
            content = m.group(1).strip()
            if re.match(r"^\d+[\s\.]", content) or re.match(r"^[IVXLCDM]+[\s\.]", content):
                return m.group(0)
            if re.search(
                r"\b(abstract|introduction|method|result|conclusion|experiment|related|"
                r"appendix|discussion|evaluation|background|setup|analysis|approach|"
                r"framework|model|system|dataset|baseline|limitation|future|references|bibliography)\b",
                content,
                re.IGNORECASE,
            ):
                return m.group(0)
            return f"\n{content}\n"

        markdown_text = re.sub(r"\n## ([^\n]+)\n", _demote_if_not_section, markdown_text)

        # 11. Collapse blank lines between table rows so GFM parses them as native tables
        tbl_lines = markdown_text.split("\n")
        tbl_out = []
        in_tbl = False
        for tl in tbl_lines:
            stl = tl.strip()
            if stl.startswith("|") and stl.endswith("|"):
                tbl_out.append(stl)
                in_tbl = True
            elif stl == "" and in_tbl:
                continue
            else:
                tbl_out.append(tl)
                in_tbl = False
        markdown_text = "\n".join(tbl_out)

        # 9. Ensure images have clean spacing before and after
        markdown_text = re.sub(r"([^\n])\n(!\[[^\]]*\]\(/dump_extract/images/[^)]+\))", r"\1\n\n\2", markdown_text)
        markdown_text = re.sub(r"(!\[[^\]]*\]\(/dump_extract/images/[^)]+\))\n([^\n])", r"\1\n\n\2", markdown_text)

        # 10. Ensure tables have clean spacing before and after
        markdown_text = re.sub(r"([^\n])\n(\|.*?\|)", r"\1\n\n\2", markdown_text)

        # 11. Join soft-wrapped lines within paragraphs:
        # Replace a single \n NOT followed by: blank line, heading, list item, blockquote, image, table row, math
        markdown_text = re.sub(
            r"(?<!\n)\n(?!\n)(?!#{1,6} )(?![-*+] )(?!\d+\. )(?!> )(?!!\[)(?!\|)(?!\$\$)",
            " ",
            markdown_text,
        )

        # 12. Collapse excessive empty lines
        markdown_text = re.sub(r"\n{3,}", r"\n\n", markdown_text)

        return markdown_text.strip()

    def _extract_sections_and_body(self, markdown_text: str, abstract: str) -> Tuple[str, List[Dict[str, Any]]]:
        """Slice clean body markdown (starting at Section 1) and build hierarchical section navigation."""
        # Find start of Section 1 (e.g., '## 1 Introduction', '## **1 Introduction**', or '## Introduction')
        sec1_match = re.search(
            r"\n(#{1,4}\s+[\*\s]*(?:\d+[\s\.\)]+|[IVXLCDM]+[\s\.\)]+)?[\*\s]*(?:Introduction|Background|Overview)\b[\s\S]*)$",
            markdown_text,
            re.IGNORECASE,
        )
        body_markdown = sec1_match.group(1).strip() if sec1_match else markdown_text

        # Extract all section headings for TOC
        sections: List[Dict[str, Any]] = []

        # If abstract exists, add as first item
        if abstract:
            sections.append({
                "id": "abstract",
                "title": "Abstract",
                "level": 2,
                "content": abstract[:350],
            })

        heading_matches = list(re.finditer(r"^(#{1,4})\s+(.+)$", body_markdown, re.MULTILINE))
        for i, match in enumerate(heading_matches):
            hashes = match.group(1)
            level = len(hashes)
            h_title = match.group(2).strip()
            # Clean markdown formatting like **bold** or *italics*
            clean_title = re.sub(r"[\*\_]", "", h_title)
            clean_title = re.sub(r"<[^>]*>", "", clean_title).strip()
            clean_title = re.sub(r"^(\d+(?:\.\d+)*)([A-Za-z])", r"\1 \2", clean_title)

            # Skip junk / malformed TOC items
            if not clean_title or len(clean_title) < 2 or len(clean_title) > 85:
                continue
            if clean_title.endswith("]") or "<!--" in clean_title:
                continue
            if re.search(r"\b(vol\.|pp\.|no\.|\(\d{4}\))\b", clean_title, re.IGNORECASE):
                continue

            slug = re.sub(r"[^a-z0-9]+", "-", clean_title.lower()).strip("-")
            start_pos = match.end()
            end_pos = heading_matches[i + 1].start() if i + 1 < len(heading_matches) else len(body_markdown)
            snippet = body_markdown[start_pos:end_pos].strip()

            sections.append({
                "id": slug or f"section-{i+1}",
                "title": clean_title,
                "level": level,
                "content": snippet[:350] if len(snippet) > 350 else snippet,
            })

        return body_markdown, sections
