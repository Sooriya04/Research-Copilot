import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Moon, Sun, RotateCw, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const VIEW_TITLES = {
  '/': 'Overview',
  '/overview': 'Overview',
  '/library': 'Library',
  '/library/reader': 'Paper Reader',
  '/library-reader': 'Paper Reader',
  '/create': 'Import Papers',
  '/chat': 'Research Chat',
  '/workspaces': 'Research Workspaces Hub',
  '/search': 'Literature Search',
  '/search-results': 'Founded Papers',
  '/knowledge-graph': 'Knowledge Graph',
  '/litgraph': 'LitGraph',
  '/pdf-inspector': 'Paper Reader',
  '/experiment-studio': 'Benchmarks & SOTA',
  '/manuscript': 'Manuscript Draft',
  '/research-gaps': 'Research Gap Finder',
  '/settings': 'Settings',
};

export default function TopHeader() {
  const location = useLocation();
  const { theme, toggleTheme, openCmdPalette, activeWorkspace, openWorkspaceModal, deactivateWorkspace } = useApp();

  const currentTitle = VIEW_TITLES[location.pathname] || location.pathname.replace('/', '') || 'Workspace';
  const wsTitle = activeWorkspace ? activeWorkspace.title : 'Research Workspace';

  const isLibraryRoute = location.pathname.startsWith('/library') || location.pathname.startsWith('/library-reader');
  const isOverviewRoute = location.pathname === '/' || location.pathname === '/overview';

  return (
    <header className="top-header">
      <div className="header-left">
        {isLibraryRoute ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Research Library</span>
            {(location.pathname === '/library/reader' || location.pathname === '/library-reader') && (
              <>
                <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>/</span>
                <strong id="header-view-title" style={{ color: 'var(--text-primary)' }}>Paper Reader</strong>
              </>
            )}
          </>
        ) : isOverviewRoute ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Research Copilot</span>
            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>/</span>
            <strong id="header-view-title" style={{ color: 'var(--text-primary)' }}>Overview</strong>
          </>
        ) : location.pathname === '/settings' ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Research Copilot</span>
            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>/</span>
            <strong id="header-view-title" style={{ color: 'var(--text-primary)' }}>Settings</strong>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              onClick={() => openWorkspaceModal()}
              style={{ cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title="Click to switch or create workspace"
            >
              {wsTitle}
            </span>
            {activeWorkspace && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deactivateWorkspace();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: 0.7,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                title="Deactivate workspace (switch to global)"
              >
                <XCircle size={13} style={{ color: 'var(--accent-rose, #f43f5e)' }} />
              </button>
            )}
            <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>/</span>
            <strong id="header-view-title">{currentTitle}</strong>
          </div>
        )}
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
