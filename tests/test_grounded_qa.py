import json
import pytest
from httpx import AsyncClient, ASGITransport

from src.api.app import app
from src.core.database import init_db
from src.core.evidence_schemas import (
    PaperEvidencePackage,
    ClaimItem,
    ClaimKind,
    ClaimConfidence,
    MetricItem,
    SourceReference,
    GroundedQARequest,
    GroundedQAResponse,
    PageIndexedDocument,
    PageData,
    WordBox,
)
from src.engines.grounded_qa import GroundedQAEngine
from src.providers.base import BaseLLMProvider, ChatMessage


class MockLLMProvider(BaseLLMProvider):
    def __init__(self, reply: str):
        self.reply = reply
        self.provider_name = "mock"
        self.model = "mock-model"

    async def complete(self, messages, model=None, temperature=0.7, **kwargs) -> str:
        return self.reply

    async def stream_chat(self, messages, model=None, temperature=0.7):
        yield self.reply


@pytest.fixture
def qa_evidence_package():
    return PaperEvidencePackage(
        paper_id="2106.09685",
        title="LoRA: Low-Rank Adaptation of Large Language Models",
        thesis="Freezes pre-trained model weights and injects trainable rank decomposition matrices.",
        plain_summary="LoRA reduces GPU memory footprint by 3x and trainable parameters by 10,000x.",
        research_question="Can parameter-efficient fine-tuning match full model fine-tuning quality?",
        claims=[
            ClaimItem(
                id="claim-1",
                statement="LoRA reduces trainable parameters by 10,000 times without quality degradation.",
                kind=ClaimKind.REPORTED_RESULT,
                confidence=ClaimConfidence.VERIFIED,
                source_refs=[SourceReference(page=1, excerpt="reduces trainable parameters by 10,000 times")],
            )
        ],
        metrics=[
            MetricItem(
                id="metric-1",
                label="Trainable Parameters Reduction",
                display_value="10,000x",
                unit="times",
                context="GPT-3 175B fine-tuning",
                source_ref=SourceReference(page=1, excerpt="10,000x reduction"),
            )
        ],
    )


@pytest.fixture
def sample_doc():
    return PageIndexedDocument(
        paper_id="2106.09685",
        page_count=1,
        pages=[
            PageData(
                page_number=1,
                width=600.0,
                height=800.0,
                text="We propose Low-Rank Adaptation, or LoRA, which freezes the pre-trained model weights and injects trainable rank decomposition matrices. This reduces trainable parameters by 10,000 times.",
                words=[
                    WordBox(text="LoRA", x_min=50, y_min=100, x_max=90, y_max=115),
                    WordBox(text="reduces", x_min=100, y_min=100, x_max=140, y_max=115),
                    WordBox(text="parameters", x_min=150, y_min=100, x_max=220, y_max=115),
                    WordBox(text="by", x_min=225, y_min=100, x_max=240, y_max=115),
                    WordBox(text="10,000", x_min=245, y_min=100, x_max=290, y_max=115),
                ],
            )
        ],
    )


@pytest.mark.asyncio
async def test_grounded_qa_answer_with_metric(qa_evidence_package, sample_doc):
    engine = GroundedQAEngine()
    res = await engine.answer_question(
        paper_id="2106.09685",
        question="What is the reduction in trainable parameters reported for LoRA?",
        evidence_pkg=qa_evidence_package,
        doc=sample_doc,
    )
    assert res.paper_id == "2106.09685"
    assert res.insufficient_evidence is False
    assert len(res.citations) > 0
    assert "10,000" in res.answer


@pytest.mark.asyncio
async def test_grounded_qa_insufficient_evidence_off_topic(qa_evidence_package, sample_doc):
    engine = GroundedQAEngine()
    res = await engine.answer_question(
        paper_id="2106.09685",
        question="What is the weather in Tokyo during the cherry blossom season?",
        evidence_pkg=qa_evidence_package,
        doc=sample_doc,
    )
    assert res.insufficient_evidence is True
    assert res.confidence == "insufficient_evidence"
    assert len(res.citations) == 0
    assert "does not contain" in res.answer


@pytest.mark.asyncio
async def test_grounded_qa_with_mock_llm(qa_evidence_package, sample_doc):
    mock_reply = json.dumps({
        "answer": "LoRA injects trainable rank decomposition matrices while freezing pre-trained weights.",
        "citations": [
            {"page": 1, "excerpt": "freezes the pre-trained model weights and injects trainable rank decomposition matrices."}
        ],
        "confidence": "verified",
        "insufficient_evidence": False
    })
    engine = GroundedQAEngine(provider=MockLLMProvider(mock_reply))
    res = await engine.answer_question(
        paper_id="2106.09685",
        question="How does LoRA adapt large models?",
        evidence_pkg=qa_evidence_package,
        doc=sample_doc,
    )
    assert res.insufficient_evidence is False
    assert res.confidence == "verified"
    assert len(res.citations) == 1
    assert res.citations[0].page == 1
    assert "rank decomposition" in res.citations[0].excerpt


@pytest.mark.asyncio
async def test_grounded_qa_api_endpoint():
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Ingest paper first
        ingest_payload = {
            "paper_id": "test-lora-qa",
            "title": "LoRA: Low-Rank Adaptation of Large Language Models",
            "force_refresh": True,
        }
        ingest_res = await client.post("/api/v1/evidence/ingest", json=ingest_payload)
        assert ingest_res.status_code == 200

        # Ask question
        qa_payload = {
            "paper_id": "test-lora-qa",
            "question": "What is the primary method or architecture of this work?",
        }
        qa_res = await client.post("/api/v1/evidence/test-lora-qa/qa", json=qa_payload)
        assert qa_res.status_code == 200
        data = qa_res.json()
        assert data["paper_id"] == "test-lora-qa"
        assert "answer" in data
        assert "confidence" in data
        assert "citations" in data
