import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('rc_theme') || 'light');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('rc_session_id') || `sess-${Math.random().toString(36).substring(2, 9)}`);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [systemConnected, setSystemConnected] = useState(true);
  
  // Persisted search & literature state
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('rc_search_query') || '');
  const [searchResults, setSearchResults] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_search_results');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [sourceCounts, setSourceCounts] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_source_counts');
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

  // Persisted comparisons
  const [comparisonPapers, setComparisonPapers] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_comparison_papers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persisted reader paper
  const [activeReaderPaper, setActiveReaderPaperState] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_reader_paper');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persisted papers added to graph
  const [addedToGraphPaperIds, setAddedToGraphPaperIds] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_added_graph_papers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save added to graph papers
  useEffect(() => {
    localStorage.setItem('rc_added_graph_papers', JSON.stringify(addedToGraphPaperIds));
  }, [addedToGraphPaperIds]);

  // Save session ID
  useEffect(() => {
    localStorage.setItem('rc_session_id', sessionId);
  }, [sessionId]);

  // Save search query
  useEffect(() => {
    localStorage.setItem('rc_search_query', searchQuery);
  }, [searchQuery]);

  // Save search results
  useEffect(() => {
    localStorage.setItem('rc_search_results', JSON.stringify(searchResults));
  }, [searchResults]);

  // Save source counts
  useEffect(() => {
    localStorage.setItem('rc_source_counts', JSON.stringify(sourceCounts));
  }, [sourceCounts]);

  // Save selected sources
  useEffect(() => {
    localStorage.setItem('rc_sources', JSON.stringify(selectedSources));
  }, [selectedSources]);

  // Save comparison papers
  useEffect(() => {
    localStorage.setItem('rc_comparison_papers', JSON.stringify(comparisonPapers));
  }, [comparisonPapers]);

  // Save active reader paper
  const setActiveReaderPaper = (paper) => {
    setActiveReaderPaperState(paper);
    if (paper) {
      localStorage.setItem('rc_reader_paper', JSON.stringify(paper));
    } else {
      localStorage.removeItem('rc_reader_paper');
    }
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
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
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
        setIsCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addComparisonPaper = (paper) => {
    if (comparisonPapers.length >= 5) {
      alert("Maximum 5 papers can be compared simultaneously.");
      return;
    }
    const pId = paper.id || paper.canonical_id;
    if (!comparisonPapers.some(p => (p.id || p.canonical_id) === pId)) {
      setComparisonPapers(prev => [...prev, paper]);
    }
  };

  const removeComparisonPaper = (paperId) => {
    setComparisonPapers(prev => prev.filter(p => (p.id || p.canonical_id) !== paperId));
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
    setAddedToGraphPaperIds([]);

    try {
      const res = await fetch('/api/v1/search/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          sources: sourcesToUse || selectedSources,
          limit_per_source: Number(limitNum),
          session_id: sessionId,
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
    setAddedToGraphPaperIds([]);
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        sessionId,
        setSessionId,
        createNewSession,
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

