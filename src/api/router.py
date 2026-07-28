import logging
import time
from fastapi import APIRouter, HTTPException
from src.api.schemas import HealthResponse, SearchRequest
from src.ingestion.arxiv.client import ArxivClient
from src.ingestion.arxiv.models import ArxivPaper, ArxivSearchResult

# Configure logger
logger = logging.getLogger("research_copilot.api")

router = APIRouter(prefix="/api/v1", tags=["Literature Ingestion"])
arxiv_client = ArxivClient()


@router.get("/health", response_model=HealthResponse, summary="Health Check")
async def health_check():
    """Verify backend API operational status."""
    logger.info("Health check endpoint queried")
    return HealthResponse()


@router.post(
    "/search/arxiv",
    response_model=ArxivSearchResult,
    summary="Search arXiv Literature (POST)",
    description="Retrieve top-K relevant research papers using the HTTP POST method with JSON body.",
)
async def search_arxiv_query(req: SearchRequest):
    """POST method endpoint supporting standard HTTP POST method with body."""
    logger.info("Received arXiv search request via HTTP POST method. Query: '%s', Top K: %d", req.query, req.top_k)
    start_time = time.time()
    try:
        results = arxiv_client.search(
            query=req.query,
            max_results=req.top_k,
            sort_by=req.sort_by,
            sort_order=req.sort_order,
        )
        duration = time.time() - start_time
        logger.info(
            "Successfully fetched %d papers for query '%s' in %.2f seconds (total matched: %d)",
            results.returned_count,
            req.query,
            duration,
            results.total_results
        )
        return results
    except Exception as e:
        logger.error("Exception occurred while searching arXiv for query '%s': %s", req.query, str(e), exc_info=True)
        return ArxivSearchResult(
            query=req.query,
            total_results=0,
            returned_count=0,
            papers=[],
        )


@router.get(
    "/papers/arxiv/{arxiv_id:path}",
    response_model=ArxivPaper,
    summary="Fetch Paper Metadata by arXiv ID",
    description="Retrieve detailed metadata for a single arXiv paper by ID (e.g. 1706.03762).",
)
async def get_paper_by_id(arxiv_id: str):
    logger.info("Received request to fetch paper by ID: '%s'", arxiv_id)
    try:
        results = arxiv_client.search(query=f"id:{arxiv_id}", max_results=1)
        if not results.papers:
            logger.warning("Paper with arXiv ID '%s' not found.", arxiv_id)
            raise HTTPException(status_code=404, detail=f"Paper with arXiv ID '{arxiv_id}' not found.")
        logger.info("Successfully fetched paper details for ID: '%s'", arxiv_id)
        return results.papers[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error occurred while retrieving paper '%s': %s", arxiv_id, str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error retrieving paper '{arxiv_id}': {str(e)}")
