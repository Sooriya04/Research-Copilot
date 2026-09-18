import pytest
from fastapi.testclient import TestClient
from src.api.app import app


@pytest.mark.asyncio
async def test_workspace_graph_isolation():
    client = TestClient(app)

    # 1. Ingest paper into Workspace A
    ingest_payload_a = {
        "topic": "Domain Specific Topic A",
        "workspace_id": "ws-alpha-123",
        "paper_data": {
            "id": "arxiv:2401.00001",
            "title": "Paper Exclusive to Alpha",
            "year": 2024,
            "authors": ["Alice Alpha"],
            "methods": ["AlphaMethod"],
            "datasets": ["AlphaDataset"],
            "metrics": {"Score": "99.0"},
            "claims": [{"claim": "Alpha claim", "verified": True}],
            "limitations": ["Alpha limitation"]
        }
    }
    resp_a = client.post("/api/v1/graph/ingest-paper", json=ingest_payload_a)
    assert resp_a.status_code == 200

    # 2. Query Workspace A graph elements
    res_graph_a = client.get("/api/v1/graph/elements?topic=Domain%20Specific%20Topic%20A&workspace_id=ws-alpha-123&scoped=true")
    assert res_graph_a.status_code == 200
    nodes_a = res_graph_a.json()["nodes"]
    node_ids_a = [n["id"] for n in nodes_a]
    assert "arxiv:2401.00001" in node_ids_a

    # 3. Query Workspace B graph elements (completely fresh topic and workspace)
    res_graph_b = client.get("/api/v1/graph/elements?topic=Completely%20Unrelated%20Topic%20B&workspace_id=ws-beta-456&scoped=true")
    assert res_graph_b.status_code == 200
    nodes_b = res_graph_b.json()["nodes"]
    node_ids_b = [n["id"] for n in nodes_b]

    # Workspace B must NOT contain Workspace A's paper or methods!
    assert "arxiv:2401.00001" not in node_ids_b
    assert "alphamethod" not in node_ids_b
    assert "alphadataset" not in node_ids_b

    # Workspace B only contains its own topic anchor
    paper_nodes_b = [n for n in nodes_b if n["node_type"] == "paper"]
    assert len(paper_nodes_b) == 0
