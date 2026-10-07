from dataclasses import dataclass, field
import re
import time
from typing import Any, Dict, List, Optional, Set
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.logger import logger
from src.core.models import PaperChunkModel
from src.rag.active_cache import ActivePaperCache, get_active_paper_cache
from src.rag.graph_store import PaperGraphStore


@dataclass
class GraphQueryResult:
    paper_id: str
    matched_entities: List[Dict[str, Any]] = field(default_factory=list)
    relationships: List[Dict[str, Any]] = field(default_factory=list)
    evidence: List[Dict[str, Any]] = field(default_factory=list)
    supporting_chunk_ids: List[str] = field(default_factory=list)
    supporting_pages: List[int] = field(default_factory=list)
    explanation: str = ""
    found: bool = False
    latency_ms: float = 0.0



class PaperGraphRetriever:
    """Graph traversal and relationship retrieval engine for scientific Q&A."""

    INTENT_KEYWORDS = {
        "dataset": ["dataset", "datasets", "benchmark", "benchmarks", "corpus", "corpora", "evaluat"],
        "metric": ["metric", "metrics", "measure", "accuracy", "f1", "score", "bleu", "rouge", "auc", "performance"],
        "model": ["model", "models", "architecture", "backbone", "llm", "foundation model"],
        "method": ["method", "approach", "algorithm", "technique", "framework", "proposal"],
        "baseline": ["baseline", "baselines", "compare", "compared", "outperform", "previous work", "prior"],
        "author": ["author", "authors", "who wrote", "researcher", "affiliated"],
    }

    def __init__(
        self,
        graph_store: Optional[PaperGraphStore] = None,
        active_cache: Optional[ActivePaperCache] = None,
    ):
        self.active_cache = active_cache or get_active_paper_cache()
        self.graph_store = graph_store or PaperGraphStore(active_cache=self.active_cache)

    async def graph_search(
        self,
        paper_id: str,
        query: str,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Traverse relevant entity subgraphs and collect supporting chunk evidence."""
        t0 = time.perf_counter()
        graph_data = await self.graph_store.get_graph(paper_id, db)
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])

        if not nodes:
            return {
                "paper_id": paper_id,
                "entities": [],
                "relationships": [],
                "evidence": [],
                "found": False,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
            }

        q_lower = query.lower()
        node_by_id = {n["id"]: n for n in nodes}

        # 1. Identify Seed Entities mentioned in query
        matched_node_ids: Set[str] = set()
        for n in nodes:
            name = n.get("label", "").lower()
            if len(name) >= 3 and (name in q_lower or re.search(rf"\b{re.escape(name)}\b", q_lower)):
                matched_node_ids.add(n["id"])

        # 2. Identify Intent Entity Types (e.g. asking about "datasets", "metrics", "baselines")
        target_types: Set[str] = set()
        for etype, kws in self.INTENT_KEYWORDS.items():
            if any(kw in q_lower for kw in kws):
                target_types.add(etype)

        # 3. Traverse Relevant Relationships
        relevant_edges: List[Dict[str, Any]] = []
        for e in edges:
            src_id = e.get("source")
            tgt_id = e.get("target")
            src_node = node_by_id.get(src_id)
            tgt_node = node_by_id.get(tgt_id)

            include_edge = False

            # If seed entity is involved
            if src_id in matched_node_ids or tgt_id in matched_node_ids:
                include_edge = True

            # If target node matches query intent type
            if tgt_node and tgt_node.get("type") in target_types:
                include_edge = True

            if src_node and src_node.get("type") in target_types:
                include_edge = True

            if include_edge:
                enriched_edge = dict(e)
                enriched_edge["relationship"] = e.get("relationship") or e.get("label", "")
                enriched_edge["source_name"] = src_node.get("label") if src_node else src_id
                enriched_edge["source_type"] = src_node.get("type") if src_node else "unknown"
                enriched_edge["target_name"] = tgt_node.get("label") if tgt_node else tgt_id
                enriched_edge["target_type"] = tgt_node.get("type") if tgt_node else "unknown"
                relevant_edges.append(enriched_edge)

        # 4. If no specific seed or intent matched, but small query: collect top paper-proposes edges
        if not relevant_edges and len(edges) > 0:
            for e in edges:
                if e.get("label") in ["proposes", "evaluates_on", "measured_by"]:
                    src_node = node_by_id.get(e.get("source"))
                    tgt_node = node_by_id.get(e.get("target"))
                    enriched_edge = dict(e)
                    enriched_edge["relationship"] = e.get("relationship") or e.get("label", "")
                    enriched_edge["source_name"] = src_node.get("label") if src_node else e.get("source")
                    enriched_edge["source_type"] = src_node.get("type") if src_node else "unknown"
                    enriched_edge["target_name"] = tgt_node.get("label") if tgt_node else e.get("target")
                    enriched_edge["target_type"] = tgt_node.get("type") if tgt_node else "unknown"
                    relevant_edges.append(enriched_edge)
                if len(relevant_edges) >= 5:
                    break

        # 5. Collect Supporting Chunk IDs
        needed_chunk_ids: Set[str] = set()
        chunk_page_map: Dict[str, int] = {}
        relation_labels: Dict[str, str] = {}

        for edge in relevant_edges:
            c_id = edge.get("source_chunk_id")
            if c_id:
                needed_chunk_ids.add(c_id)
                chunk_page_map[c_id] = edge.get("page", 1)
                relation_labels[c_id] = f"{edge.get('source_name')} --({edge.get('label')})--> {edge.get('target_name')}"

        for n_id in matched_node_ids:
            node = node_by_id.get(n_id)
            if node and node.get("source_chunk_id"):
                c_id = node.get("source_chunk_id")
                needed_chunk_ids.add(c_id)
                chunk_page_map[c_id] = node.get("page", 1)

        # 6. Fetch Chunk Excerpts (Redis first, fallback SQLite)
        evidence_list: List[Dict[str, Any]] = []
        cached_chunks = await self.active_cache.get_chunks(paper_id)
        cached_by_id = {c["chunk_id"]: c for c in (cached_chunks or [])}

        missing_from_cache = []
        for c_id in needed_chunk_ids:
            if c_id in cached_by_id:
                c_data = cached_by_id[c_id]
                evidence_list.append({
                    "chunk_id": c_id,
                    "paper_id": paper_id,
                    "page_number": c_data.get("page_number", chunk_page_map.get(c_id, 1)),
                    "section": c_data.get("section", "Methodology"),
                    "content": c_data.get("content", ""),
                    "relation_provenance": relation_labels.get(c_id, ""),
                    "score": 0.95,
                })
            else:
                missing_from_cache.append(c_id)

        found_in_db = set()
        if missing_from_cache:
            db_res = await db.execute(select(PaperChunkModel).where(PaperChunkModel.id.in_(missing_from_cache)))
            for db_c in db_res.scalars().all():
                found_in_db.add(db_c.id)
                evidence_list.append({
                    "chunk_id": db_c.id,
                    "paper_id": paper_id,
                    "page_number": db_c.page_number,
                    "section": db_c.section,
                    "content": db_c.content,
                    "relation_provenance": relation_labels.get(db_c.id, ""),
                    "score": 0.95,
                })

            for c_id in missing_from_cache:
                if c_id not in found_in_db:
                    evidence_list.append({
                        "chunk_id": c_id,
                        "paper_id": paper_id,
                        "page_number": chunk_page_map.get(c_id, 1),
                        "section": "Paper Content",
                        "content": "",
                        "relation_provenance": relation_labels.get(c_id, ""),
                        "score": 0.95,
                    })

        # Deduplicate evidence
        unique_evidence = []
        seen = set()
        for ev in evidence_list:
            if ev["chunk_id"] not in seen:
                seen.add(ev["chunk_id"])
                unique_evidence.append(ev)

        latency = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "paper_id": paper_id,
            "entities": [node_by_id[nid] for nid in matched_node_ids if nid in node_by_id],
            "relationships": relevant_edges,
            "evidence": unique_evidence,
            "needed_chunk_ids": list(needed_chunk_ids),
            "needed_pages": list(chunk_page_map.values()),
            "found": len(unique_evidence) > 0 or len(relevant_edges) > 0,
            "latency_ms": latency,
        }

    async def retrieve_subgraph(
        self,
        paper_id: str,
        query: str,
        db: AsyncSession,
    ) -> GraphQueryResult:
        """High-level query method returning structured GraphQueryResult."""
        res = await self.graph_search(paper_id=paper_id, query=query, db=db)
        chunk_ids = [e["chunk_id"] for e in res.get("evidence", [])] or list(res.get("needed_chunk_ids", []))
        pages = sorted(list({e["page_number"] for e in res.get("evidence", []) if "page_number" in e} or set(res.get("needed_pages", []))))
        explanation_parts = []
        for r in res.get("relationships", []):
            explanation_parts.append(f"{r.get('source_name')} --[{r.get('label')}]--> {r.get('target_name')}")
        explanation = "; ".join(explanation_parts)

        return GraphQueryResult(
            paper_id=paper_id,
            matched_entities=res.get("entities", []),
            relationships=res.get("relationships", []),
            evidence=res.get("evidence", []),
            supporting_chunk_ids=chunk_ids,
            supporting_pages=pages,
            explanation=explanation,
            found=res.get("found", False),
            latency_ms=res.get("latency_ms", 0.0),
        )


