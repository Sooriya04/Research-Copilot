import re
from datetime import datetime
from typing import Dict, List, Optional
from src.core.logger import logger
from src.core.schemas import (
    Paper,
    RankRequest,
    ResearchArtifact,
    ResearchArtifactKind,
    ResearchEntity,
    ResearchGraphState,
)
from src.engines.access_resolver import AccessResolver
from src.engines.citation_graph import CitationGraphEngine
from src.engines.paper_rank import PaperRankEngine
from src.engines.pdf_parser import PDFSectionExtractor
from src.engines.rubric_evaluator import RubricEvaluator
from src.graph.engine import END, ResearchStateGraph
from src.graph.node import BaseResearchNode

# --- Standard Graph Nodes ---

class PaperDiscoveryNode(BaseResearchNode):
    """Discovers initial literature across OpenAlex and arXiv."""

    def __init__(self, limit: int = 25):
        super().__init__("discover_papers", "Searches OpenAlex and arXiv for seed research papers")
        self.resolver = AccessResolver()
        self.limit = limit

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        openalex = await self.resolver.search_openalex(state.query, limit=self.limit)
        arxiv = await self.resolver.search_arxiv(state.query, limit=self.limit)
        
        for p in openalex + arxiv:
            key = p.doi or p.arxiv_id or re.sub(r"[^\w]", "", p.title.lower())
            if key not in state.papers:
                state.papers[key] = p
            elif not state.papers[key].pdf_url and p.pdf_url:
                state.papers[key].pdf_url = p.pdf_url
                
        return state

class PaperRankScoringNode(BaseResearchNode):
    """Computes multi-factor PaperRank scores across discovered papers."""

    def __init__(self):
        super().__init__("rank_papers", "Calculates PaperRank scores, prestige, and relevance")
        self.rank_engine = PaperRankEngine()

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        papers = list(state.papers.values())
        if not papers:
            return state

        req = RankRequest(query=state.query, limit=len(papers))
        rank_res = await self.rank_engine.rank(req)
        
        # Update papers and ranked list in state
        state.ranked_paper_ids = []
        for p in rank_res.papers:
            key = p.doi or p.arxiv_id or re.sub(r"[^\w]", "", p.title.lower())
            state.papers[key] = p
            state.ranked_paper_ids.append(key)

        return state

class CitationGraphExpansionNode(BaseResearchNode):
    """Expands local citation graph with referenced and citing works."""

    def __init__(self, top_k: int = 3):
        super().__init__("expand_citation_graph", "Expands references and citation network for top papers")
        self.graph_engine = CitationGraphEngine()
        self.top_k = top_k

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        top_keys = state.ranked_paper_ids[:self.top_k]
        top_papers = [state.papers[k] for k in top_keys if k in state.papers]
        
        g = self.graph_engine.build_graph(top_papers)
        state.citation_graph = {node: list(g.neighbors(node)) for node in g.nodes}
        return state

class FullTextExtractionNode(BaseResearchNode):
    """Fetches PDF and extracts structured sections for top papers."""

    def __init__(self, top_k: int = 3):
        super().__init__("extract_full_text", "Downloads PDFs and parses sections for high-priority papers")
        self.extractor = PDFSectionExtractor()
        self.top_k = top_k

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        top_keys = state.ranked_paper_ids[:self.top_k]
        for k in top_keys:
            p = state.papers.get(k)
            if p and p.pdf_url and not p.sections:
                sections = await self.extractor.fetch_and_parse_pdf(p.pdf_url)
                if sections:
                    p.sections = sections
        return state

class EvidenceSynthesisNode(BaseResearchNode):
    """Synthesizes structured Markdown research report and checklist matrix."""

    def __init__(self):
        super().__init__("synthesize_evidence", "Synthesizes literature findings into structured markdown artifact")

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        top_keys = state.ranked_paper_ids[:5]
        top_papers = [state.papers[k] for k in top_keys if k in state.papers]
        
        lines = [
            f"# Research Brief: {state.query}",
            f"\n*Session ID:* `{state.session_id}` | *Iteration:* {state.iteration}",
            f"\n## Top Ranked Scientific Literature\n",
            "| Rank | Score | Title | Year | Citations | Code |",
            "| :---: | :---: | :--- | :---: | :---: | :---: |",
        ]

        for idx, p in enumerate(top_papers, 1):
            code_badge = f"[Link]({p.checklist.code_url})" if (p.checklist and p.checklist.code_url) else ("Yes" if (p.checklist and p.checklist.has_code_repo) else "No")
            lines.append(f"| **#{idx}** | **{p.score}** | [{p.title}]({p.url or '#'}) | {p.year or 'N/A'} | {p.citation_count} | {code_badge} |")

        lines.append("\n## Methodology & Reproducibility Insights\n")
        for idx, p in enumerate(top_papers, 1):
            chk = p.checklist
            lines.append(f"### {idx}. {p.title}")
            lines.append(f"- **Authors:** {', '.join(a.name for a in p.authors[:4])}")
            lines.append(f"- **Key Metrics:** Relevance: {p.score_breakdown.topical_relevance if p.score_breakdown else 0}/100 | Prestige: {p.score_breakdown.graph_prestige if p.score_breakdown else 0}/100")
            if chk:
                lines.append(f"- **Ablations:** {'Present' if chk.has_ablation else 'Not detected'}")
                lines.append(f"- **Baselines:** {'Compared against SOTA' if chk.has_baselines else 'Not specified'}")
                lines.append(f"- **Uncertainty Quantification:** {'Error bars/variance' if chk.has_uncertainty_quant else 'None reported'}")
                if chk.compute_details:
                    lines.append(f"- **Compute Budget:** `{chk.compute_details}`")
            lines.append("")

        report_content = "\n".join(lines)
        state.synthesis_markdown = report_content

        # Create structured artifact
        artifact = ResearchArtifact(
            id=f"artifact-{state.session_id}-{int(datetime.utcnow().timestamp())}",
            kind=ResearchArtifactKind.REPORT,
            path=f"./artifacts/{state.session_id}/report.md",
            label="Executive Research Synthesis",
            role="primary_report",
            primary=True,
            format="markdown",
            content=report_content
        )
        state.artifacts.append(artifact)
        return state

# --- Loop Router Condition ---

def should_continue_loop(state: ResearchGraphState) -> str:
    """Routing function that determines whether to iterate or finish the loop."""
    state.iteration += 1
    # If we have reached max iterations or sufficient papers discovered, terminate
    if state.iteration >= state.max_iterations or len(state.ranked_paper_ids) >= 10:
        return "synthesize_evidence"
    return "discover_papers"

def build_default_research_pipeline() -> ResearchStateGraph:
    """Build the standard research graph with iterative loop support."""
    graph = ResearchStateGraph(entry_point="discover_papers")
    
    # 1. Register Nodes
    graph.add_node("discover_papers", PaperDiscoveryNode(limit=25))
    graph.add_node("rank_papers", PaperRankScoringNode())
    graph.add_node("expand_citation_graph", CitationGraphExpansionNode(top_k=5))
    graph.add_node("extract_full_text", FullTextExtractionNode(top_k=3))
    graph.add_node("synthesize_evidence", EvidenceSynthesisNode())

    # 2. Wire Linear Flow & Loop Conditions
    graph.add_edge("discover_papers", "rank_papers")
    graph.add_edge("rank_papers", "expand_citation_graph")
    graph.add_edge("expand_citation_graph", "extract_full_text")
    
    # Conditional loop edge from full text extraction
    graph.add_conditional_edge("extract_full_text", should_continue_loop)
    graph.add_edge("synthesize_evidence", END)

    return graph
