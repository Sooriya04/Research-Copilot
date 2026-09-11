from enum import Enum
from typing import Annotated, Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field
from slugify import slugify

# --- Enums ---

class NodeType(str, Enum):
    TOPIC = "topic"
    PAPER = "paper"
    METHOD = "method"
    DATASET = "dataset"
    METRIC = "metric"
    CLAIM = "claim"
    LIMITATION = "limitation"
    GAP = "gap"


class Relation(str, Enum):
    COVERS = "covers"
    INVESTIGATES = "investigates"
    CITES = "cites"
    USES_METHOD = "uses_method"
    EVALUATES_ON = "evaluates_on"
    ACHIEVES = "achieves"
    COMPARED_TO = "compared_to"
    EXTENDS = "extends"
    CONTRADICTS = "contradicts"
    LIMITED_BY = "limited_by"
    HAS_GAP = "has_gap"
    HAS_CLAIM = "has_claim"


def slugify_id(text: str) -> str:
    """Generate clean slug identifier."""
    res = slugify(text)
    return res if res else text.lower().replace(" ", "-")


# --- Node Definitions ---

class BaseGraphNode(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id: str


class TopicNode(BaseGraphNode):
    id: str  # e.g. "topic-chain-of-thought"
    name: str  # Topic label
    query: Optional[str] = None
    node_type: Literal[NodeType.TOPIC] = NodeType.TOPIC


class PaperNode(BaseGraphNode):
    id: str  # arXiv ID / DOI / Canonical ID
    title: str
    year: Optional[int] = None
    venue: Optional[str] = None
    authors: List[str] = Field(default_factory=list)
    node_type: Literal[NodeType.PAPER] = NodeType.PAPER


class MethodNode(BaseGraphNode):
    id: str  # Slugified name
    name: str
    category: str = "general"  # fine-tuning, attention, optimization, architecture, etc.
    node_type: Literal[NodeType.METHOD] = NodeType.METHOD


class DatasetNode(BaseGraphNode):
    id: str  # Slugified name
    name: str
    domain: str = "general"  # nlp, cv, bio, reasoning, multimodal, etc.
    node_type: Literal[NodeType.DATASET] = NodeType.DATASET


class MetricNode(BaseGraphNode):
    id: str
    name: str
    unit: Optional[str] = None
    node_type: Literal[NodeType.METRIC] = NodeType.METRIC


class ClaimNode(BaseGraphNode):
    id: str
    text: str
    verified: bool = False
    paper_id: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    node_type: Literal[NodeType.CLAIM] = NodeType.CLAIM


class LimitationNode(BaseGraphNode):
    id: str
    text: str
    paper_id: str
    node_type: Literal[NodeType.LIMITATION] = NodeType.LIMITATION


class ResearchGapNode(BaseGraphNode):
    id: str
    description: str
    method_id: str
    dataset_id: str
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    node_type: Literal[NodeType.GAP] = NodeType.GAP


GraphNode = Annotated[
    Union[
        TopicNode,
        PaperNode,
        MethodNode,
        DatasetNode,
        MetricNode,
        ClaimNode,
        LimitationNode,
        ResearchGapNode,
    ],
    Field(discriminator="node_type"),
]


# --- Edge Definition ---

class ResearchEdge(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    source_id: str
    target_id: str
    relation: Relation
    weight: float = 1.0


def parse_graph_node(node_type: Union[str, NodeType], data: Dict[str, Any]) -> GraphNode:
    """Parse dictionary into the appropriate typed GraphNode instance."""
    nt = NodeType(node_type) if isinstance(node_type, str) else node_type
    
    mapping = {
        NodeType.TOPIC: TopicNode,
        NodeType.PAPER: PaperNode,
        NodeType.METHOD: MethodNode,
        NodeType.DATASET: DatasetNode,
        NodeType.METRIC: MetricNode,
        NodeType.CLAIM: ClaimNode,
        NodeType.LIMITATION: LimitationNode,
        NodeType.GAP: ResearchGapNode,
    }
    
    model_cls = mapping[nt]
    payload = dict(data)
    payload["node_type"] = nt
    return model_cls.model_validate(payload)
