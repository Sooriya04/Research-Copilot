import math
import re
import time
from datetime import datetime
from typing import Dict, List, Optional
from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import ChecklistRubric, Paper, RankRequest, RankResponse, ScoreBreakdown
from src.engines.access_resolver import AccessResolver
from src.engines.citation_graph import CitationGraphEngine
from src.engines.pdf_parser import PDFSectionExtractor
from src.engines.rubric_evaluator import RubricEvaluator

STOP_WORDS = {
    "a", "about", "after", "all", "an", "and", "are", "as", "at", "based",
    "by", "for", "from", "how", "in", "into", "is", "it", "its", "of", "on",
    "or", "paper", "papers", "research", "study", "the", "their", "this",
    "to", "using", "via", "we", "with"
}

class PaperRankEngine:
    """The complete PaperRank ranking and scientific scoring engine."""

    DEFAULT_WEIGHTS = {
        "topical_relevance": 0.30,
        "citation_impact": 0.20,
        "graph_prestige": 0.20,
        "citation_velocity": 0.10,
        "methodology_quality": 0.10,
        "reproducibility": 0.10,
    }

    def __init__(self):
        self.resolver = AccessResolver()
        self.graph_engine = CitationGraphEngine()
        self.rubric_evaluator = RubricEvaluator()
        self.pdf_extractor = PDFSectionExtractor()

    async def rank(self, req: RankRequest) -> RankResponse:
        """Execute the multi-stage PaperRank pipeline."""
        start_time = time.time()
        logger.info("Executing PaperRank for query: '%s' (limit=%d)", req.query, req.limit)

        # 1. Harvest candidates across OpenAlex and arXiv
        openalex_papers = await self.resolver.search_openalex(req.query, limit=req.limit)
        arxiv_papers = await self.resolver.search_arxiv(req.query, limit=req.limit)
        
        # Deduplicate papers by title / DOI / arXiv ID
        paper_pool: Dict[str, Paper] = {}
        for p in openalex_papers + arxiv_papers:
            key = p.doi or p.arxiv_id or re.sub(r"[^\w]", "", p.title.lower())
            if key not in paper_pool:
                paper_pool[key] = p
            elif not paper_pool[key].pdf_url and p.pdf_url:
                paper_pool[key].pdf_url = p.pdf_url

        papers = list(paper_pool.values())
        if not papers:
            return RankResponse(
                query=req.query,
                run_id=f"run-{int(time.time())}",
                total_found=0,
                papers=[],
                synthesis=None,
                execution_time_ms=(time.time() - start_time) * 1000.0,
            )

        # 2. Construct Citation Graph & Calculate PageRank Prestige
        citation_graph = self.graph_engine.build_graph(papers)
        prestige_scores = self.graph_engine.calculate_prestige(citation_graph)
        nodes_count, edges_count = self.graph_engine.get_graph_stats(citation_graph)

        # 3. Optional Section-Aware Full-Text extraction for Top N
        if req.full_text_top > 0:
            for p in papers[:min(req.full_text_top, len(papers))]:
                if p.pdf_url:
                    sections = await self.pdf_extractor.fetch_and_parse_pdf(p.pdf_url)
                    if sections:
                        p.sections = sections

        # 4. Score each paper across 6 components
        current_year = datetime.utcnow().year
        query_tokens = self._tokenize(req.query)
        weights = req.weights or self.DEFAULT_WEIGHTS

        for p in papers:
            # Component 1: Topical Relevance (BM25 / lexical overlap)
            doc_tokens = self._tokenize((p.title or "") + " " + (p.abstract or ""))
            relevance = self._compute_relevance(query_tokens, doc_tokens, p.title, req.query)

            # Component 2: Citation Impact (Log-scaled)
            cites = max(0, p.citation_count)
            citation_impact = min(100.0, (math.log1p(cites) / math.log1p(10000)) * 100.0)

            # Component 3: Graph Prestige (PageRank)
            clean_id = p.id.split("/")[-1] if "/" in p.id else p.id
            graph_prestige = prestige_scores.get(clean_id, 10.0)

            # Component 4: Citation Velocity (Citations / Years since pub)
            age_years = max(1, current_year - (p.year or current_year) + 1)
            velocity = min(100.0, ((cites / age_years) / 50.0) * 100.0)

            # Component 5 & 6: Rubric (Methodology & Reproducibility)
            rubric = self.rubric_evaluator.evaluate(p)
            p.checklist = rubric
            
            method_quality = 0.0
            if rubric.has_empirical_eval: method_quality += 40.0
            if rubric.has_ablation: method_quality += 30.0
            if rubric.has_uncertainty_quant: method_quality += 30.0

            reproducibility = 0.0
            if rubric.has_code_repo: reproducibility += 50.0
            if rubric.has_dataset_link: reproducibility += 30.0
            if rubric.has_compute_budget: reproducibility += 20.0

            # Weighted Total Score
            total = (
                relevance * weights.get("topical_relevance", 0.3) +
                citation_impact * weights.get("citation_impact", 0.2) +
                graph_prestige * weights.get("graph_prestige", 0.2) +
                velocity * weights.get("citation_velocity", 0.1) +
                method_quality * weights.get("methodology_quality", 0.1) +
                reproducibility * weights.get("reproducibility", 0.1)
            )

            p.score = round(total, 2)
            p.score_breakdown = ScoreBreakdown(
                topical_relevance=round(relevance, 2),
                citation_impact=round(citation_impact, 2),
                graph_prestige=round(graph_prestige, 2),
                citation_velocity=round(velocity, 2),
                methodology_quality=round(method_quality, 2),
                reproducibility=round(reproducibility, 2),
                total_score=round(total, 2),
            )

        # 5. Sort by PaperRank total score descending
        papers.sort(key=lambda x: x.score or 0.0, reverse=True)
        ranked = papers[:min(req.limit, len(papers))]

        exec_ms = (time.time() - start_time) * 1000.0
        return RankResponse(
            query=req.query,
            run_id=f"run-{int(time.time())}",
            total_found=len(papers),
            papers=ranked,
            synthesis=None,
            execution_time_ms=round(exec_ms, 2),
            graph_nodes=nodes_count,
            graph_edges=edges_count,
        )

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[A-Za-z0-9_-]{2,}\b", text.lower())
        return [w for w in words if w not in STOP_WORDS]

    def _compute_relevance(self, query_tokens: List[str], doc_tokens: List[str], title: str, raw_query: str) -> float:
        if not query_tokens or not doc_tokens:
            return 20.0
        q_set = set(query_tokens)
        d_set = set(doc_tokens)
        overlap = len(q_set & d_set)
        jaccard = overlap / len(q_set | d_set) if (q_set | d_set) else 0.0
        
        # Exact title substring bonus
        title_bonus = 30.0 if raw_query.lower() in title.lower() else 0.0
        
        # Token coverage ratio
        coverage = (overlap / len(q_set)) * 70.0 if q_set else 0.0
        
        return min(100.0, coverage + title_bonus + (jaccard * 30.0))
