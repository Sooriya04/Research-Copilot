import json
import pytest
from src.core.canonical_models import AuthorEntity, CanonicalPaper, SourceMetadata
from src.core.schemas import PaperSection
from src.mcp.server import create_mcp_server


@pytest.mark.asyncio
async def test_mcp_tools_list_contains_read_paper_full():
    server = create_mcp_server()
    req = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    res = json.loads(await server.handle_raw_message(req))

    tool_names = [t["name"] for t in res["result"]["tools"]]
    assert "read_paper_full" in tool_names

    tool_def = next(t for t in res["result"]["tools"] if t["name"] == "read_paper_full")
    assert "identifier" in tool_def["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_mcp_read_paper_full_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 10,
        "method": "tools/call",
        "params": {
            "name": "read_paper_full",
            "arguments": {"identifier": ""},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 10
    assert res["result"]["isError"] is True
    assert "identifier" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_read_paper_full_execution_with_sections(monkeypatch):
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="Transformer architecture.",
        authors=[AuthorEntity(name="Ashish Vaswani")],
        year=2017,
        arxiv_id="1706.03762",
        pdf_url="https://arxiv.org/pdf/1706.03762.pdf",
        is_open_access=True,
    )

    sample_sections = [
        PaperSection(title="Abstract", section_type="abstract", content="The dominant sequence models..."),
        PaperSection(title="1 Introduction", section_type="intro", content="Recurrent models generate sequences..."),
        PaperSection(title="3 Model Architecture", section_type="methods", content="The Transformer follows an encoder-decoder architecture..."),
        PaperSection(title="5 Training", section_type="experiments", content="We trained on the WMT 2014 English-to-German dataset..."),
    ]

    async def mock_resolve(identifier):
        return mock_canonical

    async def mock_fetch_bytes(url):
        return b"%PDF-1.4 dummy pdf bytes"

    def mock_parse_bytes(pdf_bytes):
        return sample_sections

    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)
    monkeypatch.setattr(paper_reader._pdf_extractor, "fetch_pdf_bytes", mock_fetch_bytes)
    monkeypatch.setattr(paper_reader._pdf_parser, "parse_pdf_bytes", mock_parse_bytes)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 101,
        "method": "tools/call",
        "params": {
            "name": "read_paper_full",
            "arguments": {
                "identifier": "1706.03762",
                "include_sections": True,
                "max_chars": 50000,
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 101
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["title"] == "Attention Is All You Need"
    assert data["pdf_downloaded"] is True
    assert data["total_sections"] == 4
    section_types = [s["section_type"] for s in data["sections"]]
    assert "abstract" in section_types
    assert "methods" in section_types


@pytest.mark.asyncio
async def test_mcp_read_paper_full_fallback_to_abstract(monkeypatch):
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="doi:10.1234/test",
        title="Paywalled Paper",
        abstract="This paper is closed access but the abstract is public.",
        authors=[AuthorEntity(name="Jane Doe")],
        year=2021,
        pdf_url=None,
        is_open_access=False,
    )

    async def mock_resolve(identifier):
        return mock_canonical

    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 102,
        "method": "tools/call",
        "params": {
            "name": "read_paper_full",
            "arguments": {"identifier": "10.1234/test", "include_sections": False},
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 102
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["pdf_downloaded"] is False
    assert data["total_sections"] == 1
    assert "full_text" in data
    assert "closed access" in data["full_text"]


@pytest.mark.asyncio
async def test_mcp_tools_list_contains_summarize_paper():
    server = create_mcp_server()
    req = json.dumps({"jsonrpc": "2.0", "id": 200, "method": "tools/list"})
    res = json.loads(await server.handle_raw_message(req))

    tool_names = [t["name"] for t in res["result"]["tools"]]
    assert "summarize_paper" in tool_names

    tool_def = next(t for t in res["result"]["tools"] if t["name"] == "summarize_paper")
    assert "identifier" in tool_def["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_mcp_summarize_paper_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 201,
        "method": "tools/call",
        "params": {
            "name": "summarize_paper",
            "arguments": {"identifier": ""},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 201
    assert res["result"]["isError"] is True
    assert "identifier" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_summarize_paper_execution(monkeypatch):
    from src.core.canonical_models import (
        BenchmarkEvidence,
        CodeRepository,
        ExtractedClaim,
        PaperSummarizeResponse,
        StructuredPaperSummary,
        VerificationStatus,
    )
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="We propose the Transformer.",
        authors=[AuthorEntity(name="Ashish Vaswani"), AuthorEntity(name="Noam Shazeer")],
        year=2017,
        arxiv_id="1706.03762",
        doi="10.48550/arXiv.1706.03762",
        benchmarks=[
            BenchmarkEvidence(
                task="Machine Translation",
                dataset="WMT 2014 En-De",
                metric="BLEU",
                value="28.4",
                model="Transformer (big)",
            )
        ],
        code_repositories=[
            CodeRepository(
                url="https://github.com/tensorflow/tensor2tensor",
                is_official=True,
                stars=15000,
                framework="tensorflow",
            )
        ],
        summary=StructuredPaperSummary(
            problem="Recurrent sequence models are slow and unparallelizable.",
            contributions=["Multi-head self-attention mechanism", "Encoder-decoder Transformer architecture"],
            methodology="Transformer architecture replaces recurrence entirely with attention mechanisms and sinusoidal positional encodings.",
            experiments="Evaluated on WMT 2014 English-to-German and English-to-French translation benchmarks.",
            limitations=["Quadratic memory scaling O(N^2) with sequence length"],
            open_questions=["Linear attention scaling to million-token contexts"],
            claims=[
                ExtractedClaim(
                    claim="Achieves 28.4 BLEU on WMT 2014 English-to-German.",
                    evidence="Table 2 reports 28.4 BLEU for Transformer (big).",
                    metric="BLEU",
                    value="28.4",
                    baseline="ConvS2S",
                    confidence=0.98,
                    verification_status=VerificationStatus.VERIFIED,
                )
            ],
            model_used="gemini-2.0-flash-lite",
        ),
    )

    async def mock_summarize_paper(req, db):
        return PaperSummarizeResponse(
            canonical_paper=mock_canonical,
            cached=False,
            execution_time_ms=124.5,
        )

    monkeypatch.setattr(paper_reader._paper_intel_engine, "summarize_paper", mock_summarize_paper)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 202,
        "method": "tools/call",
        "params": {
            "name": "summarize_paper",
            "arguments": {"identifier": "1706.03762"},
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 202
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["title"] == "Attention Is All You Need"
    assert data["arxiv_id"] == "1706.03762"
    assert "Transformer" in data["summary"]["methodology"]
    assert len(data["summary"]["contributions"]) == 2
    assert len(data["summary"]["claims"]) == 1
    assert data["summary"]["claims"][0]["verification_status"] == "verified"
    assert len(data["benchmarks"]) == 1
    assert data["benchmarks"][0]["dataset"] == "WMT 2014 En-De"
    assert len(data["code_repositories"]) == 1
    assert data["code_repositories"][0]["is_official"] is True


@pytest.mark.asyncio
async def test_mcp_summarize_paper_pipeline_failure_fallback(monkeypatch):
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:2301.00000",
        title="Heuristic Fallback Paper",
        abstract="A paper testing graceful fallback when LLM fails.",
        authors=[AuthorEntity(name="Alan Turing")],
        year=2023,
    )

    async def mock_failing_summarize(req, db):
        raise RuntimeError("LLM rate limit or missing API key")

    async def mock_resolve(identifier):
        return mock_canonical

    monkeypatch.setattr(paper_reader._paper_intel_engine, "summarize_paper", mock_failing_summarize)
    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 203,
        "method": "tools/call",
        "params": {
            "name": "summarize_paper",
            "arguments": {"identifier": "2301.00000"},
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 203
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["title"] == "Heuristic Fallback Paper"
    assert "fallback" in data["note"].lower()
    assert data["summary"]["model_used"] == "extractive-fallback"
