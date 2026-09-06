import React from 'react';
import { Icons } from './Icons.jsx';

export function Sidebar({ currentView, onSelectView, onOpenCommandPalette }) {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: Icons.Overview, key: '1' },
    { id: 'search', label: 'Literature Search', icon: Icons.Search, key: '2' },
    { id: 'graph', label: 'Knowledge Graph', icon: Icons.KnowledgeGraph, key: '3' },
    { id: 'gaps', label: 'Gap Finder', icon: Icons.GapFinder, key: '4' },
    { id: 'reader', label: 'Paper Reader', icon: Icons.PaperReader, key: '5' }
  ];

  return (
    <aside className="sidebar">
      <div>
        <div className="brand-header">
          <div className="brand-icon" aria-hidden="true">RC</div>
          <div className="brand-title-group">
            <h1>Research Copilot</h1>
            <span className="brand-subtitle">Research engineering</span>
          </div>
        </div>

        <div className="nav-section-title">Research</div>
        <nav className="nav-menu">
          {navItems.map((item) => {
            const IconComp = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectView(item.id)}
              >
                <div className="nav-item-left">
                  <IconComp width={16} height={16} />
                  <span>{item.label}</span>
                </div>
                <span className="shortcut-badge">{item.key}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-status">
          <span className="status-dot" />
          <span>Knowledge services connected</span>
        </div>
        <button className="cmd-palette-trigger" onClick={onOpenCommandPalette}>
          <div className="flex items-center gap-2">
            <Icons.Command width={14} height={14} />
            <span>Command Palette</span>
          </div>
          <span className="shortcut-badge">Ctrl K</span>
        </button>
      </div>
    </aside>
  );
}
