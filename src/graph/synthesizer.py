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
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.llm import LocalOllamaProvider


def _extract_synthesis_json(text: str) -> Optional[Dict[str, Any]]:
    """Helper to extract JSON dict from potentially noisy LLM response."""
    if not text:
        return None
    cleaned = text.replace("```json", "").replace("```", "").strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return None


class GraphSynthesizer:
    """Orchestrates AI-powered batch knowledge graph synthesis for research workspaces.
    
    Architecture:
    1. Checks SQLite persistent cache (`graph_synthesis_cache`) first. If an identical set of papers
       was already synthesized for this workspace, loads directly from SQLite with ZERO LLM calls/cost.
    2. Enriches each paper with metadata & entities (each paper's extraction is also SQLite-cached).
    3. Builds a compact batch multi-paper prompt (~400 tokens per paper) for local LLM (Ollama phi4-mini)
       or configured cloud LLM to extract inter-paper relations (EXTENDS, COMPARED_TO, IMPROVES_UPON, CONTRADICTS),
       domain-specific methods, evaluation benchmarks, and combinatorial research gaps.
    4. Automatically falls back to deterministic heuristic lineage extraction if offline or on LLM error.
    5. Persists the synthesized nodes, typed edges, and synthesis cache into SQLite.
    """

    def __init__(
        self,
        store: Optional[ResearchGraphStore] = None,
        enricher: Optional[PaperEnricher] = None,
        provider: Optional[BaseLLMProvider] = None,
        db_path: str = "./data/research_copilot.db",
    ):
        self.store = store or ResearchGraphStore(db_path=db_path)
        self.enricher = enricher or PaperEnricher()
        self._provider = provider
        self.builder = GraphBuilder(store=self.store)
        self.db_path = db_path
        self._table_initialized = False

    def _resolve_llm_provider(
        self,
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> Tuple[BaseLLMProvider, str, str]:
        """Resolves the LLM provider for graph synthesis, preferring local Ollama if requested or default."""
        p_name = (provider_name or "").lower().strip()
        from src.core.config import settings
        from src.providers.factory import get_llm_provider

        # If user explicitly wants ollama or local LLM
        if p_name in ("ollama", "local", "localllm"):
            target_model = model or getattr(settings, "ollama_model", "phi4-mini") or "phi4-mini"
            return LocalOllamaProvider(model=target_model, base_url=base_url or None), "ollama", target_model

        if not p_name:
            if self._provider:
                return self._provider, getattr(self._provider, "provider_name", "custom"), getattr(self._provider, "model", "default")
            pref = getattr(settings, "default_llm_provider", "ollama") or "ollama"
            if pref == "ollama":
                target_model = model or getattr(settings, "ollama_model", "phi4-mini") or "phi4-mini"
                return LocalOllamaProvider(model=target_model, base_url=base_url or None), "ollama", target_model
            p_name = pref

        try:
            prov = get_llm_provider(p_name, model=model or "", api_key=api_key or "", base_url=base_url or "")
            return prov, p_name, model or getattr(prov, "model", "default")
        except Exception:
            target_model = model or getattr(settings, "ollama_model", "phi4-mini") or "phi4-mini"
            return LocalOllamaProvider(model=target_model, base_url=base_url or None), "ollama", target_model

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
        self, workspace_id: str, paper_ids: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached synthesis from SQLite if available."""
        if not workspace_id:
            return None
        await self._ensure_cache_table()
        try:
            async with aiosqlite.connect(self.db_path) as db:
                if paper_ids and len(paper_ids) > 0:
                    paper_hash = self.compute_paper_hash(paper_ids)
                    async with db.execute(
                        "SELECT synthesis_json, nodes_count, edges_count, paper_ids_json, paper_ids_hash FROM graph_synthesis_cache WHERE workspace_id = ? AND paper_ids_hash = ?",
                        (workspace_id, paper_hash),
                    ) as cursor:
                        row = await cursor.fetchone()
                else:
                    async with db.execute(
                        "SELECT synthesis_json, nodes_count, edges_count, paper_ids_json, paper_ids_hash FROM graph_synthesis_cache WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 1",
                        (workspace_id,),
                    ) as cursor:
                        row = await cursor.fetchone()

                if row:
                    synthesis_data = json.loads(row[0])
                    # If cached synthesis has 0 relations, 0 methods, and 0 gaps, it was a failed run - do not use
                    if not synthesis_data.get("cross_paper_relations") and not synthesis_data.get("methods") and not synthesis_data.get("research_gaps"):
                        logger.info("[GraphSynthesizer] Ignoring empty/corrupted SQLite synthesis cache for workspace '%s'", workspace_id)
                        return None
                    return {
                        "cached": True,
                        "llm_called": False,
                        "paper_ids_hash": row[4],
                        "paper_ids": json.loads(row[3]) if row[3] else [],
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
        cached_only: bool = False,
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
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

        # If papers list is empty, attempt to resolve from existing workspace cache before giving up
        if not valid_papers and not force_refresh:
            cached_res = await self.get_cached_synthesis(clean_ws_id, None)
            if cached_res and cached_res.get("paper_ids"):
                canonical_pids = cached_res.get("paper_ids", [])
                valid_papers = [{"id": pid, "title": pid} for pid in canonical_pids]

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
                elements = await self._get_scoped_elements(ws_node_id, canonical_pids)
                # If store was cleared or reset (e.g. process restart / test run), hydrate store
                if not elements.get("nodes") or len(elements.get("nodes", [])) < len(valid_papers):
                    existing_ws_node = await self.store.get_node(ws_node_id)
                    if not existing_ws_node:
                        ws_node = TopicNode(id=ws_node_id, name=f"Workspace: {topic_clean}", query=topic_clean)
                        await self.store.add_node(ws_node)

                    id_map = {}
                    for paper_data in valid_papers:
                        try:
                            enriched = await self.enricher.enrich(paper_data)
                            p_node_id = await self.builder.build_from_paper_intelligence(enriched)
                            orig_id = paper_data.get("id") or p_node_id
                            id_map[orig_id] = p_node_id
                            id_map[p_node_id] = p_node_id
                        except Exception as ing_err:
                            logger.warning("[GraphSynthesizer] Ingest error on cache hydration: %s", ing_err)

                    await self._apply_synthesis_to_store(cached_res, id_map, ws_node_id)
                    elements = await self._get_scoped_elements(ws_node_id, canonical_pids)

                return {
                    "status": "cached",
                    "workspace_id": clean_ws_id,
                    "cached": True,
                    "llm_called": False,
                    "papers_count": len(valid_papers),
                    "paper_ids": canonical_pids,
                    "cross_paper_relations_count": len(cached_res.get("cross_paper_relations", [])),
                    "gaps_count": len(cached_res.get("research_gaps", [])),
                    "synthesis_summary": cached_res.get("synthesis_summary", "Retrieved from SQLite cache."),
                    "cross_paper_relations": cached_res.get("cross_paper_relations", []),
                    "research_gaps": cached_res.get("research_gaps", []),
                    **elements,
                }

        # If cached_only mode requested and not found in cache, return immediately without calling LLM
        if cached_only:
            return {
                "status": "not_cached",
                "workspace_id": clean_ws_id,
                "cached": False,
                "llm_called": False,
                "papers_count": len(valid_papers),
                "cross_paper_relations_count": 0,
                "gaps_count": 0,
                "synthesis_summary": "Not cached in SQLite.",
                "cross_paper_relations": [],
                "research_gaps": [],
                "nodes": [],
                "edges": [],
                "stats": {"total_nodes": 0, "total_edges": 0, "node_type_counts": {}},
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

        # 4. Synthesize Cross-Paper Connections (Local Ollama phi4-mini or configured provider)
        llm_provider, engine_name, model_name = self._resolve_llm_provider(
            provider_name=provider_name,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )

        synthesis_result = {
            "cross_paper_relations": [],
            "methods": [],
            "datasets": [],
            "shared_methods": [],
            "shared_datasets": [],
            "research_gaps": [],
            "synthesis_summary": "",
            "engine": engine_name,
            "model": model_name,
        }
        llm_called = False

        if len(enriched_papers) >= 2:
            synthesis_result, llm_called = await self._run_llm_synthesis(
                enriched_papers,
                ingested_paper_node_ids,
                provider=llm_provider,
                engine_name=engine_name,
                model_name=model_name,
            )
        elif len(enriched_papers) == 1:
            synthesis_result["synthesis_summary"] = f"Single focal paper '{enriched_papers[0].get('title', '')}' mapped with core methods and evaluation datasets."

        # 5. Apply Discovered Relations, Methods, Datasets & Gaps to Graph Store
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
            "engine": synthesis_result.get("engine", engine_name),
            "model": synthesis_result.get("model", model_name),
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
        provider: BaseLLMProvider,
        engine_name: str,
        model_name: str,
    ) -> Tuple[Dict[str, Any], bool]:
        """Invoke local Ollama phi4-mini or configured LLM on compact paper abstracts to synthesize cross-paper graph intelligence."""
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
            "Analyze these papers and discover grounded relationships between them, domain-specific methods/architectures, evaluation datasets/benchmarks, and research gaps.\n"
            "STRICT RULES:\n"
            "1. ONLY output valid JSON adhering to the specified schema.\n"
            "2. 'relation' between papers MUST be one of: 'extends', 'compared_to', 'improves_upon', 'contradicts'.\n"
            "3. Ground all relations in the provided text (e.g. Paper B applies Paper A's method or outperforms Paper A).\n"
            "4. Extract distinct methods/architectures and evaluation benchmarks explicitly mentioned.\n"
            "5. Discover 1-3 combinatorial research gaps (e.g., applying Method from Paper A to the benchmark/domain of Paper B).\n"
            "SCHEMA:\n"
            "{\n"
            '  "cross_paper_relations": [\n'
            '    {"source_id": "paper_id_1", "target_id": "paper_id_2", "relation": "extends|compared_to|improves_upon|contradicts", "explanation": "Brief rationale", "weight": 2.0}\n'
            '  ],\n'
            '  "methods": [\n'
            '    {"name": "Method or Architecture Name", "paper_ids": ["paper_id_1"]}\n'
            '  ],\n'
            '  "datasets": [\n'
            '    {"name": "Dataset or Benchmark Name", "paper_ids": ["paper_id_1"]}\n'
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
            kwargs: Dict[str, Any] = {"temperature": 0.1}
            if isinstance(provider, LocalOllamaProvider):
                kwargs["json_mode"] = True
            raw_res = await provider.complete(messages, **kwargs)
            llm_called = True
            parsed = _extract_synthesis_json(raw_res)
            if isinstance(parsed, dict) and "cross_paper_relations" in parsed:
                parsed["engine"] = engine_name
                parsed["model"] = model_name
                return parsed, True
        except Exception as e:
            logger.info("[GraphSynthesizer] Primary LLM synthesis (%s) failed: %s", engine_name, e)
            if not isinstance(provider, LocalOllamaProvider):
                try:
                    logger.info("[GraphSynthesizer] Falling back to local Ollama phi4-mini for synthesis")
                    ollama_prov = LocalOllamaProvider(model="phi4-mini")
                    raw_res = await ollama_prov.complete(messages, temperature=0.1, json_mode=True)
                    parsed = _extract_synthesis_json(raw_res)
                    if isinstance(parsed, dict) and "cross_paper_relations" in parsed:
                        parsed["engine"] = "ollama"
                        parsed["model"] = "phi4-mini"
                        return parsed, True
                except Exception as ollama_err:
                    logger.warning("[GraphSynthesizer] Local Ollama fallback also failed: %s", ollama_err)

        # Fallback to deterministic heuristic synthesis
        fallback_res = self._fallback_heuristic_synthesis(enriched_papers)
        fallback_res["engine"] = "heuristic"
        fallback_res["model"] = "deterministic"
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
        """Add synthesized edges, method/dataset links, and research gaps to the graph store."""
        STOP_WORDS = {
            "large language model", "large language models", "llm", "llms", "language model",
            "artificial intelligence", "machine learning", "deep learning", "natural language processing",
            "paper", "papers", "study", "studies", "model", "models", "approach", "approaches",
            "method", "methods", "system", "systems", "framework", "frameworks", "technique", "techniques",
            "evaluation", "evaluations", "analysis", "analyses", "experiment", "experiments", "task", "tasks",
            "general", "general benchmark", "benchmark evaluation",
        }

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

            raw_rel = str(rel.get("relation", "compared_to")).lower()
            rel_type_str = raw_rel.split("|")[0].split("/")[0].strip()
            rel_enum = Relation(rel_type_str) if rel_type_str in Relation._value2member_map_ else Relation.COMPARED_TO

            edge = ResearchEdge(
                source_id=src,
                target_id=tgt,
                relation=rel_enum,
                weight=float(rel.get("weight", 2.0)),
            )
            await self.store.add_edge(edge)

        # 2. Methods (both structured method objects and shared_methods strings)
        methods_entries = synthesis.get("methods", []) or []
        for m_item in methods_entries:
            if isinstance(m_item, dict):
                m_name = m_item.get("name") or m_item.get("method") or ""
                p_ids = m_item.get("paper_ids") or []
            else:
                m_name = str(m_item)
                p_ids = list(id_map.values())
            m_norm = normalize_entity(m_name)
            if not m_norm or m_norm.lower() in STOP_WORDS or len(m_norm) < 2:
                continue
            m_slug = slugify_id(m_norm)
            m_id = m_slug if m_slug in self.store.graph else (f"method-{m_slug}" if f"method-{m_slug}" in self.store.graph else m_slug)
            existing = await self.store.get_node(m_id)
            if not existing:
                await self.store.add_node(MethodNode(id=m_id, name=m_norm, category="synthesized"))
            for pid in p_ids:
                mapped_pid = id_map.get(pid) or pid
                if mapped_pid in self.store.graph:
                    await self.store.add_edge(ResearchEdge(
                        source_id=mapped_pid,
                        target_id=m_id,
                        relation=Relation.USES_METHOD,
                        weight=2.0
                    ))

        for sm in (synthesis.get("shared_methods", []) or []):
            sm_norm = normalize_entity(str(sm))
            if not sm_norm or sm_norm.lower() in STOP_WORDS or len(sm_norm) < 2:
                continue
            sm_slug = slugify_id(sm_norm)
            sm_id = sm_slug if sm_slug in self.store.graph else (f"method-{sm_slug}" if f"method-{sm_slug}" in self.store.graph else sm_slug)
            existing = await self.store.get_node(sm_id)
            if not existing:
                await self.store.add_node(MethodNode(id=sm_id, name=sm_norm, category="shared"))
            for mapped_pid in id_map.values():
                if mapped_pid in self.store.graph:
                    await self.store.add_edge(ResearchEdge(
                        source_id=mapped_pid,
                        target_id=sm_id,
                        relation=Relation.USES_METHOD,
                        weight=2.0
                    ))

        # 3. Datasets (both structured dataset objects and shared_datasets strings)
        datasets_entries = synthesis.get("datasets", []) or []
        for d_item in datasets_entries:
            if isinstance(d_item, dict):
                d_name = d_item.get("name") or d_item.get("dataset") or ""
                p_ids = d_item.get("paper_ids") or []
            else:
                d_name = str(d_item)
                p_ids = list(id_map.values())
            d_norm = normalize_entity(d_name)
            if not d_norm or d_norm.lower() in STOP_WORDS or len(d_norm) < 2:
                continue
            d_slug = slugify_id(d_norm)
            d_id = d_slug if d_slug in self.store.graph else (f"dataset-{d_slug}" if f"dataset-{d_slug}" in self.store.graph else d_slug)
            existing = await self.store.get_node(d_id)
            if not existing:
                await self.store.add_node(DatasetNode(id=d_id, name=d_norm, domain="synthesized"))
            for pid in p_ids:
                mapped_pid = id_map.get(pid) or pid
                if mapped_pid in self.store.graph:
                    await self.store.add_edge(ResearchEdge(
                        source_id=mapped_pid,
                        target_id=d_id,
                        relation=Relation.EVALUATES_ON,
                        weight=2.0
                    ))

        for sd in (synthesis.get("shared_datasets", []) or []):
            sd_norm = normalize_entity(str(sd))
            if not sd_norm or sd_norm.lower() in STOP_WORDS or len(sd_norm) < 2:
                continue
            sd_slug = slugify_id(sd_norm)
            sd_id = sd_slug if sd_slug in self.store.graph else (f"dataset-{sd_slug}" if f"dataset-{sd_slug}" in self.store.graph else sd_slug)
            existing = await self.store.get_node(sd_id)
            if not existing:
                await self.store.add_node(DatasetNode(id=sd_id, name=sd_norm, domain="shared"))
            for mapped_pid in id_map.values():
                if mapped_pid in self.store.graph:
                    await self.store.add_edge(ResearchEdge(
                        source_id=mapped_pid,
                        target_id=sd_id,
                        relation=Relation.EVALUATES_ON,
                        weight=2.0
                    ))

        # 4. Add Research Gap Nodes & link to papers, methods, and datasets
        for idx, gap in enumerate(synthesis.get("research_gaps", []), 1):
            gap_title = gap.get("title") or f"Research Gap {idx}"
            gap_id = f"gap-{slugify_id(gap_title)[:30]}"
            method_norm = normalize_entity(gap.get("method") or "novel-technique")
            dataset_norm = normalize_entity(gap.get("dataset_or_task") or "benchmark")
            m_slug = slugify_id(method_norm)
            m_id = m_slug if m_slug in self.store.graph else f"method-{m_slug}"
            d_slug = slugify_id(dataset_norm)
            d_id = d_slug if d_slug in self.store.graph else f"dataset-{d_slug}"

            gap_node = ResearchGapNode(
                id=gap_id,
                description=gap.get("description") or gap_title,
                method_id=m_id,
                dataset_id=d_id,
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

            # Link gap to method / dataset if present
            if m_id in self.store.graph:
                await self.store.add_edge(ResearchEdge(
                    source_id=gap_id,
                    target_id=m_id,
                    relation=Relation.INVESTIGATES,
                    weight=1.5
                ))
            if d_id in self.store.graph:
                await self.store.add_edge(ResearchEdge(
                    source_id=gap_id,
                    target_id=d_id,
                    relation=Relation.EVALUATES_ON,
                    weight=1.5
                ))

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
