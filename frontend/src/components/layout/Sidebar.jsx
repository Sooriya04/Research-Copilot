import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Search,
  BookOpen,
  Upload,
  Columns3,
  Network,
  Lightbulb,
  Workflow,
  FileText,
  MessageSquare,
  Settings,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const NAV_GROUPS = [
  {
    key: 'workspace',
    label: 'WORKSPACE',
    items: [
      {
        to: '/',
        label: 'Overview',
        icon: LayoutDashboard,
        end: true,
      },
      {
        to: '/workspaces',
        label: 'Workspaces',
        icon: FolderKanban,
      },
    ],
  },
  {
    key: 'research',
    label: 'RESEARCH',
    items: [
      {
        to: '/search',
        label: 'Literature Search',
        icon: Search,
      },
      {
        to: '/search-results',
        label: 'Discovered Papers',
        icon: BookOpen,
      },
      {
        to: '/create',
        label: 'Import Papers',
        icon: Upload,
      },
    ],
  },
  {
    key: 'analysis',
    label: 'ANALYSIS',
    items: [
      {
        to: '/compare',
        label: 'Feature Matrix',
        icon: Columns3,
        isActive: (loc) => loc.pathname === '/compare' || loc.pathname === '/matrix',
      },
      {
        to: '/knowledge-graph',
        label: 'Knowledge Graph',
        icon: Network,
        isActive: (loc) => loc.pathname === '/knowledge-graph',
      },
      {
        to: '/novelty',
        label: 'Novelty & Gaps',
        icon: Lightbulb,
        isActive: (loc) =>
          loc.pathname === '/novelty' ||
          loc.pathname === '/novelty-studio' ||
          loc.pathname === '/research-gaps',
      },
      {
        to: '/litgraph',
        label: 'LitGraph',
        icon: Workflow,
      },
    ],
  },
  {
    key: 'tools',
    label: 'TOOLS',
    items: [
      {
        to: '/pdf-inspector',
        label: 'Paper Reader',
        icon: FileText,
        isActive: (loc) =>
          loc.pathname === '/pdf-inspector' ||
          loc.pathname.startsWith('/pdf-inspector/'),
      },
      {
        to: '/chat',
        label: 'Research Chat',
        icon: MessageSquare,
      },
    ],
  },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    systemConnected,
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useApp();

  return (
    <aside
      className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`}
      id="main-sidebar"
    >
      {/* ── Brand Header ── */}
      <div className="sidebar-brand-header">
        {!sidebarCollapsed ? (
          <>
            <div
              className="sidebar-brand-content"
              onClick={() => navigate('/')}
              title="Research Copilot Home"
            >
              <div className="sidebar-brand-logo">
                <Sparkles size={14} style={{ color: '#fff' }} />
              </div>
              <div className="sidebar-brand-text">
                <h2 className="sidebar-brand-title">Research Copilot</h2>
                <span className="sidebar-brand-subtitle">AI Research Engineer</span>
              </div>
            </div>
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={toggleSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="sidebar-collapse-toggle collapsed-logo-btn"
            onClick={toggleSidebar}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <div className="sidebar-brand-logo mini">
              <Sparkles size={14} style={{ color: '#fff' }} />
            </div>
          </button>
        )}
      </div>

      {/* ── Scrollable Navigation Body ── */}
      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.key} className="sidebar-nav-group">
            <span className="sidebar-group-label">{group.label}</span>
            {group.items.map((item) => {
              const active = item.isActive
                ? item.isActive(location)
                : item.end
                ? location.pathname === item.to
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={`nav-item ${active ? 'active' : ''}`}
                  title={item.label}
                  onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
                >
                  <div className="nav-item-left">
                    <item.icon size={15} strokeWidth={1.8} className="nav-item-icon" />
                    <span className="nav-item-label">{item.label}</span>
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Sidebar Footer / Bottom Section ── */}
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Settings"
          onClick={() => mobileSidebarOpen && setMobileSidebarOpen(false)}
        >
          <div className="nav-item-left">
            <Settings size={15} strokeWidth={1.8} className="nav-item-icon" />
            <span className="nav-item-label">Settings</span>
          </div>
        </NavLink>

        {/* Database and API connection status */}
        <div
          className="sidebar-status-container"
          title={systemConnected ? 'Database & API Connected (SQLite)' : 'Connecting to API...'}
        >
          <div className="system-status-indicator">
            <span
              className={`status-dot ${systemConnected ? 'connected' : 'disconnected'}`}
            />
            {!sidebarCollapsed && (
              <span className="system-status-text">
                {systemConnected ? 'SQLite & API Connected' : 'API Connecting...'}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
