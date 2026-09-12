import logging
import re
from typing import Any, Dict, List, Optional, Union

from src.core.schemas import PaperIntelligence
from src.graph.schema import (
    ClaimNode,
    DatasetNode,
    LimitationNode,
    MethodNode,
    MetricNode,
    NodeType,
    PaperNode,
    Relation,
    ResearchEdge,
    TopicNode,
    slugify_id,
)
from src.graph.store import ResearchGraphStore

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Builds Knowledge Graph nodes and semantic edges into ResearchGraphStore from PaperIntelligence."""

    def __init__(self, store: ResearchGraphStore):
        self.store = store

    async def build_topic_subgraph(
        self,
        topic: str,
        papers: List[Union[PaperIntelligence, Any]],
        clear_existing: bool = False,
    ) -> str:
        """Constructs a hierarchical research topology with a Head Topic node, Paper subnodes, and relational edges."""
        topic_clean = topic.strip()
        if not topic_clean:
            return ""

        if clear_existing:
            await self.store.clear()

        topic_id = f"topic-{slugify_id(topic_clean)}"

        # 1. Head Node: Topic
        existing_topic = await self.store.get_node(topic_id)
        if not existing_topic:
            topic_node = TopicNode(id=topic_id, name=topic_clean, query=topic_clean)
            await self.store.add_node(topic_node)
            logger.info("Added Head TopicNode: %s (%s)", topic_id, topic_clean)

        # 2. Paper subnodes and relational links
        for p in papers:
            paper_id = await self.build_from_paper_intelligence(p)
            if paper_id:
                # Link Head Topic -> Paper Subnode
                edge = ResearchEdge(
                    source_id=topic_id,
                    target_id=paper_id,
                    relation=Relation.COVERS,
                    weight=2.0,
                )
                await self.store.add_edge(edge)

        return topic_id

    async def build_from_paper_intelligence(self, paper_intel: Union[PaperIntelligence, Any]) -> str:
        """Parse structured paper intelligence and construct/persist corresponding graph entities."""
        # 1. Extract PaperNode fields
        if hasattr(paper_intel, "id"):
            paper_id = paper_intel.id
        elif hasattr(paper_intel, "canonical_id"):
            paper_id = paper_intel.canonical_id
        elif isinstance(paper_intel, dict):
            paper_id = paper_intel.get("id") or paper_intel.get("canonical_id") or "unknown-paper"
        else:
            paper_id = str(getattr(paper_intel, "id", "unknown-paper"))

        title = getattr(paper_intel, "title", "") if not isinstance(paper_intel, dict) else paper_intel.get("title", "")
        year = getattr(paper_intel, "year", None) if not isinstance(paper_intel, dict) else paper_intel.get("year")
        venue = getattr(paper_intel, "venue", None) if not isinstance(paper_intel, dict) else paper_intel.get("venue")

        raw_authors = getattr(paper_intel, "authors", []) if not isinstance(paper_intel, dict) else paper_intel.get("authors", [])
        authors_list: List[str] = []
        for a in raw_authors:
            if isinstance(a, str):
                authors_list.append(a)
            elif hasattr(a, "name"):
                authors_list.append(a.name)
            elif isinstance(a, dict) and "name" in a:
                authors_list.append(a["name"])
            else:
                authors_list.append(str(a))

        paper_node = PaperNode(
            id=paper_id,
            title=title or "Untitled Paper",
            year=int(year) if year else None,
            venue=venue,
            authors=authors_list,
        )

        # Add PaperNode
        existing_paper = await self.store.get_node(paper_id)
        if not existing_paper:
            await self.store.add_node(paper_node)
            logger.info("Added PaperNode: %s", paper_id)

        # 2. Methods & Datasets derivation (Exclude generic stop-words and high-level taxonomy terms)
        STOP_WORDS = {
            # Broad academic fields and disciplines
            "computer science", "artificial intelligence", "machine learning", "deep learning",
            "natural language processing", "natural language processing techniques",
            "information retrieval", "topic modeling", "software engineering", "mathematics",
            "algorithm", "algorithms", "neural network", "neural networks", "data science",
            "statistics", "applied mathematics", "computation and language",
            "artificial intelligence (cs.ai)", "machine learning (cs.lg)", "computation and language (cs.cl)",
            "explainable artificial intelligence (xai)", "adversarial robustness in machine learning",
            "advanced neural network application", "machine learning in image processing",
            "engineering", "linguistics", "physics", "biology", "medicine",
            # Generic placeholders & filler words
            "empirical method", "benchmark evaluation", "general benchmark", "general",
            "method", "methods", "dataset", "datasets", "benchmark", "benchmarks",
            "analysis", "study", "studies", "overview", "survey", "surveys", "research",
            "framework", "frameworks", "system", "systems", "technique", "techniques",
            "approach", "approaches", "model", "models", "evaluation", "evaluations",
            "experiment", "experiments", "task", "tasks", "performance", "impact",
            "investigation", "review", "reasoning", "reasoning & empirical analysis",
        }

        methods = getattr(paper_intel, "methods", []) if not isinstance(paper_intel, dict) else paper_intel.get("methods", [])
        datasets = getattr(paper_intel, "datasets", []) if not isinstance(paper_intel, dict) else paper_intel.get("datasets", [])
        benchmarks = getattr(paper_intel, "benchmarks", []) if not isinstance(paper_intel, dict) else paper_intel.get("benchmarks", [])

        derived_methods = list(methods)
        derived_datasets = list(datasets)

        # Incorporate verified benchmarks from PapersWithCode or intelligence if present
        for b in benchmarks:
            if isinstance(b, dict):
                d_name = b.get("dataset")
                t_name = b.get("task")
                if d_name and str(d_name).strip().lower() not in STOP_WORDS:
                    derived_datasets.append(str(d_name).strip())
                if t_name and str(t_name).strip().lower() not in STOP_WORDS:
                    derived_methods.append(str(t_name).strip())

        for m in derived_methods:
            if isinstance(m, str):
                method_name = m.strip()
                category = "general"
            elif isinstance(m, dict):
                method_name = m.get("name", "").strip() or str(m)
                category = m.get("category", "general")
            elif hasattr(m, "name"):
                method_name = getattr(m, "name", "").strip()
                category = getattr(m, "category", "general")
            else:
                method_name = str(m).strip()
                category = "general"

            if not method_name or method_name.lower() in STOP_WORDS or len(method_name) < 3:
                continue

            method_id = slugify_id(method_name)
            existing_method = await self.store.get_node(method_id)
            if not existing_method:
                method_node = MethodNode(id=method_id, name=method_name, category=category)
                await self.store.add_node(method_node)
                logger.info("Added MethodNode: %s (%s)", method_id, method_name)

            edge = ResearchEdge(source_id=paper_id, target_id=method_id, relation=Relation.USES_METHOD)
            await self.store.add_edge(edge)

        # 3. Datasets
        for d in derived_datasets:
            if isinstance(d, str):
                dataset_name = d.strip()
                domain = "general"
            elif isinstance(d, dict):
                dataset_name = d.get("name", "").strip() or str(d)
                domain = d.get("domain", "general")
            elif hasattr(d, "name"):
                dataset_name = getattr(d, "name", "").strip()
                domain = getattr(d, "domain", "general")
            else:
                dataset_name = str(d).strip()
                domain = "general"

            if not dataset_name or dataset_name.lower() in STOP_WORDS or len(dataset_name) < 3:
                continue

            dataset_id = slugify_id(dataset_name)
            existing_dataset = await self.store.get_node(dataset_id)
            if not existing_dataset:
                dataset_node = DatasetNode(id=dataset_id, name=dataset_name, domain=domain)
                await self.store.add_node(dataset_node)
                logger.info("Added DatasetNode: %s (%s)", dataset_id, dataset_name)

            edge = ResearchEdge(source_id=paper_id, target_id=dataset_id, relation=Relation.EVALUATES_ON)
            await self.store.add_edge(edge)

        # 4. Citations (Cross-Paper Links strictly between papers that exist in the store)
        cited_list = (
            getattr(paper_intel, "cited_papers", [])
            or getattr(paper_intel, "referenced_works", [])
            or (paper_intel.get("cited_papers", []) if isinstance(paper_intel, dict) else [])
            or (paper_intel.get("referenced_works", []) if isinstance(paper_intel, dict) else [])
        )
        for cited_id in cited_list:
            cid_str = str(cited_id).strip()
            if not cid_str:
                continue

            # Look up if the target paper node is already stored in our graph
            target_node = await self.store.get_node(cid_str)
            target_id = cid_str
            if not target_node:
                # Check all stored paper nodes for matching DOI, arXiv ID, or OpenAlex ID
                for nid in self.store.graph.nodes:
                    node_obj = await self.store.get_node(nid)
                    if node_obj and getattr(node_obj, "node_type", None) == NodeType.PAPER:
                        ndata = getattr(node_obj, "data", {}) or {}
                        if (ndata.get("doi") and ndata.get("doi") == cid_str) or \
                           (ndata.get("arxiv_id") and ndata.get("arxiv_id") == cid_str) or \
                           (ndata.get("openalex_id") and ndata.get("openalex_id") == cid_str):
                            target_node = node_obj
                            target_id = nid
                            break

            if target_node and getattr(target_node, "node_type", None) == NodeType.PAPER:
                edge = ResearchEdge(source_id=paper_id, target_id=target_id, relation=Relation.CITES)
                await self.store.add_edge(edge)

        # Check reverse citations: if any existing paper in the store cited this new paper
        for nid in self.store.graph.nodes:
            if nid == paper_id:
                continue
            node_obj = await self.store.get_node(nid)
            if node_obj and getattr(node_obj, "node_type", None) == NodeType.PAPER:
                ndata = getattr(node_obj, "data", {}) or {}
                existing_cited = ndata.get("cited_papers") or ndata.get("referenced_works") or []
                clean_existing_cited = [str(c).strip() for c in existing_cited]
                if (paper_id in clean_existing_cited) or \
                   (getattr(paper_node, "doi", None) and getattr(paper_node, "doi") in clean_existing_cited) or \
                   (getattr(paper_node, "arxiv_id", None) and getattr(paper_node, "arxiv_id") in clean_existing_cited):
                    rev_edge = ResearchEdge(source_id=nid, target_id=paper_id, relation=Relation.CITES)
                    await self.store.add_edge(rev_edge)

        return paper_id

