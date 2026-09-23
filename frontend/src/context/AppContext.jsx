import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AppContext = createContext(null);

const getWsKey = (wsId, key) => (wsId ? `rc_ws_${wsId}_${key}` : `rc_${key}`);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('rc_theme') || 'light');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('rc_session_id') || `sess-${Math.random().toString(36).substring(2, 9)}`);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [systemConnected, setSystemConnected] = useState(true);

  // Workspace Management State
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    try {
      if (localStorage.getItem('rc_workspace_deactivated') === 'true') {
        return null;
      }
      const saved = localStorage.getItem('rc_active_workspace');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceModalInitialTitle, setWorkspaceModalInitialTitle] = useState('');

  // Active Workspace ID reference for state scoping
  const activeWsId = activeWorkspace?.id || null;

  // Workspace-Scoped States
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      return localStorage.getItem(getWsKey(ws?.id, 'search_query')) || (ws?.title || '');
    } catch {
      return '';
    }
  });

  const [searchResults, setSearchResults] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      const saved = localStorage.getItem(getWsKey(ws?.id, 'search_results'));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sourceCounts, setSourceCounts] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      const saved = localStorage.getItem(getWsKey(ws?.id, 'source_counts'));
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [selectedSources, setSelectedSources] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_sources');
      return saved ? JSON.parse(saved) : [
        'arxiv',
        'openalex',
        'semanticscholar',
        'crossref',
        'europepmc',
        'pubmed',
        'huggingface',
        'paperswithcode',
      ];
    } catch {
      return [
        'arxiv',
        'openalex',
        'semanticscholar',
        'crossref',
        'europepmc',
        'pubmed',
        'huggingface',
        'paperswithcode',
      ];
    }
  });

  const [comparisonPapers, setComparisonPapers] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      const saved = localStorage.getItem(getWsKey(ws?.id, 'comparison_papers'));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeReaderPaper, setActiveReaderPaperState] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      const saved = localStorage.getItem(getWsKey(ws?.id, 'reader_paper'));
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [addedToGraphPaperIds, setAddedToGraphPaperIds] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      const saved = localStorage.getItem(getWsKey(ws?.id, 'added_graph_papers'));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Fetch workspaces on initial mount
  const fetchWorkspaces = async () => {
    try {
      const res = await fetch('/api/v1/workbench/workspaces');
      if (res.ok) {
        const list = await res.json();
        setWorkspaces(list);
        // Check if user explicitly deactivated workspaces
        const isDeactivated = localStorage.getItem('rc_workspace_deactivated') === 'true';
        if (isDeactivated) {
          setActiveWorkspace(null);
          return;
        }

        const storedId = localStorage.getItem('rc_active_workspace_id');
        if (storedId && list.length > 0) {
          const found = list.find((w) => w.id === storedId);
          if (found) {
            setActiveWorkspace(found);
            localStorage.setItem('rc_active_workspace', JSON.stringify(found));
            loadWorkspaceState(found.id, found.title);
            return;
          }
        }

        // If no stored ID or workspace not found, do not force-activate list[0]
        setActiveWorkspace(null);
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  // Helper to load scoped state for a workspace
  const loadWorkspaceState = (wsId, defaultTitle = '') => {
    try {
      const q = localStorage.getItem(getWsKey(wsId, 'search_query')) ?? (defaultTitle || '');
      const savedResults = localStorage.getItem(getWsKey(wsId, 'search_results'));
      const savedCounts = localStorage.getItem(getWsKey(wsId, 'source_counts'));
      const savedGraphs = localStorage.getItem(getWsKey(wsId, 'added_graph_papers'));
      const savedReader = localStorage.getItem(getWsKey(wsId, 'reader_paper'));
      const savedComparisons = localStorage.getItem(getWsKey(wsId, 'comparison_papers'));

      setSearchQuery(q);
      setSearchResults(savedResults ? JSON.parse(savedResults) : []);
      setSourceCounts(savedCounts ? JSON.parse(savedCounts) : {});
      setAddedToGraphPaperIds(savedGraphs ? JSON.parse(savedGraphs) : []);
      setActiveReaderPaperState(savedReader ? JSON.parse(savedReader) : null);
      setComparisonPapers(savedComparisons ? JSON.parse(savedComparisons) : []);
    } catch (e) {
      console.error('Error loading workspace state:', e);
    }
  };

  // Helper to persist scoped state for active workspace
  useEffect(() => {
    if (activeWsId) {
      localStorage.setItem(getWsKey(activeWsId, 'search_query'), searchQuery);
      localStorage.setItem(getWsKey(activeWsId, 'search_results'), JSON.stringify(searchResults));
      localStorage.setItem(getWsKey(activeWsId, 'source_counts'), JSON.stringify(sourceCounts));
      localStorage.setItem(getWsKey(activeWsId, 'added_graph_papers'), JSON.stringify(addedToGraphPaperIds));
      localStorage.setItem(getWsKey(activeWsId, 'comparison_papers'), JSON.stringify(comparisonPapers));
      if (activeReaderPaper) {
        localStorage.setItem(getWsKey(activeWsId, 'reader_paper'), JSON.stringify(activeReaderPaper));
      } else {
        localStorage.removeItem(getWsKey(activeWsId, 'reader_paper'));
      }
    }
  }, [activeWsId, searchQuery, searchResults, sourceCounts, addedToGraphPaperIds, comparisonPapers, activeReaderPaper]);

  const openWorkspaceModal = (initialTitle = '') => {
    setWorkspaceModalInitialTitle(initialTitle || '');
    setIsWorkspaceModalOpen(true);
  };

  const closeWorkspaceModal = () => {
    setIsWorkspaceModalOpen(false);
    setWorkspaceModalInitialTitle('');
  };

  const createWorkspace = async (title, description = '') => {
    try {
      const res = await fetch('/api/v1/workbench/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (res.ok) {
        const newWs = await res.json();
        setWorkspaces((prev) => [newWs, ...prev.filter((w) => w.id !== newWs.id)]);
        setActiveWorkspace(newWs);
        localStorage.setItem('rc_active_workspace', JSON.stringify(newWs));
        localStorage.setItem('rc_active_workspace_id', newWs.id);
        localStorage.removeItem('rc_workspace_deactivated');

        // Initialize clean state for this fresh workspace
        const initialQuery = title.trim();
        setSearchQuery(initialQuery);
        setSearchResults([]);
        setSourceCounts({});
        setAddedToGraphPaperIds([]);
        setActiveReaderPaperState(null);
        setComparisonPapers([]);

        localStorage.setItem(getWsKey(newWs.id, 'search_query'), initialQuery);
        localStorage.setItem(getWsKey(newWs.id, 'search_results'), '[]');
        localStorage.setItem(getWsKey(newWs.id, 'source_counts'), '{}');
        localStorage.setItem(getWsKey(newWs.id, 'added_graph_papers'), '[]');
        localStorage.setItem(getWsKey(newWs.id, 'comparison_papers'), '[]');
        localStorage.removeItem(getWsKey(newWs.id, 'reader_paper'));

        closeWorkspaceModal();
        return newWs;
      }
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
    return null;
  };

  const switchWorkspace = (wsId) => {
    const found = workspaces.find((w) => w.id === wsId);
    if (found) {
      setActiveWorkspace(found);
      localStorage.setItem('rc_active_workspace', JSON.stringify(found));
      localStorage.setItem('rc_active_workspace_id', found.id);
      localStorage.removeItem('rc_workspace_deactivated');
      loadWorkspaceState(found.id, found.title);
    }
  };

  const deactivateWorkspace = () => {
    setActiveWorkspace(null);
    localStorage.removeItem('rc_active_workspace');
    localStorage.removeItem('rc_active_workspace_id');
    localStorage.setItem('rc_workspace_deactivated', 'true');
    setSearchQuery('');
    setSearchResults([]);
    setSourceCounts({});
    setAddedToGraphPaperIds([]);
    setActiveReaderPaperState(null);
    setComparisonPapers([]);
  };

  const deleteWorkspace = async (wsId) => {
    try {
      await fetch(`/api/v1/workbench/workspaces/${wsId}`, { method: 'DELETE' });
      const filtered = workspaces.filter((w) => w.id !== wsId);
      setWorkspaces(filtered);
      if (activeWorkspace && activeWorkspace.id === wsId) {
        setActiveWorkspace(null);
        localStorage.removeItem('rc_active_workspace');
        localStorage.removeItem('rc_active_workspace_id');
        localStorage.setItem('rc_workspace_deactivated', 'true');
        setSearchQuery('');
        setSearchResults([]);
        setSourceCounts({});
        setAddedToGraphPaperIds([]);
        setActiveReaderPaperState(null);
        setComparisonPapers([]);
      }
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  // Save selected sources
  useEffect(() => {
    localStorage.setItem('rc_sources', JSON.stringify(selectedSources));
  }, [selectedSources]);

  // Save active reader paper helper
  const setActiveReaderPaper = (paper) => {
    setActiveReaderPaperState(paper);
  };

  // Apply theme to document.body
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

  // Toggle theme
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Check system health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/v1/health');
        if (res.ok) {
          setSystemConnected(true);
        } else {
          setSystemConnected(false);
        }
      } catch (err) {
        setSystemConnected(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsCmdPaletteOpen(false);
        setSelectedPaper(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addComparisonPaper = (paper) => {
    if (comparisonPapers.length >= 5) {
      alert('Maximum 5 papers can be compared simultaneously.');
      return;
    }
    const pId = paper.id || paper.canonical_id;
    if (!comparisonPapers.some((p) => (p.id || p.canonical_id) === pId)) {
      setComparisonPapers((prev) => [...prev, paper]);
    }
  };

  const removeComparisonPaper = (paperId) => {
    setComparisonPapers((prev) => prev.filter((p) => (p.id || p.canonical_id) !== paperId));
  };

  const clearComparisonPapers = () => {
    setComparisonPapers([]);
  };

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const performSearch = async (queryText, limitNum = 10, sourcesToUse = null) => {
    const q = (queryText || searchQuery).trim();
    if (!q) return [];

    setSearchLoading(true);
    setSearchError(null);
    setSearchQuery(q);
    setSearchResults([]);
    setSourceCounts({});

    try {
      const res = await fetch('/api/v1/search/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          sources: sourcesToUse || selectedSources,
          limit_per_source: Number(limitNum),
          session_id: activeWorkspace ? activeWorkspace.id : sessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const papers = data.papers || [];
        setSearchResults(papers);
        setSourceCounts(data.source_breakdown || {});
        if (data.session_id) {
          setSessionId(data.session_id);
        }
        return papers;
      } else {
        const err = await res.text();
        setSearchError(`Search query error: ${err}`);
        return [];
      }
    } catch (err) {
      setSearchError(`Network error connecting to backend: ${err.message}`);
      return [];
    } finally {
      setSearchLoading(false);
    }
  };

  const createNewSession = (newQuery = '') => {
    const newId = `sess-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newId);
    setSearchQuery(newQuery);
    setSearchResults([]);
    setSourceCounts({});
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        sessionId,
        setSessionId,
        createNewSession,
        workspaces,
        activeWorkspace,
        isWorkspaceModalOpen,
        workspaceModalInitialTitle,
        openWorkspaceModal,
        closeWorkspaceModal,
        createWorkspace,
        switchWorkspace,
        deactivateWorkspace,
        deleteWorkspace,
        fetchWorkspaces,
        searchQuery,
        setSearchQuery,
        searchResults,
        setSearchResults,
        sourceCounts,
        setSourceCounts,
        selectedSources,
        setSelectedSources,
        addedToGraphPaperIds,
        setAddedToGraphPaperIds,
        isCmdPaletteOpen,
        openCmdPalette: () => setIsCmdPaletteOpen(true),
        closeCmdPalette: () => setIsCmdPaletteOpen(false),
        selectedPaper,
        openPaperModal: (paper) => setSelectedPaper(paper),
        closePaperModal: () => setSelectedPaper(null),
        systemConnected,
        comparisonPapers,
        addComparisonPaper,
        removeComparisonPaper,
        clearComparisonPapers,
        activeReaderPaper,
        setActiveReaderPaper,
        searchLoading,
        setSearchLoading,
        searchError,
        setSearchError,
        performSearch,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
