"""
Evidence Dossier Exporter for Research Copilot / Trace Studio.
Generates standalone, publication-grade research dossiers across multiple formats:
1. Markdown (.md) with YAML frontmatter, audit badges, metrics, claims, and reproduction roadmap.
2. Structured JSON (.json) for machine-readable pipeline consumption.
3. Standalone academic LaTeX (.tex) with booktabs, tcolorbox, and structured tables.
"""

import json
import re
from typing import Any, Dict, List, Optional
from src.core.evidence_schemas import (
    PaperEvidencePackage,
    ClaimItem,
    MetricItem,
    GlossaryItem,
    LimitationItem,
    TimelineStage,
    EvidenceAuditResult,
    ReproductionMap,
)


class EvidenceDossierExporter:
    """Exports structured paper evidence packages into Markdown, JSON, and LaTeX dossiers."""

    def export_json(self, pkg: PaperEvidencePackage) -> Dict[str, Any]:
        """Return machine-readable JSON representation."""
        return pkg.model_dump()

    def export_markdown(self, pkg: PaperEvidencePackage) -> str:
        """Generate high-grade GitHub Flavored Markdown with frontmatter and structured tables."""
        audit = pkg.audit
        repro = pkg.reproduction_map

        # Frontmatter
        lines = [
            "---",
            f"paper_id: \"{pkg.paper_id}\"",
            f"title: \"{self._escape_yaml(pkg.title)}\"",
            f"exported_at: \"{audit.checked_at if audit else 'N/A'}\"",
            f"quote_match_rate: {round((audit.quote_match_rate if audit else 0.0) * 100, 1)}%",
            f"page_coverage_rate: {round((audit.page_coverage_rate if audit else 0.0) * 100, 1)}%",
            f"reproducibility_score: {round(repro.reproducibility_score, 1) if repro else 'N/A'}",
            "---",
            "",
            f"# Research Evidence Dossier: {pkg.title}",
            "",
            "> **Source Paper ID:** `{pkg.paper_id}`  ",
            f"> **Audit Health:** {audit.verified_claims if audit else 0}/{audit.total_claims if audit else 0} Verified Claims "
            f"({round((audit.quote_match_rate if audit else 0.0) * 100, 1)}% Exact Quote Match) | "
            f"Page Coverage: {round((audit.page_coverage_rate if audit else 0.0) * 100, 1)}%",
            "",
            "## 1. Executive Summary & Thesis",
            "",
            f"**Core Thesis:**  \n{pkg.thesis or 'N/A'}",
            "",
            f"**Research Question:**  \n{pkg.research_question or 'N/A'}",
            "",
            f"**Plain-Language Summary:**  \n{pkg.plain_summary or 'N/A'}",
            "",
        ]

        # Key Findings
        if pkg.findings:
            lines.append("### Key Findings")
            for f in pkg.findings:
                lines.append(f"- {f}")
            lines.append("")

        # Methodology Overview
        if pkg.methods:
            lines.append("### Methodology Pipeline")
            for m in pkg.methods:
                lines.append(f"- {m}")
            lines.append("")

        # Metrics & Benchmarks
        lines.extend([
            "## 2. Quantitative Metrics & Benchmarks",
            "",
            "| Metric | Reported Value | Unit | Context / Benchmark | Page |",
            "| :--- | :--- | :--- | :--- | :--- |",
        ])
        if pkg.metrics:
            for m in pkg.metrics:
                page_str = f"p.{m.source_ref.page}" if (m.source_ref and m.source_ref.page) else "—"
                lines.append(
                    f"| **{self._escape_md(m.label)}** | {self._escape_md(m.display_value)} | "
                    f"{self._escape_md(m.unit or '—')} | {self._escape_md(m.context or '—')} | {page_str} |"
                )
        else:
            lines.append("| — | No quantitative metrics extracted | — | — | — |")
        lines.append("")

        # Verified Claims Ledger
        lines.extend([
            "## 3. Verified Claims Ledger",
            "",
            "| Claim ID | Kind | Confidence | Review Status | Statement & Grounded Excerpt |",
            "| :--- | :--- | :--- | :--- | :--- |",
        ])
        if pkg.claims:
            for c in pkg.claims:
                excerpt_text = ""
                if c.source_refs:
                    ref = c.source_refs[0]
                    excerpt_text = f"<br/>*Quote (p.{ref.page or 1}):* \"{self._escape_md(ref.excerpt[:140])}...\""
                lines.append(
                    f"| `{c.id}` | {c.kind.value if hasattr(c.kind, 'value') else c.kind} | "
                    f"**{c.confidence.value if hasattr(c.confidence, 'value') else c.confidence}** | "
                    f"`{c.review_status.value if hasattr(c.review_status, 'value') else c.review_status}` | "
                    f"{self._escape_md(c.statement)}{excerpt_text} |"
                )
        else:
            lines.append("| — | — | — | — | No claims registered |")
        lines.append("")

        # Reproducibility Map
        if repro:
            lines.extend([
                "## 4. Reproducibility Roadmap & Friction Assessment",
                "",
                f"> **Reproducibility Friction Score:** **{round(repro.reproducibility_score, 1)} / 100**  ",
                f"> **Friction Summary:** {repro.friction_summary}",
                "",
                "### Code & Compute Availability",
                f"- **Repository:** {repro.code_availability.repo_url if (repro.code_availability.has_repo and repro.code_availability.repo_url) else 'Not Disclosed'}",
                f"- **Framework:** {repro.code_availability.framework or 'Undisclosed'}",
                f"- **Pretrained Checkpoints:** {'Available' if repro.code_availability.has_checkpoints else 'Re-training Required'}",
                f"- **Hardware Required:** {repro.compute_budget.gpu_type or 'Undisclosed'}"
                + (f" ({repro.compute_budget.gpu_count}x)" if repro.compute_budget.gpu_count else ""),
                f"- **Estimated Compute:** {repro.compute_budget.estimated_hours} GPU Hours" if repro.compute_budget.estimated_hours else "- **Estimated Compute:** Unspecified",
                "",
            ])

            if repro.dataset_checklist:
                lines.append("### Datasets")
                for d in repro.dataset_checklist:
                    lines.append(f"- **{d.name}** (`{d.access_type}`)" + (f": {d.download_url}" if d.download_url else ""))
                lines.append("")

            if repro.steps:
                lines.append("### Step-by-Step Reproduction Sequence")
                for s in repro.steps:
                    cmd_part = f"\n  ```bash\n  {s.suggested_command}\n  ```" if s.suggested_command else ""
                    lines.append(f"1. **[{s.phase.upper()}]** {s.action}{cmd_part}\n  - *Verify:* {s.verification_criteria}")
                lines.append("")

        # Limitations & Assumptions
        if pkg.limitations:
            lines.extend([
                "## 5. Limitations & Boundary Conditions",
                "",
            ])
            for l in pkg.limitations:
                page_str = f" (p.{l.source_ref.page})" if (l.source_ref and l.source_ref.page) else ""
                lines.append(f"- **[{l.kind}]** {l.statement}{page_str}")
            lines.append("")

        # Research Glossary
        if pkg.glossary:
            lines.extend([
                "## 6. Paper-Specific Technical Glossary",
                "",
            ])
            for g in pkg.glossary:
                page_str = f" *(p.{g.source_ref.page})*" if (g.source_ref and g.source_ref.page) else ""
                lines.append(f"- **{g.term}**: {g.definition}{page_str}")
            lines.append("")

        return "\n".join(lines)

    def export_latex(self, pkg: PaperEvidencePackage) -> str:
        """Produce clean, publication-ready standalone compilable LaTeX document."""
        audit = pkg.audit
        repro = pkg.reproduction_map

        title = self._escape_latex(pkg.title or "Research Paper Evidence Dossier")
        thesis = self._escape_latex(pkg.thesis or "Not documented.")
        rq = self._escape_latex(pkg.research_question or "Not documented.")
        summary = self._escape_latex(pkg.plain_summary or "Not documented.")

        latex_lines = [
            r"\documentclass[11pt,a4paper]{article}",
            r"\usepackage[utf8]{inputenc}",
            r"\usepackage[margin=1in]{geometry}",
            r"\usepackage{booktabs}",
            r"\usepackage{xcolor}",
            r"\usepackage{tabularx}",
            r"\usepackage{hyperref}",
            r"\usepackage{tcolorbox}",
            "",
            r"\hypersetup{colorlinks=true, linkcolor=blue!70!black, urlcolor=blue!70!black}",
            "",
            f"\\title{{\\textbf{{Evidence Dossier: {title}}}}}",
            r"\author{Research Copilot Evidence Studio}",
            r"\date{\today}",
            "",
            r"\begin{document}",
            r"\maketitle",
            "",
            r"\begin{abstract}",
            summary,
            r"\end{abstract}",
            "",
            r"\section{Executive Summary \& Grounding}",
            r"\begin{tcolorbox}[colback=blue!5!white,colframe=blue!75!black,title=Core Thesis \& Research Question]",
            f"\\textbf{{Research Question:}} {rq}\\\\[0.5em]",
            f"\\textbf{{Thesis:}} {thesis}",
            r"\end{tcolorbox}",
            "",
        ]

        # Audit score box
        if audit:
            latex_lines.extend([
                r"\begin{tcolorbox}[colback=green!5!white,colframe=green!60!black,title=Evidence Audit Health]",
                f"\\textbf{{Verified Claims:}} {audit.verified_claims} / {audit.total_claims} | ",
                f"\\textbf{{Quote Match Rate:}} {round(audit.quote_match_rate * 100, 1)}\\% | ",
                f"\\textbf{{Page Coverage:}} {round(audit.page_coverage_rate * 100, 1)}\\%",
                r"\end{tcolorbox}",
                "",
            ])

        # Metrics Table
        latex_lines.extend([
            r"\section{Reported Quantitative Metrics}",
            r"\begin{center}",
            r"\begin{tabularx}{\textwidth}{l r l X r}",
            r"\toprule",
            r"\textbf{Metric} & \textbf{Value} & \textbf{Unit} & \textbf{Context / Benchmark} & \textbf{Page} \\",
            r"\midrule",
        ])
        if pkg.metrics:
            for m in pkg.metrics:
                page_str = f"p.~{m.source_ref.page}" if (m.source_ref and m.source_ref.page) else "---"
                latex_lines.append(
                    f"{self._escape_latex(m.label)} & {self._escape_latex(m.display_value)} & "
                    f"{self._escape_latex(m.unit or '---')} & {self._escape_latex(m.context or '---')} & {page_str} \\\\"
                )
        else:
            latex_lines.append(r"\multicolumn{5}{c}{No quantitative metrics extracted} \\")
        latex_lines.extend([
            r"\bottomrule",
            r"\end{tabularx}",
            r"\end{center}",
            "",
        ])

        # Claims
        latex_lines.extend([
            r"\section{Verified Claims Ledger}",
            r"\begin{center}",
            r"\begin{tabularx}{\textwidth}{l l l X}",
            r"\toprule",
            r"\textbf{ID} & \textbf{Kind} & \textbf{Status} & \textbf{Claim Statement} \\",
            r"\midrule",
        ])
        if pkg.claims:
            for c in pkg.claims[:15]:  # Top 15 claims for neat layout
                kind_str = c.kind.value if hasattr(c.kind, 'value') else str(c.kind)
                status_str = c.review_status.value if hasattr(c.review_status, 'value') else str(c.review_status)
                latex_lines.append(
                    f"\\texttt{{{self._escape_latex(c.id)}}} & {self._escape_latex(kind_str)} & "
                    f"{self._escape_latex(status_str)} & {self._escape_latex(c.statement)} \\\\"
                )
        else:
            latex_lines.append(r"\multicolumn{4}{c}{No claims extracted} \\")
        latex_lines.extend([
            r"\bottomrule",
            r"\end{tabularx}",
            r"\end{center}",
            "",
        ])

        # Reproduction Roadmap
        if repro:
            latex_lines.extend([
                r"\section{Reproducibility Roadmap}",
                f"\\textbf{{Reproducibility Score:}} {round(repro.reproducibility_score, 1)} / 100\\\\",
                f"\\textbf{{Friction Summary:}} {self._escape_latex(repro.friction_summary)}\\\\",
                r"\begin{itemize}",
                f"\\item \\textbf{{Code Repository:}} \\url{{{repro.code_availability.repo_url}}}" if (repro.code_availability.has_repo and repro.code_availability.repo_url) else r"\item \textbf{Code Repository:} Not Disclosed",
                f"\\item \\textbf{{Framework:}} {self._escape_latex(repro.code_availability.framework or 'Undisclosed')}",
                f"\\item \\textbf{{Compute Budget:}} {self._escape_latex(repro.compute_budget.gpu_type or 'Undisclosed')}",
                r"\end{itemize}",
                "",
            ])
            if repro.steps:
                latex_lines.append(r"\subsection*{Reproduction Steps}")
                latex_lines.append(r"\begin{enumerate}")
                for s in repro.steps:
                    latex_lines.append(f"\\item \\textbf{{[{s.phase.upper()}]}} {self._escape_latex(s.action)}")
                    if s.suggested_command:
                        latex_lines.append(f"\\\\\\texttt{{{self._escape_latex(s.suggested_command)}}}")
                latex_lines.append(r"\end{enumerate}")
                latex_lines.append("")

        latex_lines.append(r"\end{document}")
        return "\n".join(latex_lines)

    def _escape_yaml(self, text: str) -> str:
        return text.replace('"', '\\"').replace("\n", " ").strip()

    def _escape_md(self, text: str) -> str:
        return text.replace("|", "\\|").replace("\n", " ").strip()

    def _escape_latex(self, text: str) -> str:
        replacements = [
            ("\\", r"\textbackslash{}"),
            ("&", r"\&"),
            ("%", r"\%"),
            ("$", r"\$"),
            ("#", r"\#"),
            ("_", r"\_"),
            ("{", r"\{"),
            ("}", r"\}"),
            ("~", r"\textasciitilde{}"),
            ("^", r"\textasciicircum{}"),
        ]
        out = str(text)
        for orig, rep in replacements:
            out = out.replace(orig, rep)
        return out
