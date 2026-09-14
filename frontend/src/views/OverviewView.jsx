import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Network,
  FileText,
  Lightbulb,
  FlaskConical,
  BookOpen,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Layers,
  Cpu,
  Database,
  ExternalLink,
  CheckCircle2,
  Clock,
  Compass,
} from 'lucide-react';

export default function OverviewView() {
  const navigate = useNavigate();
  const [quickQuery, setQuickQuery] = useState('');
  const [graphStats, setGraphStats] = useState({
    total_papers: 0,
    total_methods: 0,
    total_datasets: 0,
    total_gaps: 0,
  });
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    // 1. Fetch real graph summary
    fetch('/api/v1/graph/summary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setGraphStats({
            total_papers: data.total_papers || 0,
            total_methods: data.total_methods || 0,
            total_datasets: data.total_datasets || 0,
            total_gaps: data.total_gaps || 0,
          });
        }
      })
      .catch(() => {});

    // 2. Fetch real sessions
    fetch('/api/v1/workbench/sessions')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data)) {
          setRecentSessions(data.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  const handleHeroSearch = (e) => {
    e.preventDefault();
    if (!quickQuery.trim()) {
      navigate('/search');
    } else {
      navigate(`/search?q=${encodeURIComponent(quickQuery.trim())}`);
    }
  };

  const handleRecentSession = (query) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <section id="view-dashboard" className="view-panel active">
      {/* Hero / Mission Statement Section */}
      <div className="homepage-hero-card">
        <div className="hero-pill-badge">
          <Sparkles size={12} />
          <span>Autonomous AI Research Engineering Platform</span>
        </div>
        <h1 className="hero-title-text">
          Scientific Research Lifecycle, from Literature Discovery to Reproducible Execution
        </h1>
        <p className="hero-mission-statement">
          Research Copilot is an intelligent research assistant built for scientists and engineers.
          Unlike traditional conversational chatbots that merely summarize text, Research Copilot
          ingests verified scientific literature across eight global repositories, constructs relational
          knowledge graphs, detects unexplored research gaps, plans reproducible experiments, and drafts
          publication-ready scientific manuscripts without hallucination.
        </p>

        {/* Quick Search Launch Bar */}
        <form className="hero-quick-search-box" onSubmit={handleHeroSearch}>
          <div className="search-input-wrapper" style={{ flex: 1 }}>
            <Search size={16} color="var(--text-muted)" style={{ marginRight: 8 }} />
            <input
              type="text"
              placeholder="Explore research topics (e.g., 'Liquid neural networks for time-series forecasting')..."
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            <span>Explore Literature</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {/* Quick Route Action Buttons */}
        <div className="hero-cta-row">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/search')}>
            <Search size={13} />
            <span>Literature Search</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/search-results')}>
            <BookOpen size={13} />
            <span>Founded Papers Stream</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/knowledge-graph')}>
            <Network size={13} />
            <span>Knowledge Graph</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/pdf-inspector')}>
            <FileText size={13} />
            <span>Paper Reader & PDF</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/research-gaps')}>
            <Lightbulb size={13} />
            <span>Research Gap Matrix</span>
          </button>
        </div>
      </div>

      {/* Real-time System Metrics Ribbon */}
      <div className="metrics-strip">
        <div className="metric-box">
          <span className="metric-label">Indexed Scientific Papers</span>
          <span className="metric-val">{graphStats.total_papers}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Extracted Methods</span>
          <span className="metric-val">{graphStats.total_methods}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Benchmark Datasets</span>
          <span className="metric-val">{graphStats.total_datasets}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Identified Research Gaps</span>
          <span className="metric-val">{graphStats.total_gaps}</span>
        </div>
      </div>

      {/* Step-by-Step User Guide */}
      <div className="section-headline-block">
        <h2>
          <Compass size={18} color="var(--accent-primary, #6366f1)" />
          <span>How to Use Research Copilot</span>
        </h2>
        <p>
          Follow this 5-step operational workflow to navigate through scientific literature, inspect evidence,
          and discover high-impact research directions.
        </p>
      </div>

      <div className="guide-steps-grid">
        <div className="guide-step-card" onClick={() => navigate('/search')}>
          <div className="guide-step-number">1</div>
          <div className="guide-step-title">Query Scientific Literature</div>
          <div className="guide-step-desc">
            Enter research questions, model architectures, or domain keywords in <strong>Literature Search</strong>.
            The engine harvests and deduplicates publications from arXiv, Semantic Scholar, OpenAlex, Crossref, and PubMed.
          </div>
          <div className="guide-step-link">
            <span>Open Literature Search</span>
            <ArrowRight size={12} />
          </div>
        </div>

        <div className="guide-step-card" onClick={() => navigate('/search-results')}>
          <div className="guide-step-number">2</div>
          <div className="guide-step-title">Browse Founded Papers Feed</div>
          <div className="guide-step-desc">
            Examine discovered papers in a dedicated linear reading stream. Filter by title, keywords, or authors.
            Inspect open-access DOIs, download PDFs directly, and selectively click <strong>+ Add to Graph</strong>.
          </div>
          <div className="guide-step-link">
            <span>Open Founded Papers</span>
            <ArrowRight size={12} />
          </div>
        </div>

        <div className="guide-step-card" onClick={() => navigate('/knowledge-graph')}>
          <div className="guide-step-number">3</div>
          <div className="guide-step-title">Explore Knowledge Graph</div>
          <div className="guide-step-desc">
            Visualize the interactive relational graph. Inspect topic root nodes, ingested papers, extracted methods,
            benchmark datasets, and cross-paper bridges with real-time entity inspectors.
          </div>
          <div className="guide-step-link">
            <span>Open Knowledge Graph</span>
            <ArrowRight size={12} />
          </div>
        </div>

        <div className="guide-step-card" onClick={() => navigate('/pdf-inspector')}>
          <div className="guide-step-number">4</div>
          <div className="guide-step-title">Inspect Sections & PDF Streams</div>
          <div className="guide-step-desc">
            Read structured parsed sections (Abstract, Methodology, Empirical Results) side-by-side with original
            peer-reviewed PDF streams, complete with automated BibTeX export and citation attribution.
          </div>
          <div className="guide-step-link">
            <span>Open Paper Reader</span>
            <ArrowRight size={12} />
          </div>
        </div>

        <div className="guide-step-card" onClick={() => navigate('/research-gaps')}>
          <div className="guide-step-number">5</div>
          <div className="guide-step-title">Uncover Research Gaps</div>
          <div className="guide-step-desc">
            Run combinatorial analysis across extracted methods and datasets to detect unaddressed intersections,
            formulate grounded novel hypotheses, and plan reproducible validation experiments.
          </div>
          <div className="guide-step-link">
            <span>Open Research Gap Finder</span>
            <ArrowRight size={12} />
          </div>
        </div>
      </div>

      {/* End-to-End Architectural Pipeline */}
      <div className="section-headline-block">
        <h2>
          <Layers size={18} color="var(--accent-primary, #6366f1)" />
          <span>Overall End-to-End Workflow Pipeline</span>
        </h2>
        <p>
          Research Copilot orchestrates six specialized engineering stages to convert scientific curiosity
          into verified, publication-grade outcomes.
        </p>
      </div>

      <div className="workflow-pipeline-grid">
        <div className="workflow-stage-card">
          <div className="workflow-stage-pill">Stage 01</div>
          <div className="workflow-stage-name">Multi-Source Harvesting</div>
          <div className="workflow-stage-desc">
            Concurrent querying across arXiv, OpenAlex, Semantic Scholar, Crossref, Hugging Face, and PubMed with DOI deduplication.
          </div>
        </div>

        <div className="workflow-stage-card">
          <div className="workflow-stage-pill">Stage 02</div>
          <div className="workflow-stage-name">Document Parsing & Ingestion</div>
          <div className="workflow-stage-desc">
            Full-text PDF stream resolution, LaTeX parsing, semantic chunking, and token-budgeted embedding generation.
          </div>
        </div>

        <div className="workflow-stage-card">
          <div className="workflow-stage-pill">Stage 03</div>
          <div className="workflow-stage-name">Knowledge Graph Linking</div>
          <div className="workflow-stage-desc">
            Autonomous entity extraction connecting papers, proposed architectures, benchmark datasets, and multi-paper bridges.
          </div>
        </div>

        <div className="workflow-stage-card">
          <div className="workflow-stage-pill">Stage 04</div>
          <div className="workflow-stage-name">Combinatorial Gap Analysis</div>
          <div className="workflow-stage-desc">
            Cartesian evaluation of method-dataset matrix to uncover zero-coverage intersections and formulate novel hypotheses.
          </div>
        </div>

        <div className="workflow-stage-card">
          <div className="workflow-stage-pill">Stage 05</div>
          <div className="workflow-stage-name">Sandboxed Reproduction</div>
          <div className="workflow-stage-desc">
            Delegation to AI coding agents (Claude Code, Codex) for repository cloning, dependency resolution, and benchmark execution.
          </div>
        </div>

        <div className="workflow-stage-card">
          <div className="workflow-stage-pill">Stage 06</div>
          <div className="workflow-stage-name">Manuscript Dissemination</div>
          <div className="workflow-stage-desc">
            Automated structured LaTeX generation with verified BibTeX citations, empirical figures, and reproducible artifacts.
          </div>
        </div>
      </div>

      {/* Roadmap / Coming Soon Features */}
      <div className="section-headline-block">
        <h2>
          <Clock size={18} color="var(--accent-primary, #6366f1)" />
          <span>Roadmap & Upcoming Modules</span>
        </h2>
        <p>
          Next-generation capabilities currently in active engineering for upcoming platform releases.
        </p>
      </div>

      <div className="roadmap-grid">
        <div className="roadmap-card">
          <div className="roadmap-status-badge">
            <Cpu size={11} />
            <span>Coming Soon • Phase 2</span>
          </div>
          <div className="roadmap-title">Experiment Studio & Cloud Sandbox</div>
          <div className="roadmap-desc">
            Isolated Docker and Firecracker microVM compute environment designed for autonomous coding agents.
            Allows automated git repository cloning, dependency resolution, GPU cluster dispatching, and hyperparameter sweeps.
          </div>
          <ul className="roadmap-items-list">
            <li>Automated Conda and Poetry dependency conflict resolution</li>
            <li>Sandboxed CUDA acceleration and distributed training monitoring</li>
            <li>Bidirectional telemetry with Weights & Biases and TensorBoard</li>
          </ul>
        </div>

        <div className="roadmap-card">
          <div className="roadmap-status-badge">
            <FlaskConical size={11} />
            <span>Coming Soon • Phase 2</span>
          </div>
          <div className="roadmap-title">Standardized SOTA Benchmark Leaderboards</div>
          <div className="roadmap-desc">
            Automated empirical comparison suite tracking state-of-the-art baselines across Hugging Face Datasets
            and Papers with Code benchmarks with verifiable provenance.
          </div>
          <ul className="roadmap-items-list">
            <li>Strict metric parity verification against published author checkpoints</li>
            <li>Statistical significance testing with multi-seed bootstrap confidence intervals</li>
            <li>Direct ingestion of evaluation results into paper figures and tables</li>
          </ul>
        </div>

        <div className="roadmap-card">
          <div className="roadmap-status-badge">
            <FileText size={11} />
            <span>Coming Soon • Phase 3</span>
          </div>
          <div className="roadmap-title">Publication-Ready LaTeX Manuscript Engine</div>
          <div className="roadmap-desc">
            Comprehensive manuscript drafting engine producing camera-ready LaTeX code configured for NeurIPS, ICML,
            ICLR, IEEE, and ACM conference styles with zero-hallucination citation enforcement.
          </div>
          <ul className="roadmap-items-list">
            <li>Automated related work synthesis with linked BibTeX cross-references</li>
            <li>Export to Overleaf, ZIP archives, and compiled camera-ready PDF</li>
            <li>Algorithmic pseudocode and TikZ architecture diagram generation</li>
          </ul>
        </div>
      </div>

      {/* Supported Scientific Repositories and Recent Sessions */}
      <div className="dashboard-grid">
        <div className="card">
          <h3>Connected Scientific Knowledge Sources</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Aggregated real-time via dedicated API connectors, metadata scrapers, and open access resolvers.
          </p>
          <div className="sources-grid">
            <div className="source-chip">
              <strong>arXiv</strong>
              <span>Preprints in CS, AI, Math & Physics</span>
            </div>
            <div className="source-chip">
              <strong>Hugging Face</strong>
              <span>Pretrained Models, Datasets & Spaces</span>
            </div>
            <div className="source-chip">
              <strong>Papers with Code</strong>
              <span>SOTA Leaderboards & Repositories</span>
            </div>
            <div className="source-chip">
              <strong>GitHub</strong>
              <span>Open-Source Implementation Codebases</span>
            </div>
            <div className="source-chip">
              <strong>OpenAlex</strong>
              <span>Global Open Bibliographic Knowledge Graph</span>
            </div>
            <div className="source-chip">
              <strong>Semantic Scholar</strong>
              <span>Citation Velocity & Influential Citations</span>
            </div>
            <div className="source-chip">
              <strong>Crossref</strong>
              <span>Publisher DOIs & Metadata Registration</span>
            </div>
            <div className="source-chip">
              <strong>PubMed / Europe PMC</strong>
              <span>Biomedical & Life Sciences Literature</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Recent Research Sessions</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Saved literature investigations and research sessions ready to be restored.
          </p>
          <div className="session-list" id="recent-sessions-container">
            {recentSessions.length > 0 ? (
              recentSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="session-row"
                  onClick={() => handleRecentSession(sess.query || '')}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <span className="session-title">{sess.query}</span>
                    <span className="session-sub">
                      Session {sess.id} • {sess.status}
                    </span>
                  </div>
                  <span className="badge badge-blue">Restore</span>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                <BookOpen
                  size={24}
                  style={{ display: 'block', margin: '0 auto 8px', color: 'var(--text-muted)' }}
                />
                No prior search sessions found. Run a query in <strong>Literature Search</strong> to begin.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
