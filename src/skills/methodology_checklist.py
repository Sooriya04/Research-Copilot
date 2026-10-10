import time
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.core.schemas import Paper, PaperSection
from src.engines.rubric_evaluator import RubricEvaluator
from src.skills.registry import BaseSkill, SkillMetadata, skill_registry


class MethodologyChecklistSkill(BaseSkill):
    """Scientific Skill: Evaluates scientific papers against NeurIPS/ICLR empirical rigor & reproducibility rubrics."""

    def __init__(self):
        metadata = SkillMetadata(
            name="methodology-checklist",
            label="Full-Text Methodology Checklist & Rigor Rubrics",
            description=(
                "Audits research papers against the 5 core NeurIPS/ICLR empirical rigor criteria: "
                "Assumptions & Limitations, Reproducibility Path, Experimental Details & Baselines, "
                "Statistical Significance, and Compute Resources & Budget."
            ),
            category="research",
            parameters_schema={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Paper title"},
                    "abstract": {"type": "string", "description": "Paper abstract"},
                    "full_text": {"type": "string", "description": "Full paper text or section bodies"},
                    "sections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "content": {"type": "string"},
                                "section_type": {"type": "string"},
                            },
                        },
                        "description": "Structured list of parsed paper sections",
                    },
                    "paper_id": {"type": "string", "description": "Optional identifier or DOI of paper"},
                },
                "required": ["title"],
            },
            returns_schema={
                "type": "object",
                "properties": {
                    "paper_title": {"type": "string"},
                    "rubric_score": {"type": "number"},
                    "rubric_gaps": {"type": "integer"},
                    "items": {"type": "array"},
                    "recommendations": {"type": "array"},
                    "execution_time_ms": {"type": "number"},
                },
            },
        )
        super().__init__(metadata)
        self.evaluator = RubricEvaluator()

    async def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        start_time = time.time()
        title = str(params.get("title", "Untitled Research Paper")).strip()
        abstract = str(params.get("abstract", "")).strip()
        full_text = params.get("full_text")
        paper_id = params.get("paper_id", "paper-eval")

        raw_sections = params.get("sections") or []
        parsed_sections: List[PaperSection] = []
        for s in raw_sections:
            if isinstance(s, dict):
                parsed_sections.append(PaperSection(
                    title=s.get("title", ""),
                    content=s.get("content", ""),
                    section_type=s.get("section_type", "other"),
                ))
            elif isinstance(s, PaperSection):
                parsed_sections.append(s)

        paper = Paper(
            id=paper_id,
            title=title,
            abstract=abstract,
            sections=parsed_sections,
        )

        rubric = self.evaluator.evaluate(paper, full_text=full_text)
        exec_ms = round((time.time() - start_time) * 1000.0, 2)

        return {
            "paper_id": paper_id,
            "paper_title": title,
            "rubric_score": rubric.rubric_score,
            "rubric_gaps": rubric.rubric_gaps,
            "has_ablation": rubric.has_ablation,
            "has_code_repo": rubric.has_code_repo,
            "code_url": rubric.code_url,
            "has_compute_budget": rubric.has_compute_budget,
            "compute_details": rubric.compute_details,
            "has_uncertainty_quant": rubric.has_uncertainty_quant,
            "has_limitations": rubric.has_limitations,
            "items": [item.model_dump() for item in rubric.items],
            "recommendations": rubric.recommendations,
            "execution_time_ms": exec_ms,
        }


# Register skill on import
skill_registry.register(MethodologyChecklistSkill())
