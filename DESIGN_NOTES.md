# Research Copilot — Design Notes & Architecture Log

This document records the visual identity, design token decisions, and UI architecture for the **Research Copilot** React application.

---

## 1. Subject Matter & User Persona
* **Product**: Autonomous AI Research Engineering Platform.
* **Target User**: AI Research Engineers, ML Scientists, and Academic Authors.
* **Primary Objective**: Rapid literature discovery, relational knowledge graph analysis, paper limitation/gap synthesis, and PDF text segmentation.

---

## 2. Design Tokens & Visual Stance

### Aesthetic Thesis
* **Stance**: *Precision Scientific Studio Workstation*
* **Design Philosophy**: High data density with crisp visual hierarchy, monospace data accents, and high-contrast source provider color-coding. Zero generic SaaS purple gradients, zero emojis, zero graphic logos.

### Color Tokens
* **Background App**: `#080c14` (Deep Dark Slate)
* **Surface Card**: `#0f1623` (Dark Navy Surface)
* **Surface Elevated**: `#162032` (Elevated Panel)
* **Accent Primary**: `#3b82f6` (Precision Blue)

### Provider Badge Token Mapping
* **arXiv**: `#f97316` (Amber/Orange)
* **Semantic Scholar**: `#3b82f6` (Electric Blue)
* **OpenAlex**: `#a855f7` (Violet)
* **Hugging Face**: `#eab308` (Yellow)
* **PubMed**: `#10b981` (Emerald Green)
* **Crossref**: `#06b6d4` (Cyan)
* **GitHub**: `#cbd5e1` (Light Slate)
* **Papers With Code**: `#6366f1` (Indigo)

### Typography Pairing
* **Display & Body**: `Inter` (sans-serif)
* **Code, Hashes & Metadata**: `JetBrains Mono` (monospace)

---

## 3. Key Design Decisions

1. **No Hardcoded Data**:
   All metrics, paper grids, gap identifications, graph nodes, and PDF reader output are dynamically computed from state and live API payloads.

2. **Standalone Production Bundle (`bundle.js`)**:
   Pre-compiled using `esbuild` to prevent in-browser Babel errors or browser MIME type blocking.

3. **Go Embedded Monolith (`embed.FS`)**:
   Embedded directly inside [`main.go`](file:///home/sooriya/Desktop/research-copilot/main.go) so running `./bin/research_copilot` serves both the backend API and frontend React app from a single standalone binary.
