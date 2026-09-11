import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Moon, Sun, RotateCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const VIEW_TITLES = {
  '/': 'Overview',
  '/search': 'Literature Search',
  '/knowledge-graph': 'Knowledge Graph',
  '/pdf-inspector': 'Paper Reader',
  '/experiment-studio': 'Benchmarks & SOTA',
  '/manuscript': 'Manuscript Draft',
  '/research-gaps': 'Research Gap Finder',
};

export default function TopHeader() {
  const location = useLocation();
  const { theme, toggleTheme, openCmdPalette } = useApp();

  const currentTitle = VIEW_TITLES[location.pathname] || 'Workspace';

  return (
    <header className="top-header">
      <div className="header-left">
        <span>Workspace</span> / <strong id="header-view-title">{currentTitle}</strong>
      </div>

      <div className="command-bar-trigger" id="btn-open-cmd-bar" onClick={openCmdPalette}>
        <Search size={14} style={{ marginRight: 6, color: 'var(--text-muted)' }} />
        <span>Search literature, DOIs, repositories...</span>
        <span className="kbd-badge">⌘K</span>
      </div>

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
