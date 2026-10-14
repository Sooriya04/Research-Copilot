import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Moon, Sun, RotateCw, Layers, ChevronRight, X, ChevronDown, PanelLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const VIEW_TITLES = {
  '/': 'Overview',
  '/overview': 'Overview',
  '/create': 'Import Papers',
  '/chat': 'Research Chat',
  '/workspaces': 'Research Workspaces',
  '/search': 'Literature Search',
  '/search-results': 'Discovered Papers',
  '/knowledge-graph': 'Knowledge Graph',
  '/compare': 'Paper Comparison Matrix',
  '/matrix': 'Paper Comparison Matrix',
  '/paper-comparison': 'Paper Comparison Matrix',
  '/novelty': 'Novelty Studio',
  '/novelty-studio': 'Novelty Studio',
  '/litgraph': 'LitGraph',
  '/pdf-inspector': 'Paper Reader',
  '/experiment-studio': 'Benchmarks & SOTA',
  '/manuscript': 'Manuscript Draft',
  '/research-gaps': 'Research Gap Finder',
  '/settings': 'Settings',
};

export default function TopHeader() {
  const location = useLocation();
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

  const currentTitle = VIEW_TITLES[location.pathname] || location.pathname.replace('/', '').replace(/-/g, ' ') || 'Workspace';

  const handleSidebarToggle = () => {
    if (window.innerWidth <= 768) {
      setMobileSidebarOpen((v) => !v);
    } else {
      toggleSidebar();
    }
  };

  return (
    <header className="top-header">
      <div className="header-left">
        <button
          type="button"
          className="header-btn sidebar-toggle-btn"
          onClick={handleSidebarToggle}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ marginRight: 8, padding: '5px 7px', display: 'flex', alignItems: 'center' }}
          id="btn-sidebar-toggle"
        >
          <PanelLeft size={15} />
        </button>

        <div className="header-breadcrumbs">
          {/* Workspace Context Badge */}
          <div
            className={`header-workspace-badge ${activeWorkspace ? 'active' : 'default'}`}
            onClick={() => openWorkspaceModal()}
            title={activeWorkspace ? `Active Workspace: ${activeWorkspace.title} • Click to switch` : 'Click to select or create a workspace'}
          >
            <Layers
              size={13}
              style={{
                color: activeWorkspace ? 'var(--accent-primary, #3b82f6)' : 'var(--text-muted)',
                flexShrink: 0,
              }}
            />
            <span className="workspace-badge-title">
              {activeWorkspace ? activeWorkspace.title : 'Global Workspace'}
            </span>
            {activeWorkspace ? (
              <button
                type="button"
                className="workspace-badge-deactivate"
                onClick={(e) => {
                  e.stopPropagation();
                  deactivateWorkspace();
                }}
                title="Deactivate workspace (switch to global view)"
              >
                <X size={11} />
              </button>
            ) : (
              <ChevronDown size={11} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
            )}
          </div>

          <ChevronRight size={13} className="header-breadcrumb-separator" />

          {/* Current Page Title */}
          <strong id="header-view-title" className="header-current-title">
            {currentTitle}
          </strong>
        </div>
      </div>

      <div className="command-bar-trigger" id="btn-open-cmd-bar" onClick={openCmdPalette}>
        <Search size={14} style={{ marginRight: 6, color: 'var(--text-muted)' }} />
        <span>Search literature, DOIs, repositories...</span>
        <span className="kbd-badge">Cmd+K</span>
      </div>

      <div className="header-right">
        <a
          href="https://github.com/Sooriya04/Research-Copilot"
          target="_blank"
          rel="noopener noreferrer"
          className="header-btn"
          id="btn-github-repo"
          title="Star, review, or report issues on GitHub: Sooriya04/Research-Copilot"
          style={{ textDecoration: 'none' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
          <span>GitHub</span>
        </a>

        <button className="header-btn" id="btn-theme-toggle" title="Toggle Theme" onClick={toggleTheme}>
          {theme === 'dark' ? (
            <Sun size={14} id="theme-toggle-icon" />
          ) : (
            <Moon size={14} id="theme-toggle-icon" />
          )}
          <span>Theme</span>
        </button>
        <button
          className="header-btn"
          id="btn-refresh-all"
          title="Reload Data"
          onClick={() => window.location.reload()}
        >
          <RotateCw size={14} />
        </button>
      </div>
    </header>
  );
}
