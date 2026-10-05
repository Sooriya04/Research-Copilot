import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Network,
  FileText,
  FolderKanban,
  Sparkles,
  Library,
  Workflow,
  Settings,
  Lightbulb,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  Layers,
  ChevronRight,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    systemConnected,
    activeWorkspace,
    openWorkspaceModal,
    setActiveReaderPaper,
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useApp();

  // Load recently viewed or library papers from localStorage
  const [recentPapers, setRecentPapers] = useState([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('rc_user_library_papers_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentPapers(parsed.slice(0, 4));
          return;
        }
      }
      // Fallback: active reader paper
      const activeP = localStorage.getItem('rc_active_reader_paper');
      if (activeP) {
        const parsed = JSON.parse(activeP);
        if (parsed?.title) {
          setRecentPapers([parsed]);
        }
      }
    } catch {
      setRecentPapers([]);
    }
  }, [location.pathname]);

  const handleOpenPaper = (paper) => {
    if (!paper) return;
    setActiveReaderPaper(paper);
    if (mobileSidebarOpen) setMobileSidebarOpen(false);
    navigate('/pdf-inspector');
  };

  const isWorkspaceRoute = [
    '/workspaces',
    '/search',
    '/search-results',
    '/knowledge-graph',
    '/novelty',
    '/novelty-studio',
    '/litgraph',
    '/pdf-inspector',
  ].some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));

  return (
    <aside
      className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`}
      id="main-sidebar"
    >
      {/* ── Brand Header ── */}
      <div className="sidebar-brand-header">
        {!sidebarCollapsed ? (
          <>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, cursor: 'pointer' }}
              onClick={() => navigate('/')}
              title="Research Copilot Home"
            >
              <div className="sidebar-brand-logo">
                <Sparkles size={15} style={{ color: '#fff' }} />
              </div>
              <div className="sidebar-brand-text">
                <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                  Research Copilot
                </h2>
                <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  AI Research Engineer
                </span>
              </div>
            </div>
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={toggleSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="sidebar-collapse-toggle collapsed-logo-btn"
            onClick={toggleSidebar}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <div className="sidebar-brand-logo mini">
              <Sparkles size={14} style={{ color: '#fff' }} />
            </div>
          </button>
        )}
      </div>

      {/* ── Scrollable Navigation Body ── */}
      <nav className="sidebar-nav">
        {/* 1. Overview */}
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Overview"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <LayoutDashboard size={15} />
            <span>Overview</span>
          </div>
          <span className="nav-shortcut">1</span>
        </NavLink>

        {/* 2. Workspace & Tools Tree */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavLink
            to="/workspaces"
            className={({ isActive }) => `nav-item ${isActive || isWorkspaceRoute ? 'active' : ''}`}
            title="Workspaces"
            onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
          >
            <div className="nav-item-left">
              <FolderKanban size={15} />
              <span>Workspaces</span>
            </div>
            <span className="nav-shortcut">2</span>
          </NavLink>

          {/* Sub-tree: Shown when expanded and on a workspace route */}
          {!sidebarCollapsed && isWorkspaceRoute && (
            <div className="sidebar-sub-tree">
              <NavLink
                to="/search"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '5px 10px' }}
                onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
              >
                <div className="nav-item-left">
                  <Search size={13} />
                  <span>Literature Search</span>
                </div>
              </NavLink>

              <NavLink
                to="/search-results"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '5px 10px' }}
                onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
              >
                <div className="nav-item-left">
                  <BookOpen size={13} />
                  <span>Discovered Papers</span>
                </div>
              </NavLink>

              <NavLink
                to="/knowledge-graph"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '5px 10px' }}
                onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
              >
                <div className="nav-item-left">
                  <Network size={13} />
                  <span>Knowledge Graph</span>
                </div>
              </NavLink>

              <NavLink
                to="/novelty"
                className={({ isActive }) =>
                  `nav-item ${isActive || location.pathname === '/novelty-studio' ? 'active' : ''}`
                }
                style={{ fontSize: 12.5, padding: '5px 10px' }}
                onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
              >
                <div className="nav-item-left">
                  <Lightbulb size={13} style={{ color: '#10b981' }} />
                  <span>Novelty Studio</span>
                </div>
              </NavLink>

              <NavLink
                to="/litgraph"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '5px 10px' }}
                onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
              >
                <div className="nav-item-left">
                  <Workflow size={13} />
                  <span>LitGraph</span>
                </div>
              </NavLink>

              <NavLink
                to="/pdf-inspector"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '5px 10px' }}
                onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
              >
                <div className="nav-item-left">
                  <FileText size={13} />
                  <span>Paper Reader</span>
                </div>
              </NavLink>
            </div>
          )}
        </div>

        {/* 3. Library */}
        <NavLink
          to="/library"
          className={({ isActive }) =>
            `nav-item ${isActive || location.pathname.startsWith('/library') ? 'active' : ''}`
          }
          title="Research Library"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Library size={15} />
            <span>Library</span>
          </div>
          <span className="nav-shortcut">3</span>
        </NavLink>

        {/* ── Middle Section (Active Workspace + Recent Papers) ── */}
        {!sidebarCollapsed && (
          <div className="sidebar-middle-section">
            {/* Active Workspace Card */}
            <div className="sidebar-workspace-card">
              <div className="sidebar-ws-header">
                <span className="sidebar-section-label">ACTIVE WORKSPACE</span>
                <button
                  type="button"
                  className="sidebar-ws-switch-btn"
                  onClick={openWorkspaceModal}
                  title="Switch workspace"
                >
                  Switch
                </button>
              </div>
              <div
                className="sidebar-ws-body"
                onClick={openWorkspaceModal}
                title="Click to switch or manage workspace"
              >
                <div className="sidebar-ws-icon">
                  <Layers size={13} style={{ color: activeWorkspace ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                </div>
                <div className="sidebar-ws-details">
                  <span className="sidebar-ws-title">
                    {activeWorkspace ? activeWorkspace.title : 'Global Workspace'}
                  </span>
                  <span className="sidebar-ws-meta">
                    {activeWorkspace?.papers?.length != null
                      ? `${activeWorkspace.papers.length} ${activeWorkspace.papers.length === 1 ? 'paper' : 'papers'}`
                      : 'All literature'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Papers List */}
            <div className="sidebar-recent-papers">
              <div className="sidebar-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                  <span className="sidebar-section-label">RECENT PAPERS</span>
                </div>
                <NavLink
                  to="/library"
                  className="sidebar-section-link"
                  onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
                >
                  View all
                </NavLink>
              </div>

              {recentPapers.length > 0 ? (
                <div className="sidebar-recent-list">
                  {recentPapers.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      className="sidebar-recent-item"
                      onClick={() => handleOpenPaper(p)}
                      title={p.title || 'View in Reader'}
                    >
                      <FileText size={12} className="sidebar-recent-icon" />
                      <div className="sidebar-recent-info">
                        <span className="sidebar-recent-title">
                          {p.title || 'Untitled Paper'}
                        </span>
                        {p.year && <span className="sidebar-recent-year">{p.year}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sidebar-empty-recent">
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    No papers viewed yet.
                  </p>
                  <NavLink
                    to="/search"
                    className="sidebar-quick-action-link"
                    onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
                  >
                    <Plus size={11} /> Search & Import
                  </NavLink>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Sidebar Footer ── */}
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Settings"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Settings size={15} />
            <span>Settings</span>
          </div>
        </NavLink>

        {/* System connection indicator */}
        <div className="sidebar-status-container">
          <div className="system-status-indicator" title={systemConnected ? 'Backend & SQLite connected' : 'Connecting to API...'}>
            <div
              className="status-dot"
              style={{ backgroundColor: systemConnected ? '#10b981' : '#ef4444' }}
            />
            {!sidebarCollapsed && (
              <span id="mini-status-text">
                {systemConnected ? 'SQLite & API Connected' : 'API Connecting...'}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
