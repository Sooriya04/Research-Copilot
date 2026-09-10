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
