import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from src.core.config import settings


@dataclass
class DocumentChunk:
    """Represents a section- and page-grounded slice of a research paper."""
    chunk_id: str
    paper_id: str
    chunk_index: int
    content: str
    page_number: int
    section: str
    token_count: int
    metadata: Dict = field(default_factory=dict)


class PaperChunker:
    """Paragraph- and section-aware chunker that preserves page boundaries."""

    SECTION_HEADER_PATTERN = re.compile(
        r"^(?:\d{1,2}\.?\s+)?(?:Abstract|Introduction|Related\s+Work|Background|"
        r"Methodology|Method|Architecture|Approach|Model\s+Design|Experimental\s+Setup|"
        r"Experiments|Results|Discussion|Ablation\s+Study|Limitations|Conclusion|References)",
        re.IGNORECASE,
    )

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        self.chunk_size = chunk_size or getattr(settings, "rag_chunk_size", 800)
        self.chunk_overlap = chunk_overlap or getattr(settings, "rag_chunk_overlap", 150)

    def chunk_pages(
        self,
        paper_id: str,
        pages: List[Dict[str, any]],  # list of {"page_number": int, "text": str}
        fallback_section: str = "General",
    ) -> List[DocumentChunk]:
        """Split page texts into cohesive chunks while strictly tracking page numbers and detected sections."""
        chunks: List[DocumentChunk] = []
        chunk_counter = 0
        current_section = fallback_section

        for page_data in pages:
            page_num = page_data.get("page_number", 1)
            raw_text = page_data.get("text", "")
            if not raw_text or not raw_text.strip():
                continue

            # Split text into candidate paragraphs
            paragraphs = self._split_paragraphs(raw_text)
            buffer_text = ""

            for para in paragraphs:
                header = self._detect_section_header(para)
                if header:
                    # Flush current buffer before switching section
                    if buffer_text.strip():
                        chunks.append(
                            self._create_chunk(
                                paper_id=paper_id,
                                chunk_index=chunk_counter,
                                content=buffer_text.strip(),
                                page_number=page_num,
                                section=current_section,
                            )
                        )
                        chunk_counter += 1
                        buffer_text = ""
                    current_section = header

                clean_para = para.strip()
                if not clean_para:
                    continue

                # If single paragraph is larger than chunk_size, split it with overlap
                if len(clean_para) > self.chunk_size:
                    if buffer_text.strip():
                        chunks.append(
                            self._create_chunk(
                                paper_id=paper_id,
                                chunk_index=chunk_counter,
                                content=buffer_text.strip(),
                                page_number=page_num,
                                section=current_section,
                            )
                        )
                        chunk_counter += 1
                        buffer_text = ""

                    sub_chunks = self._split_with_overlap(clean_para)
                    for sc in sub_chunks:
                        chunks.append(
                            self._create_chunk(
                                paper_id=paper_id,
                                chunk_index=chunk_counter,
                                content=sc,
                                page_number=page_num,
                                section=current_section,
                            )
                        )
                        chunk_counter += 1
                else:
                    # Merge paragraphs up to chunk_size
                    if len(buffer_text) + len(clean_para) + 2 <= self.chunk_size:
                        buffer_text = f"{buffer_text}\n\n{clean_para}".strip()
                    else:
                        if buffer_text.strip():
                            chunks.append(
                                self._create_chunk(
                                    paper_id=paper_id,
                                    chunk_index=chunk_counter,
                                    content=buffer_text.strip(),
                                    page_number=page_num,
                                    section=current_section,
                                )
                            )
                            chunk_counter += 1
                        buffer_text = clean_para

            # Flush page buffer at page boundary to preserve exact page attribution
            if buffer_text.strip():
                chunks.append(
                    self._create_chunk(
                        paper_id=paper_id,
                        chunk_index=chunk_counter,
                        content=buffer_text.strip(),
                        page_number=page_num,
                        section=current_section,
                    )
                )
                chunk_counter += 1

        return chunks

    def _split_paragraphs(self, text: str) -> List[str]:
        # Split by double newline or consecutive newlines
        parts = re.split(r"\n\s*\n+", text)
        return [p.strip() for p in parts if p.strip()]

    def _detect_section_header(self, text: str) -> Optional[str]:
        first_line = text.strip().split("\n")[0].strip()
        if len(first_line) < 60 and self.SECTION_HEADER_PATTERN.match(first_line):
            # Clean punctuation
            return first_line.rstrip(".:")
        return None

    def _split_with_overlap(self, text: str) -> List[str]:
        """Split large text block into overlapping sub-chunks."""
        chunks = []
        start = 0
        text_len = len(text)
        step = max(100, self.chunk_size - self.chunk_overlap)

        while start < text_len:
            end = min(start + self.chunk_size, text_len)
            sub = text[start:end].strip()
            if sub:
                chunks.append(sub)
            if end >= text_len:
                break
            start += step

        return chunks

    def _create_chunk(
        self,
        paper_id: str,
        chunk_index: int,
        content: str,
        page_number: int,
        section: str,
    ) -> DocumentChunk:
        tokens = len(content.split())
        return DocumentChunk(
            chunk_id=f"{paper_id}_c{chunk_index}",
            paper_id=paper_id,
            chunk_index=chunk_index,
            content=content,
            page_number=page_number,
            section=section,
            token_count=tokens,
            metadata={"char_count": len(content)},
        )
