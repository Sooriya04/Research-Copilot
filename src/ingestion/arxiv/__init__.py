"""
arXiv API Ingestion Package
"""

from src.ingestion.arxiv.models import ArxivPaper, Author, ArxivSearchResult
from src.ingestion.arxiv.client import ArxivClient

__all__ = ["ArxivPaper", "Author", "ArxivSearchResult", "ArxivClient"]
