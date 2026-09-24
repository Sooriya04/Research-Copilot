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

        paper_node = PaperNode(
            id=paper_id,
            title=title or "Untitled Paper",
            year=int(year) if year else None,
            venue=venue,
            authors=authors_list,
            doi=doi,
            arxiv_id=arxiv_id,
            abstract=abstract,
            topics=topics or [],
        )

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

        # Automated Domain Entity Extraction from Title, Abstract, and Topics
        full_text = f"{title} {abstract}".strip()

        METHOD_PATTERNS = [
            (r"\bdecentralized\b|\bserver[- ]free\b|\bcentral\s+server\s+free\b|\bpeer[- ]to[- ]peer\b|\bp2p\b", "Decentralized Learning"),
            (r"\bprivacy\b|\bdata\s+privacy\b|\bdifferential\s+privacy\b|\bprivacy[- ]preserving\b", "Privacy-Preserving Methods"),
            (r"\bsecurity\b|\badversar(?:ies|ial)\b|\bdefense\s+mechanisms?\b|\bvulnerabilit(?:ies|y)\b|\bpoisoning\b", "Security & Defense"),
            (r"\bvertical\s+(?:asynchronous\s+)?federated\s+learning\b|\bvertical\s+fl\b|\bvafl\b", "Vertical Federated Learning"),
            (r"\bhorizontal\s+federated\s+learning\b|\bhfl\b", "Horizontal Federated Learning"),
            (r"\basynchronous\b|\bintermittent\b|\bdelay[- ]tolerant\b|\basync\b", "Asynchronous Optimization"),
            (r"\bgossip\s+(?:protocol|algorithm|approach)\b|\bsegmented\s+gossip\b", "Gossip Protocol"),
            (r"\b(?:stochastic\s+)?aggregation\b|\bmodel\s+aggregation\b|\bgradient\s+aggregation\b|\bsecure\s+aggregation\b", "Aggregation Methods"),
            (r"\bfedavg\b|\bfederated\s+averaging\b", "Federated Averaging"),
            (r"\bbyzantine\b|\bbyzantine[- ]robust\b", "Byzantine Robustness"),
            (r"\bautoencoders?\b|\bvariational\s+autoencoder\b|\bvae\b", "Autoencoders"),
            (r"\battention\s+mechanisms?\b|\bself[- ]attention\b|\bmulti[- ]head\s+attention\b", "Attention Mechanism"),
            (r"\btransformers?\b|\bvision\s+transformer\b|\bvit\b", "Transformer"),
            (r"\bconvolutional\s+neural\s+network\b|\bcnn\b|\bconvolutions?\b", "Convolutional Networks"),
            (r"\bgraph\s+neural\s+network\b|\bgnn\b|\bgraph\s+convolution\b", "Graph Neural Networks"),
            (r"\bdiffusion\s+models?\b|\bscore[- ]based\b", "Diffusion Models"),
            (r"\btransfer\s+learning\b|\bdomain\s+adaptation\b", "Transfer Learning"),
            (r"\bknowledge\s+distillation\b|\bdistill(?:ed|ing)?\b", "Knowledge Distillation"),
            (r"\bcontrastive\s+learning\b|\bsimclr\b", "Contrastive Learning"),
            (r"\bself[- ]supervised\s+learning\b|\bssl\b", "Self-Supervised Learning"),
            (r"\breinforcement\s+learning\b|\brlhf\b|\bdpo\b|\bppo\b", "Reinforcement Learning"),
            (r"\bstochastic\s+gradient\s+descent\b|\bsgd\b|\bcoordinate\s+descent\b", "Stochastic Gradient Descent"),
            (r"\bquantization\b|\bint8\b|\bint4\b|\bpruning\b|\bmodel\s+compression\b", "Model Quantization & Pruning"),
            (r"\bparameter[- ]efficient\b|\blora\b|\bpeft\b|\bprompt\s+tuning\b", "Parameter-Efficient Fine-Tuning"),
            (r"\bin[- ]context\s+learning\b|\bfew[- ]shot\b|\bzero[- ]shot\b", "In-Context Learning"),
            (r"\btest[- ]time\s+compute\b|\btest[- ]time\s+scaling\b|\bmcts\b|\bbeam\s+search\b", "Test-Time Compute"),
            (r"\bedge\s+(?:computing|devices|clients)\b|\biot\b|\bmobile\s+devices\b", "Edge Computing"),
        ]

        DATASET_PATTERNS = [
            (r"\bmnist\b", "MNIST"),
            (r"\bfashion[- ]mnist\b", "Fashion-MNIST"),
            (r"\bfemnist\b", "FEMNIST"),
            (r"\bcifar[- ]?10\b", "CIFAR-10"),
            (r"\bcifar[- ]?100\b", "CIFAR-100"),
            (r"\bimagenet\b", "ImageNet"),
            (r"\bshakespeare\b", "Shakespeare"),
            (r"\bceleba\b", "CelebA"),
            (r"\bsquad\b", "SQuAD"),
            (r"\bglue\b", "GLUE"),
            (r"\bsuperglue\b", "SuperGLUE"),
            (r"\bmmlu\b", "MMLU"),
            (r"\bgsm8k\b", "GSM8K"),
            (r"\bhumaneval\b", "HumanEval"),
            (r"\bcoco\b", "COCO"),
        ]

        # Extract methods if derived_methods is sparse
        if len(derived_methods) < 4 and full_text:
            for pat, m_label in METHOD_PATTERNS:
                if re.search(pat, full_text, re.IGNORECASE):
                    if m_label not in derived_methods and m_label.lower() not in STOP_WORDS:
                        derived_methods.append(m_label)

        # Extract datasets if derived_datasets is sparse
        if len(derived_datasets) < 3 and full_text:
            for pat, d_label in DATASET_PATTERNS:
                if re.search(pat, full_text, re.IGNORECASE):
                    if d_label not in derived_datasets and d_label.lower() not in STOP_WORDS:
                        derived_datasets.append(d_label)

        # Extract domain concepts from topics
        for t in (topics or []):
            t_str = str(t).strip()
            if t_str and t_str.lower() not in STOP_WORDS and len(t_str) >= 3 and len(t_str) <= 35:
                if t_str not in derived_methods:
                    derived_methods.append(t_str)

        # Incorporate verified benchmarks from PapersWithCode or intelligence if present
        for b in benchmarks:
            if isinstance(b, dict):
                d_name = b.get("dataset")
                t_name = b.get("task")
                if d_name and str(d_name).strip().lower() not in STOP_WORDS:
                    derived_datasets.append(str(d_name).strip())
                if t_name and str(t_name).strip().lower() not in STOP_WORDS:
                    derived_methods.append(str(t_name).strip())

        # Pre-read existing nodes (before batch_write opens connection) to avoid re-adding
        existing_paper = await self.store.get_node(paper_id)

        # Collect all nodes/edges to write, then flush in a single DB transaction
        nodes_to_add: list = []
        edges_to_add: list = []

        # Always add/update PaperNode to ensure latest metadata is persisted
        nodes_to_add.append(paper_node)
        logger.info("Persisting PaperNode: %s", paper_id)

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
                nodes_to_add.append(method_node)
                logger.info("Adding MethodNode: %s (%s)", method_id, method_name)

            edges_to_add.append(ResearchEdge(source_id=paper_id, target_id=method_id, relation=Relation.USES_METHOD))

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
                nodes_to_add.append(dataset_node)
                logger.info("Adding DatasetNode: %s (%s)", dataset_id, dataset_name)

            edges_to_add.append(ResearchEdge(source_id=paper_id, target_id=dataset_id, relation=Relation.EVALUATES_ON))

        # Helper to clean and normalize any paper identifier
        def _clean_ref(raw_val: str) -> str:
            s = str(raw_val).strip().lower()
            s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s)
            s = re.sub(r"^doi:\s*", "", s)
            s = re.sub(r"^https?://openalex\.org/", "", s)
            s = re.sub(r"^openalex:\s*", "", s)
            s = re.sub(r"^arxiv:\s*", "", s)
            s = re.sub(r"v\d+$", "", s)
            return s.strip()

        # 4. Citations (Cross-Paper Links strictly between papers that exist in the store)
        cited_list = (
            getattr(paper_intel, "cited_papers", [])
            or getattr(paper_intel, "referenced_works", [])
            or (paper_intel.get("cited_papers", []) if isinstance(paper_intel, dict) else [])
            or (paper_intel.get("referenced_works", []) if isinstance(paper_intel, dict) else [])
        )
        for cited_id in cited_list:
            cid_clean = _clean_ref(cited_id)
            if not cid_clean:
                continue

            # Look up if any stored paper matches this clean reference
            for nid in self.store.graph.nodes:
                if nid == paper_id:
                    continue
                node_data = self.store.graph.nodes.get(nid, {})
                if node_data.get("node_type") != NodeType.PAPER.value:
                    continue
                node_clean_id = _clean_ref(nid)
                node_doi = _clean_ref(node_data.get("doi", ""))
                node_arxiv = _clean_ref(node_data.get("arxiv_id", ""))
                if cid_clean in (node_clean_id, node_doi, node_arxiv) and cid_clean:
                    edges_to_add.append(ResearchEdge(source_id=paper_id, target_id=nid, relation=Relation.CITES))
                    break

        # 5. Check reverse citations: did any existing paper in the graph cite THIS new paper?
        this_clean_id = _clean_ref(paper_id)
        this_clean_doi = _clean_ref(doi or "")
        this_clean_arxiv = _clean_ref(arxiv_id or "")

        for nid in list(self.store.graph.nodes):
            if nid == paper_id:
                continue
            node_data = self.store.graph.nodes.get(nid, {})
            if node_data.get("node_type") != NodeType.PAPER.value:
                continue
            cited_by_existing = node_data.get("cited_papers") or node_data.get("referenced_works") or []
            if not cited_by_existing:
                continue
            clean_existing_cited = [_clean_ref(c) for c in cited_by_existing]
            if (this_clean_id and this_clean_id in clean_existing_cited) or \
               (this_clean_doi and this_clean_doi in clean_existing_cited) or \
               (this_clean_arxiv and this_clean_arxiv in clean_existing_cited):
                edges_to_add.append(ResearchEdge(source_id=nid, target_id=paper_id, relation=Relation.CITES))

        # Flush all collected nodes and edges in a single DB transaction
        async with self.store.batch_write() as db:
            for node in nodes_to_add:
                await self.store.add_node(node, _db=db)
            for edge in edges_to_add:
                await self.store.add_edge(edge, _db=db)

        return paper_id


