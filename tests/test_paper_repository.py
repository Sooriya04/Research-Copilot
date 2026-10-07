import pytest
from src.core.canonical_models import (
    AuthorEntity, BenchmarkEvidence, CanonicalPaper, CodeRepository,
    ExtractedClaim, PaperSectionEntity, PaperSectionType, SourceMetadata,
    StructuredPaperSummary, VerificationStatus
)
from src.core.database import get_db_session
from src.core.paper_repository import PaperRepository

@pytest.mark.asyncio
async def test_normalized_paper_persistence_and_caching():
    async with get_db_session() as db:
        paper = CanonicalPaper(
            canonical_id="doi:10.1038/s41586-021-03819-2",
            title="Highly accurate protein structure prediction with AlphaFold",
            abstract="Proteins are essential to life. Predicting their 3D structure has been a 50-year challenge.",
            authors=[AuthorEntity(name="John Jumper", affiliation="DeepMind")],
            doi="10.1038/s41586-021-03819-2",
            year=2021,
            citation_count=18000,
            is_open_access=True,
            sources=[
                SourceMetadata(source_name="openalex", external_id="W3175854817", is_primary=True)
            ],
            sections=[
                PaperSectionEntity(
                    title="1. Introduction",
                    section_type=PaperSectionType.PROBLEM,
                    content="Accurate computational prediction of 3D protein structures.",
                    order_index=0,
                    token_count=10
                ),
                PaperSectionEntity(
                    title="2. Method Architecture",
                    section_type=PaperSectionType.METHOD,
                    content="Evoformer neural network and structural module.",
                    order_index=1,
                    token_count=10
                )
            ],
            benchmarks=[
                BenchmarkEvidence(
                    task="Protein Structure Prediction",
                    dataset="CASP14",
                    metric="GDT-TS",
                    value="92.4",
                    model="AlphaFold2"
                )
            ],
            code_repositories=[
                CodeRepository(url="https://github.com/deepmind/alphafold", is_official=True, stars=15000)
            ],
            summary=StructuredPaperSummary(
                problem="50-year grand challenge in structural biology.",
                contributions=["Evoformer architecture", "End-to-end differentiable structure module"],
                methodology="Iterative refinement on MSAs and structural templates.",
                experiments="Evaluated on blind CASP14 targets achieving median 0.96 A RMSD.",
                limitations=["Multi-chain quaternary complex modeling challenges"],
                open_questions=["Conformational dynamics in solution"],
                claims=[
                    ExtractedClaim(
                        claim="AlphaFold2 achieves median GDT-TS of 92.4 on CASP14",
                        metric="GDT-TS",
                        value="92.4",
                        confidence=0.98,
                        verification_status=VerificationStatus.VERIFIED
                    )
                ]
            )
        )

        # 1. Save to SQLite
        saved = await PaperRepository.save_canonical_paper(db, paper)
        assert saved.canonical_id == "doi:10.1038/s41586-021-03819-2"

        # 2. Retrieve by Canonical ID
        loaded = await PaperRepository.get_by_canonical_id(db, "doi:10.1038/s41586-021-03819-2")
        assert loaded is not None
        assert loaded.title == "Highly accurate protein structure prediction with AlphaFold"
        assert len(loaded.sections) == 2
        assert loaded.sections[0].section_type == PaperSectionType.PROBLEM
        assert len(loaded.benchmarks) == 1
        assert loaded.benchmarks[0].dataset == "CASP14"
        assert len(loaded.code_repositories) == 1
        assert loaded.summary is not None
        assert len(loaded.summary.claims) == 1
        assert loaded.summary.claims[0].verification_status == VerificationStatus.VERIFIED

        # 3. Retrieve by DOI
        by_doi = await PaperRepository.get_by_doi_or_arxiv(db, doi="10.1038/s41586-021-03819-2")
        assert by_doi is not None
        assert by_doi.canonical_id == loaded.canonical_id


@pytest.mark.asyncio
async def test_benchmark_persistence_by_arxiv_id():
    """Verify storing and querying benchmarks in SQLite by arXiv ID e.g. 2310.06625."""
    async with get_db_session() as db:
        benchmarks = [
            BenchmarkEvidence(
                source="paperswithcode",
                task="Multivariate Time Series Forecasting",
                dataset="Electricity",
                metric="MSE",
                value="0.141",
                model="iTransformer",
                split="test",
            ),
            BenchmarkEvidence(
                source="paperswithcode",
                task="Multivariate Time Series Forecasting",
                dataset="Traffic",
                metric="MAE",
                value="0.258",
                model="iTransformer",
                split="test",
            ),
        ]
        repos = [
            CodeRepository(
                url="https://github.com/thuml/iTransformer",
                is_official=True,
                framework="pytorch",
                stars=1250,
            )
        ]

        # 1. Save with arXiv ID 2310.06625
        await PaperRepository.save_benchmarks_and_repos(
            db=db,
            benchmarks=benchmarks,
            repositories=repos,
            arxiv_id="2310.06625",
            title="iTransformer: Inverted Transformers Are Effective for Time Series Forecasting",
        )

        # 2. Query with clean arXiv ID "2310.06625"
        res = await PaperRepository.get_benchmarks_and_repos(db, arxiv_id="2310.06625")
        assert res is not None
        loaded_benchmarks, loaded_repos = res
        assert len(loaded_benchmarks) == 2
        assert loaded_benchmarks[0].dataset in ["Electricity", "Traffic"]
        assert len(loaded_repos) == 1
        assert "thuml/iTransformer" in loaded_repos[0].url

        # 3. Query with prefixed arXiv ID "arxiv:2310.06625v1" - should normalize and hit cache
        res2 = await PaperRepository.get_benchmarks_and_repos(db, arxiv_id="arxiv:2310.06625v1")
        assert res2 is not None
        loaded_benchmarks2, _ = res2
        assert len(loaded_benchmarks2) == 2
