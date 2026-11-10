import pytest
from src.core.evidence_schemas import (
    PaperEvidencePackage,
    ClaimItem,
    ClaimKind,
    ClaimConfidence,
    ClaimReviewStatus,
    MetricItem,
    SourceReference,
    LimitationItem,
    GlossaryItem,
    EvidenceAuditResult,
    CodeAvailability,
    ComputeBudget,
    ReproductionMap,
    ReproductionStep,
    DatasetChecklist,
)
from src.engines.dossier_exporter import EvidenceDossierExporter


@pytest.fixture
def sample_evidence_package():
    return PaperEvidencePackage(
        paper_id="2106.09685",
        title="LoRA: Low-Rank Adaptation of Large Language Models",
        thesis="Freezes pre-trained model weights and injects trainable rank decomposition matrices.",
        plain_summary="LoRA reduces GPU memory footprint by 3x and trainable parameters by 10,000x.",
        research_question="Can parameter-efficient fine-tuning match full model fine-tuning quality?",
        methods=["Low-Rank Matrix Decomposition", "Frozen Foundation Backbone"],
        findings=["Matches full fine-tuning on RoBERTa and GPT-3", "Zero inference latency overhead"],
        claims=[
            ClaimItem(
                id="claim-1",
                statement="LoRA reduces trainable parameters by 10,000 times without quality loss.",
                kind=ClaimKind.REPORTED_RESULT,
                confidence=ClaimConfidence.VERIFIED,
                review_status=ClaimReviewStatus.ACCEPTED,
                source_refs=[SourceReference(page=1, excerpt="reduces trainable parameters by 10,000 times", exact_match=True)],
            )
        ],
        metrics=[
            MetricItem(
                id="metric-1",
                label="Trainable Parameters Reduction",
                display_value="10,000x",
                context="GPT-3 175B fine-tuning",
                source_ref=SourceReference(page=1, excerpt="10,000x reduction"),
            )
        ],
        glossary=[
            GlossaryItem(term="LoRA", definition="Low-Rank Adaptation of large language models")
        ],
        limitations=[
            LimitationItem(id="lim-1", statement="Batching inputs with different adapter configurations is non-trivial")
        ],
        audit=EvidenceAuditResult(
            checked_at="2026-11-10T20:00:00Z",
            paper_id="2106.09685",
            page_count=14,
            total_claims=1,
            verified_claims=1,
            quote_match_rate=1.0,
            page_coverage_rate=0.8,
        ),
        reproduction_map=ReproductionMap(
            paper_id="2106.09685",
            reproducibility_score=85.0,
            code_availability=CodeAvailability(
                has_repo=True,
                repo_url="https://github.com/microsoft/LoRA",
                framework="PyTorch",
                has_checkpoints=True,
                dependencies=["torch", "transformers"],
            ),
            compute_budget=ComputeBudget(
                hardware_mentioned=True,
                gpu_type="A100",
                gpu_count=8,
                estimated_hours=48.0,
            ),
            dataset_checklist=[
                DatasetChecklist(name="GLUE", access_type="public")
            ],
            steps=[
                ReproductionStep(
                    step_number=1,
                    phase="setup",
                    action="Clone repository and install dependencies",
                    suggested_command="pip install loralib",
                    verification_criteria="Python package imported successfully",
                )
            ],
            missing_critical_elements=[],
            friction_summary="Low Friction (Public Repository & Standard Hardware)",
        ),
    )


def test_export_markdown(sample_evidence_package):
    exporter = EvidenceDossierExporter()
    md = exporter.export_markdown(sample_evidence_package)
    assert "# Research Evidence Dossier" in md
    assert "LoRA: Low-Rank Adaptation" in md
    assert "https://github.com/microsoft/LoRA" in md
    assert "10,000x" in md
    assert "Reproducibility Friction Score:" in md


def test_export_json(sample_evidence_package):
    exporter = EvidenceDossierExporter()
    data = exporter.export_json(sample_evidence_package)
    assert data["paper_id"] == "2106.09685"
    assert len(data["claims"]) == 1
    assert data["reproduction_map"]["reproducibility_score"] == 85.0


def test_export_latex(sample_evidence_package):
    exporter = EvidenceDossierExporter()
    tex = exporter.export_latex(sample_evidence_package)
    assert r"\documentclass" in tex
    assert r"\begin{document}" in tex
    assert r"\end{document}" in tex
    assert "LoRA" in tex
    assert "10,000x" in tex
