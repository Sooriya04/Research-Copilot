import re
from typing import List

class ContextCleaner:
    """Cleans raw PDF text, removing running headers/footers, page numbers, and citation noise."""

    PAGE_NUMBER_PATTERN = re.compile(r"^\s*(\d{1,4}|page\s+\d+(\s+of\s+\d+)?)\s*$", re.IGNORECASE)
    RUNNING_HEADER_PATTERN = re.compile(r"^\s*(preprint(\s+under\s+review)?|arxiv:\d{4}\.\d{4,5}(v\d+)?|conference\s+paper|proceedings\s+of\s+.*|submitted\s+to\s+.*)\s*$", re.IGNORECASE)
    CITATION_BRACKET_PATTERN = re.compile(r"\[\s*(\d+[\s,–-]*)+\s*\]")
    URL_FOOTER_PATTERN = re.compile(r"^\s*https?://\S+\s*$")
    MULTIPLE_SPACES_PATTERN = re.compile(r"[ \t]+")
    HYPHENATION_PATTERN = re.compile(r"(\w+)-\s*\n\s*(\w+)")

    def clean_page(self, page_text: str) -> str:
        """Sanitize a single page of text."""
        # 1. Fix broken hyphenated words at line breaks (e.g. trans-\n   former -> transformer)
        text = self.HYPHENATION_PATTERN.sub(r"\1\2", page_text)

        lines = text.split("\n")
        cleaned_lines: List[str] = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Strip page numbers
            if self.PAGE_NUMBER_PATTERN.match(stripped):
                continue

            # Strip running headers / conference footer noise
            if self.RUNNING_HEADER_PATTERN.match(stripped):
                continue

            # Strip standalone URL footers
            if self.URL_FOOTER_PATTERN.match(stripped):
                continue

            cleaned_lines.append(stripped)

        # 2. Re-assemble and remove citation noise: e.g. [1, 2, 3] -> ""
        merged_text = "\n".join(cleaned_lines)
        cleaned_text = self.CITATION_BRACKET_PATTERN.sub("", merged_text)
        cleaned_text = self.MULTIPLE_SPACES_PATTERN.sub(" ", cleaned_text)

        return cleaned_text.strip()

    def clean_full_document(self, pages: List[str]) -> str:
        """Clean and concatenate all document pages."""
        cleaned_pages = [self.clean_page(p) for p in pages if p.strip()]
        return "\n\n".join(cleaned_pages)
