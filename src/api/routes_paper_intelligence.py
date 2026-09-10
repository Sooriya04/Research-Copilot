from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.canonical_models import PaperSummarizeRequest, PaperSummarizeResponse
from src.core.database import get_db
from src.engines.paper_intelligence_engine import PaperIntelligenceEngine

router = APIRouter(prefix="/api/v1/paper", tags=["Paper Intelligence Engine"])
engine = PaperIntelligenceEngine()

@router.post("/summarize", response_model=PaperSummarizeResponse)
async def summarize_paper_endpoint(req: PaperSummarizeRequest, db: AsyncSession = Depends(get_db)):
    """Extract full PDF intelligence, benchmark evidence from Papers With Code, run Gemini Flash-Lite analysis, and verify claims with SQLite caching."""
    if not req.identifier.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier cannot be empty.")

    try:
        response = await engine.summarize_paper(req, db)
        return response
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Paper intelligence failure: {e}")
