import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PanelLeft,
  Layers,
  ChevronRight,
  ChevronDown,
  X,
  Search,
  Sun,
  Moon,
  Settings,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const VIEW_TITLES = {
  '/': 'Overview',
  '/overview': 'Overview',
  '/workspaces': 'Research Workspaces',
  '/search': 'Literature Search',
  '/search-results': 'Discovered Papers',
  '/create': 'Import Papers',
  '/compare': 'Feature Matrix',
  '/matrix': 'Feature Matrix',
  '/paper-comparison': 'Feature Matrix',
  '/knowledge-graph': 'Knowledge Graph',
  '/novelty': 'Novelty & Gaps',
  '/novelty-studio': 'Novelty & Gaps',
  '/research-gaps': 'Novelty & Gaps',
  '/litgraph': 'LitGraph',
  '/pdf-inspector': 'Paper Reader',
  '/chat': 'Research Chat',
  '/settings': 'Settings',
  '/experiment-studio': 'Benchmarks & SOTA',
  '/manuscript': 'Manuscript Draft',
};

export default function TopHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    theme,
    toggleTheme,
    openCmdPalette,
    activeWorkspace,
    openWorkspaceModal,
    deactivateWorkspace,
    sidebarCollapsed,
    toggleSidebar,
    setMobileSidebarOpen,
  } = useApp();

  const handleSidebarToggle = () => {
    if (window.innerWidth <= 768) {
      setMobileSidebarOpen((v) => !v);
    } else {
      toggleSidebar();
    }
  };

  // Determine current page breadcrumb
  let currentTitle = VIEW_TITLES[location.pathname];
  if (!currentTitle) {
    if (location.pathname.startsWith('/pdf-inspector/')) {
      currentTitle = 'Paper Reader';
    } else {
      const cleanPath = location.pathname.replace(/^\//, '').replace(/-/g, ' ');
      currentTitle = cleanPath
        ? cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1)
        : 'Overview';
    }
  }

  return (
    <header className="top-header">
      {/* ── LEFT: Toggle, Persistent Workspace Selector & Breadcrumb ── */}
      <div className="header-left">
        <button
          type="button"
          className="header-icon-btn sidebar-toggle-btn"
          onClick={handleSidebarToggle}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          id="btn-sidebar-toggle"
        >
          <PanelLeft size={15} strokeWidth={1.8} />
        </button>

        <div className="header-breadcrumbs">
          {/* Persistent Workspace Selector */}
          <div
            className={`header-workspace-selector ${activeWorkspace ? 'active' : ''}`}
            onClick={() => openWorkspaceModal()}
            title={
              activeWorkspace
                ? `Active Workspace: ${activeWorkspace.title} • Click to switch`
                : 'Click to select or create a workspace'
            }
          >
            <Layers
              size={13}
              className="workspace-selector-icon"
              style={{
                color: activeWorkspace ? 'var(--accent-primary, #3b82f6)' : 'var(--text-muted)',
              }}
            />
            <span className="workspace-selector-title">
              {activeWorkspace ? activeWorkspace.title : 'Global Workspace'}
            </span>
            {activeWorkspace ? (
              <button
                type="button"
                className="workspace-selector-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  deactivateWorkspace();
                }}
                title="Switch to Global Workspace"
                aria-label="Deactivate workspace"
              >
                <X size={11} />
              </button>
            ) : (
              <ChevronDown size={11} className="workspace-selector-chevron" />
            )}
          </div>

          <ChevronRight size={13} className="header-breadcrumb-separator" />

          {/* Current Page Title */}
          <span className="header-breadcrumb-current" id="header-view-title">
            {currentTitle}
          </span>
        </div>
      </div>

      {/* ── CENTER: Global Search Bar ── */}
      <div
        className="header-center"
        onClick={openCmdPalette}
        id="btn-open-cmd-bar"
        title="Search literature, papers, workspaces... (Cmd+K)"
      >
        <div className="header-search-bar">
          <Search size={14} className="header-search-icon" />
          <span className="header-search-placeholder">
            Search papers, workspaces, topics...
          </span>
          <kbd className="header-search-kbd">⌘K</kbd>
        </div>
      </div>

      {/* ── RIGHT: Theme Toggle & Settings Shortcut ── */}
      <div className="header-right">
        <button
          type="button"
          className="header-icon-btn"
          id="btn-theme-toggle"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
        </button>

        <button
          type="button"
          className="header-icon-btn"
          id="btn-settings-shortcut"
          title="Settings"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <Settings size={15} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
