from typing import List, Optional
from pydantic import BaseModel, Field
from src.ingestion.arxiv.models import ArxivPaper, ArxivSearchResult


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search topic keyword or phrase e.g. 'attention is all you need'", example="attention is all you need")
    top_k: int = Field(5, ge=1, le=50, description="Top K relevant papers to retrieve", example=5)
    sort_by: str = Field("relevance", description="Sorting criterion: relevance, lastUpdatedDate, or submittedDate")
    sort_order: str = Field("descending", description="Sorting order: descending or ascending")


class HealthResponse(BaseModel):
    status: str = Field("ok")
    version: str = Field("0.1.0")
    service: str = Field("Research Copilot API")


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
