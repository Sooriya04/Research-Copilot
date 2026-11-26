"""
Module: src/novelty/persistence.py

What this file does:
Implements Stage 8 (Persistence, Versioned Caching, and Optional Knowledge Graph Integration)
for the Novelty & Gap Analysis pipeline.

Classes & Functions:
- NoveltyPersistence: Manages SQLite tables (`graph_novelty_cache`, `novelty_proposals`,
  `novelty_artifacts`), computes multi-factor cache keys (paper IDs, content hash,
  graph version, provider/model, prompt/pipeline versions, analysis config), and
  injects provisional candidate nodes into ResearchGraphStore with full provenance.
"""
import hashlib
import json
import os
from typing import Any, Dict, List, Optional
import aiosqlite

from src.core.logger import logger
from src.graph.schema import MethodNode, Relation, ResearchEdge, slugify_id
from src.graph.store import ResearchGraphStore

PROMPT_VERSION = "v2.0"
PIPELINE_VERSION = "v2.0"


class NoveltyPersistence:
    """SQLite persistence, versioned caching, and optional Knowledge Graph injection."""

    def __init__(self, store: ResearchGraphStore, db_path: str = "./data/research_copilot.db"):
        self.store = store
        self.db_path = db_path
        self._initialized = False

    async def ensure_tables(self) -> None:
        """Create SQLite tables for proposals, versioned cache, and stage artifacts."""
        if self._initialized:
            return
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
                    confidence_score REAL DEFAULT 0.75,
                    extra_json TEXT,
                    is_custom INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            # Ensure extra_json column exists on legacy DBs
            try:
                await db.execute("ALTER TABLE novelty_proposals ADD COLUMN extra_json TEXT;")
            except Exception:
                pass
            await db.commit()
        self._initialized = True

    @staticmethod
    def compute_cache_key(
        paper_ids: List[str],
        provider: str = "gemini",
        model: str = "",
        content_hash: str = "",
        graph_version: str = "v1",
        analysis_mode: str = "focused",
        verify_prior_art: bool = True,
    ) -> str:
        """Compute deterministic SHA-256 key factoring papers, content, graph, model, and versions."""
        sorted_ids = sorted(str(pid).strip().lower() for pid in paper_ids if pid)
        raw = (
            f"{'|'.join(sorted_ids)}::"
            f"ch={content_hash}::gv={graph_version}::"
            f"p={provider.lower()}::m={model.lower()}::"
            f"pv={PROMPT_VERSION}::pl={PIPELINE_VERSION}::"
            f"mode={analysis_mode}::pa={int(verify_prior_art)}"
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    async def get_cached(self, workspace_id: str, cache_key: str) -> Optional[List[Dict[str, Any]]]:
        """Retrieve cached novelty proposals from SQLite if present."""
        if not workspace_id or not cache_key:
            return None
        await self.ensure_tables()
        try:
            async with aiosqlite.connect(self.db_path) as db:
                async with db.execute(
                    "SELECT novelties_json FROM graph_novelty_cache WHERE workspace_id = ? AND paper_ids_hash = ?",
                    (workspace_id, cache_key),
                ) as cur:
                    row = await cur.fetchone()
                    if row and row[0]:
                        data = json.loads(row[0])
                        if isinstance(data, list) and len(data) > 0:
                            return data
        except Exception as exc:
            logger.warning("[NoveltyPersistence] Cache read error: %s", exc)
        return None

    async def save_cached(
        self,
        workspace_id: str,
        cache_key: str,
        paper_ids: List[str],
        novelties: List[Dict[str, Any]],
    ) -> None:
        """Persist synthesized proposals under the versioned cache key."""
        if not workspace_id or not cache_key or not novelties:
            return
        await self.ensure_tables()
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
                    (workspace_id, cache_key, json.dumps(paper_ids), json.dumps(novelties), len(novelties)),
                )
                await db.commit()
        except Exception as exc:
            logger.warning("[NoveltyPersistence] Cache write error: %s", exc)

    async def save_proposal(
        self,
        proposal: Dict[str, Any],
        workspace_id: Optional[str] = None,
        topic: Optional[str] = None,
        is_custom: bool = False,
    ) -> Dict[str, Any]:
        """Save or update a single research proposal without overwriting unrelated proposals."""
        await self.ensure_tables()
        ws_id = workspace_id or "global"
        title = str(proposal.get("title") or "Untitled Proposal").strip()
        n_id = proposal.get("id") or f"{'custom' if is_custom else 'nov'}-{slugify_id(title)[:32]}"

        extra = {
            "problem_statement": proposal.get("problem_statement", ""),
            "research_motivation": proposal.get("research_motivation", ""),
            "identified_gap": proposal.get("identified_gap", ""),
            "technical_methodology": proposal.get("technical_methodology", ""),
            "algorithmic_approach": proposal.get("algorithmic_approach", ""),
            "potential_limitations": proposal.get("potential_limitations", ""),
            "structured_evidence": proposal.get("structured_evidence", []),
            "prior_art_status": proposal.get("prior_art_status", "not_assessed"),
            "prior_art_check": proposal.get("prior_art_check"),
            "quality_assessment": proposal.get("quality_assessment"),
            "evidence_status": proposal.get("evidence_status", "abstract_only"),
        }

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO novelty_proposals (
                    id, workspace_id, topic, title, mechanism, engine, model_name,
                    pitch, novelty_statement, grounded_paper_ids, grounded_paper_titles,
                    mathematical_formulation, testable_hypothesis, target_datasets,
                    baselines_to_beat, expected_metrics, confidence_score, extra_json, is_custom, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                    extra_json = excluded.extra_json,
                    updated_at = CURRENT_TIMESTAMP;
                """,
                (
                    n_id,
                    ws_id,
                    topic or "Literature Synthesis",
                    title,
                    proposal.get("mechanism", "recombination"),
                    proposal.get("engine", "custom" if is_custom else "gemini"),
                    proposal.get("model_name"),
                    proposal.get("pitch", ""),
                    proposal.get("novelty_statement", ""),
                    json.dumps(proposal.get("grounded_paper_ids", [])),
                    json.dumps(proposal.get("grounded_paper_titles", [])),
                    proposal.get("mathematical_formulation", ""),
                    proposal.get("testable_hypothesis", ""),
                    json.dumps(proposal.get("target_datasets", [])),
                    json.dumps(proposal.get("baselines_to_beat", [])),
                    json.dumps(proposal.get("expected_metrics", [])),
                    float(proposal.get("confidence_score") or 0.75),
                    json.dumps(extra),
                    1 if is_custom else 0,
                ),
            )
            await db.commit()

        saved = dict(proposal)
        saved["id"] = n_id
        saved["workspace_id"] = ws_id
        saved["is_custom"] = is_custom
        return saved

    async def get_saved_proposals(
        self,
        workspace_id: Optional[str] = None,
        topic: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Retrieve persisted proposals for the requested workspace."""
        await self.ensure_tables()
        out: List[Dict[str, Any]] = []
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            query = "SELECT * FROM novelty_proposals WHERE 1=1"
            params: List[Any] = []
            if workspace_id and workspace_id != "all":
                query += " AND (workspace_id = ? OR workspace_id IS NULL)"
                params.append(workspace_id)
            if topic:
                query += " AND topic = ?"
                params.append(topic)
            query += " ORDER BY updated_at DESC LIMIT ?"
            params.append(limit)
            async with db.execute(query, params) as cur:
                rows = await cur.fetchall()
                for r in rows:
                    item = {
                        "id": r["id"],
                        "workspace_id": r["workspace_id"],
                        "topic": r["topic"],
                        "title": r["title"],
                        "mechanism": r["mechanism"],
                        "engine": r["engine"],
                        "model_name": r["model_name"],
                        "pitch": r["pitch"],
                        "novelty_statement": r["novelty_statement"],
                        "grounded_paper_ids": json.loads(r["grounded_paper_ids"] or "[]"),
                        "grounded_paper_titles": json.loads(r["grounded_paper_titles"] or "[]"),
                        "mathematical_formulation": r["mathematical_formulation"],
                        "testable_hypothesis": r["testable_hypothesis"],
                        "target_datasets": json.loads(r["target_datasets"] or "[]"),
                        "baselines_to_beat": json.loads(r["baselines_to_beat"] or "[]"),
                        "expected_metrics": json.loads(r["expected_metrics"] or "[]"),
                        "confidence_score": r["confidence_score"],
                        "is_custom": bool(r["is_custom"]),
                    }
                    if "extra_json" in r.keys() and r["extra_json"]:
                        try:
                            extra = json.loads(r["extra_json"])
                            if isinstance(extra, dict):
                                item.update(extra)
                        except Exception:
                            pass
                    out.append(item)
        return out

    async def delete_proposal(self, proposal_id: str) -> bool:
        await self.ensure_tables()
        async with aiosqlite.connect(self.db_path) as db:
            cur = await db.execute("DELETE FROM novelty_proposals WHERE id = ?", (proposal_id,))
            await db.commit()
            return cur.rowcount > 0

    async def clear_proposals(self, workspace_id: Optional[str] = None) -> int:
        await self.ensure_tables()
        async with aiosqlite.connect(self.db_path) as db:
            if workspace_id:
                cur = await db.execute("DELETE FROM novelty_proposals WHERE workspace_id = ?", (workspace_id,))
            else:
                cur = await db.execute("DELETE FROM novelty_proposals")
            await db.commit()
            return cur.rowcount

    async def add_candidate_to_graph(self, workspace_id: str, novelty: Dict[str, Any]) -> Dict[str, Any]:
        """Inject a proposal into ResearchGraphStore as a provisional MethodNode with provenance."""
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

        return {
            "status": "injected",
            "candidate_node_id": cand_node_id,
            "node_id": cand_node_id,
            "edges_added": edges_added,
            "links_added": len(edges_added),
        }
