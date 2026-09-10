import pytest
from src.core.canonical_models import BenchmarkEvidence, CodeRepository
from src.engines.paperswithcode import PapersWithCodeClient

def test_benchmark_evidence_schema():
    bench = BenchmarkEvidence(
        source="paperswithcode",
        task="Language Modeling",
        dataset="Wikitext-103",
        metric="Perplexity",
        value="15.8",
        model="Transformer-XL",
        split="test",
        repository_url="https://github.com/kimiyoung/transformer-xl"
    )
    assert bench.task == "Language Modeling"
    assert bench.metric == "Perplexity"
    assert bench.value == "15.8"
    assert bench.source == "paperswithcode"

def test_code_repository_schema():
    repo = CodeRepository(
        url="https://github.com/openai/gpt-2",
        is_official=True,
        framework="TensorFlow",
        stars=35000
    )
    assert repo.url == "https://github.com/openai/gpt-2"
    assert repo.stars == 35000
    assert repo.is_official is True

@pytest.mark.asyncio
async def test_paperswithcode_client_initialization():
    client = PapersWithCodeClient()
    assert client.BASE_URL == "https://paperswithcode.com/api/v1"
    # Should safely return empty list without crashing on empty input
    benchmarks = await client.get_paper_benchmarks(arxiv_id=None, title=None)
    assert benchmarks == []
