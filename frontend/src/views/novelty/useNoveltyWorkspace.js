import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';

export function useNoveltyWorkspace(initialMechanism = 'all') {
  const {
    searchQuery,
    activeWorkspace,
    addedToGraphPaperIds,
    searchResults,
  } = useApp();

  const workspaceId = activeWorkspace?.id || null;
  const workspaceTitle = activeWorkspace?.title || 'Global Workspace';

  const [topic, setTopic] = useState(
    () => activeWorkspace?.title || searchQuery || 'Scientific Literature Synthesis'
  );
  const [availablePapers, setAvailablePapers] = useState([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(false);

  const [providersStatus, setProvidersStatus] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [selectedModel, setSelectedModel] = useState('');

  const [analysisDepth, setAnalysisDepth] = useState('focused'); // 'focused' | 'comprehensive'
  const [verifyPriorArt, setVerifyPriorArt] = useState(true);

  const [running, setRunning] = useState(false);
  const [activeStageIdx, setActiveStageIdx] = useState(-1);
  const [runError, setRunError] = useState(null);
  const [lastTelemetry, setLastTelemetry] = useState(null);

  const [proposals, setProposals] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [loadingGaps, setLoadingGaps] = useState(false);

  const [mechanismFilter, setMechanismFilter] = useState(initialMechanism);
  const [searchFilter, setSearchFilter] = useState('');
  const [addedCandidateIds, setAddedCandidateIds] = useState(new Set());
  const [addingGraphId, setAddingGraphId] = useState(null);
  const [toast, setToast] = useState(null);

  const notify = useCallback((type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Sync topic when workspace changes
  useEffect(() => {
    if (activeWorkspace?.title) {
      setTopic(activeWorkspace.title);
    } else if (searchQuery) {
      setTopic(searchQuery);
    }
  }, [activeWorkspace?.id, activeWorkspace?.title, searchQuery]);

  // Fetch configured providers
  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/novelty/providers-status');
      if (res.ok) {
        const data = await res.json();
        const map = data.providers || {};
        setProvidersStatus(map);
        // Auto-select first configured provider if current has no key
        const cur = map[selectedProvider];
        if (!cur || (!cur.configured && !cur.online)) {
          const firstReady = Object.entries(map).find(([, v]) => v.configured || v.online);
          if (firstReady) {
            setSelectedProvider(firstReady[0]);
            setSelectedModel(firstReady[1].default_model || '');
          }
        } else if (!selectedModel && cur.default_model) {
          setSelectedModel(cur.default_model);
        }
      }
    } catch (err) {
      console.error('Failed to load providers status:', err);
    }
  }, [selectedProvider, selectedModel]);

  // Fetch workspace grounding papers
  const fetchPapers = useCallback(async () => {
    setLoadingPapers(true);
    try {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/v1/novelty/workspace-papers${qs}`);
      let list = [];
      if (res.ok) {
        const data = await res.json();
        list = data.papers || [];
      }
      // Fallback to activeWorkspace.papers or search-staged graph papers
      if (list.length === 0 && activeWorkspace?.papers?.length > 0) {
        list = activeWorkspace.papers.map((p) => ({
          id: p.id || p.arxiv_id || p.paper_id,
          title: p.title || p.id,
          year: p.year,
          authors: p.authors || [],
          methods: p.methods || [],
          datasets: p.datasets || [],
        }));
      }
      if (list.length === 0 && addedToGraphPaperIds?.length > 0 && searchResults?.length > 0) {
        const stagedSet = new Set(addedToGraphPaperIds);
        list = searchResults
          .filter((p) => stagedSet.has(p.id || p.arxiv_id))
          .map((p) => ({
            id: p.id || p.arxiv_id,
            title: p.title,
            year: p.year,
            authors: p.authors || [],
            methods: [],
            datasets: [],
          }));
      }
      setAvailablePapers(list);
      setSelectedPaperIds(list.map((p) => p.id));
    } catch (err) {
      console.error('Failed to fetch workspace papers:', err);
    } finally {
      setLoadingPapers(false);
    }
  }, [workspaceId, activeWorkspace?.papers, addedToGraphPaperIds, searchResults]);

  // Fetch saved proposals from SQLite
  const fetchProposals = useCallback(async () => {
    try {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/v1/novelty/proposals${qs}`);
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch (err) {
      console.error('Failed to load saved proposals:', err);
    }
  }, [workspaceId]);

  // Fetch detected research gaps
  const fetchGaps = useCallback(async () => {
    setLoadingGaps(true);
    try {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/v1/graph/gaps${qs}`);
      if (res.ok) {
        const data = await res.json();
        setGaps(Array.isArray(data) ? data : data.gaps || []);
      }
    } catch (err) {
      console.error('Failed to load gaps:', err);
    } finally {
      setLoadingGaps(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchProviders();
    fetchPapers();
    fetchProposals();
    fetchGaps();
  }, [fetchProviders, fetchPapers, fetchProposals, fetchGaps]);

  const togglePaperSelection = (id) => {
    setSelectedPaperIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllPapers = () => setSelectedPaperIds(availablePapers.map((p) => p.id));
  const clearPaperSelection = () => setSelectedPaperIds([]);

  // Run Novelty Analysis (bridges cleanly to /api/v1/novelty/synthesize)
  const runAnalysis = async () => {
    setRunning(true);
    setRunError(null);
    setActiveStageIdx(0);

    // Advance visual stage indicator while synchronous backend synthesis runs
    const stageTimer = setInterval(() => {
      setActiveStageIdx((idx) => (idx < 6 ? idx + 1 : idx));
    }, 900);

    try {
      const res = await fetch('/api/v1/novelty/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim() || 'Scientific Literature Synthesis',
          workspace_id: workspaceId,
          paper_ids: selectedPaperIds,
          provider: selectedProvider,
          model: selectedModel || undefined,
          force_refresh: analysisDepth === 'comprehensive',
        }),
      });

      clearInterval(stageTimer);
      const data = await res.json();

      if (!res.ok) {
        const detail = data?.detail?.error || data?.detail || 'Novelty analysis failed.';
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }

      setActiveStageIdx(7);
      setLastTelemetry(data.telemetry || null);
      await fetchProposals();
      notify('success', `Generated ${data.novelties?.length || 0} grounded research proposal(s).`);
    } catch (err) {
      clearInterval(stageTimer);
      setRunError(err.message || 'Analysis failed.');
      setActiveStageIdx(-1);
    } finally {
      setRunning(false);
    }
  };

  const addProposalToGraph = async (proposal) => {
    setAddingGraphId(proposal.id);
    try {
      const res = await fetch('/api/v1/novelty/add-to-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId || 'global',
          topic,
          novelty: proposal,
        }),
      });
      if (!res.ok) throw new Error('Failed to inject candidate into Knowledge Graph');
      setAddedCandidateIds((prev) => new Set(prev).add(proposal.id));
      notify('success', `Added "${proposal.title}" as provisional candidate in Knowledge Graph.`);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setAddingGraphId(null);
    }
  };

  const deleteProposal = async (proposalId) => {
    try {
      const res = await fetch(`/api/v1/novelty/proposals/${encodeURIComponent(proposalId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProposals((prev) => prev.filter((p) => p.id !== proposalId));
        notify('info', 'Proposal deleted.');
      }
    } catch (err) {
      notify('error', `Failed to delete proposal: ${err.message}`);
    }
  };

  const clearAllProposals = async () => {
    try {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/v1/novelty/proposals${qs}`, { method: 'DELETE' });
      if (res.ok) {
        setProposals([]);
        notify('info', 'Cleared saved proposals for this workspace.');
      }
    } catch (err) {
      notify('error', `Failed to clear proposals: ${err.message}`);
    }
  };

  const createCustomProposal = async (form) => {
    const res = await fetch('/api/v1/novelty/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId || 'global',
        topic,
        ...form,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to save custom proposal');
    }
    const created = await res.json();
    setProposals((prev) => [created, ...prev]);
    notify('success', `Saved custom proposal "${created.title}".`);
    return created;
  };

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (mechanismFilter !== 'all' && p.mechanism !== mechanismFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const hay = `${p.title || ''} ${p.pitch || ''} ${p.novelty_statement || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [proposals, mechanismFilter, searchFilter]);

  return {
    workspaceId,
    workspaceTitle,
    topic,
    setTopic,
    availablePapers,
    selectedPaperIds,
    loadingPapers,
    togglePaperSelection,
    selectAllPapers,
    clearPaperSelection,
    providersStatus,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    analysisDepth,
    setAnalysisDepth,
    verifyPriorArt,
    setVerifyPriorArt,
    running,
    activeStageIdx,
    runError,
    lastTelemetry,
    runAnalysis,
    proposals,
    filteredProposals,
    gaps,
    loadingGaps,
    mechanismFilter,
    setMechanismFilter,
    searchFilter,
    setSearchFilter,
    addedCandidateIds,
    addingGraphId,
    addProposalToGraph,
    deleteProposal,
    clearAllProposals,
    createCustomProposal,
    toast,
  };
}
