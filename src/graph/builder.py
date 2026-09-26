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
        abstract = getattr(paper_intel, "abstract", "") if not isinstance(paper_intel, dict) else paper_intel.get("abstract", "")
        topics = getattr(paper_intel, "topics", []) if not isinstance(paper_intel, dict) else paper_intel.get("topics", [])
        doi = getattr(paper_intel, "doi", None) if not isinstance(paper_intel, dict) else paper_intel.get("doi")
        arxiv_id = getattr(paper_intel, "arxiv_id", None) if not isinstance(paper_intel, dict) else paper_intel.get("arxiv_id")

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

        openalex_id = getattr(paper_intel, "openalex_id", None) if not isinstance(paper_intel, dict) else paper_intel.get("openalex_id")
        citation_count = getattr(paper_intel, "citation_count", 0) if not isinstance(paper_intel, dict) else (paper_intel.get("citation_count") or 0)
        cited_list = (
            getattr(paper_intel, "cited_papers", [])
            or getattr(paper_intel, "referenced_works", [])
            or (paper_intel.get("cited_papers", []) if isinstance(paper_intel, dict) else [])
            or (paper_intel.get("referenced_works", []) if isinstance(paper_intel, dict) else [])
            or []
        )
        clean_cited_list = [str(c).strip() for c in cited_list if c]

        paper_node = PaperNode(
            id=paper_id,
            title=title or "Untitled Paper",
            year=int(year) if year else None,
            venue=venue,
            authors=authors_list,
            doi=doi,
            arxiv_id=arxiv_id,
            openalex_id=openalex_id,
            abstract=abstract,
            topics=topics or [],
            cited_papers=clean_cited_list,
            referenced_works=clean_cited_list,
            citation_count=int(citation_count) if str(citation_count).isdigit() else 0,
        )

        # 2. Methods & Datasets derivation (Only verified explicitly provided entities)
        STOP_WORDS = {
            "computer science", "artificial intelligence", "machine learning", "deep learning",
            "natural language processing", "information retrieval", "topic modeling", "software engineering",
            "empirical method", "benchmark evaluation", "general benchmark", "general",
            "method", "methods", "dataset", "datasets", "benchmark", "benchmarks",
            "analysis", "study", "studies", "overview", "survey", "surveys", "research",
            "framework", "frameworks", "system", "systems", "technique", "techniques",
            "approach", "approaches", "model", "models", "evaluation", "evaluations",
            "experiment", "experiments", "task", "tasks", "performance", "impact",
        }

        methods = getattr(paper_intel, "methods", []) if not isinstance(paper_intel, dict) else paper_intel.get("methods", [])
        datasets = getattr(paper_intel, "datasets", []) if not isinstance(paper_intel, dict) else paper_intel.get("datasets", [])
        benchmarks = getattr(paper_intel, "benchmarks", []) if not isinstance(paper_intel, dict) else paper_intel.get("benchmarks", [])

        derived_methods: list = []
        for m in methods:
            m_str = m.get("name", "") if isinstance(m, dict) else str(m)
            if m_str and m_str.lower() not in STOP_WORDS and len(m_str) >= 3:
                derived_methods.append(m_str)

        derived_datasets: list = []
        for d in datasets:
            d_str = d.get("name", "") if isinstance(d, dict) else str(d)
            if d_str and d_str.lower() not in STOP_WORDS and len(d_str) >= 3:
                derived_datasets.append(d_str)

        # Incorporate verified benchmarks from PapersWithCode if present
        for b in benchmarks:
            if isinstance(b, dict):
                d_name = b.get("dataset")
                t_name = b.get("task")
                if d_name and str(d_name).strip().lower() not in STOP_WORDS:
                    derived_datasets.append(str(d_name).strip())
                if t_name and str(t_name).strip().lower() not in STOP_WORDS:
                    derived_methods.append(str(t_name).strip())

        nodes_to_add: list = []
        edges_to_add: list = []

        # Always add/update PaperNode to ensure latest metadata is persisted
        nodes_to_add.append(paper_node)
        logger.info("Persisting PaperNode: %s", paper_id)

        for method_name in set(derived_methods):
            method_id = slugify_id(method_name)
            existing_method = await self.store.get_node(method_id)
            if not existing_method:
                method_node = MethodNode(id=method_id, name=method_name, category="general")
                nodes_to_add.append(method_node)
            edges_to_add.append(ResearchEdge(source_id=paper_id, target_id=method_id, relation=Relation.USES_METHOD))

        for dataset_name in set(derived_datasets):
            dataset_id = slugify_id(dataset_name)
            existing_dataset = await self.store.get_node(dataset_id)
            if not existing_dataset:
                dataset_node = DatasetNode(id=dataset_id, name=dataset_name, domain="general")
                nodes_to_add.append(dataset_node)
            edges_to_add.append(ResearchEdge(source_id=paper_id, target_id=dataset_id, relation=Relation.EVALUATES_ON))

        # Helper to clean and normalize any paper identifier
        def _clean_ref(raw_val: Any) -> str:
            if not raw_val:
                return ""
            s = str(raw_val).strip().lower()
            s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s)
            s = re.sub(r"^doi:\s*", "", s)
            s = re.sub(r"^https?://openalex\.org/", "", s)
            s = re.sub(r"^openalex:\s*", "", s)
            s = re.sub(r"^https?://arxiv\.org/(abs|pdf)/", "", s)
            s = re.sub(r"^arxiv:\s*", "", s)
            s = re.sub(r"\.pdf$", "", s)
            s = re.sub(r"v\d+$", "", s)
            return s.strip()

        this_clean_id = _clean_ref(paper_id)
        this_clean_doi = _clean_ref(doi or "")
        this_clean_arxiv = _clean_ref(arxiv_id or "")
        this_clean_openalex = _clean_ref(openalex_id or "")
        this_clean_title = re.sub(r"[^a-z0-9 ]", "", (title or "").lower()).strip()
        this_refs_set = {_clean_ref(c) for c in clean_cited_list if _clean_ref(c)}

        # 3. Robust Citation Mapping between added papers
        for nid in list(self.store.graph.nodes):
            if nid == paper_id:
                continue
            node_data = self.store.graph.nodes.get(nid, {})
            if node_data.get("node_type") != NodeType.PAPER.value:
                continue

            node_clean_id = _clean_ref(nid)
            node_doi = _clean_ref(node_data.get("doi", ""))
            node_arxiv = _clean_ref(node_data.get("arxiv_id", ""))
            node_openalex = _clean_ref(node_data.get("openalex_id", ""))
            node_title = re.sub(r"[^a-z0-9 ]", "", str(node_data.get("title", "")).lower()).strip()

            existing_cited = (
                node_data.get("cited_papers")
                or node_data.get("referenced_works")
                or []
            )
            node_refs_set = {_clean_ref(c) for c in existing_cited if _clean_ref(c)}

            # A. Does this paper cite the existing paper?
            paper_cites_existing = False
            for target_ref in [node_clean_id, node_doi, node_arxiv, node_openalex]:
                if target_ref and target_ref in this_refs_set:
                    paper_cites_existing = True
                    break
            if not paper_cites_existing and len(node_title) >= 15:
                for r in clean_cited_list:
                    if node_title in str(r).lower():
                        paper_cites_existing = True
                        break

            if paper_cites_existing:
                edges_to_add.append(ResearchEdge(source_id=paper_id, target_id=nid, relation=Relation.CITES, weight=2.0))

            # B. Does existing paper cite this paper?
            existing_cites_paper = False
            for target_ref in [this_clean_id, this_clean_doi, this_clean_arxiv, this_clean_openalex]:
                if target_ref and target_ref in node_refs_set:
                    existing_cites_paper = True
                    break
            if not existing_cites_paper and len(this_clean_title) >= 15:
                for r in existing_cited:
                    if this_clean_title in str(r).lower():
                        existing_cites_paper = True
                        break

            if existing_cites_paper:
                edges_to_add.append(ResearchEdge(source_id=nid, target_id=paper_id, relation=Relation.CITES, weight=2.0))

            # C. Bibliographic / Co-Citation coupling (shared references)
            if not paper_cites_existing and not existing_cites_paper:
                mutual_refs = this_refs_set.intersection(node_refs_set)
                if len(mutual_refs) >= 1:
                    edges_to_add.append(ResearchEdge(
                        source_id=paper_id,
                        target_id=nid,
                        relation=Relation.CITES,
                        weight=1.0 + min(len(mutual_refs) * 0.2, 1.5)
                    ))

        # Flush all collected nodes and edges in a single DB transaction
        async with self.store.batch_write() as db:
            for node in nodes_to_add:
                await self.store.add_node(node, _db=db)
            for edge in edges_to_add:
                await self.store.add_edge(edge, _db=db)

        return paper_id


