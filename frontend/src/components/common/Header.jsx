import React, { useState } from 'react';
import { Icons } from './Icons.jsx';

export function Header({
  currentView,
  searchQuery,
  onSearchSubmit,
  theme,
  onToggleTheme,
  healthStatus,
  isSearching
}) {
  const [localQuery, setLocalQuery] = useState(searchQuery || '');

  const viewTitles = {
    dashboard: 'Research workspace',
    search: 'Literature search',
    graph: 'Knowledge graph',
    gaps: 'Gap analysis',
    reader: 'Paper reader'
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && localQuery.trim()) {
      onSearchSubmit(localQuery);
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-breadcrumb">
          <span>Workspace</span>
          <span className="breadcrumb-separator">/</span>
          <h2 className="view-title">{viewTitles[currentView] || 'Scientific workstation'}</h2>
        </div>
        <div className="search-bar-global">
          <Icons.Search className="search-icon-global" width={14} height={14} />
          <input
            type="text"
            className="search-input-global"
            placeholder="Search papers, authors, DOIs, and repositories"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="header-right">
        <div className="status-indicator">
          <span className={`status-dot ${healthStatus?.status === 'offline' ? 'offline' : ''}`} />
          <span>{healthStatus?.status === 'offline' ? 'Offline' : 'Systems online'}</span>
        </div>

        <button className="btn-icon" onClick={onToggleTheme} title="Toggle Dark/Light Theme">
          {theme === 'dark' ? <Icons.Sun width={16} height={16} /> : <Icons.Moon width={16} height={16} />}
        </button>
      </div>
    </header>
  );
}
