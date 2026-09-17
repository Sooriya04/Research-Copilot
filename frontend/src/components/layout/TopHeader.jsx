import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Moon, Sun, RotateCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const VIEW_TITLES = {
  '/': 'Overview',
  '/overview': 'Overview',
  '/library': 'Library',
  '/create': 'Import Papers',
  '/chat': 'Research Chat',
  '/workspaces': 'Research Workspaces Hub',
  '/search': 'Literature Search',
  '/search-results': 'Founded Papers',
  '/knowledge-graph': 'Knowledge Graph',
  '/pdf-inspector': 'Paper Reader',
  '/experiment-studio': 'Benchmarks & SOTA',
  '/manuscript': 'Manuscript Draft',
  '/research-gaps': 'Research Gap Finder',
};

export default function TopHeader() {
  const location = useLocation();
  const { theme, toggleTheme, openCmdPalette, activeWorkspace, openWorkspaceModal } = useApp();

  const currentTitle = VIEW_TITLES[location.pathname] || 'Workspace';
  const wsTitle = activeWorkspace ? activeWorkspace.title : 'Research Workspace';

  const isLibraryRoute = location.pathname === '/library';
  const isOverviewRoute = location.pathname === '/' || location.pathname === '/overview';

  return (
    <header className="top-header">
      <div className="header-left">
        {isLibraryRoute ? (
          <strong id="header-view-title" style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            Research Library
          </strong>
        ) : isOverviewRoute ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Research Copilot</span>
            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>/</span>
            <strong id="header-view-title" style={{ color: 'var(--text-primary)' }}>Overview</strong>
          </>
        ) : (
          <>
            <span
              onClick={openWorkspaceModal}
              style={{ cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title="Click to switch or create workspace"
            >
              {wsTitle}
            </span>
            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>/</span>
            <strong id="header-view-title">{currentTitle}</strong>
          </>
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
