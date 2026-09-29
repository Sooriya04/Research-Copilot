import hashlib
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import aiosqlite

from src.core.logger import logger
from src.engines.paper_enricher import PaperEnricher
from src.graph.builder import GraphBuilder
from src.graph.normalizer import normalize_entity
from src.graph.schema import (
    MethodNode,
    DatasetNode,
    NodeType,
    Relation,
    ResearchEdge,
    ResearchGapNode,
    TopicNode,
    slugify_id,
)
from src.graph.store import ResearchGraphStore
from src.providers.base import ChatMessage
from src.providers.gemini import GeminiFlashLiteProvider


class GraphSynthesizer:
    """Orchestrates AI-powered batch knowledge graph synthesis for research workspaces.
    
    Architecture:
    1. Checks SQLite persistent cache (`graph_synthesis_cache`) first. If an identical set of papers
       was already synthesized for this workspace, loads directly from SQLite with ZERO LLM calls/cost.
    2. Enriches each paper with metadata & entities (each paper's extraction is also SQLite-cached).
    3. Builds a compact batch multi-paper prompt (~400 tokens per paper) for Gemini Flash-Lite to extract
       inter-paper relations (EXTENDS, COMPARED_TO, IMPROVES_UPON, CONTRADICTS), shared methods/datasets,
       and combinatorial research gaps.
    4. Automatically falls back to deterministic heuristic lineage extraction if offline or on LLM error.
    5. Persists the synthesized nodes, typed edges, and synthesis cache into SQLite.
    """

    def __init__(
        self,
        store: Optional[ResearchGraphStore] = None,
        enricher: Optional[PaperEnricher] = None,
        provider: Optional[GeminiFlashLiteProvider] = None,
        db_path: str = "./data/research_copilot.db",
    ):
        self.store = store or ResearchGraphStore(db_path=db_path)
        self.enricher = enricher or PaperEnricher()
        self.provider = provider or GeminiFlashLiteProvider()
        self.builder = GraphBuilder(store=self.store)
        self.db_path = db_path
        self._table_initialized = False

    async def _ensure_cache_table(self) -> None:
        """Create graph_synthesis_cache table if not exists."""
        if not self._table_initialized:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
                async with aiosqlite.connect(self.db_path) as db:
                    await db.execute(
                        """
                        CREATE TABLE IF NOT EXISTS graph_synthesis_cache (
                            workspace_id TEXT NOT NULL,
                            paper_ids_hash TEXT NOT NULL,
                            paper_ids_json TEXT NOT NULL,
                            synthesis_json TEXT NOT NULL,
                            nodes_count INTEGER DEFAULT 0,
                            edges_count INTEGER DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            PRIMARY KEY (workspace_id, paper_ids_hash)
                        );
                        """
                    )
                    await db.commit()
                self._table_initialized = True
            except Exception as e:
                logger.warning("[GraphSynthesizer] Failed initializing SQLite cache table: %s", e)

    @staticmethod
    def compute_paper_hash(paper_ids: List[str]) -> str:
        """Compute a deterministic hash from a sorted list of paper IDs."""
        sorted_ids = sorted(str(pid).strip().lower() for pid in paper_ids if pid)
        raw_key = "|".join(sorted_ids)
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    async def get_cached_synthesis(
        self, workspace_id: str, paper_ids: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached synthesis from SQLite if available."""
        if not workspace_id or not paper_ids:
            return None
        await self._ensure_cache_table()
        paper_hash = self.compute_paper_hash(paper_ids)
        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(
                    "SELECT synthesis_json, nodes_count, edges_count FROM graph_synthesis_cache WHERE workspace_id = ? AND paper_ids_hash = ?",
                    (workspace_id, paper_hash),
                ) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        synthesis_data = json.loads(row[0])
                        return {
                            "cached": True,
                            "llm_called": False,
                            "paper_ids_hash": paper_hash,
                            "nodes_count": row[1],
                            "edges_count": row[2],
                            **synthesis_data,
                        }
        except Exception as e:
            logger.debug("[GraphSynthesizer] Cache read notice: %s", e)
        return None

    async def save_synthesis_to_cache(
        self,
        workspace_id: str,
        paper_ids: List[str],
        synthesis_data: Dict[str, Any],
        nodes_count: int,
        edges_count: int,
    ) -> None:
        """Persist synthesized graph result to SQLite cache."""
        if not workspace_id or not paper_ids:
            return
        await self._ensure_cache_table()
        paper_hash = self.compute_paper_hash(paper_ids)
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT OR REPLACE INTO graph_synthesis_cache
                    (workspace_id, paper_ids_hash, paper_ids_json, synthesis_json, nodes_count, edges_count, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        workspace_id,
                        paper_hash,
                        json.dumps(paper_ids),
                        json.dumps(synthesis_data),
                        nodes_count,
                        edges_count,
                    ),
                )
                await db.commit()
            logger.info(
                "[GraphSynthesizer] Saved synthesis for workspace '%s' (%d papers) to SQLite cache.",
                workspace_id,
                len(paper_ids),
            )
        except Exception as e:
            logger.warning("[GraphSynthesizer] Failed writing synthesis cache to SQLite: %s", e)

    async def synthesize_workspace_graph(
        self,
        workspace_id: Optional[str],
        topic: Optional[str],
        papers: List[Dict[str, Any]],
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """Synthesize knowledge graph across staged papers, utilizing SQLite cache when possible."""
        await self.store._ensure_initialized()
        clean_ws_id = (workspace_id or "default-workspace").strip()
        topic_clean = (topic or "Research Literature").strip()
        ws_node_id = clean_ws_id if clean_ws_id.startswith("ws-") else f"ws-{clean_ws_id}"

        # 1. Normalize paper IDs
        valid_papers = []
        canonical_pids = []
        for p in papers:
            if not isinstance(p, dict):
                continue
            pid = p.get("id") or p.get("arxiv_id") or p.get("canonical_id")
            if not pid and p.get("title"):
                pid = f"paper-{slugify_id(p['title'])[:20]}"
            if pid:
                p["id"] = pid
                valid_papers.append(p)
                canonical_pids.append(pid)

        if not valid_papers:
            return {
                "status": "empty",
                "workspace_id": clean_ws_id,
                "cached": False,
                "llm_called": False,
                "papers_count": 0,
                "nodes": [],
                "edges": [],
                "stats": {"total_nodes": 0, "total_edges": 0, "node_type_counts": {}},
            }

        # 2. Check SQLite Cache First (Avoid API Cost)
        if not force_refresh:
            cached_res = await self.get_cached_synthesis(clean_ws_id, canonical_pids)
            if cached_res:
                logger.info(
                    "[GraphSynthesizer] SQLite Cache Hit for workspace '%s' with %d papers (0 LLM cost).",
                    clean_ws_id,
                    len(canonical_pids),
                )
                # Verify or ensure the graph elements are loaded
                elements = await self._get_scoped_elements(ws_node_id, canonical_pids)
                return {
                    "status": "cached",
                    "workspace_id": clean_ws_id,
                    "cached": True,
                    "llm_called": False,
                    "papers_count": len(valid_papers),
                    "cross_paper_relations_count": len(cached_res.get("cross_paper_relations", [])),
                    "gaps_count": len(cached_res.get("research_gaps", [])),
                    "synthesis_summary": cached_res.get("synthesis_summary", "Retrieved from SQLite cache."),
                    "cross_paper_relations": cached_res.get("cross_paper_relations", []),
                    "research_gaps": cached_res.get("research_gaps", []),
                    **elements,
                }

        # 3. Cache Miss / Force Refresh: Ingest papers into GraphStore
        logger.info(
            "[GraphSynthesizer] Synthesizing graph for workspace '%s' across %d papers.",
            clean_ws_id,
            len(valid_papers),
        )

        # Ensure Workspace Topic Node
        existing_ws_node = await self.store.get_node(ws_node_id)
        if not existing_ws_node:
            ws_node = TopicNode(id=ws_node_id, name=f"Workspace: {topic_clean}", query=topic_clean)
            await self.store.add_node(ws_node)

        # Ingest each paper (PaperEnricher checks SQLite paper_extractions table)
        enriched_papers = []
        ingested_paper_node_ids = {}

        for p in valid_papers:
            try:
                enriched = await self.enricher.enrich(p)
                p_node_id = await self.builder.build_from_paper_intelligence(enriched)
                ingested_paper_node_ids[p["id"]] = p_node_id or p["id"]
                enriched_papers.append(enriched)

                # Link workspace -> paper
                ws_edge = ResearchEdge(
                    source_id=ws_node_id,
                    target_id=p_node_id or p["id"],
                    relation=Relation.COVERS,
                    weight=2.0,
                )
                await self.store.add_edge(ws_edge)
            except Exception as e:
                logger.warning("[GraphSynthesizer] Error enriching paper %s: %s", p.get("id"), e)
                ingested_paper_node_ids[p["id"]] = p["id"]
                enriched_papers.append(p)

        # 4. Synthesize Cross-Paper Connections (Gemini Flash-Lite with Heuristic Fallback)
        synthesis_result = {
            "cross_paper_relations": [],
            "shared_methods": [],
            "shared_datasets": [],
            "research_gaps": [],
            "synthesis_summary": "",
        }
        llm_called = False

        if len(enriched_papers) >= 2:
            synthesis_result, llm_called = await self._run_llm_synthesis(enriched_papers, ingested_paper_node_ids)
        elif len(enriched_papers) == 1:
            synthesis_result["synthesis_summary"] = f"Single focal paper '{enriched_papers[0].get('title', '')}' mapped with core methods and evaluation datasets."

        # 5. Apply Discovered Relations & Gaps to Graph Store
        await self._apply_synthesis_to_store(synthesis_result, ingested_paper_node_ids, clean_ws_id)

        # 6. Fetch Visual Elements
        elements = await self._get_scoped_elements(ws_node_id, list(ingested_paper_node_ids.values()))

        # 7. Persist to SQLite Cache
        await self.save_synthesis_to_cache(
            workspace_id=clean_ws_id,
            paper_ids=canonical_pids,
            synthesis_data=synthesis_result,
            nodes_count=elements["stats"]["total_nodes"],
            edges_count=elements["stats"]["total_edges"],
        )

        return {
            "status": "synthesized",
            "workspace_id": clean_ws_id,
            "cached": False,
            "llm_called": llm_called,
            "papers_count": len(valid_papers),
            "cross_paper_relations_count": len(synthesis_result.get("cross_paper_relations", [])),
            "gaps_count": len(synthesis_result.get("research_gaps", [])),
            "synthesis_summary": synthesis_result.get("synthesis_summary", ""),
            "cross_paper_relations": synthesis_result.get("cross_paper_relations", []),
            "research_gaps": synthesis_result.get("research_gaps", []),
            **elements,
        }

    async def _run_llm_synthesis(
        self,
        enriched_papers: List[Dict[str, Any]],
        id_map: Dict[str, str],
    ) -> Tuple[Dict[str, Any], bool]:
        """Invoke Gemini Flash-Lite on compact paper abstracts to synthesize cross-paper graph intelligence."""
        # Build compact representation (under ~350 tokens per paper)
        paper_summaries = []
        for idx, p in enumerate(enriched_papers, 1):
            pid = p.get("id") or f"P{idx}"
            title = p.get("title", "Untitled")
            year = p.get("year") or "N/A"
            abstract = (p.get("abstract") or "").strip()[:400]
            methods = ", ".join(p.get("methods", [])[:5]) or "None extracted"
            datasets = ", ".join(p.get("datasets", [])[:5]) or "None extracted"
            paper_summaries.append(
                f"[Paper {idx}]\n"
                f"ID: {pid}\n"
                f"Title: {title} ({year})\n"
                f"Methods: {methods}\n"
                f"Datasets: {datasets}\n"
                f"Abstract: {abstract}..."
            )

        combined_input = "\n\n".join(paper_summaries)

        system_instruction = (
            "You are an expert AI Research Engineer synthesizing scientific connections across research papers.\n"
            "Analyze these papers and discover grounded relationships between them.\n"
            "STRICT RULES:\n"
            "1. ONLY output valid JSON adhering to the specified schema.\n"
            "2. 'relation' between papers MUST be one of: 'extends', 'compared_to', 'improves_upon', 'contradicts'.\n"
            "3. Ground all relations in the provided text (e.g. Paper B applies Paper A's method or outperforms Paper A).\n"
            "4. Discover 1-3 combinatorial research gaps (e.g., applying Method from Paper A to the benchmark/domain of Paper B).\n"
            "SCHEMA:\n"
            "{\n"
            '  "cross_paper_relations": [\n'
            '    {"source_id": "paper_id_1", "target_id": "paper_id_2", "relation": "extends|compared_to|improves_upon|contradicts", "explanation": "Brief rationale", "weight": 2.0}\n'
            '  ],\n'
            '  "shared_methods": ["Method name"],\n'
            '  "shared_datasets": ["Dataset name"],\n'
            '  "research_gaps": [\n'
            '    {"title": "Concise gap title", "description": "Specific gap description", "method": "Method", "dataset_or_task": "Dataset or Task", "paper_ids": ["paper_id_1", "paper_id_2"]}\n'
            '  ],\n'
            '  "synthesis_summary": "2-3 sentence high-level overview of how these papers connect methodologically."\n'
            "}"
        )

        messages = [
            ChatMessage(role="system", content=system_instruction),
            ChatMessage(role="user", content=f"Synthesize the research knowledge graph for these papers:\n\n{combined_input}"),
        ]

        llm_called = False
        try:
            raw_res = await self.provider.complete(messages, temperature=0.1)
            llm_called = True
            clean_str = raw_res.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(clean_str)
            if isinstance(parsed, dict) and "cross_paper_relations" in parsed:
                return parsed, True
        except Exception as e:
            logger.info("[GraphSynthesizer] LLM synthesis fallback to heuristic lineage: %s", e)

        # Fallback to deterministic heuristic synthesis
        fallback_res = self._fallback_heuristic_synthesis(enriched_papers)
        return fallback_res, llm_called

    def _fallback_heuristic_synthesis(self, papers: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Deterministic rule-based cross-paper lineage extraction when offline."""
        relations = []
        shared_methods = set()
        shared_datasets = set()
        gaps = []

        all_methods_map: Dict[str, List[str]] = {}
        all_datasets_map: Dict[str, List[str]] = {}

        for p in papers:
            pid = p.get("id")
            for m in p.get("methods", []):
                norm = normalize_entity(m)
                if norm:
                    all_methods_map.setdefault(norm, []).append(pid)
            for d in p.get("datasets", []):
                norm = normalize_entity(d)
                if norm:
                    all_datasets_map.setdefault(norm, []).append(pid)

        for m, pids in all_methods_map.items():
            if len(set(pids)) >= 2:
                shared_methods.add(m)

        for d, pids in all_datasets_map.items():
            if len(set(pids)) >= 2:
                shared_datasets.add(d)

        # Pairwise relationships
        for i in range(len(papers)):
            for j in range(len(papers)):
                if i == j:
                    continue
                p1 = papers[i]
                p2 = papers[j]
                pid1 = p1.get("id")
                pid2 = p2.get("id")

                # Check citation / referenced works
                p1_refs = p1.get("referenced_works") or p1.get("cited_papers") or []
                if pid2 in p1_refs or any(slugify_id(pid2) in str(ref) for ref in p1_refs):
                    relations.append({
                        "source_id": pid1,
                        "target_id": pid2,
                        "relation": "extends" if (p1.get("year", 0) or 0) >= (p2.get("year", 0) or 0) else "cites",
                        "explanation": f"{p1.get('title')} references foundational work in {p2.get('title')}",
                        "weight": 2.5,
                    })
                # Check shared datasets -> compared_to
                elif set(p1.get("datasets", [])).intersection(set(p2.get("datasets", []))):
                    if i < j:
                        relations.append({
                            "source_id": pid1,
                            "target_id": pid2,
                            "relation": "compared_to",
                            "explanation": f"Evaluated across common benchmark datasets: {', '.join(set(p1.get('datasets', [])).intersection(set(p2.get('datasets', [])))[:2])}",
                            "weight": 1.5,
                        })

        # Research gap generation
        if shared_methods and shared_datasets:
            m_first = list(shared_methods)[0]
            d_first = list(shared_datasets)[0]
            gaps.append({
                "title": f"Synergy of {m_first} on {d_first}",
                "description": f"Exploring cross-paper integration of {m_first} architecture on benchmark {d_first}.",
                "method": m_first,
                "dataset_or_task": d_first,
                "paper_ids": [p.get("id") for p in papers[:2]],
            })

        return {
            "cross_paper_relations": relations,
            "shared_methods": list(shared_methods),
            "shared_datasets": list(shared_datasets),
            "research_gaps": gaps,
            "synthesis_summary": f"Heuristically mapped methodological overlap across {len(papers)} research papers with {len(shared_methods)} shared methods and {len(shared_datasets)} common benchmarks.",
        }

    async def _apply_synthesis_to_store(
        self,
        synthesis: Dict[str, Any],
        id_map: Dict[str, str],
        workspace_id: str,
    ) -> None:
        """Add synthesized edges, shared method/dataset links, and research gaps to the graph store."""
        # 1. Cross-paper relational edges
        for rel in synthesis.get("cross_paper_relations", []):
            src_raw = rel.get("source_id")
            tgt_raw = rel.get("target_id")
            src = id_map.get(src_raw) or src_raw
            tgt = id_map.get(tgt_raw) or tgt_raw

            if not src or not tgt or src == tgt:
                continue

            # Ensure nodes exist in graph or map to slug
            if src not in self.store.graph and slugify_id(src) in self.store.graph:
                src = slugify_id(src)
            if tgt not in self.store.graph and slugify_id(tgt) in self.store.graph:
                tgt = slugify_id(tgt)

            rel_type_str = str(rel.get("relation", "compared_to")).lower()
            rel_enum = Relation(rel_type_str) if rel_type_str in Relation._value2member_map_ else Relation.COMPARED_TO

            edge = ResearchEdge(
                source_id=src,
                target_id=tgt,
                relation=rel_enum,
                weight=float(rel.get("weight", 2.0)),
            )
            await self.store.add_edge(edge)

        # 2. Add Research Gap Nodes
        for idx, gap in enumerate(synthesis.get("research_gaps", []), 1):
            gap_title = gap.get("title") or f"Research Gap {idx}"
            gap_id = f"gap-{slugify_id(gap_title)[:30]}"
            method_norm = normalize_entity(gap.get("method") or "novel-technique")
            dataset_norm = normalize_entity(gap.get("dataset_or_task") or "benchmark")

            gap_node = ResearchGapNode(
                id=gap_id,
                description=gap.get("description") or gap_title,
                method_id=f"method-{slugify_id(method_norm)}",
                dataset_id=f"dataset-{slugify_id(dataset_norm)}",
                confidence=0.85,
            )
            await self.store.add_node(gap_node)

            # Link gap node from involved papers
            p_ids = gap.get("paper_ids") or []
            if not p_ids:
                p_ids = list(id_map.values())[:2]
            for pid in p_ids:
                mapped_p = id_map.get(pid) or pid
                if mapped_p in self.store.graph:
                    edge = ResearchEdge(
                        source_id=mapped_p,
                        target_id=gap_id,
                        relation=Relation.HAS_GAP,
                        weight=1.8,
                    )
                    await self.store.add_edge(edge)

    async def _get_scoped_elements(self, ws_node_id: str, paper_ids: List[str]) -> Dict[str, Any]:
        """Fetch visual graph elements scoped strictly to the workspace and paper set."""
        allowed_node_ids = set()
        if ws_node_id in self.store.graph:
            allowed_node_ids.add(ws_node_id)
        for pid in paper_ids:
            if pid in self.store.graph:
                allowed_node_ids.add(pid)
            elif slugify_id(pid) in self.store.graph:
                allowed_node_ids.add(slugify_id(pid))

        # Include direct neighbors (methods, datasets, gaps, citations)
        for nid in list(allowed_node_ids):
            if nid in self.store.graph:
                for succ in self.store.graph.successors(nid):
                    allowed_node_ids.add(succ)
                for pred in self.store.graph.predecessors(nid):
                    allowed_node_ids.add(pred)

        edges_raw = self.store.get_scoped_edges(allowed_node_ids)

        nodes = []
        node_type_counts = {}
        for nid in allowed_node_ids:
            n = await self.store.get_node(nid)
            if not n:
                continue
            ntype = n.node_type.value if hasattr(n.node_type, "value") else str(n.node_type)
            n_dict = n.model_dump(mode="json")
            node_type_counts[ntype] = node_type_counts.get(ntype, 0) + 1
            label = getattr(n, "name", None) or getattr(n, "title", None) or getattr(n, "description", None) or nid
            nodes.append({
                "id": nid,
                "label": str(label)[:35],
                "node_type": ntype,
                "title": f"[{ntype.upper()}] {label}",
                "data": n_dict,
            })

        node_id_set = {n["id"] for n in nodes}
        edges = []
        for e in edges_raw:
            if e.source_id not in node_id_set or e.target_id not in node_id_set:
                continue
            rel_str = e.relation.value if hasattr(e.relation, "value") else str(e.relation)
            edges.append({
                "source": e.source_id,
                "target": e.target_id,
                "relation": rel_str,
                "label": rel_str.replace("_", " ").upper(),
                "weight": e.weight,
            })

        return {
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "node_type_counts": node_type_counts,
            },
        }
