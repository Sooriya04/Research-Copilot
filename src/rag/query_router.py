import re
from typing import Literal

RetrievalStrategy = Literal["hybrid", "graph", "both"]


class QueryRouter:
    """Deterministic intent router classifying research questions for Hybrid RAG, GraphRAG, or Both."""

    RELATIONAL_KEYWORDS = [
        r"\b(?:what|which)\s+(?:datasets?|benchmarks?|corpora)\b",
        r"\b(?:what|which)\s+(?:metrics?|measures?|loss\s+function)\b",
        r"\b(?:what|which)\s+(?:models?|backbone|architecture|baselines?)\b",
        r"\b(?:who\s+authored|who\s+wrote|authors?|institutions?)\b",
        r"\b(?:compares?\s+against|compared\s+to|outperforms?)\b",
        r"\b(?:what\s+papers?\s+does\s+this\s+build\s+upon|cites?)\b",
        r"\b(?:relationship\s+between|how\s+does\s+[a-zA-Z0-9_\-]+\s+relate\s+to)\b",
        r"\b(?:what\s+does\s+[a-zA-Z0-9_\-]+\s+use)\b",
    ]

    COMPLEX_HYBRID_PATTERNS = [
        r"\b(?:how\s+and\s+why|explain\s+the\s+difference|compare\s+and\s+contrast)\b",
        r"\b(?:why\s+does\s+[a-zA-Z0-9_\-]+\s+outperform)\b",
        r"\b(?:impact\s+of\s+[a-zA-Z0-9_\-]+\s+on\s+benchmark)\b",
    ]

    def route_query(self, query: str) -> RetrievalStrategy:
        """Classify user query into 'hybrid', 'graph', or 'both'."""
        q_lower = query.strip().lower()

        # Check for complex questions requiring both structural graph relationships AND detailed text chunks
        for pat in self.COMPLEX_HYBRID_PATTERNS:
            if re.search(pat, q_lower):
                return "both"

        # Check for direct entity/relationship queries
        for pat in self.RELATIONAL_KEYWORDS:
            if re.search(pat, q_lower):
                return "graph"

        # Explicit entity mention checks (e.g. asking "datasets used", "baselines")
        if any(term in q_lower for term in ["dataset", "benchmark", "baseline", "metric", "evaluated on"]):
            return "both"

        # Default to standard Hybrid RAG (semantic + keyword)
        return "hybrid"
