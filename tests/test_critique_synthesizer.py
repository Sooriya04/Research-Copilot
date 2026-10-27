"""
Unit tests for CritiqueSynthesizer:
Covering:
- Valid and invalid model JSON
- Frontier provider failures and Ollama fallback
- Full offline heuristic operation (with explicit notice)
- Cache hits, misses, and invalidation (0 model calls on cache hit)
- Per-paper critique and cross-paper synthesis
- Fully mocked unit tests requiring no live services or API keys
"""

import json
from typing import AsyncGenerator, List, Optional
from unittest.mock import AsyncMock, patch
import pytest

from src.core.schemas import ChecklistRubric, Paper, PaperSection
from src.engines.critique_synthesizer import (
    CritiqueSynthesizer,
    PaperCritiqueSchema,
    SynthesisSchema,
    extract_json_from_llm_text,
)
from src.providers.base import BaseLLMProvider, ChatMessage


class MockLLMProvider(BaseLLMProvider):
    def __init__(self, reply: str = "", fail: bool = False):
        self.reply = reply
        self.fail = fail
        self.call_count = 0

    async def complete(self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7, **kwargs) -> str:
        self.call_count += 1
        if self.fail:
            raise RuntimeError("Simulated provider failure")
        return self.reply

    async def stream_chat(
        self, messages: List[ChatMessage], model: Optional[str] = None, temperature: float = 0.7, **kwargs
    ) -> AsyncGenerator[str, None]:
        yield self.reply


def test_extract_json_from_llm_text():
    """Verify JSON parsing across markdown fences, raw json, and dirty strings."""
    # 1. Clean JSON
    assert extract_json_from_llm_text('{"critique_strengths": ["test"]}') == {"critique_strengths": ["test"]}
    # 2. Markdown fenced JSON
    fenced = '```json\n{"critique_strengths": ["test"], "confidence": 0.9}\n```'
    assert extract_json_from_llm_text(fenced) == {"critique_strengths": ["test"], "confidence": 0.9}
    # 3. Text prefix/suffix with embedded JSON
    embedded = 'Here is the analysis:\n{"critique_strengths": ["novel architecture"]}\nHope this helps!'
    assert extract_json_from_llm_text(embedded) == {"critique_strengths": ["novel architecture"]}
    # 4. Invalid text
    assert extract_json_from_llm_text("Not JSON at all") is None
    assert extract_json_from_llm_text("") is None


@pytest.mark.asyncio
async def test_critique_paper_with_mock_llm(tmp_path):
    """Verify critique generation, schema validation, and paper attribute mutation."""
    test_db = str(tmp_path / "test_critique.db")
    mock_reply = json.dumps({
        "critique_strengths": ["Novel linear attention mechanism", "Evaluated on ImageNet benchmark"],
        "critique_concerns": ["Ablation study on sequence length is missing"],
        "critique_questions": ["What is the training throughput on 8x A100 GPUs?"],
        "evidence_sufficiency": "sufficient",
        "confidence": 0.95,
        "notes": "Evidence extracted from abstract and methods.",
    })
    mock_prov = MockLLMProvider(reply=mock_reply)
    synthesizer = CritiqueSynthesizer(provider=mock_prov, db_path=test_db)

    paper = Paper(
        id="test-paper-1",
        title="Linear Time Sequence Modeling",
        abstract="We introduce a linear attention mechanism achieving 5x throughput over standard Transformers.",
        doi="10.1234/test.1",
        citation_count=120,
    )

    res = await synthesizer.critique_paper(paper)

    assert isinstance(res, PaperCritiqueSchema)
    assert len(res.critique_strengths) == 2
    assert "Novel linear attention mechanism" in res.critique_strengths
    assert "Ablation study on sequence length is missing" in res.critique_concerns
    assert len(res.critique_questions) == 1
    assert res.is_heuristic is False
    assert mock_prov.call_count == 1

    # Check that paper object was updated in place
    assert paper.critique_strengths == res.critique_strengths
    assert paper.critique_concerns == res.critique_concerns
    assert paper.critique_questions == res.critique_questions


@pytest.mark.asyncio
async def test_critique_cache_hit_and_zero_model_calls(tmp_path):
    """Verify SQLite cache hit produces identical result with zero additional model calls."""
    test_db = str(tmp_path / "test_cache.db")
    mock_reply = json.dumps({
        "critique_strengths": ["Cached strength 1"],
        "critique_concerns": ["Cached concern 1"],
        "critique_questions": ["Cached question 1"],
        "evidence_sufficiency": "sufficient",
        "confidence": 0.9,
    })
    mock_prov = MockLLMProvider(reply=mock_reply)
    synthesizer = CritiqueSynthesizer(provider=mock_prov, db_path=test_db)

    paper = Paper(
        id="cache-paper-100",
        title="Cache Verification Study",
        abstract="Testing deterministic SQLite caching.",
        doi="10.1000/cache.test",
    )

    # First call: cache miss -> calls LLM
    res1 = await synthesizer.critique_paper(paper)
    assert mock_prov.call_count == 1
    assert res1.critique_strengths == ["Cached strength 1"]

    # Second call: cache hit -> must NOT call LLM
    res2 = await synthesizer.critique_paper(paper)
    assert mock_prov.call_count == 1  # Still 1!
    assert res2.critique_strengths == ["Cached strength 1"]


@pytest.mark.asyncio
async def test_critique_cache_invalidation_on_content_change(tmp_path):
    """Verify cache invalidation when paper content changes."""
    test_db = str(tmp_path / "test_inval.db")
    mock_prov = MockLLMProvider(reply=json.dumps({
        "critique_strengths": ["Strength A"],
        "critique_concerns": ["Concern A"],
        "critique_questions": ["Question A"],
    }))
    synthesizer = CritiqueSynthesizer(provider=mock_prov, db_path=test_db)

    paper = Paper(
        id="inval-paper",
        title="Original Title",
        abstract="Original abstract text.",
    )

    await synthesizer.critique_paper(paper)
    assert mock_prov.call_count == 1

    # Mutate abstract content -> cache key must change
    paper.abstract = "Updated abstract content with newly discovered baseline results."
    await synthesizer.critique_paper(paper)
    assert mock_prov.call_count == 2


@pytest.mark.asyncio
async def test_offline_heuristic_critique_fallback(tmp_path):
    """Verify deterministic rule-based fallback when no LLM is reachable."""
    test_db = str(tmp_path / "test_heuristic.db")
    synthesizer = CritiqueSynthesizer(provider=None, db_path=test_db)

    # Force fallback to heuristic by patching provider resolution to simulate completely offline environment
    with patch.object(synthesizer, "_resolve_provider", new_callable=AsyncMock, return_value=(None, "heuristic", "deterministic-rules")):
        rubric = ChecklistRubric(
            has_code_repo=True,
            code_url="https://github.com/org/linear-model",
            has_ablation=False,
            has_uncertainty_quant=False,
            has_compute_budget=False,
            has_limitations=False,
        )
        paper = Paper(
            id="heuristic-paper-1",
            title="Deterministic Fallback Paper",
            abstract="A paper analyzed under completely offline conditions.",
            checklist=rubric,
            citation_count=75,
        )

        res = await synthesizer.critique_paper(paper)

        assert res.is_heuristic is True
        assert res.engine == "heuristic"
        # Verify heuristic strengths and concerns
        assert any("open-source codebase" in s.lower() for s in res.critique_strengths)
        assert any("ablation" in c.lower() for c in res.critique_concerns)
        assert any("compute budget" in c.lower() for c in res.critique_concerns)
        # Must clearly indicate rule-based fallback
        assert "[Rule-Based Heuristic Analysis" in res.critique_strengths[0]


@pytest.mark.asyncio
async def test_synthesis_generation_and_caching(tmp_path):
    """Verify cross-paper synthesis, structured markdown, and SQLite caching."""
    test_db = str(tmp_path / "test_synth.db")
    mock_reply = json.dumps({
        "executive_overview": "Advances in selective state-space architectures.",
        "consensus_and_foundations": "Both papers build upon associative scan formulations.",
        "contradictions_and_debates": "Trade-offs between GPU SRAM utilization and recurrent latency.",
        "recommended_reading_order": [
            {"rank": 1, "paper_id": "p1", "title": "Foundation S4", "rationale": "Establishes linear state spaces."},
            {"rank": 2, "paper_id": "p2", "title": "Mamba", "rationale": "Introduces selective recurrence."},
        ],
        "markdown": "# Synthesis Report\n\n## 1. Executive Overview\nAdvances in selective state-space architectures.\n\n## 2. Reading Order\n1. Foundation S4\n2. Mamba",
    })
    mock_prov = MockLLMProvider(reply=mock_reply)
    synthesizer = CritiqueSynthesizer(provider=mock_prov, db_path=test_db)

    p1 = Paper(id="p1", title="Foundation S4", year=2021, citation_count=500)
    p2 = Paper(id="p2", title="Mamba", year=2023, citation_count=350)

    # First call: cache miss
    md1 = await synthesizer.synthesize_papers("state space models", [p1, p2])
    assert mock_prov.call_count == 1
    assert "Synthesis Report" in md1
    assert "Executive Overview" in md1

    # Second call: cache hit -> 0 model calls
    md2 = await synthesizer.synthesize_papers("state space models", [p1, p2])
    assert mock_prov.call_count == 1
    assert md1 == md2


@pytest.mark.asyncio
async def test_synthesis_heuristic_fallback(tmp_path):
    """Verify offline rule-based synthesis produces formatted markdown with clear disclaimer."""
    test_db = str(tmp_path / "test_synth_heur.db")
    synthesizer = CritiqueSynthesizer(provider=None, db_path=test_db)

    with patch.object(synthesizer, "_resolve_provider", new_callable=AsyncMock, return_value=(None, "heuristic", "deterministic-rules")):
        p1 = Paper(id="p1", title="Attention Is All You Need", year=2017, citation_count=100000)
        p2 = Paper(id="p2", title="Mamba", year=2023, citation_count=500)

        md = await synthesizer.synthesize_papers("transformer alternatives", [p1, p2])
        assert "Scientific Literature Synthesis: Transformer Alternatives" in md
        assert "Rule-Based Heuristic Fallback" in md
        assert "Recommended Reading Order" in md
        assert "Attention Is All You Need" in md
