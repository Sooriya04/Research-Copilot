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


@pytest.mark.asyncio
async def test_mcp_tools_list_contains_extract_paper_assets():
    server = create_mcp_server()
    req = json.dumps({"jsonrpc": "2.0", "id": 300, "method": "tools/list"})
    res = json.loads(await server.handle_raw_message(req))

    tool_names = [t["name"] for t in res["result"]["tools"]]
    assert "extract_paper_assets" in tool_names

    tool_def = next(t for t in res["result"]["tools"] if t["name"] == "extract_paper_assets")
    assert "paper_id" in tool_def["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_mcp_extract_paper_assets_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 301,
        "method": "tools/call",
        "params": {
            "name": "extract_paper_assets",
            "arguments": {"paper_id": ""},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 301
    assert res["result"]["isError"] is True
    assert "paper_id" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_extract_paper_assets_execution(monkeypatch):
    import pymupdf as fitz
    from src.core.evidence_schemas import FigureAsset
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    # Generate small real PDF in memory
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 80), "Figure 1: The Transformer model architecture.")
    page.insert_text((50, 160), "Table 1: Maximum BLEU scores on translation.")
    page.insert_text((50, 240), "Attention(Q, K, V) = softmax(QK^T / sqrt(d_k))V   (1)")
    pdf_bytes = doc.tobytes()
    doc.close()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="We introduce the Transformer model.",
        authors=[AuthorEntity(name="Ashish Vaswani")],
        year=2017,
        arxiv_id="1706.03762",
        pdf_url="https://arxiv.org/pdf/1706.03762.pdf",
    )

    sample_visuals = [
        FigureAsset(
            id="fig-p1-1",
            label="Figure 1",
            caption="Figure 1: The Transformer model architecture.",
            page=1,
            asset_type="figure",
            bbox=[50.0, 40.0, 400.0, 100.0],
            image_data_url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        ),
        FigureAsset(
            id="tbl-p1-2",
            label="Table 1",
            caption="Table 1: Maximum BLEU scores on translation.",
            page=1,
            asset_type="table",
            bbox=[50.0, 120.0, 400.0, 180.0],
            image_data_url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        ),
    ]

    async def mock_resolve(identifier):
        return mock_canonical

    async def mock_fetch_bytes(url):
        return pdf_bytes

    def mock_extract_visuals(bytes_in, paper_id, max_assets):
        return sample_visuals

    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)
    monkeypatch.setattr(paper_reader._pdf_extractor, "fetch_pdf_bytes", mock_fetch_bytes)
    monkeypatch.setattr(paper_reader._visual_extractor, "extract_visual_assets", mock_extract_visuals)

    # Test "all" asset types with include_image_data=True
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 302,
        "method": "tools/call",
        "params": {
            "name": "extract_paper_assets",
            "arguments": {
                "paper_id": "1706.03762",
                "asset_type": "all",
                "include_image_data": True,
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 302
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["title"] == "Attention Is All You Need"
    assert data["total_figures"] == 1
    assert data["total_tables"] == 1
    assert data["figures"][0]["figure_id"] == "fig-p1-1"
    assert "image_data_url" in data["figures"][0]
    assert data["tables"][0]["table_id"] == "tbl-p1-2"
    assert data["total_equations"] >= 1
    assert "Attention" in data["equations"][0]["text"]


@pytest.mark.asyncio
async def test_mcp_extract_paper_assets_filter_equations(monkeypatch):
    import pymupdf as fitz
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "L_{G} = E_{x}[log D(x)] + E_{z}[log(1 - D(G(z)))]   (2)")
    pdf_bytes = doc.tobytes()
    doc.close()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1406.2661",
        title="Generative Adversarial Nets",
        authors=[AuthorEntity(name="Ian Goodfellow")],
        year=2014,
        pdf_url="https://arxiv.org/pdf/1406.2661.pdf",
    )

    async def mock_resolve(identifier):
        return mock_canonical

    async def mock_fetch_bytes(url):
        return pdf_bytes

    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)
    monkeypatch.setattr(paper_reader._pdf_extractor, "fetch_pdf_bytes", mock_fetch_bytes)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 303,
        "method": "tools/call",
        "params": {
            "name": "extract_paper_assets",
            "arguments": {
                "paper_id": "1406.2661",
                "asset_type": "equations",
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 303
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert "equations" in data
    assert "figures" not in data
    assert "tables" not in data
    assert data["total_equations"] >= 1
    assert "(2)" in data["equations"][0]["text"]


@pytest.mark.asyncio
async def test_mcp_tools_list_contains_verify_paper_claim():
    server = create_mcp_server()
    req = json.dumps({"jsonrpc": "2.0", "id": 400, "method": "tools/list"})
    res = json.loads(await server.handle_raw_message(req))

    tool_names = [t["name"] for t in res["result"]["tools"]]
    assert "verify_paper_claim" in tool_names

    tool_def = next(t for t in res["result"]["tools"] if t["name"] == "verify_paper_claim")
    assert "paper_id" in tool_def["inputSchema"]["required"]
    assert "claim_text" in tool_def["inputSchema"]["required"]


@pytest.mark.asyncio
async def test_mcp_verify_paper_claim_validation():
    server = create_mcp_server()
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 401,
        "method": "tools/call",
        "params": {
            "name": "verify_paper_claim",
            "arguments": {"paper_id": "1706.03762", "claim_text": ""},
        },
    })
    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 401
    assert res["result"]["isError"] is True
    assert "claim_text" in res["result"]["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_mcp_verify_paper_claim_supported(monkeypatch):
    import pymupdf as fitz
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (50, 100),
        "The Transformer achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, "
        "improving over the existing best results by over 2 BLEU."
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="We propose the Transformer.",
        authors=[AuthorEntity(name="Ashish Vaswani")],
        year=2017,
        pdf_url="https://arxiv.org/pdf/1706.03762.pdf",
    )

    async def mock_resolve(identifier):
        return mock_canonical

    async def mock_fetch_bytes(url):
        return pdf_bytes

    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)
    monkeypatch.setattr(paper_reader._pdf_extractor, "fetch_pdf_bytes", mock_fetch_bytes)

    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 402,
        "method": "tools/call",
        "params": {
            "name": "verify_paper_claim",
            "arguments": {
                "paper_id": "1706.03762",
                "claim_text": "Transformer achieves 28.4 BLEU on the WMT 2014 English-to-German translation task",
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 402
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["verdict"] == "SUPPORTED"
    assert data["verifiable_score"] >= 0.8
    assert 1 in data["page_numbers"]
    assert len(data["exact_quotes"]) >= 1
    assert "28.4 BLEU" in data["exact_quotes"][0]


@pytest.mark.asyncio
async def test_mcp_verify_paper_claim_refuted_by_benchmark(monkeypatch):
    from src.core.canonical_models import BenchmarkEvidence
    from src.mcp.tools import paper_reader

    server = create_mcp_server()

    mock_canonical = CanonicalPaper(
        canonical_id="arxiv:1706.03762",
        title="Attention Is All You Need",
        abstract="We propose the Transformer.",
        authors=[AuthorEntity(name="Ashish Vaswani")],
        year=2017,
        pdf_url=None,
        benchmarks=[
            BenchmarkEvidence(
                task="Machine Translation",
                dataset="WMT 2014 En-De",
                metric="BLEU",
                value="28.4",
                model="Transformer (big)",
            )
        ],
    )

    async def mock_resolve(identifier):
        return mock_canonical

    monkeypatch.setattr(paper_reader._canonical_resolver, "resolve", mock_resolve)

    # Claim asserts 42.0 BLEU on WMT 2014 En-De (contradicting published 28.4)
    req = json.dumps({
        "jsonrpc": "2.0",
        "id": 403,
        "method": "tools/call",
        "params": {
            "name": "verify_paper_claim",
            "arguments": {
                "paper_id": "1706.03762",
                "claim_text": "Model achieves 42.0 BLEU on WMT 2014 En-De",
            },
        },
    })

    res = json.loads(await server.handle_raw_message(req))
    assert res["id"] == 403
    data = json.loads(res["result"]["content"][0]["text"])

    assert data["success"] is True
    assert data["verdict"] == "REFUTED"
    assert "contradiction" in data["analysis"].lower()
    assert "28.4" in data["analysis"]
