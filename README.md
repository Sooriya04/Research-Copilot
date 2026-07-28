# Research Copilot 🚀

> **An Autonomous AI Research Engineering Platform**

Research Copilot is an AI-powered platform designed to assist researchers throughout the complete scientific research lifecycle—from discovering literature and identifying research gaps to executing experiments, reproducing published methods, and writing publication-ready manuscripts.

Unlike traditional chatbots or search engines that only summarize paper text, Research Copilot functions as an **AI Research Engineer** capable of executing reproducible code experiments, modifying model architectures, comparing baseline results, and preserving strict citation integrity.

<br />

---

## 🏛️ System Architecture Flow

```mermaid
flowchart TD
    A[Researcher]
    B[Enter Research Topic]
    C[Research Orchestrator]

    A --> B
    B --> C

    %% ==========================
    %% Research Sources
    %% ==========================

    C --> ARXIV[arXiv API]
    C --> PWC[Papers with Code API]
    C --> HF[Hugging Face Hub API]
    C --> KG[Kaggle API]
    C --> OA[OpenAlex API]
    C --> SS[Semantic Scholar API]
    C --> CR[Crossref API]
    C --> PM[PubMed / Entrez API]

    ARXIV --> URD
    PWC --> URD
    HF --> URD
    KG --> URD
    OA --> URD
    SS --> URD
    CR --> URD
    PM --> URD

    %% ==========================
    %% Unified Research Data
    %% ==========================

    URD[Unified Research Data]

    URD --> META[Metadata]
    URD --> ABS[Abstracts]
    URD --> PAPER[Full Papers]
    URD --> DATASETS[Datasets]
    URD --> CODE[Source Code]
    URD --> BENCH[Benchmarks]

    %% ==========================
    %% Agentic RAG
    %% ==========================

    META --> RAG
    ABS --> RAG
    PAPER --> RAG
    DATASETS --> RAG
    CODE --> RAG
    BENCH --> RAG

    RAG[Agentic RAG]

    RAG --> EMB[Embedding]
    RAG --> CHUNK[Chunking]
    RAG --> HYBRID[Hybrid Retrieval]
    RAG --> RERANK[Reranking]
    RAG --> KGGRAPH[Knowledge Graph]

    %% ==========================
    %% Knowledge Base
    %% ==========================

    EMB --> KB
    CHUNK --> KB
    HYBRID --> KB
    RERANK --> KB
    KGGRAPH --> KB

    KB[Research Knowledge Base]

    %% ==========================
    %% Research Intelligence
    %% ==========================

    KB --> SUM[Paper Summarization]
    KB --> RELATED[Related Work Discovery]
    KB --> GAP[Research Gap Detection]
    KB --> IDEA[Novel Idea Generation]
    KB --> PLAN[Experiment Planning]

    %% ==========================
    %% Coding Agents
    %% ==========================

    PLAN --> ROUTER[MCP Skill Router]

    ROUTER --> CLAUDE[Claude Code]
    ROUTER --> CODEX[OpenAI Codex]
    ROUTER --> OPENCODE[OpenCode]

    CLAUDE --> PIPE
    CODEX --> PIPE
    OPENCODE --> PIPE

    PIPE[Experiment Pipeline]

    %% ==========================
    %% Experiment Pipeline
    %% ==========================

    PIPE --> DOWNLOAD[Download Dataset]
    PIPE --> REPRO[Reproduce Paper]
    PIPE --> MODIFY[Modify Architecture]
    PIPE --> SEARCH[Hyperparameter Search]
    PIPE --> TRAIN[Model Training]
    PIPE --> EVAL[Evaluation]
    PIPE --> COMPARE[Benchmark Comparison]

    DOWNLOAD --> RESULTS
    REPRO --> RESULTS
    MODIFY --> RESULTS
    SEARCH --> RESULTS
    TRAIN --> RESULTS
    EVAL --> RESULTS
    COMPARE --> RESULTS

    RESULTS[Experimental Results]

    %% ==========================
    %% Paper Generation
    %% ==========================

    RESULTS --> WRITER[Gemini / Grok]

    WRITER --> ABSTRACT[Abstract]
    WRITER --> INTRO[Introduction]
    WRITER --> RELATEDWORK[Related Work]
    WRITER --> METHOD[Methodology]
    WRITER --> EXPERIMENTS[Experiments]
    WRITER --> RES[Results]
    WRITER --> DISCUSSION[Discussion]
    WRITER --> CONCLUSION[Conclusion]

    ABSTRACT --> DRAFT
    INTRO --> DRAFT
    RELATEDWORK --> DRAFT
    METHOD --> DRAFT
    EXPERIMENTS --> DRAFT
    RES --> DRAFT
    DISCUSSION --> DRAFT
    CONCLUSION --> DRAFT

    DRAFT[Research Paper Draft]
```

<br />

---

## 🎯 Key Capabilities

* **Multi-Source Aggregation**: Automated metadata & artifact retrieval across 8 scientific repositories (arXiv, Papers with Code, Hugging Face, Kaggle, OpenAlex, Semantic Scholar, Crossref, PubMed).
* **Agentic RAG & Knowledge Graph**: Relational subgraphs connecting papers, code repositories, benchmarks, datasets, and authors with hybrid search & re-ranking.
* **Autonomous Experiment Execution**: Routing execution directives via MCP to coding agents (Claude Code, OpenAI Codex, OpenCode) for training, hyperparameter search, and evaluation.
* **Publication-Ready Paper Drafting**: Synthesis of empirical evidence into 8 structured LaTeX paper sections with verified citation attribution.

<br />

---

## 📚 Documentation Index

The full system documentation is organized cleanly in the [`docs/`](./docs) directory:

* 🏛️ **[System Architecture](./docs/architecture.md)** — Comprehensive technical spec, 10 modular services, RAG design, and MCP router.
* 🔄 **[Research Workflow](./docs/workflow.md)** — The 12-stage research engineering process from topic definition to manuscript publication.
* 🗺️ **[Development Roadmap](./docs/roadmap.md)** — Implementation phases and milestone checklists for building the platform.
* 🤖 **[AI Agent Guidelines](./AGENTS.md)** — Operational constraints, design principles, and guidelines for AI agents working in this repository.

<br />

---

## ⚡ Quick Start

*(Service components and API setup instructions will be updated as modules are built. Follow progress in the [Development Roadmap](./docs/roadmap.md)).*
