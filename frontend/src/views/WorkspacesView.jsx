import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  Check,
  Trash2,
  Edit2,
  Archive,
  ArrowRight,
  BookOpen,
  Network,
  X,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function WorkspacesView() {
  const navigate = useNavigate();
  const {
    workspaces,
    setWorkspaces,
    activeWorkspace,
    switchWorkspace,
    deleteWorkspace,
    createWorkspace,
  } = useApp();

  // Toolbar & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'archived'
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'created' | 'name'

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState('blank'); // 'blank' | 'template'
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rename modal
  const [editingWs, setEditingWs] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Delete confirm modal
  const [deletingWs, setDeletingWs] = useState(null);

  // Research templates (moved into creation dialog)
  const researchTemplates = [
    {
      id: 'rag',
      title: 'Agentic RAG & Multi-Hop Reasoning',
      description: 'Autonomous retrieval-augmented generation architectures, multi-hop question answering, and chain-of-thought verification.',
      badge: 'RAG Architecture',
    },
    {
      id: 'diffusion',
      title: 'Diffusion Models & Generative Video',
      description: 'Score-based generative models, continuous-time diffusion, latent video synthesis, and consistency distillation.',
      badge: 'Multimodal',
    },
    {
      id: 'interpretability',
      title: 'Mechanistic Interpretability in Transformers',
      description: 'Probing attention circuits, superposition, dictionary learning, and representation steering in frontier models.',
      badge: 'Interpretability',
    },
    {
      id: 'agents',
      title: 'Autonomous Coding Agents & Tool Use',
      description: 'Self-correcting code synthesis, AST manipulation, sandboxed execution pipelines, and SWE-bench evaluation.',
      badge: 'Agentic Systems',
    },
  ];

  // Helper to read scoped counts from localStorage
  const getWorkspaceStats = (wsId) => {
    try {
      const results = JSON.parse(localStorage.getItem(`rc_ws_${wsId}_search_results`) || '[]');
      const graphs = JSON.parse(localStorage.getItem(`rc_ws_${wsId}_added_graph_papers`) || '[]');
      return {
        paperCount: Array.isArray(results) ? results.length : 0,
        graphCount: Array.isArray(graphs) ? graphs.length : 0,
      };
    } catch {
      return { paperCount: 0, graphCount: 0 };
    }
  };

  // Filter and sort workspaces
  const filteredWorkspaces = useMemo(() => {
    return workspaces
      .filter((ws) => {
        const isArchived = !!ws.state_json?.archived;
        if (statusFilter === 'active' && (isArchived || activeWorkspace?.id !== ws.id)) return false;
        if (statusFilter === 'archived' && !isArchived) return false;
        if (statusFilter === 'all' && isArchived) return false; // Default list excludes archived unless specified

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (ws.title || '').toLowerCase().includes(q);
        const descMatch = (ws.description || '').toLowerCase().includes(q);
        return titleMatch || descMatch;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (sortBy === 'created') {
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        }
        // default 'recent'
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [workspaces, searchQuery, statusFilter, sortBy, activeWorkspace]);

  // Handle open workspace
  const handleOpen = (wsId) => {
    switchWorkspace(wsId);
    navigate('/search');
  };

  // Handle workspace creation
  const handleCreate = async (e) => {
    e?.preventDefault();
    const titleToUse = createMode === 'template' && selectedTemplate ? selectedTemplate.title : newTitle.trim();
    const descToUse = createMode === 'template' && selectedTemplate ? selectedTemplate.description : newDesc.trim();

    if (!titleToUse) return;
    setIsSubmitting(true);
    try {
      const created = await createWorkspace(titleToUse, descToUse);
      if (created) {
        setIsCreateOpen(false);
        setNewTitle('');
        setNewDesc('');
        setSelectedTemplate(null);
        setCreateMode('blank');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle rename / edit
  const handleSaveEdit = async (e) => {
    e?.preventDefault();
    if (!editingWs || !editTitle.trim()) return;
    try {
      const res = await fetch(`/api/v1/workbench/workspaces/${editingWs.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        if (activeWorkspace?.id === updated.id) {
          switchWorkspace(updated.id);
        }
        setEditingWs(null);
      }
    } catch (err) {
      console.error('Failed to update workspace:', err);
    }
  };

  // Handle toggle archive
  const handleToggleArchive = async (ws) => {
    const isArchived = !ws.state_json?.archived;
    try {
      const res = await fetch(`/api/v1/workbench/workspaces/${ws.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_json: { archived: isArchived } }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      }
    } catch (err) {
      console.error('Failed to archive workspace:', err);
    }
  };

  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (!deletingWs) return;
    await deleteWorkspace(deletingWs.id);
    setDeletingWs(null);
  };

  return (
    <div className="view-container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── 1. Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'rgba(37, 99, 235, 0.1)',
                color: 'var(--accent-primary, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderKanban size={16} />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Research Workspaces
            </h1>
            <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 600 }}>
              {workspaces.length} {workspaces.length === 1 ? 'Workspace' : 'Workspaces'}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
            Manage isolated research environments, literature collections, and knowledge graph records.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setCreateMode('blank');
            setNewTitle('');
            setNewDesc('');
            setSelectedTemplate(null);
            setIsCreateOpen(true);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
        >
          <Plus size={14} />
          <span>Create Workspace</span>
        </button>
      </div>

      {/* ── 2. Workspace Toolbar ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '8px 12px',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', width: 280, minWidth: 200 }}>
          <Search
            size={13}
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspaces..."
            style={{
              width: '100%',
              fontSize: 12,
              padding: '5px 8px 5px 28px',
              borderRadius: 'var(--radius-xs, 4px)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 0,
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Filters and Sorting */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-secondary)', padding: 2, borderRadius: 'var(--radius-xs, 4px)' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'archived', label: 'Archived' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 3,
                  border: 'none',
                  background: statusFilter === tab.id ? 'var(--bg-card)' : 'transparent',
                  color: statusFilter === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: statusFilter === tab.id ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: statusFilter === tab.id ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              fontSize: 11.5,
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs, 4px)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="recent">Recently Updated</option>
            <option value="created">Recently Created</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* ── 3. Workspace List (Clean Table Layout) ── */}
      {filteredWorkspaces.length > 0 ? (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  WORKSPACE
                </th>
                <th style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', width: 140 }}>
                  INDEXED PAPERS
                </th>
                <th style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', width: 140 }}>
                  GRAPH NODES
                </th>
                <th style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', width: 120 }}>
                  STATUS
                </th>
                <th style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', width: 130 }}>
                  DATE
                </th>
                <th style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', width: 180 }}>
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkspaces.map((ws) => {
                const isActive = activeWorkspace && activeWorkspace.id === ws.id;
                const isArchived = !!ws.state_json?.archived;
                const stats = getWorkspaceStats(ws.id);

                return (
                  <tr
                    key={ws.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isActive ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                    }}
                  >
                    {/* Name & Description */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 4,
                            background: isActive ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-subtle)',
                            color: isActive ? 'var(--accent-primary, #2563eb)' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          <FolderKanban size={13} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              onClick={() => handleOpen(ws.id)}
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                              }}
                              title="Open workspace"
                            >
                              {ws.title}
                            </span>
                            {isActive && (
                              <span className="badge badge-emerald" style={{ fontSize: 9.5 }}>
                                Active
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4, maxWidth: 520 }}>
                            {ws.description || 'No description provided.'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Indexed Papers Count */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <BookOpen size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>{stats.paperCount}</span>
                      </div>
                    </td>

                    {/* Graph Nodes Count */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Network size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>{stats.graphCount}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      {isArchived ? (
                        <span className="badge badge-gray" style={{ fontSize: 10 }}>Archived</span>
                      ) : isActive ? (
                        <span className="badge badge-emerald" style={{ fontSize: 10 }}>In Use</span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>Ready</span>
                      )}
                    </td>

                    {/* Date */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {ws.created_at ? ws.created_at.slice(0, 10) : 'Recent'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpen(ws.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title="Open workspace"
                        >
                          <span>{isActive ? 'Continue' : 'Open'}</span>
                          <ArrowRight size={11} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingWs(ws);
                            setEditTitle(ws.title);
                            setEditDesc(ws.description || '');
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 6px' }}
                          title="Rename / Edit"
                        >
                          <Edit2 size={12} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleArchive(ws)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 6px', color: isArchived ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                          title={isArchived ? 'Unarchive' : 'Archive'}
                        >
                          <Archive size={12} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingWs(ws)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 6px', color: 'var(--accent-red, #ef4444)' }}
                          title="Delete workspace"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── 6. Clean Empty States ── */
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
          }}
        >
          <FolderKanban size={32} style={{ margin: '0 auto 10px', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            {searchQuery ? 'No Workspaces Found' : 'No Workspaces Created'}
          </h3>
          <p style={{ fontSize: 12, margin: '0 auto 16px', maxWidth: 400, lineHeight: 1.5 }}>
            {searchQuery
              ? `No research workspaces match the search query "${searchQuery}". Clear your search filter or create a new one.`
              : 'Create a research workspace to isolate literature search results, knowledge graph topology, and synthesis notes.'}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSearchQuery('');
              setIsCreateOpen(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <Plus size={13} />
            <span>Create Workspace</span>
          </button>
        </div>
      )}

      {/* ── 5. Clean Workspace Creation Modal ── */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
              width: '100%',
              maxWidth: 520,
              padding: '20px 24px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Create Research Workspace
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Mode Tabs: Blank vs Template */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', padding: 3, borderRadius: 'var(--radius-xs, 4px)', marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => {
                  setCreateMode('blank');
                  setSelectedTemplate(null);
                }}
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: '5px 10px',
                  borderRadius: 3,
                  border: 'none',
                  background: createMode === 'blank' ? 'var(--bg-card)' : 'transparent',
                  color: createMode === 'blank' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: createMode === 'blank' ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                Blank Workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateMode('template');
                  if (!selectedTemplate) setSelectedTemplate(researchTemplates[0]);
                }}
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: '5px 10px',
                  borderRadius: 3,
                  border: 'none',
                  background: createMode === 'template' ? 'var(--bg-card)' : 'transparent',
                  color: createMode === 'template' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: createMode === 'template' ? 600 : 400,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Sparkles size={11} style={{ color: 'var(--accent-primary)' }} />
                <span>Research Template</span>
              </button>
            </div>

            <form onSubmit={handleCreate}>
              {createMode === 'blank' ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. Quantization-Aware Training, Diffusion Models..."
                      required
                      autoFocus
                      style={{
                        width: '100%',
                        fontSize: 12.5,
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-xs, 4px)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Description (Optional)
                    </label>
                    <textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Research scope, questions, or target venue..."
                      rows={3}
                      style={{
                        width: '100%',
                        fontSize: 12.5,
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-xs, 4px)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                </>
              ) : (
                /* Template Selector */
                <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Select Research Blueprint:
                  </label>
                  {researchTemplates.map((t) => {
                    const isSel = selectedTemplate?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTemplate(t)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-xs, 4px)',
                          border: `1px solid ${isSel ? 'var(--accent-primary, #2563eb)' : 'var(--border-subtle)'}`,
                          background: isSel ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</span>
                          <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>{t.badge}</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.35 }}>
                          {t.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (createMode === 'blank' ? !newTitle.trim() : !selectedTemplate)}
                  className="btn btn-primary btn-sm"
                >
                  {isSubmitting ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 4. Rename / Edit Modal ── */}
      {editingWs && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
              width: '100%',
              maxWidth: 460,
              padding: '20px 24px',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-primary)' }}>
              Edit Workspace
            </h3>
            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Workspace Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    fontSize: 12.5,
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-xs, 4px)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Description
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    fontSize: 12.5,
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-xs, 4px)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditingWs(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editTitle.trim()}
                  className="btn btn-primary btn-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 4. Delete Confirmation Dialog ── */}
      {deletingWs && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
              width: '100%',
              maxWidth: 420,
              padding: '20px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, color: 'var(--accent-red, #ef4444)' }}>
              <AlertTriangle size={18} />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Delete Workspace?
              </h3>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.45 }}>
              Are you sure you want to delete <strong>"{deletingWs.title}"</strong>? This action cannot be undone and will permanently remove associated research graph and literature session records.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDeletingWs(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-sm"
                style={{ background: 'var(--accent-red, #ef4444)', color: '#fff', border: 'none' }}
              >
                Delete Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
