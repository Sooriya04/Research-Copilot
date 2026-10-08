import hashlib
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
import aiosqlite
from pydantic import BaseModel, Field

from src.core.logger import logger
from src.graph.gap_engine import GapDetectionEngine
from src.graph.schema import (
    MethodNode,
    NodeType,
    PaperNode,
    Relation,
    ResearchEdge,
    slugify_id,
)
from src.graph.store import ResearchGraphStore
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.gemini import GeminiFlashLiteProvider
from src.providers.groq import GroqProvider
from src.providers.llm import LocalOllamaProvider
from src.providers.openrouter import OpenRouterProvider
from src.providers.nvidia import NvidiaProvider
from src.providers.deepseek import DeepSeekProvider
from src.core.provider_settings import resolve_provider_credentials
from src.core.config import settings


class NoveltyItem(BaseModel):
    id: str
    title: str
    mechanism: str = Field(
        default="recombination",
        description="One of: recombination, contradiction_resolution, limitation_inversion, gap_realization",
    )
    engine: str = "gemini"
    model_name: Optional[str] = None
    pitch: str = "Novel architectural synthesis from literature graph."
    novelty_statement: str = "Grounded hypothesis derived from literature topology."
    grounded_paper_ids: List[str] = []
    grounded_paper_titles: List[str] = []
    mathematical_formulation: str = "Formulation detailed in empirical plan."
    testable_hypothesis: str = "The proposed method will demonstrate statistically significant error reduction."
    target_datasets: List[str] = []
    baselines_to_beat: List[str] = []
    expected_metrics: List[str] = []
    confidence_score: float = 0.85


class NoveltySynthesisResponse(BaseModel):
    status: str
    workspace_id: Optional[str] = None
    topic: Optional[str] = None
    cached: bool = False
    llm_called: bool = False
    papers_count: int = 0
    gaps_count: int = 0
    novelties: List[NoveltyItem] = []


class GraphNoveltyEngine:
    """Synthesizes grounded scientific research novelty from active Knowledge Graph topologies."""

    def __init__(
        self,
        store: Optional[ResearchGraphStore] = None,
        provider: Optional[GeminiFlashLiteProvider] = None,
        db_path: str = "./data/research_copilot.db",
    ):
        self.store = store or ResearchGraphStore(db_path=db_path)
        self.provider = provider or GeminiFlashLiteProvider()
        self.gap_engine = GapDetectionEngine(store=self.store)
        self.db_path = db_path
        self._table_initialized = False

    async def _ensure_cache_table(self) -> None:
        """Create graph_novelty_cache table if not exists."""
        if not self._table_initialized:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
                async with aiosqlite.connect(self.db_path) as db:
                    await db.execute(
                        """
                        CREATE TABLE IF NOT EXISTS graph_novelty_cache (
                            workspace_id TEXT NOT NULL,
                            paper_ids_hash TEXT NOT NULL,
                            paper_ids_json TEXT NOT NULL,
                            novelties_json TEXT NOT NULL,
                            novelties_count INTEGER DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            PRIMARY KEY (workspace_id, paper_ids_hash)
                        );
                        """
                    )
                    await db.execute(
                        """
                        CREATE TABLE IF NOT EXISTS novelty_proposals (
                            id TEXT PRIMARY KEY,
                            workspace_id TEXT,
                            topic TEXT,
                            title TEXT NOT NULL,
                            mechanism TEXT,
                            engine TEXT,
                            model_name TEXT,
                            pitch TEXT,
                            novelty_statement TEXT,
                            grounded_paper_ids TEXT,
                            grounded_paper_titles TEXT,
                            mathematical_formulation TEXT,
                            testable_hypothesis TEXT,
                            target_datasets TEXT,
                            baselines_to_beat TEXT,
                            expected_metrics TEXT,
                            confidence_score REAL DEFAULT 0.85,
                            is_custom INTEGER DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                        """
                    )
                    # Backfill from graph_novelty_cache if novelty_proposals is empty
                    async with db.execute("SELECT COUNT(*) FROM novelty_proposals") as cur:
                        row = await cur.fetchone()
                        if row and row[0] == 0:
                            async with db.execute("SELECT workspace_id, novelties_json FROM graph_novelty_cache") as c2:
                                rows = await c2.fetchall()
                                for ws_id, n_json in rows:
                                    try:
                                        items = json.loads(n_json)
                                        if isinstance(items, list):
                                            for it in items:
                                                if isinstance(it, dict) and it.get("title"):
                                                    n_id = it.get("id") or f"nov-{slugify_id(it.get('title'))}"
                                                    await db.execute(
                                                        """
                                                        INSERT OR IGNORE INTO novelty_proposals
                                                        (id, workspace_id, title, mechanism, engine, model_name, pitch,
                                                         novelty_statement, grounded_paper_ids, grounded_paper_titles,
                                                         mathematical_formulation, testable_hypothesis, target_datasets,
                                                         baselines_to_beat, expected_metrics, confidence_score, is_custom)
                                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                                        """,
                                                        (
                                                            n_id,
                                                            ws_id,
                                                            it.get("title"),
                                                            it.get("mechanism", "recombination"),
                                                            it.get("engine", "gemini"),
                                                            it.get("model_name"),
                                                            it.get("pitch", ""),
                                                            it.get("novelty_statement", ""),
                                                            json.dumps(it.get("grounded_paper_ids", [])),
                                                            json.dumps(it.get("grounded_paper_titles", [])),
                                                            it.get("mathematical_formulation", ""),
                                                            it.get("testable_hypothesis", ""),
                                                            json.dumps(it.get("target_datasets", [])),
                                                            json.dumps(it.get("baselines_to_beat", [])),
                                                            json.dumps(it.get("expected_metrics", [])),
                                                            float(it.get("confidence_score") or 0.85),
                                                            0,
                                                        )
                                                    )
                                    except Exception:
                                        pass
                    await db.commit()
                self._table_initialized = True
            except Exception as e:
                logger.warning("[GraphNoveltyEngine] Failed initializing SQLite cache/proposals tables: %s", e)

    @staticmethod
    def compute_paper_hash(paper_ids: List[str], provider: str = "gemini", model: str = "") -> str:
        """Compute a deterministic hash from a sorted list of paper IDs + provider + model."""
        sorted_ids = sorted(str(pid).strip().lower() for pid in paper_ids if pid)
        raw_key = "|".join(sorted_ids)
        if provider != "gemini" or model:
            raw_key += f"::{provider.lower()}::{model.lower()}"
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    async def get_cached_novelties(
        self, workspace_id: str, paper_ids: List[str], provider: str = "gemini", model: str = ""
    ) -> Optional[List[Dict[str, Any]]]:
        """Retrieve cached novelty synthesis from SQLite if available."""
        if not workspace_id or not paper_ids:
            return None
        await self._ensure_cache_table()
        paper_hash = self.compute_paper_hash(paper_ids, provider=provider, model=model)
        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(
                    "SELECT novelties_json FROM graph_novelty_cache WHERE workspace_id = ? AND paper_ids_hash = ?",
                    (workspace_id, paper_hash),
                ) as cursor:
                    row = await cursor.fetchone()
                    if row and row[0]:
                        data = json.loads(row[0])
                        if isinstance(data, list) and len(data) > 0:
                            return data
        except Exception as e:
            logger.warning("[GraphNoveltyEngine] Cache read error: %s", e)
        return None

    async def save_cached_novelties(
        self,
        workspace_id: str,
        paper_ids: List[str],
        novelties: List[Dict[str, Any]],
        provider: str = "gemini",
        model: str = "",
    ) -> None:
        """Persist generated novelty synthesis into SQLite cache."""
        if not workspace_id or not paper_ids or not novelties:
            return
        await self._ensure_cache_table()
        paper_hash = self.compute_paper_hash(paper_ids, provider=provider, model=model)
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT INTO graph_novelty_cache
                        (workspace_id, paper_ids_hash, paper_ids_json, novelties_json, novelties_count, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(workspace_id, paper_ids_hash) DO UPDATE SET
                        novelties_json = excluded.novelties_json,
                        novelties_count = excluded.novelties_count,
                        updated_at = CURRENT_TIMESTAMP;
                    """,
                    (
                        workspace_id,
                        paper_hash,
                        json.dumps(paper_ids),
                        json.dumps(novelties),
                        len(novelties),
                    ),
                )
                await db.commit()
        except Exception as e:
            logger.warning("[GraphNoveltyEngine] Cache write error: %s", e)

    async def save_proposal(
        self,
        proposal: Dict[str, Any],
        workspace_id: Optional[str] = None,
        topic: Optional[str] = None,
        is_custom: bool = False,
    ) -> Dict[str, Any]:
        """Save a proposal (synthesized or user-created) into novelty_proposals table."""
        await self._ensure_cache_table()
        import time as _t
        n_id = proposal.get("id") or f"{'custom-' if is_custom else 'nov-'}{slugify_id(proposal.get('title', 'proposal'))[:30]}-{int(_t.time())}"
        proposal["id"] = n_id
        if is_custom:
            proposal["is_custom"] = True
            if not proposal.get("engine"):
                proposal["engine"] = "custom"
            if not proposal.get("model_name"):
                proposal["model_name"] = "user-authored"

        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    INSERT INTO novelty_proposals
                    (id, workspace_id, topic, title, mechanism, engine, model_name, pitch,
                     novelty_statement, grounded_paper_ids, grounded_paper_titles,
                     mathematical_formulation, testable_hypothesis, target_datasets,
                     baselines_to_beat, expected_metrics, confidence_score, is_custom, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        mechanism = excluded.mechanism,
                        pitch = excluded.pitch,
                        novelty_statement = excluded.novelty_statement,
                        mathematical_formulation = excluded.mathematical_formulation,
                        testable_hypothesis = excluded.testable_hypothesis,
                        target_datasets = excluded.target_datasets,
                        baselines_to_beat = excluded.baselines_to_beat,
                        expected_metrics = excluded.expected_metrics,
                        confidence_score = excluded.confidence_score,
                        updated_at = CURRENT_TIMESTAMP;
                    """,
                    (
                        n_id,
                        workspace_id or "global",
                        topic or "Literature Synthesis",
                        proposal.get("title", "Untitled Proposal"),
                        proposal.get("mechanism", "recombination"),
                        proposal.get("engine", "custom" if is_custom else "gemini"),
                        proposal.get("model_name", "user-authored" if is_custom else "default"),
                        proposal.get("pitch", ""),
                        proposal.get("novelty_statement", ""),
                        json.dumps(proposal.get("grounded_paper_ids", [])),
                        json.dumps(proposal.get("grounded_paper_titles", [])),
                        proposal.get("mathematical_formulation", ""),
                        proposal.get("testable_hypothesis", ""),
                        json.dumps(proposal.get("target_datasets", [])),
                        json.dumps(proposal.get("baselines_to_beat", [])),
                        json.dumps(proposal.get("expected_metrics", [])),
                        float(proposal.get("confidence_score", 0.85) or 0.85),
                        1 if (is_custom or proposal.get("is_custom")) else 0,
                    ),
                )
                await db.commit()
        except Exception as e:
            logger.warning("[GraphNoveltyEngine] Error saving proposal to DB: %s", e)
        return proposal

    async def get_saved_proposals(
        self,
        workspace_id: Optional[str] = None,
        topic: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Retrieve all saved proposals for a workspace/topic ordered by most recent."""
        await self._ensure_cache_table()
        proposals = []
        try:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                query = "SELECT * FROM novelty_proposals WHERE 1=1"
                params: List[Any] = []
                if workspace_id and workspace_id != "global":
                    query += " AND (workspace_id = ? OR workspace_id = 'global')"
                    params.append(workspace_id)
                query += " ORDER BY created_at DESC LIMIT ?"
                params.append(limit)

                async with db.execute(query, params) as cursor:
                    rows = await cursor.fetchall()
                    for r in rows:
                        def parse_json_field(val):
                            if not val:
                                return []
                            try:
                                return json.loads(val)
                            except Exception:
                                return []

                        proposals.append({
                            "id": r["id"],
                            "workspace_id": r["workspace_id"],
                            "topic": r["topic"],
                            "title": r["title"],
                            "mechanism": r["mechanism"] or "recombination",
                            "engine": r["engine"] or "gemini",
                            "model_name": r["model_name"],
                            "pitch": r["pitch"] or "",
                            "novelty_statement": r["novelty_statement"] or "",
                            "grounded_paper_ids": parse_json_field(r["grounded_paper_ids"]),
                            "grounded_paper_titles": parse_json_field(r["grounded_paper_titles"]),
                            "mathematical_formulation": r["mathematical_formulation"] or "",
                            "testable_hypothesis": r["testable_hypothesis"] or "",
                            "target_datasets": parse_json_field(r["target_datasets"]),
                            "baselines_to_beat": parse_json_field(r["baselines_to_beat"]),
                            "expected_metrics": parse_json_field(r["expected_metrics"]),
                            "confidence_score": float(r["confidence_score"] or 0.85),
                            "is_custom": bool(r["is_custom"]),
                            "created_at": str(r["created_at"]),
                        })
        except Exception as e:
            logger.warning("[GraphNoveltyEngine] Error reading saved proposals: %s", e)
        return proposals

    async def delete_saved_proposal(self, proposal_id: str) -> bool:
        """Delete a proposal by ID from novelty_proposals table."""
        await self._ensure_cache_table()
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("DELETE FROM novelty_proposals WHERE id = ?", (proposal_id,))
                await db.commit()
                return True
        except Exception as e:
            logger.warning("[GraphNoveltyEngine] Error deleting proposal %s: %s", proposal_id, e)
            return False

    async def clear_all_proposals(self, workspace_id: Optional[str] = None) -> int:
        """Clear proposals for a workspace."""
        await self._ensure_cache_table()
        try:
            async with aiosqlite.connect(self.db_path) as db:
                if workspace_id and workspace_id != "global":
                    res = await db.execute("DELETE FROM novelty_proposals WHERE workspace_id = ?", (workspace_id,))
                else:
                    res = await db.execute("DELETE FROM novelty_proposals")
                await db.commit()
                return res.rowcount
        except Exception as e:
            logger.warning("[GraphNoveltyEngine] Error clearing proposals: %s", e)
            return 0

    async def resolve_provider(
        self,
        provider_name: str = "gemini",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> tuple[BaseLLMProvider, str, str]:
        """Resolves (provider_instance, normalized_name, model_name) using SQLite user_settings credentials."""
        p_name = (provider_name or "gemini").lower().strip()
        creds = await resolve_provider_credentials(
            provider_id=p_name,
            explicit_key=api_key,
            explicit_model=model,
            explicit_base_url=base_url,
        )
        resolved_key = creds.get("api_key")
        resolved_model = creds.get("model")
        resolved_base_url = creds.get("base_url")

        if p_name == "groq":
            mdl = resolved_model or "qwen/qwen3.8-27b"
            return GroqProvider(api_key=resolved_key, model=mdl), "groq", mdl
        elif p_name == "ollama":
            mdl = resolved_model or getattr(settings, "ollama_model", "phi4-mini")
            return LocalOllamaProvider(base_url=resolved_base_url, model=mdl), "ollama", mdl
        elif p_name == "openrouter":
            mdl = resolved_model or "anthropic/claude-3.5-sonnet"
            return OpenRouterProvider(api_key=resolved_key, model=mdl, base_url=resolved_base_url), "openrouter", mdl
        elif p_name == "nvidia":
            mdl = resolved_model or "meta/llama-3.3-70b-instruct"
            return NvidiaProvider(api_key=resolved_key, model=mdl, base_url=resolved_base_url), "nvidia", mdl
        elif p_name == "deepseek":
            mdl = resolved_model or "deepseek-chat"
            return DeepSeekProvider(api_key=resolved_key, model=mdl, base_url=resolved_base_url), "deepseek", mdl
        else:
            if not api_key and not model and self.provider:
                return self.provider, "gemini", getattr(self.provider, "model", "gemini-3.5-flash-lite")
            mdl = resolved_model or "gemini-3.5-flash-lite"
            return GeminiFlashLiteProvider(api_key=resolved_key, model=mdl), "gemini", mdl

    async def synthesize_novelties(
        self,
        workspace_id: Optional[str] = None,
        topic: Optional[str] = None,
        paper_ids: Optional[List[str]] = None,
        provider_name: str = "gemini",
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        force_refresh: bool = False,
        providers: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Synthesize grounded novel research hypotheses and architectures from the active knowledge graph."""
        await self.store._ensure_initialized()

        # Handle multi-provider concurrent execution (custom selection or 'all')
        target_providers: List[str] = []
        if providers and isinstance(providers, list) and len(providers) > 0:
            target_providers = [p.strip().lower() for p in providers if p and p.strip()]
        elif "," in (provider_name or ""):
            target_providers = [p.strip().lower() for p in provider_name.split(",") if p.strip()]
        elif (provider_name or "").lower() == "all":
            all_known = ["gemini", "groq", "ollama", "openrouter", "nvidia"]
            target_providers = []
            for candidate in all_known:
                creds = await resolve_provider_credentials(candidate)
                if creds.get("has_key") or candidate == "ollama":
                    target_providers.append(candidate)
            if not target_providers:
                target_providers = ["gemini"]

        if len(target_providers) > 1:
            import asyncio
            coros = [
                self.synthesize_novelties(
                    workspace_id=workspace_id,
                    topic=topic,
                    paper_ids=paper_ids,
                    provider_name=p,
                    api_key=api_key if (p == provider_name) else None,
                    base_url=base_url if (p == "ollama" and base_url) else None,
                    force_refresh=force_refresh,
                )
                for p in target_providers
            ]
            results = await asyncio.gather(*coros, return_exceptions=True)
            merged = []
            successful_providers = []
            for p, r in zip(target_providers, results):
                if isinstance(r, dict) and r.get("novelties"):
                    merged.extend(r["novelties"])
                    successful_providers.append(p)
                elif isinstance(r, Exception):
                    logger.warning("[GraphNoveltyEngine] Provider '%s' error during multi-model run: %s", p, r)

            ws_key = workspace_id or (f"topic-{slugify_id(topic)}" if topic else "global")
            for item in merged:
                await self.save_proposal(item, workspace_id=ws_key, topic=topic)
            return {
                "status": "multi_synthesized",
                "workspace_id": ws_key,
                "topic": topic or "Literature Synthesis",
                "cached": False,
                "llm_called": True,
                "provider": "multi",
                "providers_run": successful_providers,
                "papers_count": len(paper_ids or []),
                "gaps_count": len(merged),
                "novelties": merged,
            }
        elif len(target_providers) == 1:
            provider_name = target_providers[0]

        # 1. Resolve paper IDs in scope
        target_pids = list(paper_ids) if paper_ids else []
        if not target_pids:
            for nid in self.store.graph.nodes:
                node = await self.store.get_node(nid)
                if node and getattr(node, "node_type", None) == NodeType.PAPER:
                    target_pids.append(nid)

        ws_key = workspace_id or (f"topic-{slugify_id(topic)}" if topic else "global")

        # Resolve provider
        active_provider, eng_name, model_str = await self.resolve_provider(
            provider_name=provider_name,
            api_key=api_key,
            model=model,
            base_url=base_url,
        )

        # 2. Check SQLite cache
        if not force_refresh and ws_key and target_pids:
            cached_data = await self.get_cached_novelties(ws_key, target_pids, provider=eng_name, model=model_str)
            if cached_data:
                logger.info(
                    "[GraphNoveltyEngine] SQLite Cache Hit for workspace '%s' (%s/%s) -> 0 LLM calls",
                    ws_key,
                    eng_name,
                    model_str,
                )
                parsed_items = [NoveltyItem(**item) for item in cached_data]
                return {
                    "status": "cached",
                    "workspace_id": ws_key,
                    "topic": topic or "Literature Synthesis",
                    "provider": eng_name,
                    "model": model_str,
                    "cached": True,
                    "llm_called": False,
                    "papers_count": len(target_pids),
                    "gaps_count": len(parsed_items),
                    "novelties": [item.model_dump() for item in parsed_items],
                }

        # 3. Collect papers and graph relationships
        paper_records = []
        for pid in target_pids:
            p_node = await self.store.get_node(pid)
            if p_node:
                p_dict = p_node.model_dump() if hasattr(p_node, "model_dump") else getattr(p_node, "__dict__", {})
                paper_records.append({
                    "id": pid,
                    "title": p_dict.get("title") or getattr(p_node, "title", pid),
                    "year": p_dict.get("year") or getattr(p_node, "year", None),
                    "abstract": p_dict.get("abstract") or getattr(p_node, "abstract", ""),
                    "methods": p_dict.get("methods") or [],
                    "datasets": p_dict.get("datasets") or [],
                })

        # Collect existing relational edges between these papers
        all_edges = await self.store.get_all_edges()
        rel_records = []
        pid_set = set(target_pids)
        for e in all_edges:
            if e.source_id in pid_set and e.target_id in pid_set:
                rel_str = e.relation.value if hasattr(e.relation, "value") else str(e.relation)
                rel_records.append({
                    "source": e.source_id,
                    "target": e.target_id,
                    "relation": rel_str,
                })

        # Collect detected gaps
        detected_gaps = []
        try:
            raw_gaps = await self.gap_engine.detect_method_dataset_gaps()
            for g in raw_gaps[:5]:
                detected_gaps.append({
                    "method": g.method_id,
                    "dataset": g.dataset_id,
                    "description": g.description,
                })
        except Exception:
            pass

        # 4. Formulate Prompt for Gemini Flash-Lite
        llm_called = False
        novelties_dicts = []

        if paper_records:
            try:
                system_prompt = (
                    "You are a World-Class Principal AI Research Engineer at Google DeepMind and Stanford AI Lab. "
                    "Your mission is to examine a structured scientific literature Knowledge Graph and synthesize "
                    "HIGH-IMPACT, GROUNDED, PUBLICATION-READY RESEARCH NOVELTY PROPOSALS.\n\n"
                    "RULES FOR SCIENTIFIC NOVELTY:\n"
                    "1. DO NOT generate hand-waving platitudes or generic ideas.\n"
                    "2. Ground every proposal strictly in the provided papers, their mathematical methods, and their empirical limitations.\n"
                    "3. Utilize the 4 Scientific Novelty Mechanisms:\n"
                    "   - 'recombination': Orthogonal fusion of Method A from Paper 1 and Method B from Paper 2.\n"
                    "   - 'contradiction_resolution': Unifying contradictory findings (e.g. Paper A says linear beats transformers, Paper B says patched attention beats linear).\n"
                    "   - 'limitation_inversion': Directly resolving a known bottleneck of Paper A using a mechanism from Paper B.\n"
                    "   - 'gap_realization': Designing a rigorous experiment for an unexplored method-dataset intersection.\n"
                    "4. Output STRICT JSON only with no markdown fences, matching the requested schema exactly."
                )

                papers_summary_text = ""
                for idx, p in enumerate(paper_records, 1):
                    papers_summary_text += (
                        f"Paper [{idx}] ID: {p['id']}\n"
                        f"Title: {p['title']} ({p['year'] or 'Recent'})\n"
                        f"Abstract: {p['abstract'][:450]}...\n\n"
                    )

                edges_summary_text = ", ".join(
                    [f"{e['source']} -[{e['relation']}]-> {e['target']}" for e in rel_records[:10]]
                ) or "No direct cross-paper edges logged yet."

                gaps_summary_text = ", ".join(
                    [f"{g['method']} on {g['dataset']}" for g in detected_gaps[:4]]
                ) or "Combinatorial exploration open."

                user_prompt = f"""Target Research Topic: {topic or 'Literature Synthesis'}
Active Workspace Graph:
- Number of Papers: {len(paper_records)}
- Known Inter-Paper Relationships: {edges_summary_text}
- Identified Gaps: {gaps_summary_text}

Papers in Knowledge Graph:
{papers_summary_text}

TASK:
Synthesize 2 to 3 distinct, publication-grade Novelty Proposals from this Knowledge Graph.
Return JSON with this EXACT structure:
{{
  "proposals": [
    {{
      "id": "novelty-slug-identifier",
      "title": "Clear, publication-ready title (e.g., Inverted Variate Reprogramming...)",
      "mechanism": "recombination | contradiction_resolution | limitation_inversion | gap_realization",
      "pitch": "1-2 sentence compelling executive summary of the breakthrough idea.",
      "novelty_statement": "Detailed scientific explanation of what is novel vs prior art in the graph.",
      "grounded_paper_ids": ["paper_id_1", "paper_id_2"],
      "grounded_paper_titles": ["Full Title of Paper 1", "Full Title of Paper 2"],
      "mathematical_formulation": "Clear equations, tokenization flow, or algorithmic design block.",
      "testable_hypothesis": "Falsifiable scientific hypothesis statement with expected quantitative criteria.",
      "target_datasets": ["Benchmark 1", "Benchmark 2"],
      "baselines_to_beat": ["Method from Paper 1", "Method from Paper 2"],
      "expected_metrics": ["MSE", "MAE", "Throughput"],
      "confidence_score": 0.90
    }}
  ]
}}
"""
                logger.info("[GraphNoveltyEngine] Calling provider '%s' (%s) to synthesize novelty across %d papers...", eng_name, model_str, len(paper_records))
                messages = [
                    ChatMessage(role="system", content=system_prompt),
                    ChatMessage(role="user", content=user_prompt),
                ]
                raw_reply = await active_provider.complete(messages, model=model_str, temperature=0.35)
                llm_called = True

                cleaned = raw_reply.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                if cleaned.startswith("```"):
                    cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]

                parsed_json = json.loads(cleaned.strip())
                if isinstance(parsed_json, list):
                    proposals = parsed_json
                elif isinstance(parsed_json, dict):
                    proposals = (
                        parsed_json.get("proposals")
                        or parsed_json.get("novelties")
                        or parsed_json.get("novelty_ideas")
                        or parsed_json.get("novelities")
                        or parsed_json.get("ideas")
                        or parsed_json.get("items")
                        or []
                    )
                else:
                    proposals = []

                for prop in proposals:
                    if not isinstance(prop, dict):
                        continue
                    # Normalize fields for robustness with local models like phi4-mini
                    if "title" not in prop and "concept_name" in prop:
                        prop["title"] = prop["concept_name"]
                    if not prop.get("title"):
                        prop["title"] = f"Novel Method for {topic or 'Literature'}"
                    if "id" not in prop or not prop["id"]:
                        prop["id"] = f"novelty-{slugify_id(prop['title'])[:32]}"
                    if "pitch" not in prop and "description" in prop:
                        prop["pitch"] = prop["description"]
                    if not prop.get("pitch"):
                        prop["pitch"] = "Novel mechanism synthesized from graph nodes."
                    if "mechanism" not in prop or not prop["mechanism"]:
                        prop["mechanism"] = "recombination"
                    if "novelty_statement" not in prop or not prop["novelty_statement"]:
                        prop["novelty_statement"] = prop.get("key_innovation") or prop.get("pitch", "Grounded synthesis from literature.")
                    if "mathematical_formulation" not in prop or not prop["mathematical_formulation"]:
                        prop["mathematical_formulation"] = "Adaptive gating formulation across scale regimes: H_out = sigma(W_g * X) * F_a(X) + (1 - sigma(W_g * X)) * F_b(X)"
                    if "testable_hypothesis" not in prop or not prop["testable_hypothesis"]:
                        prop["testable_hypothesis"] = "Empirical reduction of forecasting MSE by >= 10% on benchmark datasets."
                    if "target_datasets" not in prop or not prop["target_datasets"]:
                        prop["target_datasets"] = ["Standard Benchmark Suite"]
                    if "baselines_to_beat" not in prop or not prop["baselines_to_beat"]:
                        prop["baselines_to_beat"] = [p["title"] for p in paper_records[:2]]
                    if "expected_metrics" not in prop or not prop["expected_metrics"]:
                        prop["expected_metrics"] = ["MSE", "MAE"]
                    if "confidence_score" not in prop:
                        prop["confidence_score"] = 0.85
                    prop["engine"] = eng_name
                    prop["model_name"] = model_str
                    novelties_dicts.append(NoveltyItem(**prop).model_dump())

            except Exception as llm_err:
                logger.warning("[GraphNoveltyEngine] Provider '%s' Novelty synthesis error: %s. Using heuristic fallback.", eng_name, llm_err)

        # 5. Deterministic Heuristic Fallback (if LLM returned empty or failed)
        if not novelties_dicts and paper_records:
            logger.info("[GraphNoveltyEngine] Generating deterministic heuristic novelty proposals from graph topology.")
            novelties_dicts = self._generate_heuristic_novelties(topic or "Literature Synthesis", paper_records, detected_gaps)

        # 6. Save to SQLite Cache & Persistent Proposals Table
        if ws_key and target_pids and novelties_dicts:
            await self.save_cached_novelties(ws_key, target_pids, novelties_dicts, provider=eng_name, model=model_str)
            for item in novelties_dicts:
                await self.save_proposal(item, workspace_id=ws_key, topic=topic)

        return {
            "status": "synthesized",
            "workspace_id": ws_key,
            "topic": topic or "Literature Synthesis",
            "provider": eng_name,
            "model": model_str,
            "cached": False,
            "llm_called": llm_called,
            "papers_count": len(target_pids),
            "gaps_count": len(novelties_dicts),
            "novelties": novelties_dicts,
        }

    def _generate_heuristic_novelties(
        self, topic: str, papers: List[Dict[str, Any]], gaps: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Deterministic heuristic novelty generator based on combinatorial graph analysis."""
        proposals = []
        p_titles = [p["title"] for p in papers[:3]]
        p_ids = [p["id"] for p in papers[:3]]

        # Proposal 1: Orthogonal Recombination
        proposals.append({
            "id": f"novelty-recomb-{slugify_id(topic)[:20]}",
            "title": f"Adaptive Dual-Branch Architecture for {topic.title()}",
            "mechanism": "recombination",
            "pitch": f"Unifies orthogonal representation channels from '{p_titles[0]}' with the parameter-efficient formulation of '{p_titles[-1]}'.",
            "novelty_statement": (
                f"While '{p_titles[0]}' models local sequence dependencies and '{p_titles[-1]}' operates globally, "
                "neither fuses dynamic routing across scale regimes. This proposal introduces an adaptive cross-attention gate."
            ),
            "grounded_paper_ids": p_ids,
            "grounded_paper_titles": p_titles,
            "mathematical_formulation": "H_fused = alpha * Branch_A(X) + (1 - alpha) * Branch_B(X), where alpha = sigmoid(W_gate * Pool(X))",
            "testable_hypothesis": "Dynamic routing across representations will reduce out-of-distribution error by >= 12% compared to either baseline.",
            "target_datasets": ["Standard Benchmark Suite", "Out-of-Distribution Shift Split"],
            "baselines_to_beat": p_titles,
            "expected_metrics": ["MSE", "MAE", "Parameter Efficiency"],
            "confidence_score": 0.82,
            "engine": "heuristic",
            "model_name": "graph-topology-analyzer",
        })

        # Proposal 2: Gap Realization / Robustness
        proposals.append({
            "id": f"novelty-robust-{slugify_id(topic)[:20]}",
            "title": f"Spectral Regularization under Non-Stationary Dynamics for {topic.title()}",
            "mechanism": "limitation_inversion",
            "pitch": f"Inverts the common failure mode of '{p_titles[0]}' under distribution drift using frequency-domain attenuation.",
            "novelty_statement": (
                "Identifies that high-frequency noise spikes corrupt deep attention weights during non-stationary transitions. "
                "Applies reversible instance normalization directly in spectral space prior to projection."
            ),
            "grounded_paper_ids": [p_ids[0]] if p_ids else [],
            "grounded_paper_titles": [p_titles[0]] if p_titles else [],
            "mathematical_formulation": "X_clean = iFFT(Filter(FFT(RevIN(X)))) -> Backbone(X_clean)",
            "testable_hypothesis": "Spectral pre-filtering will eliminate variance divergence during sudden covariate distribution shifts.",
            "target_datasets": ["Severe Distribution Shift Testbed"],
            "baselines_to_beat": [p_titles[0]] if p_titles else ["State-of-the-art Baselines"],
            "expected_metrics": ["Robustness Ratio", "Worst-case Loss"],
            "confidence_score": 0.85,
            "engine": "heuristic",
            "model_name": "graph-topology-analyzer",
        })

        return proposals

    async def add_novelty_candidate_node(
        self,
        workspace_id: str,
        novelty: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Inject a synthesized novelty proposal directly into the knowledge graph as a candidate node."""
        await self.store._ensure_initialized()

        novelty_id = novelty.get("id") or f"novelty-{slugify_id(novelty.get('title', 'candidate'))}"
        cand_node_id = f"cand-{novelty_id}"

        # Create Method / Proposed Architecture Node
        cand_node = MethodNode(
            id=cand_node_id,
            name=novelty.get("title", "Proposed Architecture"),
            category="Proposed Novelty",
        )
        await self.store.add_node(cand_node)

        # Connect directed edges to grounded foundation papers
        edges_added = []
        grounded_ids = novelty.get("grounded_paper_ids", [])
        for gid in grounded_ids:
            if gid in self.store.graph:
                edge = ResearchEdge(
                    source_id=cand_node_id,
                    target_id=gid,
                    relation=Relation.IMPROVES_UPON,
                    weight=3.0,
                )
                await self.store.add_edge(edge)
                edges_added.append({
                    "source": cand_node_id,
                    "target": gid,
                    "relation": "improves_upon",
                })

        logger.info(
            "[GraphNoveltyEngine] Injected Candidate Novelty Node '%s' into graph with %d foundation links",
            cand_node_id,
            len(edges_added),
        )
        return {
            "status": "injected",
            "candidate_node_id": cand_node_id,
            "title": novelty.get("title"),
            "edges_added": edges_added,
        }
