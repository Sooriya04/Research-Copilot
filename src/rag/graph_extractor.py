import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class ResearchEntity:
    id: str
    paper_id: str
    name: str
    entity_type: str
    description: str = ""
    source_chunk_id: Optional[str] = None
    page_number: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ResearchRelationship:
    id: str
    paper_id: str
    source_entity_id: str
    relationship: str
    target_entity_id: str
    source_chunk_id: Optional[str] = None
    page_number: int = 1
    confidence: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class EntityNormalizer:
    """Conservative entity normalizer to merge clear lexical duplicates without over-merging."""

    CANONICAL_SYNONYMS = {
        "gpt4": "GPT-4",
        "gpt 4": "GPT-4",
        "gpt-4": "GPT-4",
        "gpt-4o": "GPT-4o",
        "gpt3.5": "GPT-3.5",
        "gpt-3.5": "GPT-3.5",
        "llama": "LLaMA",
        "llama2": "LLaMA-2",
        "llama-2": "LLaMA-2",
        "llama3": "LLaMA-3",
        "llama-3": "LLaMA-3",
        "deepseek-r1": "DeepSeek-R1",
        "deepseek r1": "DeepSeek-R1",
        "gsm8k": "GSM8K",
        "truthfulqa": "TruthfulQA",
        "halueval": "HaluEval",
        "humaneval": "HumanEval",
        "mmlu": "MMLU",
        "bleu": "BLEU",
        "rouge": "ROUGE",
        "auc-pr": "AUC-PR",
        "auc-roc": "AUC-ROC",
        "f1": "F1-Score",
        "f1 score": "F1-Score",
        "f1-score": "F1-Score",
        "accuracy": "Accuracy",
    }

    @classmethod
    def normalize_name(cls, name: str) -> str:
        clean = name.strip().strip("'\"()[]{}.,;:").strip()
        low = clean.lower()
        if low in cls.CANONICAL_SYNONYMS:
            return cls.CANONICAL_SYNONYMS[low]
        # Preserve standard capitalization
        if len(clean) <= 5 and clean.isalpha():
            return clean.upper()
        return clean

    normalize_entity_name = normalize_name



class PaperGraphExtractor:
    """Extracts research entities and relationships with chunk- and page-level evidence preservation."""

    # Heuristic Patterns
    DATASET_PATTERNS = [
        re.compile(r"\b(GSM8K|TruthfulQA|HaluEval|HumanEval|MMLU|ImageNet|SQuAD|Glue|SuperGlue|MATH|CoQA|BoolQ|ARC)\b", re.IGNORECASE),
        re.compile(r"(?:dataset|benchmark|corpus)\s+(?:called\s+)?([A-Z][a-zA-Z0-9_\-]+)", re.IGNORECASE),
        re.compile(r"evaluated\s+(?:on|across)\s+([A-Z][a-zA-Z0-9_\-]+(?:\s+dataset)?)", re.IGNORECASE),
    ]

    METRIC_PATTERNS = [
        re.compile(r"\b(accuracy|F1(?:\s*score)?|BLEU|ROUGE(?:-\d)?|AUC-PR|AUC-ROC|perplexity|exact\s*match|latency|throughput)\b", re.IGNORECASE),
        re.compile(r"measured\s+by\s+([a-zA-Z0-9_\-]+(?:\s+metric)?)", re.IGNORECASE),
    ]

    MODEL_PATTERNS = [
        re.compile(r"\b(GPT-4[a-z0-9\-]*|GPT-3\.5|LLaMA(?:-[0-9a-z]+)?|Mistral(?:-[0-9a-z]+)?|Claude(?:-[0-9a-z]+)?|DeepSeek(?:-[0-9a-z]+)?|BERT|RoBERTa|T5|Transformer)\b", re.IGNORECASE),
        re.compile(r"baseline\s+model\s+([A-Z][a-zA-Z0-9_\-]+)", re.IGNORECASE),
    ]

    METHOD_PATTERNS = [
        re.compile(r"(?:we\s+propose|our\s+approach|our\s+method|we\s+introduce)\s+([A-Z][a-zA-Z0-9_\-]+)", re.IGNORECASE),
        re.compile(r"(?:method|framework|algorithm|architecture)\s+(?:named|called)\s+([A-Z][a-zA-Z0-9_\-]+)", re.IGNORECASE),
    ]

    COMPARE_PATTERNS = [
        re.compile(r"compare(?:d|s)?\s+(?:against|to|with)?\s*(?:baseline\s+)?([A-Z][a-zA-Z0-9_\-]+)", re.IGNORECASE),
        re.compile(r"outperforms\s+(?:baseline\s+)?([A-Z][a-zA-Z0-9_\-]+)", re.IGNORECASE),
    ]


    def __init__(self, normalizer: Optional[EntityNormalizer] = None):
        self.normalizer = normalizer or EntityNormalizer()

    def _entity_id(self, paper_id: str, name: str, entity_type: str) -> str:
        h = hashlib.sha256(f"{paper_id}:{name.lower()}:{entity_type}".encode()).hexdigest()[:12]
        return f"{paper_id}_e_{h}"

    def _rel_id(self, paper_id: str, src_id: str, rel: str, tgt_id: str) -> str:
        h = hashlib.sha256(f"{paper_id}:{src_id}:{rel}:{tgt_id}".encode()).hexdigest()[:12]
        return f"{paper_id}_r_{h}"

    def extract_graph(
        self,
        paper_id: str,
        paper_title: str,
        chunks: List[Dict[str, Any]],
        authors: Optional[List[str]] = None,
    ) -> Tuple[List[ResearchEntity], List[ResearchRelationship]]:
        """Extract structured entities and relationships from chunks with provenance tracking."""
        entities_dict: Dict[str, ResearchEntity] = {}
        relationships_dict: Dict[str, ResearchRelationship] = {}

        # 1. Base Paper Entity
        paper_entity_id = self._entity_id(paper_id, paper_title, "paper")
        paper_entity = ResearchEntity(
            id=paper_entity_id,
            paper_id=paper_id,
            name=paper_title,
            entity_type="paper",
            description=f"Primary research paper: {paper_title}",
            source_chunk_id=chunks[0].get("chunk_id") if chunks else None,
            page_number=1,
        )
        entities_dict[paper_entity_id] = paper_entity

        # 2. Authors
        first_chunk_id = chunks[0].get("chunk_id") if chunks else None
        if authors:
            for auth in authors:
                auth_name = self.normalizer.normalize_name(auth)
                if not auth_name:
                    continue
                a_id = self._entity_id(paper_id, auth_name, "author")
                if a_id not in entities_dict:
                    entities_dict[a_id] = ResearchEntity(
                        id=a_id,
                        paper_id=paper_id,
                        name=auth_name,
                        entity_type="author",
                        source_chunk_id=first_chunk_id,
                        page_number=1,
                    )
                r_id = self._rel_id(paper_id, paper_entity_id, "authored_by", a_id)
                relationships_dict[r_id] = ResearchRelationship(
                    id=r_id,
                    paper_id=paper_id,
                    source_entity_id=paper_entity_id,
                    relationship="authored_by",
                    target_entity_id=a_id,
                    source_chunk_id=first_chunk_id,
                    page_number=1,
                )

        # 3. Track Primary Proposed Method
        proposed_methods: Set[str] = set()

        # 4. Parse Chunks for Method, Dataset, Model, Metric, and Baselines
        for c in chunks:
            text = c.get("content", "")
            chunk_id = c.get("chunk_id")
            page_num = c.get("page_number", 1)

            # Discover Proposed Methods
            for pat in self.METHOD_PATTERNS:
                for match in pat.finditer(text):
                    m_name = self.normalizer.normalize_name(match.group(1))
                    if len(m_name) > 2 and m_name.lower() not in ["the", "this", "our", "a", "an"]:
                        m_id = self._entity_id(paper_id, m_name, "method")
                        if m_id not in entities_dict:
                            entities_dict[m_id] = ResearchEntity(
                                id=m_id,
                                paper_id=paper_id,
                                name=m_name,
                                entity_type="method",
                                source_chunk_id=chunk_id,
                                page_number=page_num,
                                description=f"Proposed method in {paper_title}",
                            )
                        proposed_methods.add(m_id)
                        # Paper -> proposes -> Method
                        r_id = self._rel_id(paper_id, paper_entity_id, "proposes", m_id)
                        relationships_dict[r_id] = ResearchRelationship(
                            id=r_id,
                            paper_id=paper_id,
                            source_entity_id=paper_entity_id,
                            relationship="proposes",
                            target_entity_id=m_id,
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )

            # Fallback if no method pattern matched: extract title acronym/keyword as method
            if not proposed_methods:
                title_words = paper_title.split()
                if title_words:
                    primary_name = title_words[0].strip(":")
                    if len(primary_name) > 2:
                        m_id = self._entity_id(paper_id, primary_name, "method")
                        entities_dict[m_id] = ResearchEntity(
                            id=m_id,
                            paper_id=paper_id,
                            name=primary_name,
                            entity_type="method",
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )
                        proposed_methods.add(m_id)
                        r_id = self._rel_id(paper_id, paper_entity_id, "proposes", m_id)
                        relationships_dict[r_id] = ResearchRelationship(
                            id=r_id,
                            paper_id=paper_id,
                            source_entity_id=paper_entity_id,
                            relationship="proposes",
                            target_entity_id=m_id,
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )

            primary_method_id = next(iter(proposed_methods)) if proposed_methods else paper_entity_id

            # Datasets
            for pat in self.DATASET_PATTERNS:
                for match in pat.finditer(text):
                    d_name = self.normalizer.normalize_name(match.group(1))
                    if len(d_name) > 2 and d_name.lower() not in ["the", "a", "benchmark", "dataset"]:
                        d_id = self._entity_id(paper_id, d_name, "dataset")
                        if d_id not in entities_dict:
                            entities_dict[d_id] = ResearchEntity(
                                id=d_id,
                                paper_id=paper_id,
                                name=d_name,
                                entity_type="dataset",
                                source_chunk_id=chunk_id,
                                page_number=page_num,
                            )
                        # Method -> evaluates_on -> Dataset
                        r_id = self._rel_id(paper_id, primary_method_id, "evaluates_on", d_id)
                        relationships_dict[r_id] = ResearchRelationship(
                            id=r_id,
                            paper_id=paper_id,
                            source_entity_id=primary_method_id,
                            relationship="evaluates_on",
                            target_entity_id=d_id,
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )

            # Metrics
            for pat in self.METRIC_PATTERNS:
                for match in pat.finditer(text):
                    met_name = self.normalizer.normalize_name(match.group(1))
                    if len(met_name) > 1:
                        met_id = self._entity_id(paper_id, met_name, "metric")
                        if met_id not in entities_dict:
                            entities_dict[met_id] = ResearchEntity(
                                id=met_id,
                                paper_id=paper_id,
                                name=met_name,
                                entity_type="metric",
                                source_chunk_id=chunk_id,
                                page_number=page_num,
                            )
                        # Method -> measured_by -> Metric
                        r_id = self._rel_id(paper_id, primary_method_id, "measured_by", met_id)
                        relationships_dict[r_id] = ResearchRelationship(
                            id=r_id,
                            paper_id=paper_id,
                            source_entity_id=primary_method_id,
                            relationship="measured_by",
                            target_entity_id=met_id,
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )

            # Models
            for pat in self.MODEL_PATTERNS:
                for match in pat.finditer(text):
                    mod_name = self.normalizer.normalize_name(match.group(1))
                    if len(mod_name) > 2:
                        mod_id = self._entity_id(paper_id, mod_name, "model")
                        if mod_id not in entities_dict:
                            entities_dict[mod_id] = ResearchEntity(
                                id=mod_id,
                                paper_id=paper_id,
                                name=mod_name,
                                entity_type="model",
                                source_chunk_id=chunk_id,
                                page_number=page_num,
                            )
                        # Method -> uses -> Model
                        r_id = self._rel_id(paper_id, primary_method_id, "uses", mod_id)
                        relationships_dict[r_id] = ResearchRelationship(
                            id=r_id,
                            paper_id=paper_id,
                            source_entity_id=primary_method_id,
                            relationship="uses",
                            target_entity_id=mod_id,
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )

            # Compared Baselines
            for pat in self.COMPARE_PATTERNS:
                for match in pat.finditer(text):
                    base_name = self.normalizer.normalize_name(match.group(1))
                    if len(base_name) > 2 and base_name.lower() not in ["the", "previous", "prior", "standard"]:
                        base_id = self._entity_id(paper_id, base_name, "baseline")
                        if base_id not in entities_dict:
                            entities_dict[base_id] = ResearchEntity(
                                id=base_id,
                                paper_id=paper_id,
                                name=base_name,
                                entity_type="baseline",
                                source_chunk_id=chunk_id,
                                page_number=page_num,
                            )
                        # Method -> compares_against -> Baseline
                        r_id = self._rel_id(paper_id, primary_method_id, "compares_against", base_id)
                        relationships_dict[r_id] = ResearchRelationship(
                            id=r_id,
                            paper_id=paper_id,
                            source_entity_id=primary_method_id,
                            relationship="compares_against",
                            target_entity_id=base_id,
                            source_chunk_id=chunk_id,
                            page_number=page_num,
                        )

        return list(entities_dict.values()), list(relationships_dict.values())

    def extract_from_chunks(
        self,
        paper_id: str,
        chunks: List[Any],
        title: str = "",
        authors: Optional[List[str]] = None,
    ) -> Tuple[List[ResearchEntity], List[ResearchRelationship]]:
        """Convenience method accepting either DocumentChunk objects or raw dictionaries."""
        formatted_chunks = []
        for c in chunks:
            if isinstance(c, dict):
                formatted_chunks.append(c)
            else:
                formatted_chunks.append({
                    "chunk_id": getattr(c, "chunk_id", getattr(c, "id", None)),
                    "content": getattr(c, "content", ""),
                    "page_number": getattr(c, "page_number", 1),
                    "section": getattr(c, "section", ""),
                    "token_count": getattr(c, "token_count", 0),
                })
        return self.extract_graph(
            paper_id=paper_id,
            paper_title=title,
            chunks=formatted_chunks,
            authors=authors,
        )

