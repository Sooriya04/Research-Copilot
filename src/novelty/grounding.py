"""
Module: src/novelty/grounding.py

What this file does:
Implements Stage 1 (Research Grounding) of the Novelty & Gap Analysis pipeline.
Collects workspace papers from the Knowledge Graph and SQLite, preferring full-text
content when indexed and preserving inter-paper graph relationships.

Classes & Functions:
- ResearchGrounder: Loads GroundedPaper records, extracts Knowledge Graph edges,
  and computes deterministic content hashes for cache invalidation.
"""
import hashlib
from typing import Any, Dict, List, Optional
import aiosqlite

from src.graph.schema import NodeType
from src.graph.store import ResearchGraphStore
from src.novelty.schemas import GroundedPaper, GroundingContext


class ResearchGrounder:
    """Stage 1: Loads workspace papers (preferring full text) and graph topology."""

    def __init__(self, store: ResearchGraphStore, db_path: str = "./data/research_copilot.db"):
        self.store = store
        self.db_path = db_path

    async def ground(
        self,
        workspace_id: Optional[str] = None,
        topic: Optional[str] = None,
        paper_ids: Optional[List[str]] = None,
    ) -> GroundingContext:
        """Build a GroundingContext from selected paper IDs or active workspace graph nodes."""
        await self.store._ensure_initialized()

        target_pids = list(paper_ids) if paper_ids else []
        if not target_pids:
            scoped_paper_ids = None
            if workspace_id and workspace_id.strip():
                ws_clean = workspace_id.strip()
                ws_id = ws_clean if ws_clean.startswith("ws-") else f"ws-{ws_clean}"
                scoped_paper_ids = set()
                if ws_id in self.store.graph:
                    for succ in self.store.graph.successors(ws_id):
                        scoped_paper_ids.add(succ)
                    for pred in self.store.graph.predecessors(ws_id):
                        scoped_paper_ids.add(pred)

            for nid in self.store.graph.nodes:
                if scoped_paper_ids is not None and nid not in scoped_paper_ids:
                    continue
                node = await self.store.get_node(nid)
                if node and getattr(node, "node_type", None) == NodeType.PAPER:
                    target_pids.append(nid)

        papers: List[GroundedPaper] = []
        try:
            async with aiosqlite.connect(self.db_path) as db:
                for pid in target_pids:
                    try:
                        paper = await self._load_single_paper(pid, db=db)
                    except TypeError:
                        paper = await self._load_single_paper(pid)
                    if paper:
                        papers.append(paper)
        except Exception:
            for pid in target_pids:
                paper = await self._load_single_paper(pid)
                if paper:
                    papers.append(paper)

        # Collect inter-paper graph edges
        all_edges = await self.store.get_all_edges()
        pid_set = set(target_pids)
        edges: List[Dict[str, Any]] = []
        for e in all_edges:
            if e.source_id in pid_set and e.target_id in pid_set:
                rel_str = e.relation.value if hasattr(e.relation, "value") else str(e.relation)
                edges.append({
                    "source": e.source_id,
                    "target": e.target_id,
                    "relation": rel_str,
                })

        content_hash = self._compute_content_hash(papers, edges)
        return GroundingContext(
            workspace_id=workspace_id or "global",
            topic=topic or "Scientific Literature Synthesis",
            papers=papers,
            edges=edges,
            content_hash=content_hash,
            graph_version=f"edges:{len(edges)}",
        )

    async def _load_single_paper(
        self, pid: str, db: Optional[aiosqlite.Connection] = None
    ) -> Optional[GroundedPaper]:
        """Load paper metadata, abstract, and full text (if available) from graph + SQLite."""
        p_node = await self.store.get_node(pid)
        title = pid
        year = None
        authors: List[str] = []
        abstract = ""
        full_text: Optional[str] = None
        methods: List[str] = []
        datasets: List[str] = []
        source = "sqlite"

        if p_node:
            p_dict = p_node.model_dump() if hasattr(p_node, "model_dump") else getattr(p_node, "__dict__", {})
            title = p_dict.get("title") or getattr(p_node, "title", pid)
            year = p_dict.get("year") or getattr(p_node, "year", None)
            authors = p_dict.get("authors") or []
            abstract = p_dict.get("abstract") or getattr(p_node, "abstract", "") or ""
            methods = p_dict.get("methods") or []
            datasets = p_dict.get("datasets") or []
            source = "graph"

        # Enrich with SQLite papers table + chunks/full_text if present
        async def _enrich_from_conn(conn: aiosqlite.Connection) -> None:
            nonlocal title, abstract, year, full_text
            try:
                async with conn.execute(
                    "SELECT title, abstract, year FROM papers WHERE id = ? OR arxiv_id = ?",
                    (pid, pid),
                ) as cur:
                    row = await cur.fetchone()
                    if row:
                        if not title or title == pid:
                            title = row[0] or pid
                        if not abstract and row[1]:
                            abstract = row[1]
                        if not year and row[2]:
                            year = row[2]
                # Check if parsed paper chunks exist in paper_chunks table
                try:
                    async with conn.execute(
                        "SELECT content FROM paper_chunks WHERE paper_id = ? ORDER BY chunk_index ASC LIMIT 12",
                        (pid,),
                    ) as c2:
                        chunk_rows = await c2.fetchall()
                        if chunk_rows:
                            full_text = "\n\n".join(r[0] for r in chunk_rows if r[0])
                except Exception:
                    pass
            except Exception:
                pass

        if db is not None:
            await _enrich_from_conn(db)
        else:
            try:
                async with aiosqlite.connect(self.db_path) as conn:
                    await _enrich_from_conn(conn)
            except Exception:
                pass

        if not title and not abstract and not p_node:
            return None

        return GroundedPaper(
            id=pid,
            title=title,
            year=year,
            authors=authors,
            abstract=abstract,
            full_text=full_text,
            has_full_text=bool(full_text and len(full_text.strip()) > 100),
            methods=methods,
            datasets=datasets,
            source=source,
        )

    @staticmethod
    def _compute_content_hash(papers: List[GroundedPaper], edges: List[Dict[str, Any]]) -> str:
        parts = sorted(
            f"{p.id}:{len(p.abstract)}:{len(p.full_text or '')}:{p.title}"
            for p in papers
        )
        edge_parts = sorted(f"{e['source']}->{e['relation']}->{e['target']}" for e in edges)
        raw = "|".join(parts) + "::" + "|".join(edge_parts)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
