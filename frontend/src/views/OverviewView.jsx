import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  BookOpen,
  FolderKanban,
  Network,
  Columns3,
  FileText,
  ArrowRight,
  Clock,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function OverviewView() {
  const navigate = useNavigate();
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    openWorkspaceModal,
    performSearch,
    searchResults,
    activeReaderPaper,
    setActiveReaderPaper,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    indexedPapers: 0,
    activeWorkspaces: workspaces.length || 0,
    graphRelationships: 0,
  });

  // Fetch real statistics from database
  useEffect(() => {
    fetch('/api/v1/graph/summary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStats({
            indexedPapers: data.total_papers || 0,
            activeWorkspaces: workspaces.length || 0,
            graphRelationships: data.total_relationships || data.total_edges || 0,
          });
        }
      })
      .catch(() => {
        // Fallback to local counts if API unavailable
        setStats((prev) => ({
          ...prev,
          activeWorkspaces: workspaces.length,
          indexedPapers: searchResults?.length || 0,
        }));
      });
  }, [workspaces.length, searchResults?.length]);

  const handleSearch = (e) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    performSearch(q);
    navigate('/search-results');
  };

  // Recent accessed papers from current session / context
  const recentPapers = [];
  if (activeReaderPaper && activeReaderPaper.title) {
    recentPapers.push(activeReaderPaper);
  }
  if (searchResults && searchResults.length > 0) {
    searchResults.slice(0, 4).forEach((p) => {
      if (!recentPapers.some((rp) => (rp.id || rp.title) === (p.id || p.title))) {
        recentPapers.push(p);
      }
    });
  }

  return (
    <div className="view-container" style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
      {/* ── SECTION A: RESEARCH SEARCH ── */}
      <section style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Research Workspace
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Search across literature by research topic, paper title, DOI, or arXiv identifier.
        </p>

        <form onSubmit={handleSearch}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '6px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search research topic, title, DOI, or arXiv ID (e.g. 2312.00752)..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13.5,
                color: 'var(--text-primary)',
                padding: '8px 0',
              }}
            />
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="btn btn-primary btn-sm"
              style={{ padding: '6px 16px', fontSize: 12.5 }}
            >
              Search
            </button>
          </div>
        </form>
      </section>

      {/* ── SECTION B: RESEARCH STATISTICS ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {/* Stat 1: Total Indexed Papers */}
          <div
            style={{
              padding: '16px 18px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>Total Indexed Papers</span>
              <BookOpen size={15} style={{ color: 'var(--accent-primary, #2563eb)' }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.indexedPapers}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Registered scientific records</span>
          </div>

          {/* Stat 2: Active Workspaces */}
          <div
            style={{
              padding: '16px 18px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>Active Workspaces</span>
              <FolderKanban size={15} style={{ color: 'var(--accent-emerald, #10b981)' }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              {workspaces.length}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Current: {activeWorkspace?.title || 'Default'}
            </span>
          </div>

          {/* Stat 3: Knowledge Graph Relationships */}
          <div
            style={{
              padding: '16px 18px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>Graph Relationships</span>
              <Network size={15} style={{ color: 'var(--accent-purple, #8b5cf6)' }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.graphRelationships}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Inter-paper & method links</span>
          </div>
        </div>
      </section>

      {/* ── SECTION C: RECENT RESEARCH ACTIVITY ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px', letterSpacing: '-0.01em' }}>
          Recent Research Activity
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {/* Column 1: Recently Accessed Papers */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Recently Accessed Papers
              </span>
              <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
            </div>

            {recentPapers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentPapers.slice(0, 4).map((paper, idx) => (
                  <div
                    key={paper.id || idx}
                    onClick={() => {
                      setActiveReaderPaper(paper);
                      navigate(`/pdf-inspector?paper=${encodeURIComponent(paper.canonical_id || paper.id || paper.title)}`);
                    }}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-xs, 4px)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          lineHeight: 1.35,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {paper.title || 'Untitled Paper'}
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>
                        {paper.primary_source || 'Paper'} {paper.year ? `· ${paper.year}` : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {(paper.authors || []).map((a) => (typeof a === 'string' ? a : a.name)).slice(0, 2).join(', ') || 'Academic Authors'}
                      {activeReaderPaper?.title === paper.title && (
                        <span style={{ color: 'var(--accent-primary, #2563eb)', marginLeft: 6, fontWeight: 600 }}>
                          (Active in Reader)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No papers accessed yet. Search literature or load a paper to view it here.
              </div>
            )}
          </div>

          {/* Column 2: Recently Modified Workspaces */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Workspaces ({workspaces.length})
              </span>
              <button
                type="button"
                onClick={() => openWorkspaceModal()}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--accent-primary, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                <Plus size={12} />
                <span>New</span>
              </button>
            </div>

            {workspaces.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {workspaces.slice(0, 4).map((ws) => {
                  const isActive = activeWorkspace && activeWorkspace.id === ws.id;
                  return (
                    <div
                      key={ws.id}
                      onClick={() => {
                        switchWorkspace(ws.id);
                        navigate('/workspaces');
                      }}
                      style={{
                        padding: '10px 12px',
                        background: isActive ? 'var(--bg-subtle)' : 'transparent',
                        borderRadius: 'var(--radius-xs, 4px)',
                        border: `1px solid ${isActive ? 'var(--accent-primary, #2563eb)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {ws.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {ws.created_at ? `Created ${ws.created_at.slice(0, 10)}` : 'Active Workspace'}
                        </div>
                      </div>
                      {isActive ? (
                        <span className="badge badge-emerald" style={{ fontSize: 9.5 }}>Active</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Open →</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No workspaces created yet.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── SECTION D: QUICK RESEARCH ACTIONS ── */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px', letterSpacing: '-0.01em' }}>
          Quick Research Actions
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {/* Action 1: Literature Search */}
          <div
            onClick={() => navigate('/search')}
            style={{
              padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 4,
                  background: 'rgba(37, 99, 235, 0.1)',
                  color: 'var(--accent-primary, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Search size={15} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Literature Search</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Multi-source discovery</div>
              </div>
            </div>
            <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Action 2: Paper Comparison */}
          <div
            onClick={() => navigate('/compare')}
            style={{
              padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 4,
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: 'var(--accent-emerald, #10b981)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Columns3 size={15} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Paper Comparison</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>8-attribute matrix</div>
              </div>
            </div>
            <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Action 3: Knowledge Graph */}
          <div
            onClick={() => navigate('/knowledge-graph')}
            style={{
              padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 4,
                  background: 'rgba(139, 92, 246, 0.1)',
                  color: 'var(--accent-purple, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Network size={15} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Knowledge Graph</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Topology & bridges</div>
              </div>
            </div>
            <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
          </div>

          {/* Action 4: Paper Reader */}
          <div
            onClick={() => navigate('/pdf-inspector')}
            style={{
              padding: '14px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 4,
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: 'var(--accent-amber, #f59e0b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={15} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Paper Reader</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PDF & Markdown viewer</div>
              </div>
            </div>
            <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      </section>
    </div>
  );
}
