# Loop + Graph Research Engine

The **Loop + Graph Engine** (`src/graph/`) powers the autonomous research workflow of Research Copilot.

---

## 🔄 State Graph Topology

```mermaid
flowchart TD
    START(["Start Query"]) --> DISCOVER["discover_papers<br/>(OpenAlex & arXiv)"]
    DISCOVER --> RANK["rank_papers<br/>(PaperRank 6-Factor)"]
    RANK --> EXPAND["expand_citation_graph<br/>(Directed Citations)"]
    EXPAND --> EXTRACT["extract_full_text<br/>(PDF Section Parser)"]
    EXTRACT --> CHECK{"should_continue_loop?<br/>(Iteration < Max & Depth)"}
    CHECK -- "Needs More Evidence" --> DISCOVER
    CHECK -- "Loop Complete" --> SYNTH["synthesize_evidence<br/>(Markdown Synthesis Artifact)"]
    SYNTH --> FINISH(["__END__"])
```

---

## 🛠️ Adding Custom Nodes

You can easily extend the pipeline by inheriting from `BaseResearchNode`:

```python
from src.graph.node import BaseResearchNode
from src.core.schemas import ResearchGraphState

class CustomBioNode(BaseResearchNode):
    def __init__(self):
        super().__init__("custom_bio_analysis", "Runs structural analysis")

    async def execute(self, state: ResearchGraphState) -> ResearchGraphState:
        # Access and mutate state
        state.custom_context["bio_score"] = 98.5
        return state
```

Register the node in your pipeline:
```python
graph.add_node("custom_bio", CustomBioNode())
graph.add_edge("extract_full_text", "custom_bio")
```
