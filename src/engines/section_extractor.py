import re
from typing import Dict, List, Optional
from src.core.canonical_models import PaperSectionEntity, PaperSectionType
from src.core.logger import logger
from src.engines.context_cleaner import ContextCleaner

class SectionExtractor:
    """Classifies document text into semantically equivalent canonical research sections."""

    SECTION_CLASSIFIERS: Dict[PaperSectionType, List[re.Pattern]] = {
        PaperSectionType.ABSTRACT: [
            re.compile(r"^\s*(abstract|summary)\b", re.IGNORECASE)
        ],
        PaperSectionType.PROBLEM: [
            re.compile(r"^\s*(\d\.?\s*)?(introduction|motivation|problem\s+statement|background\s+and\s+motivation|overview)\b", re.IGNORECASE)
        ],
        PaperSectionType.RELATED_WORK: [
            re.compile(r"^\s*(\d\.?\s*)?(related\s+works?|prior\s+art|literature\s+review|background|state\s+of\s+the\s+art)\b", re.IGNORECASE)
        ],
        PaperSectionType.METHOD: [
            re.compile(r"^\s*(\d\.?\s*)?(proposed\s+)?(methods?|methodology|approach|model\s+architecture|proposed\s+method|framework|algorithmic\s+design|implementation\s+details)\b", re.IGNORECASE)
        ],
        PaperSectionType.EXPERIMENTS: [
            re.compile(r"^\s*(\d\.?\s*)?(empirical\s+)?(experiments?|evaluation|experimental\s+setup|results?|empirical\s+analysis|benchmarks?|ablation\s+studies)\b", re.IGNORECASE)
        ],
        PaperSectionType.LIMITATIONS: [
            re.compile(r"^\s*(\d\.?\s*)?(limitations?(\s+and\s+threats\s+to\s+validity)?|discussion|threats\s+to\s+validity|failure\s+cases?|future\s+work|broader\s+impacts?)\b", re.IGNORECASE)
        ],
        PaperSectionType.CONCLUSION: [
            re.compile(r"^\s*(\d\.?\s*)?(conclusions?|concluding\s+remarks|summary\s+and\s+outlook)\b", re.IGNORECASE)
        ],
    }

    def __init__(self):
        self.cleaner = ContextCleaner()

    def extract_sections(self, raw_pages: List[str]) -> List[PaperSectionEntity]:
        """Extract and semantically classify sections from document pages."""
        cleaned_doc = self.cleaner.clean_full_document(raw_pages)
        lines = cleaned_doc.split("\n")

        sections: List[PaperSectionEntity] = []
        current_type = PaperSectionType.PROBLEM
        current_title = "Introduction"
        current_lines: List[str] = []
        order_idx = 0

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            matched_type = None
            if len(stripped) < 70 and not stripped.endswith("."):
                for sec_type, patterns in self.SECTION_CLASSIFIERS.items():
                    if any(p.match(stripped) for p in patterns):
                        matched_type = sec_type
                        break

            if matched_type:
                # Flush previous section
                if current_lines:
                    content_str = "\n".join(current_lines).strip()
                    if len(content_str) > 10:
                        sections.append(PaperSectionEntity(
                            title=current_title,
                            section_type=current_type,
                            content=content_str,
                            order_index=order_idx,
                            token_count=len(content_str.split())
                        ))
                        order_idx += 1
                    current_lines = []

                current_type = matched_type
                current_title = stripped
            else:
                current_lines.append(stripped)

        # Flush final section
        if current_lines:
            content_str = "\n".join(current_lines).strip()
            if len(content_str) > 10:
                sections.append(PaperSectionEntity(
                    title=current_title,
                    section_type=current_type,
                    content=content_str,
                    order_index=order_idx,
                    token_count=len(content_str.split())
                ))

        logger.info("[SectionExtractor] Extracted %d structured sections", len(sections))
        return sections
