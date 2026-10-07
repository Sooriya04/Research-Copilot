import json
from typing import Any, Dict, List, Optional
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.logger import logger
from src.core.models import GraphEntityModel, GraphRelationshipModel
from src.rag.active_cache import ActivePaperCache, get_active_paper_cache
from src.rag.graph_extractor import ResearchEntity, ResearchRelationship


class PaperGraphStore:
    """Persistent SQLite storage and Redis caching for paper knowledge graphs."""

    def __init__(self, active_cache: Optional[ActivePaperCache] = None):
        self.active_cache = active_cache or get_active_paper_cache()

    def _entities_cache_key(self, paper_id: str) -> str:
        return f"paper:{paper_id}:graph:entities"

    def _relationships_cache_key(self, paper_id: str) -> str:
        return f"paper:{paper_id}:graph:relationships"

    async def save_graph(
        self,
        paper_id: str,
        entities: List[ResearchEntity],
        relationships: List[ResearchRelationship],
        db: AsyncSession,
    ) -> None:
        """Persist entities and relationships to SQLite and update active Redis cache."""
        # 1. Clean previous entities & relationships in SQLite
        await db.execute(delete(GraphRelationshipModel).where(GraphRelationshipModel.paper_id == paper_id))
        await db.execute(delete(GraphEntityModel).where(GraphEntityModel.paper_id == paper_id))

        # 2. Insert Entities
        for e in entities:
            ent_rec = GraphEntityModel(
                id=e.id,
                paper_id=paper_id,
                name=e.name,
                entity_type=e.entity_type,
                description=e.description,
                source_chunk_id=e.source_chunk_id,
                page_number=e.page_number,
                metadata_json=e.metadata,
            )
            db.add(ent_rec)

        # 3. Insert Relationships
        for r in relationships:
            rel_rec = GraphRelationshipModel(
                id=r.id,
                paper_id=paper_id,
                source_entity_id=r.source_entity_id,
                relationship=r.relationship,
                target_entity_id=r.target_entity_id,
                source_chunk_id=r.source_chunk_id,
                page_number=r.page_number,
                confidence=r.confidence,
                metadata_json=r.metadata,
            )
            db.add(rel_rec)

        await db.commit()
        logger.info(
            "[PaperGraphStore] Persisted graph for '%s': %d entities, %d relationships in SQLite.",
            paper_id,
            len(entities),
            len(relationships),
        )

        # 4. Cache in Redis
        try:
            client = await self.active_cache.get_client()
            if client:
                nodes_data = [
                    {
                        "id": e.id,
                        "label": e.name,
                        "type": e.entity_type,
                        "page": e.page_number,
                        "source_chunk_id": e.source_chunk_id,
                        "description": e.description,
                    }
                    for e in entities
                ]
                edges_data = [
                    {
                        "id": r.id,
                        "source": r.source_entity_id,
                        "target": r.target_entity_id,
                        "label": r.relationship,
                        "relationship": r.relationship,
                        "page": r.page_number,
                        "source_chunk_id": r.source_chunk_id,
                        "confidence": r.confidence,
                    }
                    for r in relationships
                ]
                pipe = client.pipeline()
                pipe.set(self._entities_cache_key(paper_id), json.dumps(nodes_data), ex=self.active_cache.ttl)
                pipe.set(self._relationships_cache_key(paper_id), json.dumps(edges_data), ex=self.active_cache.ttl)
                await pipe.execute()
        except Exception as ex:
            logger.warning("[PaperGraphStore] Redis graph caching note: %s", ex)

    async def get_graph(self, paper_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Fetch full knowledge graph for paper, checking Redis active cache first."""
        # 1. Check Redis cache
        try:
            client = await self.active_cache.get_client()
            if client:
                raw_nodes = await client.get(self._entities_cache_key(paper_id))
                raw_edges = await client.get(self._relationships_cache_key(paper_id))
                if raw_nodes and raw_edges:
                    nodes = json.loads(raw_nodes)
                    edges = json.loads(raw_edges)
                    return {
                        "paper_id": paper_id,
                        "nodes": nodes,
                        "edges": edges,
                        "entity_count": len(nodes),
                        "relationship_count": len(edges),
                        "source": "redis",
                    }
        except Exception as e:
            logger.warning("[PaperGraphStore] Redis cache read note: %s", e)

        # 2. Fetch from SQLite
        ent_stmt = select(GraphEntityModel).where(GraphEntityModel.paper_id == paper_id)
        ent_res = await db.execute(ent_stmt)
        entities = ent_res.scalars().all()

        rel_stmt = select(GraphRelationshipModel).where(GraphRelationshipModel.paper_id == paper_id)
        rel_res = await db.execute(rel_stmt)
        relationships = rel_res.scalars().all()

        nodes = [
            {
                "id": e.id,
                "label": e.name,
                "type": e.entity_type,
                "page": e.page_number,
                "source_chunk_id": e.source_chunk_id,
                "description": e.description,
            }
            for e in entities
        ]

        edges = [
            {
                "id": r.id,
                "source": r.source_entity_id,
                "target": r.target_entity_id,
                "label": r.relationship,
                "relationship": r.relationship,
                "page": r.page_number,
                "source_chunk_id": r.source_chunk_id,
                "confidence": r.confidence,
            }
            for r in relationships
        ]

        return {
            "paper_id": paper_id,
            "nodes": nodes,
            "edges": edges,
            "entity_count": len(nodes),
            "relationship_count": len(edges),
            "source": "sqlite",
        }

    async def invalidate_graph(self, paper_id: str) -> None:
        """Evict graph keys from Redis cache."""
        try:
            client = await self.active_cache.get_client()
            if client:
                await client.delete(self._entities_cache_key(paper_id), self._relationships_cache_key(paper_id))
        except Exception:
            pass
