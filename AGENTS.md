# Research Copilot

Research Copilot is an AI-powered research engineering platform designed to assist researchers throughout the complete research lifecycle, from discovering scientific literature to reproducing experiments and generating publication-ready research papers.

Unlike traditional AI chatbots that only summarize papers, Research Copilot functions as an intelligent research assistant capable of understanding research papers, identifying research gaps, discovering related work, reproducing existing methods, modifying architectures, running experiments, evaluating results, and generating structured research drafts.

The platform aggregates knowledge from multiple trusted scientific sources including arXiv, Papers with Code, Hugging Face, Kaggle, OpenAlex, Semantic Scholar, Crossref, and PubMed. Information collected from these sources is unified into a structured research knowledge base consisting of metadata, abstracts, full papers, datasets, source code repositories, benchmarks, and citations.

Research Copilot uses an Agentic Retrieval-Augmented Generation (Agentic RAG) pipeline that combines document parsing, semantic chunking, embedding generation, hybrid retrieval, reranking, citation tracking, and knowledge graph construction. Instead of retrieving isolated documents, the system builds relationships between papers, datasets, authors, implementations, benchmarks, and experimental results to improve reasoning accuracy.

The primary objective of the platform is not simply answering questions but assisting researchers in making research decisions. This includes understanding existing work, identifying limitations in current methods, suggesting novel research directions, generating implementation plans, reproducing published experiments, comparing new methods against state-of-the-art baselines, and producing publication-ready research paper drafts.

Research Copilot integrates with external AI coding agents such as Claude Code, OpenAI Codex, OpenCode, and future code-generation systems through an execution pipeline. These agents may be used to download repositories, resolve dependencies, modify model architectures, reproduce papers, perform hyperparameter optimization, execute experiments, evaluate benchmarks, and collect reproducible results.

The platform follows a modular architecture where every component has a single responsibility. Data collection, indexing, retrieval, reasoning, experiment execution, evaluation, and document generation remain independent services that communicate through well-defined interfaces. New research sources, models, datasets, or execution engines should be easily integrated without modifying existing components.

Every generated output must prioritize factual correctness, proper source attribution, reproducibility, and citation integrity. AI-generated content must always be grounded in retrieved evidence whenever possible. Hallucinated citations, fabricated experimental results, or unsupported scientific claims are unacceptable.

Research Copilot is designed to become an autonomous research engineering platform that helps transform scientific ideas into reproducible experiments and publication-quality research while keeping the human researcher in control of every critical decision.

---

# AI Agent Guidelines

When contributing to this project, always prioritize modularity, maintainability, and scalability.

Every component should have a clearly defined responsibility.

Preferred architecture:

- **Data Collection**: Fetch literature and artifacts from arXiv, OpenAlex, Semantic Scholar, Papers with Code, Hugging Face, PubMed, etc.
- **Document Processing**: Parsing PDFs, structured chunking, LaTeX extraction, metadata extraction.
- **Knowledge Extraction**: Entity extraction (datasets, models, architectures, metrics, hyperparams).
- **Agentic RAG**: Multi-hop retrieval, hybrid search (keyword + vector), reranking, context synthesis.
- **Knowledge Graph**: Subgraph generation linking papers ↔ authors ↔ code ↔ datasets ↔ benchmarks.
- **Research Reasoning**: Gap identification, hypothesis formation, literature synthesis.
- **Experiment Planning**: Step-by-step reproduction plans, dataset setup, hardware budget, metric definitions.
- **Code Execution**: Containerized/sandboxed execution, dependency resolution, model training, evaluation runs.
- **Benchmark Evaluation**: Standardized evaluation protocols, SOTA comparisons, metric logging.
- **Paper Generation**: Structured LaTeX generation, citation management, figure/table generation.

Avoid tightly coupling unrelated functionality.

Prefer composition over large monolithic classes.

Write reusable modules with clean interfaces.

Every external API should have an abstraction layer.

Every long-running task should support asynchronous execution.

Every experiment should be reproducible.

All generated research outputs should preserve citations and source references.

Assume this project will eventually scale to thousands of research papers, datasets, repositories, and concurrent research sessions.

---

# Project Philosophy

Research Copilot is not a chatbot.

It is not a search engine.

It is not a paper summarizer.

It is an AI Research Engineer.

The goal is to help researchers:

- Discover knowledge.
- Understand existing work.
- Identify research gaps.
- Generate novel ideas.
- Plan implementations.
- Reproduce published research.
- Improve existing methods.
- Execute experiments.
- Compare results.
- Produce publication-ready research.

Every feature should move the researcher closer to completing high-quality scientific research.
