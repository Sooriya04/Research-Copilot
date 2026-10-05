import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AppContext = createContext(null);

const getWsKey = (wsId, key) => (wsId ? `rc_ws_${wsId}_${key}` : `rc_${key}`);

// Safe storage utilities to prevent "DOMException: The quota has been exceeded" crashes
export const safeStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[Storage] Quota exceeded while writing '${key}'. Auto-pruning bloated caches...`);
    try {
      const keysToPurge = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (
          k.includes('_search_results') ||
          k.includes('_reader_paper') ||
          k.includes('_litgraph_data')
        )) {
          if (k !== key) {
            keysToPurge.push(k);
          }
        }
      }
      keysToPurge.forEach((k) => {
        try { localStorage.removeItem(k); } catch {}
      });
      localStorage.setItem(key, value);
    } catch {
      console.warn(`[Storage] Pruning insufficient for '${key}'. Skipping persistence.`);
    }
  }
};

export const safeStorageRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {}
};

// Compact large paper payloads before storing in 5MB-limited localStorage
const compactPaperForStorage = (p) => {
  if (!p) return null;
  return {
    id: p.id,
    title: p.title,
    authors: (p.authors || []).slice(0, 5),
    year: p.year,
    doi: p.doi,
    arxiv_id: p.arxiv_id,
    openalex_id: p.openalex_id,
    abstract: p.abstract ? String(p.abstract).slice(0, 300) : '',
    citation_count: p.citation_count || 0,
    primary_source: p.primary_source || 'unknown',
    url: p.url,
    pdf_url: p.pdf_url,
    topics: (p.topics || []).slice(0, 5),
  };
};

// Compact LitGraph data before storing in localStorage
const compactLitGraphForStorage = (data) => {
  if (!data) return null;
  return {
    target: data.target,
    nodes: (data.nodes || []).slice(0, 45).map((n) => ({
      id: n.id,
      title: n.title,
      authors: (n.authors || []).slice(0, 3),
      year: n.year,
      citationCount: n.citationCount || 0,
      radius: n.radius,
      isSeed: n.isSeed,
      url: n.url,
      doi: n.doi,
    })),
    links: (data.links || []).slice(0, 150).map((l) => ({
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      weight: l.weight,
    })),
  };
};

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('rc_theme') || 'light');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('rc_session_id') || `sess-${Math.random().toString(36).substring(2, 9)}`);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [systemConnected, setSystemConnected] = useState(true);

  // Responsive Sidebar States
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('rc_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('rc_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

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

  const DEFAULT_SOURCES = ['arxiv', 'openalex', 'semanticscholar'];

  const [selectedSources, setSelectedSources] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_sources');
      if (saved) {
        const parsed = JSON.parse(saved);
        // If user had the old noisy sources saved, reset to the clean default
        const noisySources = ['crossref', 'europepmc', 'pubmed', 'huggingface', 'paperswithcode'];
        const hasNoisy = parsed.some(s => noisySources.includes(s));
        if (hasNoisy) {
          localStorage.removeItem('rc_sources');
          return DEFAULT_SOURCES;
        }
        return parsed;
      }
      return DEFAULT_SOURCES;
    } catch {
      return DEFAULT_SOURCES;
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

  const [litGraphData, setLitGraphData] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      const saved = localStorage.getItem(getWsKey(ws?.id, 'litgraph_data'));
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [litGraphTarget, setLitGraphTarget] = useState(() => {
    try {
      const ws = JSON.parse(localStorage.getItem('rc_active_workspace') || 'null');
      return localStorage.getItem(getWsKey(ws?.id, 'litgraph_target')) || '';
    } catch {
      return '';
    }
  });

  // Proactive cleanup on mount to recover quota if browser storage is already full from previous crashes
  useEffect(() => {
    try {
      let totalLength = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (v) totalLength += v.length;
      }
      if (totalLength > 2000000) {
        console.info('[Storage] High localStorage usage detected. Auto-cleaning legacy cache blobs...');
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.includes('_reader_paper') || k.includes('_litgraph_data') || k.includes('_search_results'))) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch (e) {
      console.warn('[Storage] Startup cleanup notice:', e);
    }
  }, []);

  // Long-Term Workspace Research Memory & Hypotheses Ledger
  const [workspaceMemories, setWorkspaceMemories] = useState([]);

  const fetchWorkspaceMemories = async (wsId) => {
    if (!wsId) {
      setWorkspaceMemories([]);
      return [];
    }
    try {
      const res = await fetch(`/api/v1/workbench/workspaces/${wsId}/memories`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceMemories(data);
        return data;
      }
    } catch (e) {
      console.error('[AppContext] Failed to fetch workspace memories:', e);
    }
    return [];
  };

  const addWorkspaceMemory = async (wsId, memoryData) => {
    if (!wsId) return null;
    try {
      const res = await fetch(`/api/v1/workbench/workspaces/${wsId}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memoryData),
      });
      if (res.ok) {
        const created = await res.json();
        setWorkspaceMemories((prev) => [created, ...prev]);
        return created;
      }
    } catch (e) {
      console.error('[AppContext] Failed to add workspace memory:', e);
    }
    return null;
  };

  const deleteWorkspaceMemory = async (wsId, memId) => {
    if (!wsId || !memId) return;
    try {
      await fetch(`/api/v1/workbench/workspaces/${wsId}/memories/${memId}`, { method: 'DELETE' });
      setWorkspaceMemories((prev) => prev.filter((m) => m.id !== memId));
    } catch (e) {
      console.error('[AppContext] Failed to delete workspace memory:', e);
    }
  };

  useEffect(() => {
    if (activeWsId) {
      fetchWorkspaceMemories(activeWsId);
    } else {
      setWorkspaceMemories([]);
    }
  }, [activeWsId]);

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
      const savedLitData = localStorage.getItem(getWsKey(wsId, 'litgraph_data'));
      const savedLitTarget = localStorage.getItem(getWsKey(wsId, 'litgraph_target'));

      setSearchQuery(q);
      setSearchResults(savedResults ? JSON.parse(savedResults) : []);
      setSourceCounts(savedCounts ? JSON.parse(savedCounts) : {});
      setAddedToGraphPaperIds(savedGraphs ? JSON.parse(savedGraphs) : []);
      setActiveReaderPaperState(savedReader ? JSON.parse(savedReader) : null);
      setComparisonPapers(savedComparisons ? JSON.parse(savedComparisons) : []);
      setLitGraphData(savedLitData ? JSON.parse(savedLitData) : null);
      setLitGraphTarget(savedLitTarget || '');
    } catch (e) {
      console.error('Error loading workspace state:', e);
    }
  };

  // Helper to persist scoped state for active workspace safely without quota errors
  useEffect(() => {
    try {
      if (activeWsId) {
        safeStorageSet(getWsKey(activeWsId, 'search_query'), searchQuery || '');
        const compactResults = (searchResults || []).slice(0, 30).map(compactPaperForStorage);
        safeStorageSet(getWsKey(activeWsId, 'search_results'), JSON.stringify(compactResults));
        safeStorageSet(getWsKey(activeWsId, 'source_counts'), JSON.stringify(sourceCounts || {}));
        safeStorageSet(getWsKey(activeWsId, 'added_graph_papers'), JSON.stringify(addedToGraphPaperIds || []));
        safeStorageSet(getWsKey(activeWsId, 'comparison_papers'), JSON.stringify(comparisonPapers || []));
        
        if (activeReaderPaper) {
          safeStorageSet(getWsKey(activeWsId, 'reader_paper'), JSON.stringify(compactPaperForStorage(activeReaderPaper)));
        } else {
          safeStorageRemove(getWsKey(activeWsId, 'reader_paper'));
        }
        
        if (litGraphData) {
          safeStorageSet(getWsKey(activeWsId, 'litgraph_data'), JSON.stringify(compactLitGraphForStorage(litGraphData)));
        } else {
          safeStorageRemove(getWsKey(activeWsId, 'litgraph_data'));
        }
        
        if (litGraphTarget) {
          safeStorageSet(getWsKey(activeWsId, 'litgraph_target'), litGraphTarget);
        } else {
          safeStorageRemove(getWsKey(activeWsId, 'litgraph_target'));
        }
      } else {
        if (litGraphData) {
          safeStorageSet(getWsKey(null, 'litgraph_data'), JSON.stringify(compactLitGraphForStorage(litGraphData)));
        } else {
          safeStorageRemove(getWsKey(null, 'litgraph_data'));
        }
        if (litGraphTarget) {
          safeStorageSet(getWsKey(null, 'litgraph_target'), litGraphTarget);
        } else {
          safeStorageRemove(getWsKey(null, 'litgraph_target'));
        }
      }
    } catch (e) {
      console.warn('[Storage] Error persisting workspace state:', e);
    }
  }, [activeWsId, searchQuery, searchResults, sourceCounts, addedToGraphPaperIds, comparisonPapers, activeReaderPaper, litGraphData, litGraphTarget]);

  const openWorkspaceModal = (initialTitle = '') => {
    setWorkspaceModalInitialTitle(typeof initialTitle === 'string' ? initialTitle : '');
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
        safeStorageSet('rc_active_workspace', JSON.stringify(newWs));
        safeStorageSet('rc_active_workspace_id', newWs.id);
        safeStorageRemove('rc_workspace_deactivated');

        // Initialize clean state for this fresh workspace
        const initialQuery = title.trim();
        setSearchQuery(initialQuery);
        setSearchResults([]);
        setSourceCounts({});
        setAddedToGraphPaperIds([]);
        setActiveReaderPaperState(null);
        setComparisonPapers([]);

        safeStorageSet(getWsKey(newWs.id, 'search_query'), initialQuery);
        safeStorageSet(getWsKey(newWs.id, 'search_results'), '[]');
        safeStorageSet(getWsKey(newWs.id, 'source_counts'), '{}');
        safeStorageSet(getWsKey(newWs.id, 'added_graph_papers'), '[]');
        safeStorageSet(getWsKey(newWs.id, 'comparison_papers'), '[]');
        safeStorageRemove(getWsKey(newWs.id, 'reader_paper'));

        // Pre-fetch LitGraph in parallel for the newly created workspace topic and store it
        if (initialQuery) {
          fetch(`/api/v1/litgraph/query?q=${encodeURIComponent(initialQuery)}`)
            .then(async (lRes) => {
              if (lRes.ok) {
                const lData = await lRes.json();
                if (lData.nodes) {
                  const minR = 5, maxR = 24;
                  lData.nodes = lData.nodes.map((n) => {
                    const count = n.citationCount || 0;
                    const r = count > 0 ? Math.max(minR, Math.min(maxR, Math.sqrt(Math.log10(count + 1) * 80))) : minR;
                    return { ...n, radius: r };
                  });
                }
                setLitGraphData(lData);
                setLitGraphTarget(initialQuery);
                safeStorageSet(getWsKey(newWs.id, 'litgraph_data'), JSON.stringify(compactLitGraphForStorage(lData)));
                safeStorageSet(getWsKey(newWs.id, 'litgraph_target'), initialQuery);
              }
            })
            .catch(() => {});
        }

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
      safeStorageSet('rc_active_workspace', JSON.stringify(found));
      safeStorageSet('rc_active_workspace_id', found.id);
      safeStorageRemove('rc_workspace_deactivated');
      loadWorkspaceState(found.id, found.title);
    }
  };

  const deactivateWorkspace = () => {
    setActiveWorkspace(null);
    safeStorageRemove('rc_active_workspace');
    safeStorageRemove('rc_active_workspace_id');
    safeStorageSet('rc_workspace_deactivated', 'true');
    setSearchQuery('');
    setSearchResults([]);
    setSourceCounts({});
    setAddedToGraphPaperIds([]);
    setActiveReaderPaperState(null);
    setComparisonPapers([]);
    setLitGraphData(null);
    setLitGraphTarget('');
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

    const currentWsId = activeWorkspace?.id || null;

    // Parallel search in LitGraph to pre-fetch and store information
    fetch(`/api/v1/litgraph/query?q=${encodeURIComponent(q)}`)
      .then(async (lRes) => {
        if (lRes.ok) {
          const lData = await lRes.json();
          if (lData.nodes) {
            const minR = 5, maxR = 24;
            lData.nodes = lData.nodes.map((n) => {
              const count = n.citationCount || 0;
              const r = count > 0 ? Math.max(minR, Math.min(maxR, Math.sqrt(Math.log10(count + 1) * 80))) : minR;
              return { ...n, radius: r };
            });
          }
          setLitGraphData(lData);
          setLitGraphTarget(q);
          safeStorageSet(getWsKey(currentWsId, 'litgraph_data'), JSON.stringify(compactLitGraphForStorage(lData)));
          safeStorageSet(getWsKey(currentWsId, 'litgraph_target'), q);
        }
      })
      .catch((err) => {
        console.debug('Parallel LitGraph fetch error:', err);
      });

    try {
      const res = await fetch('/api/v1/search/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          sources: sourcesToUse || selectedSources,
          limit_per_source: Number(limitNum),
          workspace_id: currentWsId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const papers = data.papers || [];
        setSearchResults(papers);
        setSourceCounts(data.source_breakdown || {});
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
        litGraphData,
        setLitGraphData,
        litGraphTarget,
        setLitGraphTarget,
        workspaceMemories,
        fetchWorkspaceMemories,
        addWorkspaceMemory,
        deleteWorkspaceMemory,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        mobileSidebarOpen,
        setMobileSidebarOpen,
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
