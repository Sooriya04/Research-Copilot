from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.core.schemas import ChecklistRubric, PaperSection, RankRequest, RankResponse
from src.engines.paper_rank import PaperRankEngine
from src.skills.paper_rank import RANK_PROFILES
from src.skills.registry import skill_registry

router = APIRouter(prefix="/api/v1/rank", tags=["PaperRank & Rigor Rubrics"])
rank_engine = PaperRankEngine()


class ChecklistRequest(BaseModel):
    title: str = "Untitled Paper"
    abstract: str = ""
    full_text: Optional[str] = None
    sections: Optional[List[PaperSection]] = Field(default_factory=list)
    paper_id: Optional[str] = "paper-eval"


class SkillExecutionRequest(BaseModel):
    params: Dict[str, Any] = Field(default_factory=dict)


@router.post("", response_model=RankResponse)
async def rank_papers_endpoint(req: RankRequest):
    """Rank scientific papers for a research topic using the PaperRank 6-factor algorithm."""
    if not req.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query string cannot be empty."
        )
    return await rank_engine.rank(req)


@router.get("/profiles")
async def get_rank_profiles():
    """Retrieve available PaperRank sensitivity weighting presets."""
    return {
        "default_profile": "balanced",
        "profiles": RANK_PROFILES,
    }


@router.post("/checklist", response_model=ChecklistRubric)
async def evaluate_methodology_checklist_endpoint(req: ChecklistRequest):
    """Evaluate a research paper against the 5 core NeurIPS/ICLR empirical rigor & reproducibility rubrics."""
    from src.core.schemas import Paper
    from src.engines.rubric_evaluator import RubricEvaluator

    evaluator = RubricEvaluator()
    paper = Paper(
        id=req.paper_id or "paper-eval",
        title=req.title,
        abstract=req.abstract,
        sections=req.sections or [],
    )
    return evaluator.evaluate(paper, full_text=req.full_text)


@router.get("/skills")
async def list_scientific_skills():
    """List all registered scientific and research engineering skills."""
    return {"skills": skill_registry.list_skills()}


@router.post("/skills/{skill_name}")
async def execute_scientific_skill(skill_name: str, req: SkillExecutionRequest):
    """Dynamically execute a scientific skill by name (e.g. 'paper-rank', 'methodology-checklist')."""
    try:
        result = await skill_registry.execute(skill_name, req.params)
        return {"status": "success", "skill": skill_name, "result": result}
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Execution of skill '{skill_name}' failed: {str(e)}",
        )
