import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Search,
  BookOpen,
  Network,
  FileText,
  Plus,
  FolderKanban,
  FolderPlus,
  Sparkles,
  GitBranch,
  Library,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
  const location = useLocation();
  const {
    systemConnected,
    searchResults,
    activeWorkspace,
    openWorkspaceModal,
  } = useApp();

  return (
    <aside className="sidebar">
      {/* Brand Header — perfectly aligned with TopHeader 56px height */}
      <div
        style={{
          height: 56,
          padding: '0 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <h2 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Research Copilot
          </h2>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            AI Research Engineer
          </span>
        </div>
      </div>

      <nav className="sidebar-nav" style={{ padding: '14px 12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* 1. Overview */}
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="nav-item-left">
            <LayoutDashboard size={15} />
            <span>Overview</span>
          </div>
        </NavLink>

        {/* 2. Workspace & Nested Hierarchy Tree */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavLink
            to="/workspaces"
            className={({ isActive }) =>
              `nav-item ${
                isActive ||
                ['/workspaces', '/search', '/search-results', '/knowledge-graph', '/pdf-inspector'].some(
                  (p) => location.pathname === p || location.pathname.startsWith(p + '/')
                )
                  ? 'active'
                  : ''
              }`
            }
          >
            <div className="nav-item-left">
              <FolderKanban size={15} />
              <span>Workspaces</span>
            </div>
          </NavLink>

          {/* Sub-tree: Rendered when user is on workspaces or inside any workspace tool */}
          {['/workspaces', '/search', '/search-results', '/knowledge-graph', '/pdf-inspector'].some(
            (p) => location.pathname === p || location.pathname.startsWith(p + '/')
          ) && (
            <div style={{ paddingLeft: 10, borderLeft: '1.5px solid var(--border-subtle)', marginLeft: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <NavLink
                to="/search"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '6px 10px' }}
              >
                <div className="nav-item-left">
                  <Search size={14} />
                  <span>Literature Search</span>
                </div>
              </NavLink>

              <NavLink
                to="/search-results"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '6px 10px' }}
              >
                <div className="nav-item-left">
                  <BookOpen size={14} />
                  <span>Founded Papers</span>
                </div>
                {searchResults && searchResults.length > 0 && (
                  <span
                    className="badge badge-blue"
                    style={{
                      fontSize: '0.68rem',
                      padding: '1px 6px',
                      borderRadius: '999px',
                    }}
                  >
                    {searchResults.length}
                  </span>
                )}
              </NavLink>

              <NavLink
                to="/knowledge-graph"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '6px 10px' }}
              >
                <div className="nav-item-left">
                  <Network size={14} />
                  <span>Knowledge Graph</span>
                </div>
              </NavLink>

              <NavLink
                to="/pdf-inspector"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ fontSize: 12.5, padding: '6px 10px' }}
              >
                <div className="nav-item-left">
                  <FileText size={14} />
                  <span>Paper Reader</span>
                </div>
              </NavLink>
            </div>
          )}
        </div>

        {/* 3. Library (Single Page Hub) */}
        <NavLink
          to="/library"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="nav-item-left">
            <Library size={15} />
            <span>Library</span>
          </div>
        </NavLink>
      </nav>

      {/* Footer — flush edge-to-edge border */}
      <div className="sidebar-footer" style={{ height: 48, padding: '0 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div className="system-status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            className="status-dot"
            id="mini-status-dot"
            style={{ backgroundColor: systemConnected ? '#10b981' : '#ef4444', width: 6, height: 6, borderRadius: '50%' }}
          ></div>
          <span id="mini-status-text" style={{ fontSize: 11.5 }}>
            {systemConnected ? 'SQLite & API Connected' : 'API Connecting...'}
          </span>
        </div>
      </div>
    </aside>
  );
}
