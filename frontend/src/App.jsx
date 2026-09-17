import React, { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopHeader from './components/layout/TopHeader';
import CommandPaletteModal from './components/modals/CommandPaletteModal';
import PaperDetailModal from './components/modals/PaperDetailModal';
import CreateWorkspaceModal from './components/modals/CreateWorkspaceModal';

import OverviewView from './views/OverviewView';
import LiteratureSearchView from './views/LiteratureSearchView';
import LiteratureResultsView from './views/LiteratureResultsView';
import KnowledgeGraphView from './views/KnowledgeGraphView';
import LitGraphView from './views/LitGraphView';
import PaperReaderView from './views/PaperReaderView';
import LibraryView from './views/LibraryView';
import LibraryReaderView from './views/LibraryReaderView';
import ChatView from './views/ChatView';
import CreateView from './views/CreateView';
import BenchmarksView from './views/BenchmarksView';
import ManuscriptView from './views/ManuscriptView';
import ResearchGapView from './views/ResearchGapView';
import WorkspacesView from './views/WorkspacesView';

export default function App() {
  const navigate = useNavigate();

  // Numeric shortcuts 1, 2, 3, 4
  useEffect(() => {
    const handleNumberShortcuts = (e) => {
      if (['1', '2', '3', '4'].includes(e.key) && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        const routes = ['/', '/workspaces', '/library', '/search'];
        navigate(routes[parseInt(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', handleNumberShortcuts);
    return () => window.removeEventListener('keydown', handleNumberShortcuts);
  }, [navigate]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <TopHeader />
        <div className="content-body">
          <Routes>
            <Route path="/" element={<OverviewView />} />
            <Route path="/overview" element={<OverviewView />} />
            <Route path="/workspaces" element={<WorkspacesView />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/library/reader" element={<LibraryReaderView />} />
            <Route path="/library-reader" element={<LibraryReaderView />} />
            <Route path="/create" element={<CreateView />} />
            <Route path="/chat" element={<ChatView />} />
            <Route path="/search" element={<LiteratureSearchView />} />
            <Route path="/search-results" element={<LiteratureResultsView />} />
            <Route path="/knowledge-graph" element={<KnowledgeGraphView />} />
            <Route path="/litgraph" element={<LitGraphView />} />
            <Route path="/pdf-inspector" element={<PaperReaderView />} />
            <Route path="/experiment-studio" element={<BenchmarksView />} />
            <Route path="/manuscript" element={<ManuscriptView />} />
            <Route path="/research-gaps" element={<ResearchGapView />} />
            <Route path="*" element={<OverviewView />} />
          </Routes>
        </div>
      </main>

      <CommandPaletteModal />
      <PaperDetailModal />
      <CreateWorkspaceModal />
    </div>
  );
}
