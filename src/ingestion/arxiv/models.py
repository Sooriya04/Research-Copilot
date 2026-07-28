from typing import List, Optional
from pydantic import BaseModel, Field


class Author(BaseModel):
    name: str
    affiliation: Optional[str] = None


class ArxivPaper(BaseModel):
    arxiv_id: str = Field(..., description="arXiv identifier e.g. 1706.03762")
    title: str = Field(..., description="Paper title")
    abstract: str = Field(..., description="Paper abstract text")
    authors: List[Author] = Field(default_factory=list, description="List of paper authors")
    published_date: str = Field(..., description="Publication date string (ISO format)")
    updated_date: Optional[str] = Field(None, description="Last updated date string")
    pdf_url: str = Field(..., description="Direct link to PDF document")
    entry_id: str = Field(..., description="Full arXiv entry URL")
    primary_category: str = Field(..., description="Primary arXiv category e.g. cs.CL")
    categories: List[str] = Field(default_factory=list, description="All associated arXiv categories")
    doi: Optional[str] = Field(None, description="Digital Object Identifier if available")
    journal_ref: Optional[str] = Field(None, description="Journal reference if published")
    full_text: Optional[str] = Field(None, description="Parsed text of the PDF")
    paragraphs: Optional[List[str]] = Field(None, description="Parsed paragraphs of the PDF")

    def formatted_authors(self) -> str:
        names = [a.name for a in self.authors]
        if len(names) <= 3:
            return ", ".join(names)
        return ", ".join(names[:3]) + f" et al. ({len(names)} authors)"


class ArxivSearchResult(BaseModel):
    query: str
    total_results: int
    returned_count: int
    papers: List[ArxivPaper] = Field(default_factory=list)
