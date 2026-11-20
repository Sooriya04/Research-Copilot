import json
import pytest
from src.core.canonical_models import AuthorEntity, CanonicalPaper, CodeRepository
from src.mcp.server import create_mcp_server


@pytest.mark.asyncio
async def test_mcp_tools_list_contains_get_paper_code_repositories():
    server = create_mcp_server()
    req = json.dumps({"jsonrpc": "2.0", "id": 801, "method": "tools/list"})
    res = json.loads(await server.handle_raw_message(req))

    tool_names = [t["name"] for t in res["result"]["tools"]]
    assert "get_paper_code_repositories" in tool_names

    tool_def = next(t for t in res["result"]["tools"] if t["name"] == "get_paper_code_repositories")
    assert "paper_id_or_title" in tool_def["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_mcp_get_paper_code_repositories_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 802,
        "method": "tools/call",
        "params": {
            "name": "get_paper_code_repositories",
            "arguments": {"paper_id_or_title": "   "},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 802
    assert res["result"]["isError"] is True
    assert "paper_id_or_title" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_get_paper_code_repositories_execution(monkeypatch):
    from src.mcp.tools import code_benchmarks

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="We introduce the Transformer.",
        authors=[AuthorEntity(name="Ashish Vaswani")],
        year=2017,
        arxiv_id="1706.03762",
    )

    mock_raw_repos = [
        CodeRepository(
            url="https://github.com/tensorflow/tensor2tensor",
            is_official=True,
            framework="TensorFlow",
            stars=17470,
            license="Apache-2.0",
        ),
        CodeRepository(
            url="https://github.com/jadore801120/attention-is-all-you-need-pytorch",
            is_official=False,
            framework="PyTorch",
            stars=6100,
            license="MIT",
        ),
        CodeRepository(
            url="https://huggingface.co/spaces/nvidia/nemotron-diarization",
            is_official=False,
            framework="Gradio / Space",
            stars=118,
            license=None,
        ),
    ]

    async def mock_resolve(identifier):
        return mock_canonical

    async def mock_get_code_repos(arxiv_id=None, title=None):
        return mock_raw_repos

    async def mock_enrich_metadata(repo_url, client, base_stars=None, base_framework=None):
        if "tensor2tensor" in repo_url:
            return {
                "url": repo_url,
                "stars": 17473,
                "framework": "TensorFlow",
                "language": "Python",
                "license": "Apache-2.0",
                "last_commit_date": "2023-06-02T18:55:09Z",
                "is_active": True,
                "description": "Library of deep learning models and datasets.",
            }
        elif "attention-is-all-you-need-pytorch" in repo_url:
            return {
                "url": repo_url,
                "stars": 6120,
                "framework": "PyTorch",
                "language": "Python",
                "license": "MIT",
                "last_commit_date": "2022-04-12T10:00:00Z",
                "is_active": True,
                "description": "A PyTorch implementation of Attention Is All You Need.",
            }
        else:
            return {
                "url": repo_url,
                "stars": 118,
                "framework": "Gradio / Space",
                "language": "Python",
                "license": None,
                "last_commit_date": "2026-10-29T12:52:36Z",
                "is_active": True,
                "description": "Nemotron diarization demo space.",
            }

    monkeypatch.setattr(code_benchmarks._canonical_resolver, "resolve", mock_resolve)
    monkeypatch.setattr(code_benchmarks._paperswithcode_client, "get_code_repositories", mock_get_code_repos)
    monkeypatch.setattr(code_benchmarks, "enrich_repository_metadata", mock_enrich_metadata)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 803,
        "method": "tools/call",
        "params": {
            "name": "get_paper_code_repositories",
            "arguments": {
                "paper_id_or_title": "1706.03762",
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 803
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["paper_id"] == "arxiv:1706.03762"
    assert data["title"] == "Attention Is All You Need"
    assert data["total_repositories"] == 3
    assert len(data["official_repositories"]) == 1
    assert data["official_repositories"][0]["url"] == "https://github.com/tensorflow/tensor2tensor"
    assert data["official_repositories"][0]["stars"] == 17473
    assert data["official_repositories"][0]["license"] == "Apache-2.0"
    assert data["official_repositories"][0]["is_active"] is True

    assert len(data["community_repositories"]) == 2
    assert data["community_repositories"][0]["url"] == "https://github.com/jadore801120/attention-is-all-you-need-pytorch"
    assert data["community_repositories"][0]["stars"] == 6120
    assert data["community_repositories"][0]["framework"] == "PyTorch"
    assert data["primary_framework"] in ["TensorFlow", "PyTorch"]
