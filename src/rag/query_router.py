import re
from typing import Any, Dict, Literal, Optional

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

    # --- External Research Triggers (Searqon Integration) ---

    EXTERNAL_RESEARCH_PATTERNS = [
        r"\b(?:newer|newest|latest|recent|more\s+recent|subsequent|follow[\s\-]up)\b",
        r"\b(?:after\s+this|since\s+this|after\s+publication|in\s+recent\s+years)\b",
        r"\b(?:state\s+of\s+the\s+art|sota|today)\b",
        r"\b(?:current(?:\s+\w+)?\s+(?:methods?|models?|approaches?|benchmarks?|sota|results?))\b",
        r"\b(?:compare\s+(?:with|to)\s+current)\b",
        r"\b(?:what\s+came\s+after|has\s+this\s+been\s+improved|who\s+improved\s+on)\b",
        r"\b(?:find\s+recent\s+work|future\s+work|what\s+happened\s+with\s+this)\b",
        r"\b(?:alternative\s+approaches|modern\s+baselines?|benchmarks?\s+now)\b",
        r"\b(?:202[5-9]|203\d)\b",
    ]

    def should_search_external(
        self,
        query: str,
        mode: str = "auto",
        paper_chunks_found: bool = True,
    ) -> bool:
        """Determine whether Searqon external web research should be triggered."""
        clean_mode = (mode or "auto").strip().lower()

        # 1. Explicit Paper-only mode: NEVER search web
        if clean_mode in ("paper", "paper_only"):
            return False

        # 2. Explicit Research mode: ALWAYS search web
        if clean_mode in ("research", "research_mode", "web"):
            return True

        # 3. Auto mode: check deterministic query intent patterns
        q_lower = query.strip().lower()
        for pat in self.EXTERNAL_RESEARCH_PATTERNS:
            if re.search(pat, q_lower):
                return True

        # 4. Auto mode fallback: if paper had 0 relevant chunks and query is not asking for specific internal paper structure
        if not paper_chunks_found:
            internal_only = [
                r"\b(?:section|page|table|figure|equation|abstract|appendix)\b",
                r"\b(?:in\s+the\s+paper|in\s+this\s+paper|the\s+authors\s+state)\b",
            ]
            if not any(re.search(p, q_lower) for p in internal_only):
                return True

        return False

    def generate_search_query(
        self,
        query: str,
        paper_context: Optional[dict] = None,
    ) -> str:
        """Construct a focused, high-precision search query using paper metadata when helpful."""
        q_clean = query.strip()
        context = paper_context or {}

        # Strip standard conversational prefixes
        clean_q = re.sub(
            r"^(?:can\s+you\s+tell\s+me|tell\s+me|what\s+are|are\s+there|is\s+there|how\s+does|find|search\s+for|look\s+up)\s+",
            "",
            q_clean,
            flags=re.IGNORECASE,
        ).strip().rstrip("?.")

        paper_title = context.get("title") or ""
        primary_method = context.get("method") or context.get("primary_method") or ""
        topic = context.get("topic") or ""

        # If question contains relative references ("this work", "this method", "this paper", "it")
        relative_refs = [r"\bthis\s+paper\b", r"\bthis\s+work\b", r"\bthis\s+method\b", r"\bthis\s+approach\b", r"\bthis\b"]
        has_relative = any(re.search(r, clean_q, re.IGNORECASE) for r in relative_refs)

        anchor = primary_method or (paper_title.split(":")[0] if ":" in paper_title else paper_title[:40])

        if has_relative and anchor:
            # Substitute "this method" / "this" with the paper's actual anchor
            subbed = clean_q
            for r in relative_refs:
                subbed = re.sub(r, anchor, subbed, flags=re.IGNORECASE)
            return f"{subbed} research"

        # If the user query is very short (e.g. "newer approaches", "future work")
        if len(clean_q.split()) <= 4 and anchor:
            return f"{anchor} {clean_q} recent papers"

        # Otherwise use the cleaned query
        return clean_q

