import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Network,
  FileText,
  Lightbulb,
  FlaskConical,
  PenTool,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
  const { systemConnected, searchResults } = useApp();

  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <div className="workspace-icon">RC</div>
        <div className="workspace-info">
          <h2>Research Copilot</h2>
          <span>Scientific Workspace</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {/* Section 1: Explore */}
        <div>
          <div className="nav-section-title">EXPLORE</div>
          <div className="nav-group">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <LayoutDashboard size={15} />
                <span>Overview</span>
              </div>
              <span className="nav-shortcut">1</span>
            </NavLink>

            <NavLink
              to="/search"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <Search size={15} />
                <span>Literature Search</span>
              </div>
              <span className="nav-shortcut">2</span>
            </NavLink>

            <NavLink
              to="/search-results"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <BookOpen size={15} />
                <span>Founded Papers</span>
              </div>
              {searchResults && searchResults.length > 0 ? (
                <span
                  className="nav-shortcut"
                  style={{
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    color: 'var(--accent-primary, #6366f1)',
                    borderColor: 'var(--accent-primary, #6366f1)',
                  }}
                >
                  {searchResults.length}
                </span>
              ) : (
                <span className="nav-shortcut">3</span>
              )}
            </NavLink>

            <NavLink
              to="/knowledge-graph"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <Network size={15} />
                <span>Knowledge Graph</span>
              </div>
              <span className="nav-shortcut">4</span>
            </NavLink>

            <NavLink
              to="/pdf-inspector"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <FileText size={15} />
                <span>Paper Reader</span>
              </div>
              <span className="nav-shortcut">5</span>
            </NavLink>
          </div>
        </div>

        {/* Section 2: Engineering */}
        <div>
          <div className="nav-section-title">ENGINEERING</div>
          <div className="nav-group">
            <NavLink
              to="/research-gaps"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <Lightbulb size={15} />
                <span>Research Gap Finder</span>
              </div>
            </NavLink>

            <NavLink
              to="/experiment-studio"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <FlaskConical size={15} />
                <span>Benchmarks & SOTA</span>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: 10, padding: '2px 5px' }}>Soon</span>
            </NavLink>

            <NavLink
              to="/manuscript"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <PenTool size={15} />
                <span>Manuscript Draft</span>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: 10, padding: '2px 5px' }}>Soon</span>
            </NavLink>
          </div>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="system-status-indicator">
          <div
            className="status-dot"
            id="mini-status-dot"
            style={{ backgroundColor: systemConnected ? '#10b981' : '#ef4444' }}
          ></div>
          <span id="mini-status-text">
            {systemConnected ? 'SQLite & API Connected' : 'API Connecting...'}
          </span>
        </div>
      </div>
    </aside>
  );
}
