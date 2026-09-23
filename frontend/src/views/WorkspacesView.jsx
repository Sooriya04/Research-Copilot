import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  Check,
  Trash2,
  ArrowRight,
  BookOpen,
  Network,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  ExternalLink,
  Cpu,
  Activity,
  Compass,
  SlidersHorizontal,
  Bookmark,
  Share2,
  Lightbulb,
  XCircle,
  Workflow,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function WorkspacesView() {
  const navigate = useNavigate();
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    deactivateWorkspace,
    deleteWorkspace,
    createWorkspace,
    openWorkspaceModal,
    searchResults,
    addedToGraphPaperIds,
    activeReaderPaper,
  } = useApp();

  const [filterTerm, setFilterTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'active'
  const [sortBy, setSortBy] = useState('recent'); // 'recent', 'name'

  // Helper to read scoped stats for each workspace from localStorage
  const getWorkspaceStats = (wsId) => {
    try {
      const results = JSON.parse(localStorage.getItem(`rc_ws_${wsId}_search_results`) || '[]');
      const graphs = JSON.parse(localStorage.getItem(`rc_ws_${wsId}_added_graph_papers`) || '[]');
      const hasReader = !!localStorage.getItem(`rc_ws_${wsId}_reader_paper`);
      const query = localStorage.getItem(`rc_ws_${wsId}_search_query`) || '';
      return {
        paperCount: Array.isArray(results) ? results.length : 0,
        graphCount: Array.isArray(graphs) ? graphs.length : 0,
        hasReader,
        query,
      };
    } catch {
      return { paperCount: 0, graphCount: 0, hasReader: false, query: '' };
    }
  };

  const filteredWorkspaces = useMemo(() => {
    return workspaces
      .filter((ws) => {
        if (filterType === 'active' && activeWorkspace?.id !== ws.id) return false;
        if (!filterTerm.trim()) return true;
        const term = filterTerm.toLowerCase().trim();
        const titleMatch = (ws.title || '').toLowerCase().includes(term);
        const descMatch = (ws.description || '').toLowerCase().includes(term);
        return titleMatch || descMatch;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return (a.title || '').localeCompare(b.title || '');
        }
        // default: recent
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [workspaces, filterTerm, filterType, sortBy, activeWorkspace]);

  const handleOpenWorkspace = (wsId) => {
    switchWorkspace(wsId);
    navigate('/search');
  };

  // Quick-start scientific templates to quickly bootstrap research topics
  const researchTemplates = [
    {
      title: 'Agentic RAG & Multi-Hop Reasoning',
      description: 'Autonomous retrieval-augmented generation architectures, multi-hop question answering, and chain-of-thought verification.',
      badge: 'RAG Architecture',
    },
    {
      title: 'Diffusion Models & Generative Video',
      description: 'Score-based generative models, continuous-time diffusion, latent video synthesis, and consistency distillation.',
      badge: 'Multimodal',
    },
    {
      title: 'Mechanistic Interpretability in Transformers',
      description: 'Probing attention circuits, superposition, dictionary learning, and representation steering in frontier models.',
      badge: 'Interpretability',
    },
    {
      title: 'Autonomous Coding Agents & Tool Use',
      description: 'Self-correcting code synthesis, AST manipulation, sandboxed execution pipelines, and SWE-bench evaluation.',
      badge: 'Agentic Systems',
    },
  ];

  const handleLaunchTemplate = async (template) => {
    const confirmed = window.confirm(
      `Create a new workspace for "${template.title}"?\n\nThis will open the Literature Search with this topic pre-loaded.`
    );
    if (!confirmed) return;
    const newWs = await createWorkspace(template.title, template.description);
    if (newWs) {
      navigate('/search');
    }
  };

  return (
    <section id="view-workspaces-hub" className="view-panel active">
      {/* Panel Header */}
      <div className="panel-header" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              Research Workspaces Hub
            </h1>
            <span className="badge badge-blue" style={{ fontSize: 11.5, padding: '2px 8px' }}>
              {workspaces.length} {workspaces.length === 1 ? 'Workspace' : 'Workspaces'}
            </span>
          </div>
          <p className="panel-subtitle" style={{ margin: 0, maxWidth: 720, fontSize: 13, color: 'var(--text-muted)' }}>
            Isolated scientific research environments for literature retrieval, knowledge graphs, benchmark tracking, and manuscript synthesis.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openWorkspaceModal()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, flexShrink: 0 }}
        >
          <Plus size={15} />
          <span>Create Workspace</span>
        </button>
      </div>

      {/* Active Workspace Spotlight Hero Banner */}
      {activeWorkspace && (
        <div
          className="card"
          style={{
            marginBottom: 28,
            padding: '24px 28px',
            borderRadius: 'var(--radius-lg, 12px)',
            border: '1px solid var(--border-hover, #6366f1)',
            background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-subtle) 100%)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle decorative glow */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 4,
              height: '100%',
              background: 'var(--accent-primary, #6366f1)',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  className="badge badge-emerald"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 10px',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'currentColor',
                      display: 'inline-block',
                    }}
                  />
                  Active Environment
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-code)' }}>
                  ID: {activeWorkspace.id}
                </span>
                {activeWorkspace.created_at && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} />
                    {activeWorkspace.created_at.slice(0, 10)}
                  </span>
                )}
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 8px', color: 'var(--text-primary)' }}>
                {activeWorkspace.title}
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0, maxWidth: 780, lineHeight: 1.6 }}>
                {activeWorkspace.description || 'No description provided for this research environment. Use the quick actions below to manage literature search, knowledge graph, and citations.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => openWorkspaceModal(activeWorkspace.title)}
                style={{ fontSize: 12.5, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <SlidersHorizontal size={13} />
                <span>Edit Details</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={deactivateWorkspace}
                style={{ fontSize: 12.5, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-rose, #f43f5e)' }}
                title="Deactivate workspace and return to global mode"
              >
                <XCircle size={13} />
                <span>Deactivate</span>
              </button>
            </div>
          </div>

          {/* Active Workspace Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 18,
              padding: '14px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                  color: 'var(--accent-primary, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BookOpen size={16} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Found Papers
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {searchResults.length} Papers
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: 'var(--accent-emerald, #10b981)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Network size={16} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Knowledge Graph
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {addedToGraphPaperIds.length} Nodes
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  color: 'var(--accent-amber, #f59e0b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={16} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Paper Reader
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {activeReaderPaper ? '1 Ingested' : 'Ready'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  color: '#8b5cf6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Compass size={16} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Research Domain
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 160,
                  }}
                  title={activeWorkspace.title}
                >
                  {activeWorkspace.title}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Launch Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 6 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/chat')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600 }}
            >
              <Sparkles size={14} />
              <span>AI Research Chat</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/search')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
            >
              <Search size={14} />
              <span>Search Literature</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/search-results')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
            >
              <BookOpen size={14} />
              <span>Founded Papers</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/knowledge-graph')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
            >
              <Network size={14} />
              <span>Knowledge Graph ({addedToGraphPaperIds.length})</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/litgraph')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
            >
              <Workflow size={14} />
              <span>LitGraph Similarity</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/pdf-inspector')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
            >
              <FileText size={14} />
              <span>Paper Reader & Markdown</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/research-gaps')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
            >
              <Lightbulb size={14} />
              <span>Research Gaps</span>
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 12px',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              placeholder="Search workspaces by keyword or title..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                padding: '8px 0',
              }}
            />
            {filterTerm && (
              <button
                type="button"
                onClick={() => setFilterTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: 'var(--bg-subtle)', padding: 2, borderRadius: 'var(--radius-sm)' }}>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              style={{
                border: 'none',
                background: filterType === 'all' ? 'var(--bg-card)' : 'transparent',
                color: filterType === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: filterType === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                padding: '5px 12px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All ({workspaces.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('active')}
              style={{
                border: 'none',
                background: filterType === 'active' ? 'var(--bg-card)' : 'transparent',
                color: filterType === 'active' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: filterType === 'active' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                padding: '5px 12px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Active
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="recent">Recently Created</option>
            <option value="name">Alphabetical (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Workspaces Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18, marginBottom: 36 }}>
        {filteredWorkspaces.map((ws) => {
          const isActive = activeWorkspace && activeWorkspace.id === ws.id;
          const stats = getWorkspaceStats(ws.id);

          return (
            <div
              key={ws.id}
              className="card"
              style={{
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderRadius: 'var(--radius-md, 10px)',
                border: isActive ? '1.5px solid var(--accent-primary, #6366f1)' : '1px solid var(--border-subtle)',
                background: isActive ? 'var(--bg-subtle)' : 'var(--bg-card)',
                boxShadow: isActive ? '0 4px 16px rgba(99, 102, 241, 0.08)' : 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
              }}
            >
              <div>
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        backgroundColor: isActive ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-subtle)',
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FolderKanban size={15} />
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-code)' }}>
                      {ws.id}
                    </span>
                  </div>

                  {isActive ? (
                    <span className="badge badge-emerald" style={{ fontSize: 11, fontWeight: 600 }}>Active</span>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>Workspace</span>
                  )}
                </div>

                {/* Card Title */}
                <h3
                  onClick={() => handleOpenWorkspace(ws.id)}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    margin: '0 0 8px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.35,
                    cursor: 'pointer',
                  }}
                  title={ws.title}
                >
                  {ws.title}
                </h3>

                {/* Card Description */}
                <p
                  style={{
                    fontSize: 12.8,
                    color: 'var(--text-secondary)',
                    margin: '0 0 16px',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {ws.description || 'No specific description provided for this research environment.'}
                </p>

                {/* Scoped Stats Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <BookOpen size={11} style={{ color: 'var(--accent-primary)' }} />
                    {stats.paperCount} {stats.paperCount === 1 ? 'Paper' : 'Papers'}
                  </span>

                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Network size={11} style={{ color: 'var(--accent-emerald, #10b981)' }} />
                    {stats.graphCount} Graph Nodes
                  </span>

                  {stats.hasReader && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 4,
                        backgroundColor: 'var(--bg-subtle)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <FileText size={11} style={{ color: 'var(--accent-amber, #f59e0b)' }} />
                      Reader Ingested
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Meta info & Delete */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    <Calendar size={12} />
                    <span>{ws.created_at ? ws.created_at.slice(0, 10) : 'Active'}</span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete workspace "${ws.title}"? This cannot be undone.`)) {
                        deleteWorkspace(ws.id);
                      }
                    }}
                    style={{ padding: '4px 8px', color: 'var(--accent-rose)', opacity: 0.85 }}
                    title="Delete Workspace"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Action Buttons Row */}
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  {isActive && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={deactivateWorkspace}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        fontSize: 12,
                        padding: '6px 10px',
                        color: 'var(--accent-rose, #f43f5e)',
                      }}
                      title="Deactivate this workspace"
                    >
                      <XCircle size={13} />
                      <span>Deactivate</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenWorkspace(ws.id)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      fontSize: 12,
                      padding: '6px 14px',
                      fontWeight: 600,
                    }}
                  >
                    <span>{isActive ? 'Open Workspace' : 'Switch & Open'}</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State when no workspaces match search */}
      {filteredWorkspaces.length === 0 && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', marginBottom: 36 }}>
          <FolderKanban size={42} style={{ margin: '0 auto 14px', display: 'block', color: 'var(--border-hover)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            {filterTerm ? `No workspaces matching "${filterTerm}"` : 'No Research Workspaces Found'}
          </h3>
          <p style={{ fontSize: 13, maxWidth: 460, margin: '0 auto 18px', color: 'var(--text-secondary)' }}>
            Create an isolated workspace to organize papers, custom knowledge graphs, and research notes for a specific scientific domain.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openWorkspaceModal()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} />
            <span>Create New Workspace</span>
          </button>
        </div>
      )}

      {/* Quick-Start Scientific Topic Blueprints */}
      <div
        className="card"
        style={{
          padding: '24px 28px',
          borderRadius: 'var(--radius-lg, 12px)',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Quick-Start Scientific Blueprints
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
              Bootstrap an isolated research environment instantly from pre-configured scientific research topics.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {researchTemplates.map((tpl, i) => (
            <div
              key={i}
              style={{
                padding: '16px 18px',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="badge badge-purple" style={{ fontSize: 10.5 }}>
                    {tpl.badge}
                  </span>
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                  {tpl.title}
                </h4>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {tpl.description}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleLaunchTemplate(tpl)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Plus size={13} />
                <span>Launch Blueprint</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

