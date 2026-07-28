# System Architecture

Research Copilot follows a decoupled, modular 10-layer architecture. Every component has a single, well-defined responsibility, allowing data ingestion, retrieval, reasoning, code execution, and document generation to operate independently.

<br />

---

## 📊 Complete Architecture Flowchart

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

## 🏛️ Core Architectural Subsystems

### 1. Data Ingestion & Unification
The `Research Orchestrator` manages parallel calls to 8 primary scientific APIs:
* **arXiv API**: Retrieves paper preprints, LaTeX source bundles, and author data.
* **Papers with Code API**: Obtains leaderboard benchmarks, evaluation tables, and repository links.
* **Hugging Face Hub API**: Collects model weights, dataset metadata, and README cards.
* **Kaggle API**: Fetches competition datasets, code notebooks, and baseline scores.
* **OpenAlex API**: Maps global scholarly entities, citations, and institutional networks.
* **Semantic Scholar API**: Provides paper influence graphs and TLDR summaries.
* **Crossref API**: Accesses publisher metadata and DOI registration records.
* **PubMed / Entrez API**: Accesses life science literature and MeSH indexing.

All outputs are unified into structured data categories: *Metadata*, *Abstracts*, *Full Papers*, *Datasets*, *Source Code*, and *Benchmarks*.

<br />

### 2. Agentic RAG Engine
* **Embedding & Chunking**: Performs semantic section-aware chunking and multi-modal embedding generation.
* **Hybrid Retrieval**: Integrates sparse keyword matching (BM25) with dense semantic vector search.
* **Reranking**: Scores retrieved context based on scientific context relevance.
* **Knowledge Graph Construction**: Constructs subgraphs linking papers $\leftrightarrow$ authors $\leftrightarrow$ datasets $\leftrightarrow$ code repos $\leftrightarrow$ benchmarks.

<br />

### 3. Research Intelligence
Extracts actionable insights from the **Research Knowledge Base**:
* Paper Summarization
* Related Work Discovery
* Research Gap Detection
* Novel Idea Generation
* Experiment Planning

<br />

### 4. MCP Skill Router & AI Coding Agents
* **MCP Router**: Translates experiment plans into executable MCP tool invocations.
* **Agent Ecosystem**: Dispatches code execution tasks to specialized agents (**Claude Code**, **OpenAI Codex**, **OpenCode**).
* **Containerized Pipeline**:
  $$\text{Download Dataset} \rightarrow \text{Reproduce Paper} \rightarrow \text{Modify Architecture} \rightarrow \text{Hyperparameter Search} \rightarrow \text{Model Training} \rightarrow \text{Evaluation} \rightarrow \text{Benchmark Comparison}$$

<br />

### 5. Structured Paper Generation
* **Synthesis Engine (Gemini / Grok)**: Merges empirical results from code execution runs with retrieved background evidence.
* **8 Section Drafts**: Generates *Abstract, Introduction, Related Work, Methodology, Experiments, Results, Discussion, Conclusion*.
* **Output**: Assembles a fully referenced, publication-ready LaTeX research paper draft.
