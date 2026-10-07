import asyncio
import fakeredis.aioredis as fake_aioredis
import pytest
from httpx import ASGITransport, AsyncClient
from src.api.app import app
from src.core.database import get_db_session
from src.rag.active_cache import ActivePaperCache
from src.rag.chunker import DocumentChunk
from src.rag.graph_extractor import EntityNormalizer, PaperGraphExtractor
from src.rag.graph_retriever import PaperGraphRetriever
from src.rag.graph_store import PaperGraphStore
from src.rag.ingestion import PaperIngestionService
from src.rag.query_router import QueryRouter
from src.rag.service import PaperRAGService


def test_entity_normalization():
    """Verify conservative entity normalizer resolves synonyms and removes casing anomalies."""
    normalizer = EntityNormalizer()
    assert normalizer.normalize_entity_name("GPT 4") == "GPT-4"
    assert normalizer.normalize_entity_name("gpt-4") == "GPT-4"
    assert normalizer.normalize_entity_name("llama-3") == "LLaMA-3"
    assert normalizer.normalize_entity_name("BERT") == "BERT"
    assert normalizer.normalize_entity_name("halueval") == "HaluEval"
    assert normalizer.normalize_entity_name("accuracy") == "Accuracy"
    assert normalizer.normalize_entity_name("f1 score") == "F1-Score"
    assert normalizer.normalize_entity_name("f1") == "F1-Score"
    assert normalizer.normalize_entity_name("auc-pr") == "AUC-PR"


def test_graph_extractor_from_chunks():
    """Verify PaperGraphExtractor correctly identifies research entities and relationships with chunk and page provenance."""
    extractor = PaperGraphExtractor()
    paper_id = "test-extract-001"
    chunks = [
        DocumentChunk(
            chunk_id=f"{paper_id}_c0",
            paper_id=paper_id,
            chunk_index=0,
            content="We propose BTProp, a novel method authored by Alice Smith. We evaluate on HaluEval and TruthfulQA datasets.",
            page_number=1,
            section="1. Introduction",
            token_count=35,
        ),
        DocumentChunk(
            chunk_id=f"{paper_id}_c1",
            paper_id=paper_id,
            chunk_index=1,
            content="BTProp uses GPT-4 and compares against baseline LLaMA-2. The primary metric measured is AUC-PR and Accuracy.",
            page_number=2,
            section="3. Experiments",
            token_count=35,
        ),
    ]

    entities, relationships = extractor.extract_from_chunks(
        paper_id=paper_id,
        chunks=chunks,
        title="BTProp Paper",
        authors=["Alice Smith"],
    )

    # 1. Verify paper and author entities
    entity_names = {e.name: e for e in entities}
    assert "BTProp Paper" in entity_names
    assert entity_names["BTProp Paper"].entity_type == "paper"
    assert "Alice Smith" in entity_names
    assert entity_names["Alice Smith"].entity_type == "author"

    # 2. Verify extracted methods, datasets, models, metrics
    assert "BTProp" in entity_names
    assert entity_names["BTProp"].entity_type == "method"

    assert "HaluEval" in entity_names
    assert entity_names["HaluEval"].entity_type == "dataset"
    assert entity_names["HaluEval"].page_number == 1
    assert entity_names["HaluEval"].source_chunk_id == f"{paper_id}_c0"

    assert "GPT-4" in entity_names
    assert entity_names["GPT-4"].entity_type == "model"
    assert entity_names["GPT-4"].page_number == 2

    assert "AUC-PR" in entity_names
    assert entity_names["AUC-PR"].entity_type == "metric"
    assert entity_names["AUC-PR"].page_number == 2

    # 3. Verify relationships
    rel_tuples = {(r.relationship, r.page_number) for r in relationships}
    assert ("authored_by", 1) in rel_tuples or ("proposes", 1) in rel_tuples
    assert any(r.relationship == "evaluates_on" for r in relationships)
    assert any(r.relationship == "uses" for r in relationships)
    assert any(r.relationship == "measured_by" for r in relationships)
    assert any(r.relationship == "compares_against" for r in relationships)

    # Check relationship source & target entities exist
    ent_id_map = {e.id: e for e in entities}
    for r in relationships:
        assert r.source_entity_id in ent_id_map
        assert r.target_entity_id in ent_id_map
        assert r.page_number in [1, 2]
        assert r.source_chunk_id is not None


@pytest.mark.asyncio
async def test_graph_store_sqlite_and_redis():
    """Verify PaperGraphStore saves to SQLite and Redis, and retrieves graph structures correctly."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    store = PaperGraphStore(active_cache=cache)

    paper_id = "test-store-001"
    extractor = PaperGraphExtractor()
    chunks = [
        DocumentChunk(
            chunk_id=f"{paper_id}_c0",
            paper_id=paper_id,
            chunk_index=0,
            content="We propose GraphNet for reasoning on SQuAD dataset using RoBERTa, measured by F1-Score.",
            page_number=1,
            section="1. Introduction",
            token_count=30,
        )
    ]
    entities, relationships = extractor.extract_from_chunks(
        paper_id=paper_id,
        chunks=chunks,
        title="GraphNet Study",
        authors=["Bob Johnson"],
    )

    async with get_db_session() as db:
        # Save to SQLite and Redis
        await store.save_graph(paper_id, entities, relationships, db)

        # Retrieve graph (should come from Redis initially)
        graph_data = await store.get_graph(paper_id, db)
        assert graph_data["paper_id"] == paper_id
        assert graph_data["entity_count"] == len(entities)
        assert graph_data["relationship_count"] == len(relationships)
        assert graph_data["source"] == "redis"
        assert len(graph_data["nodes"]) == len(entities)
        assert len(graph_data["edges"]) == len(relationships)

        # Evict Redis cache and verify fallback to SQLite
        await fake_client.delete(f"paper:{paper_id}:graph:entities")
        await fake_client.delete(f"paper:{paper_id}:graph:relationships")

        sqlite_graph = await store.get_graph(paper_id, db)
        assert sqlite_graph["paper_id"] == paper_id
        assert sqlite_graph["entity_count"] == len(entities)
        assert sqlite_graph["relationship_count"] == len(relationships)
        assert sqlite_graph["source"] == "sqlite"


@pytest.mark.asyncio
async def test_graph_retriever_subgraph():
    """Verify PaperGraphRetriever matches query intents and traverses entity relationships."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    store = PaperGraphStore(active_cache=cache)
    retriever = PaperGraphRetriever(graph_store=store)

    paper_id = "test-retriever-001"
    extractor = PaperGraphExtractor()
    chunks = [
        DocumentChunk(
            chunk_id=f"{paper_id}_c0",
            paper_id=paper_id,
            chunk_index=0,
            content="Our method FastAttn evaluates on ImageNet dataset and GLUE benchmark using ViT model. We measure Top-1 Accuracy.",
            page_number=3,
            section="4. Evaluation",
            token_count=35,
        )
    ]
    entities, relationships = extractor.extract_from_chunks(
        paper_id=paper_id,
        chunks=chunks,
        title="FastAttn Paper",
        authors=["Charlie"],
    )

    async with get_db_session() as db:
        await store.save_graph(paper_id, entities, relationships, db)

        # Query: "What dataset did FastAttn evaluate on?"
        res = await retriever.retrieve_subgraph(
            paper_id=paper_id,
            query="What dataset did FastAttn evaluate on?",
            db=db,
        )
        assert len(res.matched_entities) > 0
        assert len(res.relationships) > 0
        assert any(r["relationship"] == "evaluates_on" for r in res.relationships)
        assert "ImageNet" in res.explanation or "GLUE" in res.explanation
        assert f"{paper_id}_c0" in res.supporting_chunk_ids
        assert 3 in res.supporting_pages


def test_query_router_intent_classification():
    """Verify QueryRouter accurately distinguishes graph, hybrid, and combined queries."""
    router = QueryRouter()

    # Relationship / Graph Queries
    assert router.route_query("What datasets did this method use?") in ["graph", "both"]
    assert router.route_query("Which model was used as the baseline?") in ["graph", "both"]
    assert router.route_query("What metric was used to evaluate the proposed method?") in ["graph", "both"]
    assert router.route_query("How does this method compare against previous approaches?") in ["graph", "both"]
    assert router.route_query("Who authored this paper?") in ["graph", "both"]

    # Hybrid / Text-dominant queries
    assert router.route_query("Can you summarize the introduction section?") == "hybrid"
    assert router.route_query("Explain the theoretical background in section 2.") == "hybrid"


@pytest.mark.asyncio
async def test_end_to_end_graph_chat_and_api():
    """Verify full pipeline: ingestion extracts graph, API serves /graph, and /chat answers relationship queries with citations."""
    ingestion = PaperIngestionService()
    rag_service = PaperRAGService()

    paper_id = "test-e2e-graph-001"
    async with get_db_session() as db:
        await ingestion.ingest_document(
            paper_id=paper_id,
            title="Relational Reasoning in LLMs",
            abstract="We propose NeuroGraph evaluated on GSM8k with PaLM-2.",
            pages=[
                {
                    "page_number": 1,
                    "text": "1. Introduction\nWe propose NeuroGraph for multi-step reasoning. Authored by David Lee.",
                },
                {
                    "page_number": 2,
                    "text": "3. Experiments\nNeuroGraph is evaluated on GSM8K dataset using PaLM-2. We measure Pass@1 accuracy against baseline GPT-3.5.",
                },
            ],
            db=db,
        )

        # 1. Test chat endpoint with relationship question
        response = await rag_service.answer_question(
            paper_id=paper_id,
            question="What dataset was used and what metric was measured for NeuroGraph?",
            db=db,
            top_k=3,
        )

        assert response.answer is not None
        assert len(response.answer) > 0
        assert len(response.citations) > 0
        assert any(c.page in [1, 2] for c in response.citations)
        assert response.retrieval_strategy in ["graph", "both", "hybrid"]

    # 2. Test GET /papers/{paper_id}/graph via HTTP client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        graph_resp = await client.get(f"/api/v1/papers/{paper_id}/graph")
        assert graph_resp.status_code == 200
        data = graph_resp.json()
        assert data["paper_id"] == paper_id
        assert "nodes" in data
        assert "edges" in data
        assert len(data["nodes"]) > 0
        node_labels = [n["label"] for n in data["nodes"]]
        assert "NeuroGraph" in node_labels or "GSM8K" in node_labels


@pytest.mark.asyncio
async def test_paper_isolation_in_graph_store():
    """Verify Knowledge Graph of Paper X does not leak into Paper Y."""
    fake_client = fake_aioredis.FakeRedis(decode_responses=True)
    cache = ActivePaperCache(redis_client=fake_client, ttl_seconds=600, enabled=True)
    store = PaperGraphStore(active_cache=cache)
    ingestion = PaperIngestionService()

    paper_x = "paper-iso-x"
    paper_y = "paper-iso-y"

    async with get_db_session() as db:
        await ingestion.ingest_document(
            paper_id=paper_x,
            title="Paper X Method",
            pages=[{"page_number": 1, "text": "Paper X proposes XNet on dataset ImageNet-1k."}],
            db=db,
        )
        await ingestion.ingest_document(
            paper_id=paper_y,
            title="Paper Y Method",
            pages=[{"page_number": 1, "text": "Paper Y proposes YNet on dataset CIFAR-100."}],
            db=db,
        )

        graph_x = await store.get_graph(paper_x, db)
        graph_y = await store.get_graph(paper_y, db)

        labels_x = {n["label"] for n in graph_x["nodes"]}
        labels_y = {n["label"] for n in graph_y["nodes"]}

        # X should contain XNet/ImageNet-1k but NOT YNet/CIFAR-100
        assert "XNet" in labels_x or "ImageNet-1k" in labels_x
        assert "YNet" not in labels_x
        assert "CIFAR-100" not in labels_x

        # Y should contain YNet/CIFAR-100 but NOT XNet/ImageNet-1k
        assert "YNet" in labels_y or "CIFAR-100" in labels_y
        assert "XNet" not in labels_y
        assert "ImageNet-1k" not in labels_y
