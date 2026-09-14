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
  Plus,
  Check,
  FolderKanban,
  Calendar,
  PenTool,
  Terminal,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const CONNECTED_SOURCES = [
  { name: 'arXiv', desc: 'Computer science, AI, machine learning, physics preprints', tag: 'Free Open Access' },
  { name: 'OpenAlex', desc: 'Universal scholarly bibliographic catalog (250M+ scientific works)', tag: 'Live Index' },
  { name: 'Semantic Scholar', desc: 'AI-backed citation graph analysis and influential citations', tag: 'AI Search' },
  { name: 'Crossref', desc: 'Official international digital object identifier (DOI) registry', tag: 'Metadata' },
  { name: 'Europe PMC / PubMed', desc: 'Biomedical, clinical, and life sciences scientific literature', tag: 'Full Text' },
  { name: 'Hugging Face', desc: 'Pre-trained neural models, open datasets, and eval spaces', tag: 'Artifacts' },
  { name: 'Papers with Code', desc: 'State-of-the-art benchmark tables and official repositories', tag: 'Benchmarks' },
  { name: 'GitHub', desc: 'Open-source scientific model implementations and codebases', tag: 'Code' },
];

export default function OverviewView() {
  const navigate = useNavigate();
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    openWorkspaceModal,
    performSearch,
    searchResults,
    addedToGraphPaperIds,
  } = useApp();

  const [heroQuery, setHeroQuery] = useState('');
  const [graphStats, setGraphStats] = useState({
    total_papers: 0,
    total_methods: 0,
    total_datasets: 0,
    total_gaps: 0,
  });

  useEffect(() => {
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
  }, []);

  const handleHeroSearch = (e) => {
    if (e) e.preventDefault();
    const q = heroQuery.trim();
    if (!q) return;
    performSearch(q);
    navigate('/search-results');
  };

  const handleTopicClick = (topic) => {
    setHeroQuery(topic);
    performSearch(topic);
    navigate('/search-results');
  };

  return (
    <section id="view-overview" className="view-panel active">
      {/* 1. HERO / MISSION SECTION */}
      <div className="card homepage-hero-card" style={{ marginBottom: 24, padding: '32px 36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="hero-pill-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13} style={{ color: 'var(--accent-primary, #6366f1)' }} />
            <span>AI-Powered Autonomous Research Engineering</span>
          </span>
          {activeWorkspace && (
            <span className="badge badge-emerald" style={{ fontSize: 11.5 }}>
              Active Workspace: {activeWorkspace.title}
            </span>
          )}
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px', color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          Research Copilot: From Scientific Literature to Reproducible Research
        </h1>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px', maxWidth: 840, lineHeight: 1.6 }}>
          Research Copilot is an intelligent scientific assistant engineered to assist researchers across the entire research lifecycle: discover multi-source literature, construct topological knowledge graphs, analyze open research gaps, resolve legal full-text PDFs, and prepare publication-ready manuscripts.
        </p>

        {/* Primary Search Input */}
        <form onSubmit={handleHeroSearch} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--bg-input, #18181b)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '0 14px',
              }}
            >
              <Search size={17} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                placeholder="Enter scientific topic, paper title, DOI, or arXiv identifier (e.g. Attention Is All You Need)..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  padding: '12px 0',
                }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!heroQuery.trim()}
              style={{ padding: '12px 24px', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span>Explore Literature</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </form>

        {/* 5 Fast Action Navigation Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={13} style={{ color: 'var(--accent-primary)' }} />
            <span>1. Literature Search</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <BookOpen size={13} style={{ color: 'var(--accent-emerald)' }} />
            <span>2. Founded Papers ({searchResults.length})</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Network size={13} style={{ color: 'var(--accent-violet)' }} />
            <span>3. Knowledge Graph</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/pdf-inspector')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={13} style={{ color: 'var(--accent-amber)' }} />
            <span>4. Paper Reader & PDF</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/research-gaps')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Lightbulb size={13} style={{ color: 'var(--accent-rose)' }} />
            <span>5. Research Gap Finder</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/workspaces')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FolderKanban size={13} style={{ color: 'var(--text-primary)' }} />
            <span>Workspaces Hub ({workspaces.length})</span>
          </button>
        </div>
      </div>

      {/* 2. REAL-TIME STATS RIBBON */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="card stat-ribbon-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Indexed Papers</span>
            <BookOpen size={17} style={{ color: 'var(--accent-primary, #6366f1)' }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
            {graphStats.total_papers || searchResults.length || 0}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Registered scientific records</span>
        </div>

        <div className="card stat-ribbon-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Active Workspaces</span>
            <FolderKanban size={17} style={{ color: 'var(--accent-emerald, #10b981)' }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
            {workspaces.length}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Isolated research environments</span>
        </div>

        <div className="card stat-ribbon-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Graph Methods</span>
            <Layers size={17} style={{ color: 'var(--accent-violet, #a855f7)' }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
            {graphStats.total_methods || 0}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Extracted methodologies</span>
        </div>

        <div className="card stat-ribbon-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Literature Gaps</span>
            <Lightbulb size={17} style={{ color: 'var(--accent-amber, #f59e0b)' }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>
            {graphStats.total_gaps || 0}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Combinatorial opportunities</span>
        </div>
      </div>

      {/* 3. STEP-BY-STEP INTERACTIVE USAGE GUIDE */}
      <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Compass size={17} style={{ color: 'var(--accent-primary, #6366f1)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            How to Use Research Copilot: 5-Step Research Guide
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <div
            className="guide-step-card"
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 700 }}>STEP 1</span>
              <FolderKanban size={15} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Create a Research Workspace
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Name your workspace after your research question or paper. Workspaces isolate your queries, graph nodes, and reader notes.
            </p>
          </div>

          <div
            className="guide-step-card"
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 700 }}>STEP 2</span>
              <Search size={15} style={{ color: 'var(--accent-emerald)' }} />
            </div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Multi-Source Literature Search
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Search across 8 scientific repositories in parallel with 8s timeout budgets, automatic deduplication, and open-access PDF resolution.
            </p>
          </div>

          <div
            className="guide-step-card"
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 700 }}>STEP 3</span>
              <Network size={15} style={{ color: 'var(--accent-violet)' }} />
            </div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Selective Graph Topology Ingestion
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Click "+ Add to Graph" on founded papers. The graph links Topic → Papers → Inter-paper Method/Dataset bridges cleanly.
            </p>
          </div>

          <div
            className="guide-step-card"
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 700 }}>STEP 4</span>
              <FileText size={15} style={{ color: 'var(--accent-amber)' }} />
            </div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Interactive Paper Reader & PDF
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Inspect live PDF streams, extract structured methodology, examine technical concepts, and copy formatted BibTeX citation code.
            </p>
          </div>

          <div
            className="guide-step-card"
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 11, fontWeight: 700 }}>STEP 5</span>
              <Lightbulb size={15} style={{ color: 'var(--accent-rose)' }} />
            </div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Find Literature Gaps & Hypotheses
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Discover unproven Method × Dataset combinatorial pairs and generate grounded novel research hypotheses.
            </p>
          </div>
        </div>
      </div>

      {/* 4. END-TO-END RESEARCH PIPELINE WORKFLOW (6 STAGES) */}
      <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Layers size={17} style={{ color: 'var(--accent-primary, #6366f1)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Complete End-to-End Scientific Architecture Workflow
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div className="workflow-card" style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Database size={15} style={{ color: 'var(--accent-primary)' }} />
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Stage 1: Multi-Source Literature Discovery</h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Executes parallel async queries across arXiv, OpenAlex, Semantic Scholar, Crossref, and Europe PMC with unified entity deduplication.
            </p>
          </div>

          <div className="workflow-card" style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <FileText size={15} style={{ color: 'var(--accent-emerald)' }} />
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Stage 2: Open Access Resolver & PDF Proxy</h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Locates legal open-access full-text streams (Unpaywall, AlphaXiv, PMC) and streams PDFs via high-performance proxy to bypass browser CORS.
            </p>
          </div>

          <div className="workflow-card" style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Network size={15} style={{ color: 'var(--accent-violet)' }} />
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Stage 3: Topological Knowledge Graph</h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Builds typed DiGraph networks linking topic pills, paper rectangles, and inter-paper relationship circles using SQLite async persistence.
            </p>
          </div>

          <div className="workflow-card" style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Lightbulb size={15} style={{ color: 'var(--accent-amber)' }} />
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Stage 4: Combinatorial Gap Engine</h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Analyzes graph matrices to find unproven Method × Dataset pairs, evaluating underexplored scientific opportunities.
            </p>
          </div>

          <div className="workflow-card" style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Terminal size={15} style={{ color: 'var(--accent-rose)' }} />
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Stage 5: Autonomous Coding Agent Execution</h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Executes sandboxed scripts to download GitHub repositories, resolve dependencies, and replicate experiments autonomously.
            </p>
          </div>

          <div className="workflow-card" style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <PenTool size={15} style={{ color: 'var(--accent-primary)' }} />
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Stage 6: Manuscript Drafting & Citations</h4>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Compiles structured LaTeX papers with automated BibTeX citation tracking, formatted abstract, and empirical benchmark tables.
            </p>
          </div>
        </div>
      </div>

      {/* 5. YOUR RESEARCH WORKSPACES */}
      <div className="card" style={{ marginBottom: 24, padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Your Research Workspaces
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Switch between isolated scientific environments to continue literature searches, graph nodes, and reader notes.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/workspaces')}
              style={{ fontSize: 12 }}
            >
              <span>View All ({workspaces.length})</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => openWorkspaceModal()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <Plus size={13} />
              <span>New Workspace</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {workspaces.slice(0, 6).map((ws) => {
            const isActive = activeWorkspace && activeWorkspace.id === ws.id;
            return (
              <div
                key={ws.id}
                onClick={() => {
                  switchWorkspace(ws.id);
                  navigate('/search');
                }}
                className="card"
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderLeft: isActive ? '3px solid var(--accent-primary, #6366f1)' : '1px solid var(--border-subtle)',
                  background: isActive ? 'var(--bg-subtle)' : 'var(--bg-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'border-color 0.2s',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FolderKanban size={14} style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-code)' }}>
                        {ws.id}
                      </span>
                    </div>
                    {isActive ? (
                      <span className="badge badge-emerald" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Check size={10} />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>Saved</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ws.title}
                  </h3>

                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.4,
                    }}
                  >
                    {ws.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {ws.created_at ? ws.created_at.slice(0, 10) : 'Active'}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{isActive ? 'Continue' : 'Open'}</span>
                    <ArrowRight size={11} />
                  </span>
                </div>
              </div>
            );
          })}

          {workspaces.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '28px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <FolderKanban size={30} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--text-muted)' }} />
              <p style={{ margin: '0 0 10px', fontSize: 13 }}>No research workspaces created yet.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openWorkspaceModal()}
              >
                + Create First Workspace
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6. UPCOMING FEATURES & ROADMAP */}
      <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Clock size={17} style={{ color: 'var(--accent-primary, #6366f1)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Platform Roadmap & Upcoming Engineering Modules
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>Phase 2</span>
              <FlaskConical size={16} style={{ color: 'var(--accent-emerald)' }} />
            </div>
            <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700 }}>Experiment Studio & SOTA Baselines</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Benchmark tracking and automatic metric extraction against state-of-the-art baselines across Papers with Code leaderboards.
            </p>
          </div>

          <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>Phase 3</span>
              <Terminal size={16} style={{ color: 'var(--accent-violet)' }} />
            </div>
            <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700 }}>AI Coding Agent Execution Engine</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Sandboxed execution pipeline integrating Claude Code, OpenCode, and local runners to reproduce published paper codebases.
            </p>
          </div>

          <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>Phase 4</span>
              <PenTool size={16} style={{ color: 'var(--accent-amber)' }} />
            </div>
            <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700 }}>LaTeX Manuscript Generator</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Automated compilation of NeurIPS, ICML, and ICLR template manuscripts with citation trees, LaTeX tables, and empirical figures.
            </p>
          </div>
        </div>
      </div>

      {/* 7. CONNECTED SCIENTIFIC DATABASES (8 SOURCES) */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Database size={17} style={{ color: 'var(--accent-primary, #6366f1)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Connected Scientific Databases (8 Parallel Connectors)
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {CONNECTED_SOURCES.map((db, idx) => (
            <div
              key={idx}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{db.name}</strong>
                <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>{db.tag}</span>
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{db.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
