# Research Copilot — Agentic Architecture Specification

You are helping build **Research Copilot**, an AI Research Engineering platform.

Research Copilot is **not a chatbot, search engine, or paper summarizer**.

Its long-term goal is to function as an **AI Research Engineer** that can take a research question or existing paper and assist through:

Research Question → Literature Discovery → Understanding → Knowledge Extraction → Gap Analysis → Novelty Analysis → Hypothesis → Experiment Planning → Implementation → Reproduction → Experimentation → Evaluation → Verification → Paper Generation.

---

# 1. Core Architecture Philosophy

Use a **hybrid Agentic RAG + Graph + Loop architecture**.

Do NOT build the entire system as:

```text
User → One giant autonomous agent → Answer
```

Instead use:

```text
User
 ↓
Research Orchestrator
 ↓
LangGraph Research Workflow
 ↓
Specialized Research Agents
 ↓
Tools / Services / Execution Engines
 ↓
Shared Research State
 ↓
Critics / Verification
 ↓
Replanning Loops
 ↓
Research Output
```

The architecture must remain:

* Modular
* Observable
* Reproducible
* Extensible
* Fault tolerant
* Human controllable
* Suitable for long-running research tasks

---

# 2. Agent Design Principle

Use **hardcoded specialist capabilities**, but allow the orchestrator to dynamically decide:

* which capability to invoke
* when to invoke it
* what input to provide
* whether another agent is required
* whether the current result is sufficient
* whether to retry
* whether to re-plan

Do NOT initially allow the LLM to arbitrarily create Python agents at runtime.

The system should define trusted specialist agents such as:

```text
ResearchPlannerAgent
LiteratureSearchAgent
PaperReaderAgent
KnowledgeExtractionAgent
CitationAgent
NoveltyAgent
GapAnalysisAgent
HypothesisAgent
ExperimentPlannerAgent
CodeAgent
ReproductionAgent
ExperimentAgent
EvaluationAgent
CriticAgent
ResearchSynthesizerAgent
PaperWriterAgent
```

These agents are reusable capabilities.

The orchestrator determines their execution order.

---

# 3. Orchestrator

Create a central:

```text
Research Orchestrator
```

Its responsibility is NOT to perform all research itself.

Its responsibility is:

```text
Understand Research Goal
        ↓
Decompose Problem
        ↓
Create Research Plan
        ↓
Select Agents
        ↓
Execute Agents
        ↓
Inspect Results
        ↓
Evaluate Evidence
        ↓
Re-plan if Necessary
        ↓
Trigger Verification
        ↓
Move Research Toward Completion
```

The orchestrator should behave like a **research project manager / control plane**, while specialist agents perform the actual research tasks.

---

# 4. LangGraph

Use **LangGraph as the workflow/state orchestration layer**.

The graph should not simply be a linear chain.

It should support:

* branching
* conditional routing
* loops
* retries
* checkpoints
* state updates
* human approval
* re-planning
* long-running workflows

Example:

```text
START
 ↓
Research Planning
 ↓
Literature Discovery
 ↓
Evidence Retrieval
 ↓
Paper Analysis
 ↓
Knowledge Extraction
 ↓
Gap Analysis
 ↓
Novelty Analysis
 ↓
Hypothesis
 ↓
Experiment Planning
 ↓
Implementation
 ↓
Experiment
 ↓
Evaluation
 ↓
Critic
 ↓
 ┌───────────────┐
 │ Result valid? │
 └───────┬───────┘
      NO │ YES
         │
         ↓
      Re-plan
         │
         └──────────────→ Experiment
                             
YES
 ↓
Research Synthesis
 ↓
Paper Generation
 ↓
Verification
 ↓
END
```

The actual graph should be **state-driven rather than blindly sequential**.

---

# 5. Shared Research State

All agents should operate around a shared structured research state.

Conceptually:

```python
ResearchState = {

    "research_question": ...,

    "research_goal": ...,

    "research_plan": ...,

    "papers": [],

    "evidence": [],

    "citations": [],

    "authors": [],

    "datasets": [],

    "models": [],

    "architectures": [],

    "benchmarks": [],

    "knowledge_graph": ...,

    "identified_gaps": [],

    "hypotheses": [],

    "experiment_plan": ...,

    "repositories": [],

    "experiment_runs": [],

    "results": [],

    "critiques": [],

    "research_decisions": [],

    "artifacts": [],

    "final_draft": ...
}
```

Do not rely on passing huge textual prompts between agents.

Agents should read/write structured state and persistent research artifacts.

---

# 6. Agents vs Tools

Do not make everything an LLM agent.

Use agents for reasoning-heavy tasks.

Use normal tools/services for deterministic operations.

## Agents

```text
Research Planner
Novelty Analysis
Gap Analysis
Hypothesis Generation
Experiment Planning
Critic
Research Synthesis
Paper Generation
```

## Tools / Services

```text
OpenAlex API
Semantic Scholar API
arXiv API
Papers With Code
Hugging Face
PubMed
SearxNG
GitHub
PDF Parser
PyMuPDF4LLM
OCR
Embedding Model
Vector Database
PostgreSQL
Knowledge Graph
Container Runtime
GPU Execution
Benchmark Runner
LaTeX Compiler
```

The principle is:

> **Reasoning should be agentic. Deterministic operations should remain tools/services.**

---

# 7. Research Loops

Research Copilot should contain multiple specialized loops.

## Literature Discovery Loop

```text
Search
 ↓
Retrieve
 ↓
Rank
 ↓
Analyze Coverage
 ↓
Enough evidence?
 ├── NO → Search again
 └── YES → Continue
```

## Novelty Loop

```text
Candidate Idea
 ↓
Search Existing Literature
 ↓
Compare Methods
 ↓
Analyze Difference
 ↓
Novel enough?
 ├── NO → Modify Hypothesis
 └── YES → Continue
```

## Reproduction Loop

```text
Paper
 ↓
Find Repository
 ↓
Environment Setup
 ↓
Run Baseline
 ↓
Error?
 ├── YES → Debug → Run Again
 └── NO
      ↓
Compare Published Results
 ↓
Results Match?
 ├── NO → Investigate → Re-run
 └── YES → Reproduced
```

## Experiment Loop

```text
Hypothesis
 ↓
Experiment Plan
 ↓
Implementation
 ↓
Run
 ↓
Evaluate
 ↓
Critic
 ↓
More evidence required?
 ├── YES → Modify Experiment
 └── NO → Continue
```

## Paper Verification Loop

```text
Draft
 ↓
Citation Verification
 ↓
Claim Verification
 ↓
Evidence Verification
 ↓
Experiment Verification
 ↓
Valid?
 ├── NO → Revise
 └── YES → Final
```

---

# 8. Research Memory

Research Copilot should maintain persistent research memory.

Potential layers:

```text
PostgreSQL
    ↓
Structured Research State

Vector Database
    ↓
Semantic Retrieval

Knowledge Graph
    ↓
Paper ↔ Author ↔ Dataset ↔ Model ↔ Code
       ↕
    Benchmark ↔ Result ↔ Citation

Artifact Storage
    ↓
PDFs / Code / Logs / Models / Results / Figures
```

The system should distinguish:

```text
Facts
Evidence
Claims
Hypotheses
Assumptions
Experimental Results
Agent Decisions
Human Decisions
```

Do not mix these together.

---

# 9. Evidence-First Research

Every important research claim should have traceability.

Prefer:

```text
Claim
 ↓
Evidence
 ↓
Source
 ↓
Citation
```

The system must avoid:

* fabricated citations
* fabricated papers
* fabricated experiments
* fabricated benchmark results
* unsupported scientific claims

If evidence is insufficient, the system should explicitly mark the claim as uncertain or require further research.

---

# 10. Human-in-the-Loop

Research Copilot should be autonomous in execution but **human-controlled at critical decision points**.

Human approval may be required for:

```text
Research Direction
        ↓
Hypothesis Selection
        ↓
Expensive Experiment
        ↓
Major Architecture Change
        ↓
External Publication
        ↓
Final Research Claims
```

The AI should assist the researcher rather than silently making irreversible research decisions.

---

# 11. Execution Architecture

External coding agents such as:

```text
Claude Code
OpenAI Codex
OpenCode
Future Coding Agents
```

can be connected through an execution interface.

Research Copilot should not tightly couple itself to one coding agent.

Create an abstraction:

```text
CodeExecutionProvider
```

with implementations such as:

```text
ClaudeCodeProvider
CodexProvider
OpenCodeProvider
LocalAgentProvider
```

Likewise:

```text
LiteratureProvider
EmbeddingProvider
LLMProvider
ExecutionProvider
StorageProvider
```

This allows providers to be swapped without rewriting the research pipeline.

---

# 12. Example End-to-End Research Journey

Suppose the researcher asks:

> "Can hierarchical retrieval improve RAG?"

The system should conceptually perform:

```text
Research Question
        ↓
Planner
        ↓
Literature Search
        ↓
Retrieve Related Papers
        ↓
Construct Literature Graph
        ↓
Read Important Papers
        ↓
Extract:
    - architectures
    - datasets
    - metrics
    - methods
    - limitations
        ↓
Gap Analysis
        ↓
Novelty Analysis
        ↓
Generate Candidate Hypotheses
        ↓
Human Review
        ↓
Experiment Planning
        ↓
Find Existing Implementations
        ↓
Reproduce Baselines
        ↓
Implement Proposed Method
        ↓
Run Experiments
        ↓
Evaluate
        ↓
Critic
        ↓
Additional Experiments if Required
        ↓
Compare Against Baselines
        ↓
Synthesize Findings
        ↓
Generate Paper
        ↓
Verify Citations + Claims + Results
        ↓
Publication-Ready Draft
```

---

# 13. Important Architectural Rule

Do not build a "swarm of agents" just because it sounds autonomous.

Prefer:

```text
                         ORCHESTRATOR
                              │
                    ┌─────────┴─────────┐
                    │                   │
              RESEARCH GRAPH       RESEARCH STATE
                    │                   │
                    └─────────┬─────────┘
                              ↓
                     SPECIALIST AGENTS
                              ↓
                            TOOLS
                              ↓
                       EXPERIMENTS
                              ↓
                           CRITIC
                              ↓
                          RE-PLAN
```

The intelligence comes from **coordination + state + feedback loops**, not from having hundreds of agents.

---

# 14. Initial Implementation Strategy

Build the system incrementally.

## Phase 1

Implement:

```text
ResearchState
ResearchOrchestrator
LangGraph
LiteratureSearchAgent
PaperReaderAgent
KnowledgeExtractionAgent
Citation Tracking
```

## Phase 2

Add:

```text
Knowledge Graph
Hybrid Retrieval
Reranking
Gap Analysis
Novelty Analysis
Research Critic
```

## Phase 3

Add:

```text
Hypothesis Agent
Experiment Planner
Code Execution Interface
Repository Analysis
Reproduction Pipeline
```

## Phase 4

Add:

```text
Experiment Agent
Evaluation Agent
Benchmark Manager
Experiment Memory
Result Verification
```

## Phase 5

Add:

```text
Research Synthesizer
LaTeX Generator
Citation Manager
Figure/Table Generator
Paper Verification
```

## Phase 6

Introduce more advanced autonomy:

```text
Dynamic planning
Dynamic task decomposition
Adaptive research loops
Agent spawning where justified
Budget-aware execution
Long-running research sessions
Self-evaluation
Cross-experiment reasoning
```

Do not start with Phase 6.

Build the deterministic foundations first.

---

# 15. Core Mental Model

The entire system should follow this model:

```text
                 RESEARCH QUESTION
                        │
                        ↓
                     PLAN
                        │
                        ↓
                    DISCOVER
                        │
                        ↓
                    UNDERSTAND
                        │
                        ↓
                    CONNECT
                        │
                        ↓
                   IDENTIFY GAP
                        │
                        ↓
                    HYPOTHESIZE
                        │
                        ↓
                    EXPERIMENT
                        │
                        ↓
                     EVALUATE
                        │
                        ↓
                      CRITIC
                        │
                   ┌────┴────┐
                   │         │
                Improve    Accept
                   │         │
                   └──→ LOOP │
                             ↓
                          SYNTHESIZE
                             ↓
                          PUBLISH
```

The **graph represents the research process**.

The **loop represents scientific iteration**.

The **agents represent specialized reasoning capabilities**.

The **tools represent deterministic capabilities**.

The **ResearchState represents shared knowledge**.

The **Orchestrator represents control and planning**.

That is the architecture Research Copilot should evolve toward.

---

# 16. Guiding Principle for Future Development

Whenever implementing a new feature, ask:

1. Is this a **tool**, **service**, or **reasoning agent**?
2. What responsibility does it own?
3. What state does it consume?
4. What state does it produce?
5. Can it be independently tested?
6. Can it be replaced without changing the rest of the system?
7. Does it need an LLM at all?
8. Does it require a loop?
9. Does it require human approval?
10. Can its output be traced back to evidence?

If a feature cannot answer these questions clearly, redesign it before implementation.

The ultimate objective is:

> **Research Copilot should behave less like a chatbot and more like a persistent AI research engineering system that can plan, investigate, implement, experiment, verify, learn from results, and iterate toward reproducible scientific work.**
