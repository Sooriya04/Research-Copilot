import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import TopHeader from './components/layout/TopHeader';
import CommandPaletteModal from './components/modals/CommandPaletteModal';
import PaperDetailModal from './components/modals/PaperDetailModal';
import CreateWorkspaceModal from './components/modals/CreateWorkspaceModal';

const OverviewView = lazy(() => import('./views/OverviewView'));
const LiteratureSearchView = lazy(() => import('./views/LiteratureSearchView'));
const LiteratureResultsView = lazy(() => import('./views/LiteratureResultsView'));
const KnowledgeGraphView = lazy(() => import('./views/KnowledgeGraphView'));
const LitGraphView = lazy(() => import('./views/LitGraphView'));
const PaperReaderView = lazy(() => import('./views/PaperReaderView'));
const ChatView = lazy(() => import('./views/ChatView'));
const CreateView = lazy(() => import('./views/CreateView'));
const BenchmarksView = lazy(() => import('./views/BenchmarksView'));
const ManuscriptView = lazy(() => import('./views/ManuscriptView'));
const WorkspacesView = lazy(() => import('./views/WorkspacesView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const NoveltyStudioView = lazy(() => import('./views/NoveltyStudioView'));
const PaperComparisonView = lazy(() => import('./views/PaperComparisonView'));

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mobileSidebarOpen, setMobileSidebarOpen } = useApp();

  const isReaderRoute = location.pathname === '/pdf-inspector';

  // Numeric shortcuts 1, 2, 3, 4
  useEffect(() => {
    const handleNumberShortcuts = (e) => {
      if (['1', '2', '3', '4'].includes(e.key) && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        const routes = ['/', '/workspaces', '/search', '/knowledge-graph'];
        navigate(routes[parseInt(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', handleNumberShortcuts);
    return () => window.removeEventListener('keydown', handleNumberShortcuts);
  }, [navigate]);

  return (
    <div className="app-layout">
      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <Sidebar />
      <main className="main-content">
        {!isReaderRoute && <TopHeader />}
        <div className={`content-body ${isReaderRoute ? 'reader-body' : ''}`}>
          <Suspense fallback={<div className="view-loader-fallback" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '320px', color: '#94a3b8', fontSize: '14px' }}>Loading...</div>}>
            <Routes>
              <Route path="/" element={<OverviewView />} />
              <Route path="/overview" element={<OverviewView />} />
              <Route path="/workspaces" element={<WorkspacesView />} />
              <Route path="/create" element={<CreateView />} />
              <Route path="/chat" element={<ChatView />} />
              <Route path="/search" element={<LiteratureSearchView />} />
              <Route path="/search-results" element={<LiteratureResultsView />} />
              <Route path="/knowledge-graph" element={<KnowledgeGraphView />} />
              <Route path="/compare" element={<PaperComparisonView />} />
              <Route path="/matrix" element={<PaperComparisonView />} />
              <Route path="/paper-comparison" element={<PaperComparisonView />} />
              <Route path="/novelty" element={<NoveltyStudioView />} />
              <Route path="/novelty-studio" element={<NoveltyStudioView />} />
              <Route path="/litgraph" element={<LitGraphView />} />
              <Route path="/pdf-inspector" element={<PaperReaderView />} />
              <Route path="/experiment-studio" element={<BenchmarksView />} />
              <Route path="/manuscript" element={<ManuscriptView />} />
              <Route path="/research-gaps" element={<Navigate to="/novelty?mechanism=gap_realization" replace />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="*" element={<OverviewView />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      <CommandPaletteModal />
      <PaperDetailModal />
      <CreateWorkspaceModal />
    </div>
  );
}
