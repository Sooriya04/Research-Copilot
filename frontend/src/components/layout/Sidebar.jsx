import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Network,
  FileText,
  Lightbulb,
  FlaskConical,
  PenTool,
  ChevronsUpDown,
  Plus,
  Check,
  Trash2,
  FolderPlus,
  FolderKanban,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
  const location = useLocation();
  const isOverview = location.pathname === '/';

  const {
    systemConnected,
    searchResults,
    workspaces,
    activeWorkspace,
    switchWorkspace,
    deleteWorkspace,
    openWorkspaceModal,
  } = useApp();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showWorkspaceTools = !isOverview && (activeWorkspace || workspaces.length > 0);

  return (
    <aside className="sidebar">
      {/* Interactive Workspace Switcher Header */}
      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <div
          className="workspace-switcher"
          onClick={() => setDropdownOpen((prev) => !prev)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title="Click to switch or create workspaces"
        >
          <div className="workspace-icon">
            {activeWorkspace ? activeWorkspace.title.substring(0, 2).toUpperCase() : 'RC'}
          </div>
          <div className="workspace-info" style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activeWorkspace ? activeWorkspace.title : 'Research Copilot'}
            </h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {activeWorkspace ? 'Active Workspace' : 'Select Workspace'}
            </span>
          </div>
          <ChevronsUpDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div
            className="card"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 10,
              right: 10,
              zIndex: 1000,
              padding: '8px 6px',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              maxHeight: 320,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                padding: '4px 8px 6px',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: 4,
              }}
            >
              Research Workspaces ({workspaces.length})
            </div>

            <div style={{ overflowY: 'auto', flex: 1, maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {workspaces.map((ws) => {
                const isActive = activeWorkspace && activeWorkspace.id === ws.id;
                return (
                  <div
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id);
                      setDropdownOpen(false);
                    }}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--bg-subtle)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                    className="workspace-menu-item"
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isActive && <Check size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: isActive ? 600 : 500,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ws.title}
                        </span>
                      </div>
                      {ws.description && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            paddingLeft: isActive ? 18 : 0,
                          }}
                        >
                          {ws.description}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete workspace "${ws.title}"?`)) {
                          deleteWorkspace(ws.id);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 2,
                        opacity: 0.6,
                      }}
                      title="Delete Workspace"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}

              {workspaces.length === 0 && (
                <div style={{ padding: '12px 8px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  No workspaces created yet.
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setDropdownOpen(false);
                  openWorkspaceModal();
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
              >
                <Plus size={13} />
                <span>New Research Workspace</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {/* Section 1: Explore & Literature */}
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
            </NavLink>

            <NavLink
              to="/workspaces"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="nav-item-left">
                <FolderKanban size={15} />
                <span>Workspaces</span>
              </div>
            </NavLink>

            {showWorkspaceTools && (
              <>
                <NavLink
                  to="/search"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="nav-item-left">
                    <Search size={15} />
                    <span>Literature Search</span>
                  </div>
                </NavLink>

                <NavLink
                  to="/search-results"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="nav-item-left">
                    <BookOpen size={15} />
                    <span>Founded Papers</span>
                  </div>
                  {searchResults && searchResults.length > 0 && (
                    <span
                      className="badge badge-blue"
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 6px',
                        borderRadius: '999px',
                      }}
                    >
                      {searchResults.length}
                    </span>
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
                </NavLink>

                <NavLink
                  to="/pdf-inspector"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="nav-item-left">
                    <FileText size={15} />
                    <span>Paper Reader</span>
                  </div>
                </NavLink>
              </>
            )}
          </div>
        </div>

        {/* Section 2: Research Reasoning & Engineering */}
        {showWorkspaceTools && (
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
                <span className="badge badge-neutral" style={{ fontSize: 9.5, padding: '1px 5px' }}>Soon</span>
              </NavLink>

              <NavLink
                to="/manuscript"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <div className="nav-item-left">
                  <PenTool size={15} />
                  <span>Manuscript Draft</span>
                </div>
                <span className="badge badge-neutral" style={{ fontSize: 9.5, padding: '1px 5px' }}>Soon</span>
              </NavLink>
            </div>
          </div>
        )}
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
