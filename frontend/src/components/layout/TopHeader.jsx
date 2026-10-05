import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Moon, Sun, RotateCw, Layers, ChevronRight, X, ChevronDown, PanelLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const VIEW_TITLES = {
  '/': 'Overview',
  '/overview': 'Overview',
  '/library': 'Research Library',
  '/library/reader': 'Paper Reader',
  '/library-reader': 'Paper Reader',
  '/create': 'Import Papers',
  '/chat': 'Research Chat',
  '/workspaces': 'Research Workspaces',
  '/search': 'Literature Search',
  '/search-results': 'Discovered Papers',
  '/knowledge-graph': 'Knowledge Graph',
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
  const isLibraryRoute = location.pathname.startsWith('/library') || location.pathname.startsWith('/library-reader');

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

      {!isLibraryRoute && (
        <div className="command-bar-trigger" id="btn-open-cmd-bar" onClick={openCmdPalette}>
          <Search size={14} style={{ marginRight: 6, color: 'var(--text-muted)' }} />
          <span>Search literature, DOIs, repositories...</span>
          <span className="kbd-badge">⌘K</span>
        </div>
      )}

      <div className="header-right">
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
