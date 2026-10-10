import time
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.core.schemas import Paper, RankRequest
from src.engines.paper_rank import PaperRankEngine
from src.skills.registry import BaseSkill, SkillMetadata, skill_registry

RANK_PROFILES: Dict[str, Dict[str, float]] = {
    "balanced": {
        "topical_relevance": 0.30,
        "citation_impact": 0.20,
        "graph_prestige": 0.20,
        "citation_velocity": 0.10,
        "methodology_quality": 0.10,
        "reproducibility": 0.10,
    },
    "reproducibility": {
        "topical_relevance": 0.20,
        "citation_impact": 0.10,
        "graph_prestige": 0.10,
        "citation_velocity": 0.10,
        "methodology_quality": 0.15,
        "reproducibility": 0.35,
    },
    "empirical_rigor": {
        "topical_relevance": 0.20,
        "citation_impact": 0.10,
        "graph_prestige": 0.10,
        "citation_velocity": 0.10,
        "methodology_quality": 0.35,
        "reproducibility": 0.15,
    },
    "recent_velocity": {
        "topical_relevance": 0.25,
        "citation_impact": 0.10,
        "graph_prestige": 0.10,
        "citation_velocity": 0.35,
        "methodology_quality": 0.10,
        "reproducibility": 0.10,
    },
    "prestige": {
        "topical_relevance": 0.20,
        "citation_impact": 0.25,
        "graph_prestige": 0.35,
        "citation_velocity": 0.05,
        "methodology_quality": 0.08,
        "reproducibility": 0.07,
    },
}


class PaperRankSkill(BaseSkill):
    """Scientific Skill: Multi-factor PaperRank scoring engine answering 'What should a researcher read first?'"""

    def __init__(self):
        metadata = SkillMetadata(
            name="paper-rank",
            label="PaperRank Multi-Factor Literature Scoring",
            description=(
                "Ranks scientific literature using a 6-factor algorithm combining topical relevance, "
                "citation impact, graph PageRank prestige, annual citation velocity, methodology quality, "
                "and artifact reproducibility."
            ),
            category="research",
            parameters_schema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Scientific research topic, keywords, or research question",
                    },
                    "limit": {
                        "type": "integer",
                        "default": 10,
                        "description": "Maximum number of ranked papers to return",
                    },
                    "profile": {
                        "type": "string",
                        "enum": ["balanced", "reproducibility", "empirical_rigor", "recent_velocity", "prestige"],
                        "default": "balanced",
                        "description": "Sensitivity weighting profile for ranking",
                    },
                    "custom_weights": {
                        "type": "object",
                        "description": "Custom weights dictionary overriding profile weights",
                    },
                    "full_text_top": {
                        "type": "integer",
                        "default": 0,
                        "description": "Number of top papers to fetch full text and run deep section parsing for",
                    },
                },
                "required": ["query"],
            },
            returns_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "profile": {"type": "string"},
                    "weights_applied": {"type": "object"},
                    "total_found": {"type": "integer"},
                    "ranked_papers": {"type": "array"},
                    "recommended_first_read": {"type": "object"},
                    "execution_time_ms": {"type": "number"},
                },
            },
        )
        super().__init__(metadata)
        self.engine = PaperRankEngine()

    async def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        query = str(params.get("query", "")).strip()
        if not query:
            raise ValueError("Parameter 'query' cannot be empty for paper-rank skill.")

        limit = int(params.get("limit", 10))
        profile = str(params.get("profile", "balanced")).lower()
        custom_weights = params.get("custom_weights")
        full_text_top = int(params.get("full_text_top", 0))

        # Select weights
        applied_weights = custom_weights or RANK_PROFILES.get(profile, RANK_PROFILES["balanced"])

        req = RankRequest(
            query=query,
            limit=limit,
            weights=applied_weights,
            full_text_top=full_text_top,
        )

        start_time = time.time()
        res = await self.engine.rank(req)
        exec_ms = round((time.time() - start_time) * 1000.0, 2)

        papers_payload = []
        for p in res.papers:
            papers_payload.append({
                "id": p.id,
                "title": p.title,
                "year": p.year,
                "citation_count": p.citation_count,
                "score": p.score,
                "score_breakdown": p.score_breakdown.model_dump() if p.score_breakdown else None,
                "checklist": p.checklist.model_dump() if p.checklist else None,
                "url": p.url or p.pdf_url,
                "primary_source": p.primary_source,
                "authors": [a.name for a in p.authors[:4]] if p.authors else [],
            })

        first_read = papers_payload[0] if papers_payload else None

        return {
            "query": query,
            "profile": profile,
            "weights_applied": applied_weights,
            "total_found": res.total_found,
            "graph_nodes": res.graph_nodes,
            "graph_edges": res.graph_edges,
            "ranked_papers": papers_payload,
            "recommended_first_read": first_read,
            "execution_time_ms": exec_ms,
        }


# Register skill on import
skill_registry.register(PaperRankSkill())
