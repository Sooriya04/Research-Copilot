import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Network,
  FileText,
  Sparkles,
  Library,
  Workflow,
  Settings,
  Lightbulb,
  PanelLeftClose,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    systemConnected,
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useApp();

  const isPaperReaderActive = [
    '/pdf-inspector',
    '/library/reader',
    '/library-reader',
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
        </NavLink>

        {/* 2. Literature Search */}
        <NavLink
          to="/search"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Literature Search"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Search size={15} />
            <span>Literature Search</span>
          </div>
        </NavLink>

        {/* 3. Discovered Papers */}
        <NavLink
          to="/search-results"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Discovered Papers"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <BookOpen size={15} />
            <span>Discovered Papers</span>
          </div>
        </NavLink>

        {/* 4. Knowledge Graph */}
        <NavLink
          to="/knowledge-graph"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Knowledge Graph"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Network size={15} />
            <span>Knowledge Graph</span>
          </div>
        </NavLink>

        {/* 5. Novelty Studio */}
        <NavLink
          to="/novelty"
          className={({ isActive }) =>
            `nav-item ${isActive || location.pathname === '/novelty-studio' ? 'active' : ''}`
          }
          title="Novelty Studio"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Lightbulb size={15} />
            <span>Novelty Studio</span>
          </div>
        </NavLink>

        {/* 6. LitGraph */}
        <NavLink
          to="/litgraph"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="LitGraph"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Workflow size={15} />
            <span>LitGraph</span>
          </div>
        </NavLink>

        {/* 7. Paper Reader (Active Highlight) */}
        <NavLink
          to="/pdf-inspector"
          className={`nav-item ${isPaperReaderActive ? 'active paper-reader-active' : ''}`}
          title="Paper Reader"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <FileText size={15} />
            <span>Paper Reader</span>
          </div>
          {isPaperReaderActive && !sidebarCollapsed && (
            <span className="reader-active-indicator" title="Active Paper Reader" />
          )}
        </NavLink>

        {/* 8. Library */}
        <NavLink
          to="/library"
          className={({ isActive }) =>
            `nav-item ${isActive || (location.pathname.startsWith('/library') && !isPaperReaderActive) ? 'active' : ''}`
          }
          title="Research Library"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Library size={15} />
            <span>Library</span>
          </div>
        </NavLink>
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
