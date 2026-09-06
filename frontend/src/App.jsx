import React, { useState, useEffect, useCallback } from 'react';
import { ApiService } from './services/api.js';
import { Sidebar } from './components/common/Sidebar.jsx';
import { Header } from './components/common/Header.jsx';
import { OverviewView } from './components/views/OverviewView.jsx';
import { SearchView } from './components/views/SearchView.jsx';
import { KnowledgeGraphView } from './components/views/KnowledgeGraphView.jsx';
import { GapFinderView } from './components/views/GapFinderView.jsx';
import { PaperReaderView } from './components/views/PaperReaderView.jsx';
import { PaperDetailModal } from './components/views/PaperDetailModal.jsx';
import { CommandPalette } from './components/common/CommandPalette.jsx';

export function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('rc_theme') || 'light');
  const [searchQuery, setSearchQuery] = useState('');
  const [papers, setPapers] = useState([]);
  const [sourceCounts, setSourceCounts] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [healthStatus, setHealthStatus] = useState({ status: 'ok' });

  // Apply visual theme to document body
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
    localStorage.setItem('rc_theme', theme);
  }, [theme]);

  // Initial Health & Knowledge Graph Fetching
  useEffect(() => {
    const initApp = async () => {
      const health = await ApiService.getHealth();
      setHealthStatus(health);

      const graph = await ApiService.getKnowledgeGraph();
      if (graph) setGraphData(graph);
    };
    initApp();
  }, []);

  // Keyboard Shortcuts (1-5 for views, Ctrl+K / Cmd+K for command palette)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setSelectedPaper(null);
        return;
      }

      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === '1') setCurrentView('dashboard');
      if (e.key === '2') setCurrentView('search');
      if (e.key === '3') setCurrentView('graph');
      if (e.key === '4') setCurrentView('gaps');
      if (e.key === '5') setCurrentView('reader');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Dynamic Multi-Source Search Handler
  const handleSearch = useCallback(async (query, filter = 'all') => {
    if (!query || !query.trim()) return;
    setSearchQuery(query);
    setIsSearching(true);
    try {
      if (filter === 'all') {
        const res = await ApiService.searchUnified(query);
        setPapers(res.papers || []);
        setSourceCounts(res.source_counts || null);
      } else {
        const res = await ApiService.searchProvider(filter, query);
        setPapers(res.papers || res.results || []);
      }
    } catch (err) {
      console.error('Search request failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="app-layout">
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      <div className="workspace-container">
        <Header
          currentView={currentView}
          searchQuery={searchQuery}
          onSearchSubmit={(q) => handleSearch(q)}
          theme={theme}
          onToggleTheme={toggleTheme}
          healthStatus={healthStatus}
          isSearching={isSearching}
        />

        <main className="content-area">
          {currentView === 'dashboard' && (
            <OverviewView
              papers={papers}
              graphData={graphData}
              onExecuteSearch={handleSearch}
              onSelectPaper={setSelectedPaper}
              onNavigateView={setCurrentView}
              searchQuery={searchQuery}
            />
          )}

          {currentView === 'search' && (
            <SearchView
              papers={papers}
              searchQuery={searchQuery}
              onExecuteSearch={handleSearch}
              onSelectPaper={setSelectedPaper}
              onExtractPdf={(paperObj) => {
                setSelectedPaper(paperObj);
                setCurrentView('reader');
              }}
              isSearching={isSearching}
              sourceCounts={sourceCounts}
            />
          )}

          {currentView === 'graph' && (
            <KnowledgeGraphView
              graphData={graphData}
              papers={papers}
              onSelectPaper={setSelectedPaper}
            />
          )}

          {currentView === 'gaps' && (
            <GapFinderView
              papers={papers}
              searchQuery={searchQuery}
              onExecuteSearch={handleSearch}
            />
          )}

          {currentView === 'reader' && (
            <PaperReaderView selectedPaper={selectedPaper} />
          )}
        </main>
      </div>

      <PaperDetailModal
        paper={selectedPaper}
        onClose={() => setSelectedPaper(null)}
        onExtractPdf={(paperObj) => {
          setSelectedPaper(paperObj);
          setCurrentView('reader');
        }}
        onNavigateView={setCurrentView}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectView={setCurrentView}
        onToggleTheme={toggleTheme}
        onExecuteSearch={handleSearch}
      />
    </div>
  );
}
