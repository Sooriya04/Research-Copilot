import argparse
import sys
from typing import Optional

from src.ingestion.arxiv.client import ArxivClient
from src.ingestion.arxiv.models import ArxivSearchResult


def search_arxiv(query: str, top_k: int = 5, verbose: bool = True) -> ArxivSearchResult:
    """
    Search arXiv for top_k relevant documents for a given query topic.

    Args:
        query: Search query (e.g., 'attention is all you need')
        top_k: Number of top relevant matches to retrieve
        verbose: Whether to print formatted results to stdout

    Returns:
        ArxivSearchResult object containing matched ArxivPaper instances.
    """
    client = ArxivClient()
    result = client.search(query=query, max_results=top_k)

    if verbose:
        print("\n" + "=" * 80)
        print(f" 🔍 RESEARCH COPILOT - arXiv LITERATURE SEARCH")
        print("=" * 80)
        print(f" Query Term     : '{result.query}'")
        print(f" Total Matched  : {result.total_results:,} papers in arXiv")
        print(f" Top-K Returned : {result.returned_count}")
        print("=" * 80 + "\n")

        for idx, paper in enumerate(result.papers, 1):
            print(f" [{idx}] {paper.title}")
            print(f"     arXiv ID   : {paper.arxiv_id}  [{paper.primary_category}]")
            print(f"     Authors    : {paper.formatted_authors()}")
            print(f"     Published  : {paper.published_date[:10]}")
            print(f"     PDF Link   : {paper.pdf_url}")
            print(f"     Abstract   : {paper.abstract[:250]}...")
            print("-" * 80 + "\n")

    return result


def main():
    parser = argparse.ArgumentParser(description="Search arXiv for relevant scientific papers.")
    parser.add_argument("query", type=str, nargs="?", default="attention is all you need", help="Search topic query string")
    parser.add_argument("--top-k", "-k", type=int, default=5, help="Number of top matches to retrieve")
    args = parser.parse_args()

    search_arxiv(query=args.query, top_k=args.top_k, verbose=True)


if __name__ == "__main__":
    main()
