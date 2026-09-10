from fastapi import APIRouter, HTTPException, status
from src.core.schemas import RankRequest, RankResponse
from src.engines.paper_rank import PaperRankEngine

router = APIRouter(prefix="/api/v1/rank", tags=["PaperRank"])
rank_engine = PaperRankEngine()

@router.post("", response_model=RankResponse)
async def rank_papers_endpoint(req: RankRequest):
    """Rank scientific papers for a research topic using the PaperRank 6-factor algorithm."""
    if not req.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty."
        )
    return await rank_engine.rank(req)
