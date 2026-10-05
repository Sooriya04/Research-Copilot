import React, { useState, useEffect, useMemo } from 'react';
import {
  Lightbulb,
  Zap,
  Sparkles,
  Server,
  Cpu,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RotateCw,
  Copy,
  Check,
  CheckSquare,
  Square,
  Plus,
  MessageSquare,
  Network,
  Columns3,
  LayoutGrid,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  Radio,
  FileText,
  Activity,
  Code2,
  Database,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Key,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MathRenderer from '../components/common/MathRenderer';

export default function NoveltyStudioView() {
  const navigate = useNavigate();
  const { searchQuery, activeWorkspace, theme } = useApp();

  // Topic and Papers state
  const [topic, setTopic] = useState(() => searchQuery || activeWorkspace?.title || 'Time Series Forecasting');
  const [availablePapers, setAvailablePapers] = useState([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(false);

  // Providers & Models state
  const [providersStatus, setProvidersStatus] = useState(null);
  const [selectedProviders, setSelectedProviders] = useState(['gemini']); // Array of active engines: ['gemini', 'groq', 'ollama', 'openrouter', 'nvidia']
  const selectedProvider = selectedProviders.length === 1 ? selectedProviders[0] : (selectedProviders.length === 5 ? 'all' : selectedProviders.join(','));
  const [selectedModel, setSelectedModel] = useState('');
  const [groqKeyOverride, setGroqKeyOverride] = useState(() => localStorage.getItem('rc_groq_key') || '');
  const [geminiKeyOverride, setGeminiKeyOverride] = useState(() => localStorage.getItem('rc_gemini_key') || '');
  const [openrouterKeyOverride, setOpenrouterKeyOverride] = useState(() => localStorage.getItem('rc_openrouter_key') || '');
  const [nvidiaKeyOverride, setNvidiaKeyOverride] = useState(() => localStorage.getItem('rc_nvidia_key') || '');
  const [ollamaUrlOverride, setOllamaUrlOverride] = useState(() => localStorage.getItem('rc_ollama_url') || 'http://localhost:11434');
  const [testTargetProvider, setTestTargetProvider] = useState('gemini');
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [showKeyPassword, setShowKeyPassword] = useState(false);

  // Multi-selection helper functions
  const toggleProvider = (id) => {
    setSelectedProviders((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((p) => p !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const selectOnlyProvider = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedProviders([id]);
  };

  const selectAllProviders = () => {
    setSelectedProviders(['gemini', 'groq', 'ollama', 'openrouter', 'nvidia']);
  };

  const selectCloudProviders = () => {
    setSelectedProviders(['gemini', 'groq', 'openrouter', 'nvidia']);
  };

  // Connection testing state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Synthesis state & results (persisted in localStorage and SQLite)
  const [synthesizing, setSynthesizing] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [noveltyResults, setNoveltyResults] = useState(() => {
    try {
      const wsKey = activeWorkspace?.id ? `rc_ws_${activeWorkspace.id}_novelty_results` : 'rc_novelty_results';
      const saved = localStorage.getItem(wsKey) || localStorage.getItem('rc_novelty_results');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [lastTelemetry, setLastTelemetry] = useState(null);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Custom Novelty Authoring Modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState({
    title: '',
    mechanism: 'recombination',
    pitch: '',
    novelty_statement: '',
    mathematical_formulation: '',
    testable_hypothesis: '',
    target_datasets: '',
    baselines_to_beat: '',
    expected_metrics: '',
    grounded_paper_ids: [],
    confidence_score: 0.9,
  });
  const [creatingCustom, setCreatingCustom] = useState(false);

  // Filter & View Mode
  const [mechanismFilter, setMechanismFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'compare'
  const [copiedId, setCopiedId] = useState(null);
  const [addedCandidateIds, setAddedCandidateIds] = useState(new Set());
  const [addingId, setAddingId] = useState(null);

  // Responsive Masonry Column state
  const [autoColumnCount, setAutoColumnCount] = useState(() => {
    if (typeof window === 'undefined') return 3;
    const width = window.innerWidth;
    if (width < 768) return 1;
    if (width < 1280) return 2;
    if (width < 1800) return 3;
    return 4;
  });
  const [customColumnCount, setCustomColumnCount] = useState(null);
  const activeColumnCount = customColumnCount || autoColumnCount;

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) setAutoColumnCount(1);
      else if (width < 1280) setAutoColumnCount(2);
      else if (width < 1800) setAutoColumnCount(3);
      else setAutoColumnCount(4);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDark = theme === 'dark';

  // Persist noveltyResults to localStorage whenever they change
  useEffect(() => {
    try {
      if (noveltyResults && noveltyResults.length > 0) {
        const wsKey = activeWorkspace?.id ? `rc_ws_${activeWorkspace.id}_novelty_results` : 'rc_novelty_results';
        localStorage.setItem(wsKey, JSON.stringify(noveltyResults));
        localStorage.setItem('rc_novelty_results', JSON.stringify(noveltyResults));
      }
    } catch (e) {
      console.warn('Failed saving novelty results to localStorage:', e);
    }
  }, [noveltyResults, activeWorkspace?.id]);

  // 1. Fetch Providers Status, Workspace Papers, and Saved Proposals on mount or workspace switch
  useEffect(() => {
    try {
      const wsKey = activeWorkspace?.id ? `rc_ws_${activeWorkspace.id}_novelty_results` : 'rc_novelty_results';
      const saved = localStorage.getItem(wsKey) || localStorage.getItem('rc_novelty_results');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNoveltyResults(parsed);
        }
      }
    } catch {}
    fetchProvidersStatus();
    fetchWorkspacePapers();
    fetchSavedProposals();
  }, [activeWorkspace?.id]);

  const addTelemetryLog = (msg) => {
    const timeStr = new Date().toLocaleTimeString();
    setTelemetryLogs((prev) => [`[${timeStr}] ${msg}`, ...prev.slice(0, 19)]);
  };

  const fetchProvidersStatus = async () => {
    try {
      addTelemetryLog('Querying backend for LLM providers status...');
      const res = await fetch('/api/v1/novelty/providers-status');
      if (res.ok) {
        const data = await res.json();
        setProvidersStatus(data.providers);
        addTelemetryLog('Provider status received: Gemini, Groq, Ollama registered.');
      }
    } catch (err) {
      console.error('Failed fetching provider status:', err);
      addTelemetryLog(`Failed fetching provider status: ${err.message}`);
    }
  };

  const handleSaveKeyToDb = async (provider, apiKey, model, baseUrl) => {
    setSavingKey(true);
    setErrorMsg(null);
    addTelemetryLog(`Saving ${provider.toUpperCase()} credentials into SQLite database...`);
    try {
      const res = await fetch('/api/v1/novelty/save-provider-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          api_key: apiKey || null,
          model: model || null,
          base_url: baseUrl || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg(`✅ ${provider.toUpperCase()} credentials permanently saved to SQLite database!`);
        addTelemetryLog(`SQLite DB updated for ${provider}: Masked ${data.api_key_masked || 'OK'}`);
        if (provider === 'groq') localStorage.setItem('rc_groq_key', apiKey || '');
        if (provider === 'gemini') localStorage.setItem('rc_gemini_key', apiKey || '');
        if (provider === 'openrouter') localStorage.setItem('rc_openrouter_key', apiKey || '');
        if (provider === 'nvidia') localStorage.setItem('rc_nvidia_key', apiKey || '');
        await fetchProvidersStatus();
      } else {
        setErrorMsg(data.detail || `Failed to save ${provider} credentials in SQLite`);
        addTelemetryLog(`Error saving to SQLite: ${data.detail || 'Failed'}`);
      }
    } catch (err) {
      setErrorMsg(`Failed saving key: ${err.message}`);
      addTelemetryLog(`Network error saving key to SQLite: ${err.message}`);
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveKeyFromDb = async (provider) => {
    addTelemetryLog(`Removing ${provider.toUpperCase()} credentials from SQLite DB...`);
    try {
      const res = await fetch(`/api/v1/novelty/remove-provider-key/${provider}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setToastMsg(`🗑️ ${provider.toUpperCase()} credentials removed from SQLite database.`);
        addTelemetryLog(`Removed ${provider} credentials from SQLite DB.`);
        if (provider === 'groq') { setGroqKeyOverride(''); localStorage.removeItem('rc_groq_key'); }
        if (provider === 'gemini') { setGeminiKeyOverride(''); localStorage.removeItem('rc_gemini_key'); }
        if (provider === 'openrouter') { setOpenrouterKeyOverride(''); localStorage.removeItem('rc_openrouter_key'); }
        if (provider === 'nvidia') { setNvidiaKeyOverride(''); localStorage.removeItem('rc_nvidia_key'); }
        await fetchProvidersStatus();
      }
    } catch (err) {
      setErrorMsg(`Error removing key: ${err.message}`);
    }
  };

  const fetchWorkspacePapers = async () => {
    setLoadingPapers(true);
    try {
      const res = await fetch('/api/v1/novelty/workspace-papers');
      if (res.ok) {
        const data = await res.json();
        const papers = data.papers || [];
        setAvailablePapers(papers);
        setSelectedPaperIds(papers.map((p) => p.id));
        addTelemetryLog(`Loaded ${papers.length} active literature papers from knowledge graph.`);
      }
    } catch (err) {
      console.error('Failed fetching workspace papers:', err);
    } finally {
      setLoadingPapers(false);
    }
  };

  const fetchSavedProposals = async () => {
    try {
      const wsKey = activeWorkspace?.id || 'global';
      const res = await fetch(`/api/v1/novelty/proposals?workspace_id=${encodeURIComponent(wsKey)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.proposals && Array.isArray(data.proposals) && data.proposals.length > 0) {
          setNoveltyResults((prev) => {
            const idMap = new Map();
            for (const p of data.proposals) {
              idMap.set(p.id, p);
            }
            for (const p of prev || []) {
              if (!idMap.has(p.id)) {
                idMap.set(p.id, p);
              }
            }
            const merged = Array.from(idMap.values());
            try {
              const wsKey = activeWorkspace?.id ? `rc_ws_${activeWorkspace.id}_novelty_results` : 'rc_novelty_results';
              localStorage.setItem(wsKey, JSON.stringify(merged));
              localStorage.setItem('rc_novelty_results', JSON.stringify(merged));
            } catch {}
            return merged;
          });
          addTelemetryLog(`Loaded ${data.proposals.length} saved novelty proposals from SQLite.`);
        }
      }
    } catch (err) {
      console.warn('Could not fetch saved proposals:', err);
    }
  };

  const handleCreateCustomNovelty = async (e) => {
    if (e) e.preventDefault();
    if (!customForm.title.trim()) {
      setErrorMsg('Please enter a proposal title.');
      return;
    }

    setCreatingCustom(true);
    setErrorMsg(null);
    try {
      const activeTopic = (topic || searchQuery || activeWorkspace?.title || 'Literature Synthesis').trim();
      const payload = {
        workspace_id: activeWorkspace?.id || null,
        topic: activeTopic,
        title: customForm.title.trim(),
        mechanism: customForm.mechanism || 'recombination',
        pitch: customForm.pitch.trim() || 'Custom user-authored scientific novelty proposal.',
        novelty_statement: customForm.novelty_statement.trim() || customForm.title.trim(),
        mathematical_formulation: customForm.mathematical_formulation.trim() || 'Formulation defined by researcher.',
        testable_hypothesis: customForm.testable_hypothesis.trim() || 'Empirical validation across target benchmarks.',
        target_datasets: customForm.target_datasets
          ? customForm.target_datasets.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        baselines_to_beat: customForm.baselines_to_beat
          ? customForm.baselines_to_beat.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        expected_metrics: customForm.expected_metrics
          ? customForm.expected_metrics.split(',').map((s) => s.trim()).filter(Boolean)
          : ['MSE', 'MAE'],
        grounded_paper_ids: customForm.grounded_paper_ids || [],
        grounded_paper_titles: (customForm.grounded_paper_ids || []).map((id) => {
          const p = availablePapers.find((ap) => ap.id === id);
          return p ? p.title : id;
        }),
        confidence_score: parseFloat(customForm.confidence_score) || 0.9,
      };

      const res = await fetch('/api/v1/novelty/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setNoveltyResults((prev) => [created, ...(prev || [])]);
        setToastMsg(`✨ Successfully added your novelty: "${created.title}"`);
        addTelemetryLog(`User authored novelty created: "${created.title}" (id=${created.id})`);
        setShowCustomModal(false);
        setCustomForm({
          title: '',
          mechanism: 'recombination',
          pitch: '',
          novelty_statement: '',
          mathematical_formulation: '',
          testable_hypothesis: '',
          target_datasets: '',
          baselines_to_beat: '',
          expected_metrics: '',
          grounded_paper_ids: [],
          confidence_score: 0.9,
        });
      } else {
        const errJson = await res.json().catch(() => ({ detail: 'Failed creating proposal' }));
        setErrorMsg(errJson.detail || 'Failed creating proposal');
      }
    } catch (err) {
      setErrorMsg(`Failed creating custom proposal: ${err.message}`);
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleDeleteProposal = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this novelty proposal from your deck?')) return;
    try {
      await fetch(`/api/v1/novelty/proposals/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setNoveltyResults((prev) => prev.filter((p) => p.id !== id));
      setToastMsg('Proposal removed from deck.');
      addTelemetryLog(`Deleted proposal ${id}.`);
    } catch (err) {
      console.warn('Failed deleting proposal:', err);
    }
  };

  const handleClearAllProposals = async () => {
    if (!window.confirm('Clear all novelty proposals from this workspace deck?')) return;
    try {
      const wsKey = activeWorkspace?.id || 'global';
      await fetch(`/api/v1/novelty/proposals?workspace_id=${encodeURIComponent(wsKey)}`, { method: 'DELETE' });
      setNoveltyResults([]);
      const storageKey = activeWorkspace?.id ? `rc_ws_${activeWorkspace.id}_novelty_results` : 'rc_novelty_results';
      localStorage.removeItem(storageKey);
      localStorage.removeItem('rc_novelty_results');
      setToastMsg('Deck cleared.');
      addTelemetryLog('Cleared all proposals from deck.');
    } catch (err) {
      console.warn('Failed clearing deck:', err);
    }
  };

  // 2. Test Connection
  const handleTestConnection = async (overrideTarget) => {
    setTestingConnection(true);
    setTestResult(null);
    const target = overrideTarget || testTargetProvider || selectedProviders[0] || 'gemini';
    addTelemetryLog(`Testing connectivity to provider: ${target.toUpperCase()}...`);
    try {
      const payload = {
        provider: target === 'all' ? 'gemini' : target,
        api_key:
          target === 'groq'
            ? groqKeyOverride
            : target === 'gemini'
            ? geminiKeyOverride
            : target === 'openrouter'
            ? openrouterKeyOverride
            : target === 'nvidia'
            ? nvidiaKeyOverride
            : undefined,
        base_url: target === 'ollama' ? ollamaUrlOverride : undefined,
        model: selectedModel || undefined,
      };

      const res = await fetch('/api/v1/novelty/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        setTestResult(result);
        if (result.success) {
          addTelemetryLog(`Backend verified: ${result.provider} responsive in ${result.latency_ms}ms.`);
        } else {
          addTelemetryLog(`Connection probe returned error: ${result.error}`);
        }
      } else {
        const errText = await res.text();
        setTestResult({ success: false, error: `HTTP ${res.status}: ${errText}` });
        addTelemetryLog(`Connection test failed: HTTP ${res.status}`);
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      addTelemetryLog(`Connection test exception: ${err.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // 3. Fire Synthesis
  const handleSynthesize = async () => {
    if (selectedProviders.length === 0) {
      setErrorMsg('Please select at least one LLM engine to synthesize novelty.');
      return;
    }

    setSynthesizing(true);
    setErrorMsg(null);
    setToastMsg(null);

    const activeTopic = (topic || searchQuery || activeWorkspace?.title || 'Literature Synthesis').trim();
    const activePids = selectedPaperIds.length > 0 ? selectedPaperIds : availablePapers.map((p) => p.id);

    const provStr = selectedProviders.length === 1 ? selectedProviders[0] : (selectedProviders.length === 5 ? 'all' : selectedProviders.join(','));
    addTelemetryLog(
      `Firing synthesis -> POST /api/v1/novelty/synthesize (engines=[${selectedProviders.join(', ')}], papers=${activePids.length})...`
    );

    try {
      const payload = {
        topic: activeTopic,
        workspace_id: activeWorkspace?.id || null,
        paper_ids: activePids,
        provider: provStr,
        providers: selectedProviders,
        model: selectedModel || undefined,
        api_key:
          selectedProviders.length === 1
            ? (selectedProviders[0] === 'groq'
                ? groqKeyOverride || undefined
                : selectedProviders[0] === 'gemini'
                ? geminiKeyOverride || undefined
                : selectedProviders[0] === 'openrouter'
                ? openrouterKeyOverride || undefined
                : selectedProviders[0] === 'nvidia'
                ? nvidiaKeyOverride || undefined
                : undefined)
            : undefined,
        base_url: selectedProviders.includes('ollama') ? ollamaUrlOverride || undefined : undefined,
        force_refresh: forceRefresh,
      };

      const res = await fetch('/api/v1/novelty/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setNoveltyResults(data.novelties || []);
        setLastTelemetry(data.telemetry);

        const duration = data.telemetry?.duration_ms || 0;
        const count = (data.novelties || []).length;
        const isCached = data.telemetry?.cached || data.cached;

        addTelemetryLog(
          `Synthesis success: Received ${count} novelty proposals in ${duration}ms (${isCached ? 'SQLite Cache' : 'Live LLM'}).`
        );
        setToastMsg(`Synthesized ${count} research novelty proposals via ${data.provider || selectedProvider}!`);
      } else {
        const errJson = await res.json().catch(() => ({ detail: 'Synthesis failed' }));
        const errMsg = typeof errJson.detail === 'object' ? errJson.detail.error : errJson.detail;
        setErrorMsg(errMsg || `Synthesis request failed with status ${res.status}`);
        addTelemetryLog(`Synthesis failed: ${errMsg}`);
      }
    } catch (err) {
      setErrorMsg(`Synthesis network error: ${err.message}`);
      addTelemetryLog(`Network exception during synthesis: ${err.message}`);
    } finally {
      setSynthesizing(false);
    }
  };

  // 4. Add Novelty to Knowledge Graph Canvas
  const handleAddToGraph = async (novelty) => {
    setAddingId(novelty.id);
    try {
      const res = await fetch('/api/v1/novelty/add-to-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: activeWorkspace?.id || null,
          topic: topic,
          novelty,
        }),
      });
      if (res.ok) {
        setAddedCandidateIds((prev) => new Set([...prev, novelty.id]));
        setToastMsg(`Candidate node "${novelty.title}" added to Knowledge Graph!`);
        addTelemetryLog(`Injected candidate node into Knowledge Graph: cand-${novelty.id}`);
      }
    } catch (err) {
      console.error('Failed adding candidate node to graph:', err);
    } finally {
      setAddingId(null);
    }
  };

  // 5. Copy Proposal Markdown
  const handleCopyProposal = (nov) => {
    const md = `### ${nov.title}
**Mechanism**: ${nov.mechanism} (${nov.engine || 'AI Engine'})
**Hypothesis**: ${nov.testable_hypothesis}

**Mathematical Formulation**:
\`\`\`latex
${nov.mathematical_formulation || 'N/A'}
\`\`\`

**Grounded Papers**: ${(nov.grounded_paper_titles || []).join(', ')}
**Target Datasets**: ${(nov.target_datasets || []).join(', ')}
**Baselines to Beat**: ${(nov.baselines_to_beat || []).join(', ')}`;

    navigator.clipboard.writeText(md);
    setCopiedId(nov.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered Novelty list
  const filteredNovelties = useMemo(() => {
    return (noveltyResults || []).filter((n) => {
      const matchMech = mechanismFilter === 'all' || (n.mechanism || '').toLowerCase() === mechanismFilter.toLowerCase();
      const matchProv =
        providerFilter === 'all' ||
        (providerFilter === 'custom' && (n.is_custom || (n.engine || '').toLowerCase() === 'custom')) ||
        (n.engine || '').toLowerCase() === providerFilter.toLowerCase();
      return matchMech && matchProv;
    });
  }, [noveltyResults, mechanismFilter, providerFilter]);

  // Grouped for side-by-side comparison mode
  const comparisonByEngine = useMemo(() => {
    const groups = { gemini: [], groq: [], ollama: [], openrouter: [], nvidia: [], custom: [], heuristic: [] };
    (noveltyResults || []).forEach((n) => {
      const eng = (n.engine || 'gemini').toLowerCase();
      if (n.is_custom || eng === 'custom') {
        groups.custom.push(n);
      } else if (groups[eng]) {
        groups[eng].push(n);
      } else {
        groups.heuristic.push(n);
      }
    });
    return groups;
  }, [noveltyResults]);

  // Masonry column grouping: Distributes cards across columns to avoid uneven row gaps
  const masonryColumns = useMemo(() => {
    const count = Math.max(1, activeColumnCount);
    const cols = Array.from({ length: count }, () => []);
    (filteredNovelties || []).forEach((nov, idx) => {
      cols[idx % count].push(nov);
    });
    return cols;
  }, [filteredNovelties, activeColumnCount]);

  return (
    <div className="view-panel active" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* 1. Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Lightbulb size={18} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Research Novelty Studio
            </h1>
            <span
              className="badge"
              style={{
                background: isDark ? '#064e3b' : '#ecfdf5',
                color: '#10b981',
                border: '1px solid #10b981',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Multi-LLM Engine
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Autonomous scientific novelty synthesis across <strong>Google Gemini</strong>, <strong>Groq LPU</strong>, <strong>Local Ollama</strong>, <strong>OpenRouter</strong>, and <strong>NVIDIA NIM</strong>, grounded in Knowledge Graph topology.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <SlidersHorizontal size={13} />
            <span>Engines & Keys</span>
            {showConfigDrawer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            title="Open Vis.js Knowledge Graph Canvas"
          >
            <Network size={13} />
            <span>Graph Canvas</span>
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowCustomModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
              color: '#8b5cf6',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm, 6px)',
              cursor: 'pointer',
            }}
            title="Create and add your own custom novelty proposal"
          >
            <Plus size={14} />
            <span>Add Custom Novelty</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={handleSynthesize}
            disabled={synthesizing || selectedProviders.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              fontWeight: 600,
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
            }}
          >
            {synthesizing ? <RotateCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
            <span>
              {synthesizing
                ? 'Synthesizing...'
                : selectedProviders.length === 5
                ? 'Fire Tournament (All 5 Engines)'
                : selectedProviders.length === 1
                ? `Fire Synthesis (${selectedProviders[0].toUpperCase()})`
                : `Fire Synthesis (${selectedProviders.length} Engines: ${selectedProviders.map((p) => p.toUpperCase()).join(', ')})`}
            </span>
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMsg && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 16,
            background: isDark ? '#064e3b' : '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-sm)',
            color: isDark ? '#ecfdf5' : '#065f46',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} style={{ color: '#10b981' }} />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 16,
            background: isDark ? '#450a0a' : '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: 'var(--radius-sm)',
            color: isDark ? '#fca5a5' : '#991b1b',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} style={{ color: '#ef4444' }} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Multi-Engine Selector Toolbar & Checkbox Cards */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
              Target LLM Engines:
            </span>
            <span
              className="badge"
              style={{
                background: isDark ? '#064e3b' : '#ecfdf5',
                color: '#10b981',
                border: '1px solid #10b981',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {selectedProviders.length} of 5 Selected
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick Select:</span>
            <button
              type="button"
              onClick={selectAllProviders}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '3px 9px' }}
              title="Select all 5 LLM engines for tournament synthesis"
            >
              All 5 Engines
            </button>
            <button
              type="button"
              onClick={selectCloudProviders}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '3px 9px' }}
              title="Select Gemini, Groq, OpenRouter, and NVIDIA"
            >
              Cloud (4)
            </button>
            <button
              type="button"
              onClick={() => setSelectedProviders(['ollama'])}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '3px 9px' }}
              title="Select Local Ollama daemon only"
            >
              Local Ollama
            </button>
            <button
              type="button"
              onClick={() => setSelectedProviders(['gemini'])}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '3px 9px' }}
              title="Reset selection to Gemini"
            >
              Gemini Only
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {/* 1. Google Gemini Card */}
          {(() => {
            const isSelected = selectedProviders.includes('gemini');
            return (
              <div
                onClick={() => toggleProvider('gemini')}
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-subtle)',
                  background: isSelected ? (isDark ? '#1e293b' : '#eff6ff') : 'var(--bg-card)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(59, 130, 246, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: isSelected ? 'none' : '1.5px solid var(--border-subtle)',
                        background: isSelected ? '#3b82f6' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: '#ffffff', strokeWidth: 3 }} />}
                    </div>
                    <Sparkles size={16} style={{ color: '#3b82f6' }} />
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Google Gemini</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="badge badge-blue" style={{ fontSize: 9.5 }}>Cloud Fast</span>
                    <button
                      type="button"
                      onClick={(e) => selectOnlyProvider('gemini', e)}
                      style={{
                        fontSize: 9.5,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                      title="Select only Google Gemini"
                    >
                      Only
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  Flash-Lite structured JSON synthesis with strict schema validation.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Model: {providersStatus?.gemini?.default_model || 'gemini-3.5-flash-lite'}</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>
                    {providersStatus?.gemini?.stored_in_db ? '● SQLite Active' : (providersStatus?.gemini?.has_key ? '● .env Active' : '○ Needs Key')}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 2. Groq LPU Card */}
          {(() => {
            const isSelected = selectedProviders.includes('groq');
            return (
              <div
                onClick={() => toggleProvider('groq')}
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #f59e0b' : '1px solid var(--border-subtle)',
                  background: isSelected ? (isDark ? '#292211' : '#fffbeb') : 'var(--bg-card)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: isSelected ? 'none' : '1.5px solid var(--border-subtle)',
                        background: isSelected ? '#f59e0b' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: '#ffffff', strokeWidth: 3 }} />}
                    </div>
                    <Zap size={16} style={{ color: '#f59e0b' }} />
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Groq LPU</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="badge badge-amber" style={{ fontSize: 9.5 }}>Ultra Speed</span>
                    <button
                      type="button"
                      onClick={(e) => selectOnlyProvider('groq', e)}
                      style={{
                        fontSize: 9.5,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                      title="Select only Groq LPU"
                    >
                      Only
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  Lightning-fast token generation on Qwen-3.8, GPT-OSS, and Llama.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Model: {providersStatus?.groq?.default_model || 'qwen/qwen3.8-27b'}</span>
                  <span style={{ color: providersStatus?.groq?.has_key ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                    {providersStatus?.groq?.stored_in_db ? '● SQLite Active' : (providersStatus?.groq?.has_key ? '● .env Active' : '○ Needs Key')}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 3. Local Ollama Card */}
          {(() => {
            const isSelected = selectedProviders.includes('ollama');
            return (
              <div
                onClick={() => toggleProvider('ollama')}
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                  background: isSelected ? (isDark ? '#064e3b22' : '#ecfdf5') : 'var(--bg-card)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(16, 185, 129, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: isSelected ? 'none' : '1.5px solid var(--border-subtle)',
                        background: isSelected ? '#10b981' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: '#ffffff', strokeWidth: 3 }} />}
                    </div>
                    <Server size={16} style={{ color: '#10b981' }} />
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Local Ollama</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="badge badge-emerald" style={{ fontSize: 9.5 }}>Local & Private</span>
                    <button
                      type="button"
                      onClick={(e) => selectOnlyProvider('ollama', e)}
                      style={{
                        fontSize: 9.5,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                      title="Select only Local Ollama"
                    >
                      Only
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  Zero-cloud, air-gapped local model inference on localhost:11434.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Model: {providersStatus?.ollama?.default_model || 'phi4-mini'}</span>
                  <span style={{ color: providersStatus?.ollama?.online ? '#10b981' : 'var(--text-muted)' }}>
                    {providersStatus?.ollama?.online ? `● Online (${providersStatus?.ollama?.latency_ms ? `${Math.round(providersStatus.ollama.latency_ms)}ms` : 'ready'})` : '○ Offline'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 4. OpenRouter Card */}
          {(() => {
            const isSelected = selectedProviders.includes('openrouter');
            return (
              <div
                onClick={() => toggleProvider('openrouter')}
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)',
                  background: isSelected ? (isDark ? '#2e106522' : '#f5f3ff') : 'var(--bg-card)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(139, 92, 246, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: isSelected ? 'none' : '1.5px solid var(--border-subtle)',
                        background: isSelected ? '#8b5cf6' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: '#ffffff', strokeWidth: 3 }} />}
                    </div>
                    <Layers size={16} style={{ color: '#8b5cf6' }} />
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>OpenRouter</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="badge badge-purple" style={{ fontSize: 9.5 }}>Universal Frontier</span>
                    <button
                      type="button"
                      onClick={(e) => selectOnlyProvider('openrouter', e)}
                      style={{
                        fontSize: 9.5,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                      title="Select only OpenRouter"
                    >
                      Only
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  Access Claude 3.5, DeepSeek-R1, Llama 3.3, and Gemma with unified routing.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Model: {providersStatus?.openrouter?.default_model || 'anthropic/claude-3.5-sonnet'}</span>
                  <span style={{ color: providersStatus?.openrouter?.has_key ? '#10b981' : '#8b5cf6', fontWeight: 600 }}>
                    {providersStatus?.openrouter?.stored_in_db ? '● SQLite Active' : (providersStatus?.openrouter?.has_key ? '● .env Active' : '○ Needs Key')}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 5. NVIDIA NIM Card */}
          {(() => {
            const isSelected = selectedProviders.includes('nvidia');
            return (
              <div
                onClick={() => toggleProvider('nvidia')}
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #76b900' : '1px solid var(--border-subtle)',
                  background: isSelected ? (isDark ? '#1a2e05' : '#f7fee7') : 'var(--bg-card)',
                  boxShadow: isSelected ? '0 0 0 1px rgba(118, 185, 0, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: isSelected ? 'none' : '1.5px solid var(--border-subtle)',
                        background: isSelected ? '#76b900' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: '#ffffff', strokeWidth: 3 }} />}
                    </div>
                    <Cpu size={16} style={{ color: '#76b900' }} />
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>NVIDIA NIM</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      className="badge"
                      style={{
                        fontSize: 9.5,
                        background: isDark ? '#1a2e05' : '#f7fee7',
                        color: '#76b900',
                        border: '1px solid #76b900',
                      }}
                    >
                      Enterprise NIM
                    </span>
                    <button
                      type="button"
                      onClick={(e) => selectOnlyProvider('nvidia', e)}
                      style={{
                        fontSize: 9.5,
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                      title="Select only NVIDIA NIM"
                    >
                      Only
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
                  Meta Llama 3.3, Nemotron, and DeepSeek running on NVIDIA DGX Cloud.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Model: {providersStatus?.nvidia?.default_model || 'meta/llama-3.3-70b-instruct'}</span>
                  <span style={{ color: providersStatus?.nvidia?.has_key ? '#10b981' : '#76b900', fontWeight: 600 }}>
                    {providersStatus?.nvidia?.stored_in_db ? '● SQLite Active' : (providersStatus?.nvidia?.has_key ? '● .env Active' : '○ Needs Key')}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 3. Provider Settings & Connection Test Drawer */}
      {showConfigDrawer && (
        <div
          className="card"
          style={{
            padding: '20px',
            marginBottom: 20,
            background: isDark ? '#0f172a' : '#f8fafc',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} style={{ color: '#10b981' }} />
              <span>LLM Provider Keys & SQLite Database Storage</span>
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Keys saved here are stored in SQLite (<code>research_copilot.db</code>) and used automatically.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16, marginBottom: 16 }}>
            {/* 1. Groq LPU Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: isDark ? '#1e293b' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={14} style={{ color: '#f59e0b' }} />
                  <strong style={{ fontSize: 13 }}>Groq LPU Engine</strong>
                </div>
                {providersStatus?.groq?.stored_in_db ? (
                  <span className="badge badge-emerald" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Database size={10} /> SQLite Saved
                  </span>
                ) : providersStatus?.groq?.has_key ? (
                  <span className="badge badge-amber" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Key size={10} /> .env Active
                  </span>
                ) : (
                  <span className="badge badge-red" style={{ fontSize: 10 }}>Key Missing</span>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  API Key: {providersStatus?.groq?.api_key_masked && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>({providersStatus.groq.api_key_masked})</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKeyPassword ? 'text' : 'password'}
                    className="input"
                    placeholder={providersStatus?.groq?.api_key_masked || 'Paste Groq key (gsk_...)'}
                    value={groqKeyOverride}
                    onChange={(e) => setGroqKeyOverride(e.target.value)}
                    style={{ fontSize: 12, width: '100%', padding: '6px 30px 6px 10px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyPassword((prev) => !prev)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {showKeyPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Model:
                </label>
                <select
                  className="input"
                  value={selectedProvider === 'groq' ? selectedModel : ''}
                  onChange={(e) => {
                    setSelectedProvider('groq');
                    setSelectedModel(e.target.value);
                  }}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                >
                  <option value="">Default ({providersStatus?.groq?.default_model || 'qwen/qwen3.8-27b'})</option>
                  {providersStatus?.groq?.supported_models?.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="qwen/qwen3.8-27b">qwen/qwen3.8-27b (Fast)</option>
                  <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                  <option value="openai/gpt-oss-20b">openai/gpt-oss-20b</option>
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveKeyToDb('groq', groqKeyOverride, selectedModel)}
                  disabled={savingKey || !groqKeyOverride}
                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                >
                  <Save size={12} />
                  <span>{savingKey ? 'Saving...' : 'Save to SQLite DB'}</span>
                </button>
                {providersStatus?.groq?.stored_in_db && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemoveKeyFromDb('groq')}
                    style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Remove key from SQLite DB"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Google Gemini Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: isDark ? '#1e293b' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} style={{ color: '#3b82f6' }} />
                  <strong style={{ fontSize: 13 }}>Google Gemini</strong>
                </div>
                {providersStatus?.gemini?.stored_in_db ? (
                  <span className="badge badge-emerald" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Database size={10} /> SQLite Saved
                  </span>
                ) : (
                  <span className="badge badge-blue" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Key size={10} /> .env Active
                  </span>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  API Key: {providersStatus?.gemini?.api_key_masked && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>({providersStatus.gemini.api_key_masked})</span>}
                </label>
                <input
                  type={showKeyPassword ? 'text' : 'password'}
                  className="input"
                  placeholder={providersStatus?.gemini?.api_key_masked || 'Paste Gemini key (AQ...)'}
                  value={geminiKeyOverride}
                  onChange={(e) => setGeminiKeyOverride(e.target.value)}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Model:
                </label>
                <select
                  className="input"
                  value={selectedProvider === 'gemini' ? selectedModel : ''}
                  onChange={(e) => {
                    setSelectedProvider('gemini');
                    setSelectedModel(e.target.value);
                  }}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                >
                  <option value="">Default (gemini-3.5-flash-lite)</option>
                  <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveKeyToDb('gemini', geminiKeyOverride, selectedModel)}
                  disabled={savingKey || !geminiKeyOverride}
                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                >
                  <Save size={12} />
                  <span>{savingKey ? 'Saving...' : 'Save to SQLite DB'}</span>
                </button>
                {providersStatus?.gemini?.stored_in_db && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemoveKeyFromDb('gemini')}
                    style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Remove key from SQLite DB"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* 3. Local Ollama Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: isDark ? '#1e293b' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Server size={14} style={{ color: '#10b981' }} />
                  <strong style={{ fontSize: 13 }}>Local Ollama</strong>
                </div>
                <span className={providersStatus?.ollama?.online ? 'badge badge-emerald' : 'badge badge-gray'} style={{ fontSize: 10 }}>
                  {providersStatus?.ollama?.online ? '● Daemon Online' : '○ Offline'}
                </span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Base URL:
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="http://localhost:11434"
                  value={ollamaUrlOverride}
                  onChange={(e) => setOllamaUrlOverride(e.target.value)}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Model:
                </label>
                <select
                  className="input"
                  value={selectedProvider === 'ollama' ? selectedModel : ''}
                  onChange={(e) => {
                    setSelectedProvider('ollama');
                    setSelectedModel(e.target.value);
                  }}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                >
                  <option value="">Default ({providersStatus?.ollama?.default_model || 'phi4-mini'})</option>
                  <option value="phi4-mini">phi4-mini (Local Active)</option>
                  <option value="phi4-mini:latest">phi4-mini:latest</option>
                  {providersStatus?.ollama?.supported_models?.filter(m => !m.includes('phi4-mini')).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="llama3">llama3</option>
                  <option value="mistral">mistral</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveKeyToDb('ollama', null, selectedModel, ollamaUrlOverride)}
                  disabled={savingKey}
                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                >
                  <Save size={12} />
                  <span>{savingKey ? 'Saving...' : 'Save to SQLite DB'}</span>
                </button>
              </div>
            </div>

            {/* 4. OpenRouter Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: isDark ? '#1e293b' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={14} style={{ color: '#8b5cf6' }} />
                  <strong style={{ fontSize: 13 }}>OpenRouter</strong>
                </div>
                {providersStatus?.openrouter?.stored_in_db ? (
                  <span className="badge badge-emerald" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Database size={10} /> SQLite Saved
                  </span>
                ) : providersStatus?.openrouter?.has_key ? (
                  <span className="badge badge-purple" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Key size={10} /> .env Active
                  </span>
                ) : (
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>○ Needs Key</span>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  API Key: {providersStatus?.openrouter?.api_key_masked && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>({providersStatus.openrouter.api_key_masked})</span>}
                </label>
                <input
                  type={showKeyPassword ? 'text' : 'password'}
                  className="input"
                  placeholder={providersStatus?.openrouter?.api_key_masked || 'Paste OpenRouter key (sk-or-v1-...)'}
                  value={openrouterKeyOverride}
                  onChange={(e) => setOpenrouterKeyOverride(e.target.value)}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Model:
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={providersStatus?.openrouter?.default_model || 'anthropic/claude-3.5-sonnet'}
                  value={selectedProvider === 'openrouter' ? selectedModel : ''}
                  onChange={(e) => {
                    setSelectedProvider('openrouter');
                    setSelectedModel(e.target.value);
                  }}
                  list="openrouter-models-datalist"
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px', marginBottom: 4 }}
                />
                <datalist id="openrouter-models-datalist">
                  <option value="anthropic/claude-3.5-sonnet" />
                  <option value="deepseek/deepseek-r1" />
                  <option value="meta-llama/llama-3.3-70b-instruct" />
                  <option value="google/gemini-2.0-flash-001" />
                  <option value="openai/gpt-4o-mini" />
                  <option value="google/gemma-4-31b-it:free" />
                </datalist>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {['anthropic/claude-3.5-sonnet', 'deepseek/deepseek-r1', 'google/gemma-4-31b-it:free'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSelectedProvider('openrouter');
                        setSelectedModel(m);
                      }}
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {m.split('/')[1] || m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveKeyToDb('openrouter', openrouterKeyOverride, selectedModel)}
                  disabled={savingKey || !openrouterKeyOverride}
                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                >
                  <Save size={12} />
                  <span>{savingKey ? 'Saving...' : 'Save to SQLite DB'}</span>
                </button>
                {providersStatus?.openrouter?.stored_in_db && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemoveKeyFromDb('openrouter')}
                    style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Remove key from SQLite DB"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* 5. NVIDIA NIM Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: isDark ? '#1e293b' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Cpu size={14} style={{ color: '#76b900' }} />
                  <strong style={{ fontSize: 13 }}>NVIDIA NIM</strong>
                </div>
                {providersStatus?.nvidia?.stored_in_db ? (
                  <span className="badge badge-emerald" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Database size={10} /> SQLite Saved
                  </span>
                ) : providersStatus?.nvidia?.has_key ? (
                  <span
                    className="badge"
                    style={{
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: isDark ? '#1a2e05' : '#f7fee7',
                      color: '#76b900',
                      border: '1px solid #76b900',
                    }}
                  >
                    <Key size={10} /> .env Active
                  </span>
                ) : (
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>○ Needs Key</span>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  API Key: {providersStatus?.nvidia?.api_key_masked && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>({providersStatus.nvidia.api_key_masked})</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKeyPassword ? 'text' : 'password'}
                    className="input"
                    placeholder={providersStatus?.nvidia?.api_key_masked || 'Paste NVIDIA key (nvapi-...)'}
                    value={nvidiaKeyOverride}
                    onChange={(e) => setNvidiaKeyOverride(e.target.value)}
                    style={{ fontSize: 12, width: '100%', padding: '6px 30px 6px 10px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyPassword((prev) => !prev)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {showKeyPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Model:
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={providersStatus?.nvidia?.default_model || 'meta/llama-3.3-70b-instruct'}
                  value={selectedProviders.includes('nvidia') ? selectedModel : ''}
                  onChange={(e) => {
                    if (!selectedProviders.includes('nvidia')) toggleProvider('nvidia');
                    setSelectedModel(e.target.value);
                  }}
                  list="nvidia-models-datalist"
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px', marginBottom: 4 }}
                />
                <datalist id="nvidia-models-datalist">
                  <option value="meta/llama-3.3-70b-instruct" />
                  <option value="nvidia/llama-3.1-nemotron-70b-instruct" />
                  <option value="deepseek-ai/deepseek-r1" />
                  <option value="mistralai/mixtral-8x22b-instruct-v0.1" />
                  <option value="meta/llama-3.1-405b-instruct" />
                  <option value="meta/llama-3.1-8b-instruct" />
                </datalist>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'deepseek-ai/deepseek-r1'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        if (!selectedProviders.includes('nvidia')) toggleProvider('nvidia');
                        setSelectedModel(m);
                      }}
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 3,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {m.split('/')[1] || m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveKeyToDb('nvidia', nvidiaKeyOverride, selectedModel)}
                  disabled={savingKey || !nvidiaKeyOverride}
                  style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                >
                  <Save size={12} />
                  <span>{savingKey ? 'Saving...' : 'Save to SQLite DB'}</span>
                </button>
                {providersStatus?.nvidia?.stored_in_db && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRemoveKeyFromDb('nvidia')}
                    style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Remove key from SQLite DB"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Diagnostics Test Bar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Test Engine:</span>
              <select
                className="input"
                value={testTargetProvider}
                onChange={(e) => setTestTargetProvider(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px' }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq LPU</option>
                <option value="ollama">Local Ollama</option>
                <option value="openrouter">OpenRouter</option>
                <option value="nvidia">NVIDIA NIM</option>
              </select>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleTestConnection(testTargetProvider)}
              disabled={testingConnection}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {testingConnection ? <RotateCw size={12} className="animate-spin" /> : <Activity size={12} />}
              <span>Test {testTargetProvider.toUpperCase()} Connection</span>
            </button>

            {testResult && (
              <div
                style={{
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: testResult.success ? '#10b981' : '#ef4444',
                }}
              >
                {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>
                  {testResult.success
                    ? `${testResult.message} (${testResult.latency_ms}ms) [Source: ${testResult.key_source || 'direct'}]`
                    : testResult.error}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Target Topic & Literature Selector Strip */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
          marginBottom: 16,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 280 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Topic:
            </span>
            <input
              type="text"
              className="input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Time Series Forecasting"
              style={{ fontSize: 13, fontWeight: 600, flex: 1, padding: '5px 10px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={forceRefresh}
                onChange={(e) => setForceRefresh(e.target.checked)}
              />
              <span>Bypass SQLite Cache (Force LLM Run)</span>
            </label>

            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              {selectedPaperIds.length} / {availablePapers.length} Papers Staged
            </span>
          </div>
        </div>

        {/* Papers pills */}
        {availablePapers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Grounding Literature:</span>
            {availablePapers.map((p) => {
              const isSelected = selectedPaperIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPaperIds((prev) =>
                      isSelected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                    );
                  }}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: isSelected ? (isDark ? '#1e293b' : '#e0f2fe') : 'var(--bg-secondary)',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                    color: isSelected ? (isDark ? '#7dd3fc' : '#0369a1') : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span>{isSelected ? '✓' : '+'}</span>
                  <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Live Telemetry & API Verification HUD */}
      <div
        className="card"
        style={{
          padding: '12px 18px',
          marginBottom: 20,
          background: isDark ? '#09090b' : '#f8fafc',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
              API Status:
            </span>
            <span style={{ fontSize: 11.5, color: '#10b981', fontWeight: 600 }}>200 OK (Backend Active)</span>
          </div>

          {lastTelemetry && (
            <>
              <div style={{ height: 14, width: 1, background: 'var(--border-subtle)' }} />
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Latency: <strong style={{ color: 'var(--text-primary)' }}>{lastTelemetry.duration_ms}ms</strong>
              </div>
              <div style={{ height: 14, width: 1, background: 'var(--border-subtle)' }} />
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Source: <strong style={{ color: lastTelemetry.cached ? '#10b981' : '#3b82f6' }}>{lastTelemetry.cached ? 'SQLite Cache' : 'Live LLM'}</strong>
              </div>
              <div style={{ height: 14, width: 1, background: 'var(--border-subtle)' }} />
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Proposals: <strong style={{ color: 'var(--text-primary)' }}>{lastTelemetry.proposals_generated}</strong>
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          Endpoint: POST /api/v1/novelty/synthesize
        </div>
      </div>

      {/* 6. Novelty Deck Controls & View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Synthesized Novelty Proposals ({filteredNovelties.length})
          </h2>

          {/* Mechanism filter */}
          <select
            className="input"
            value={mechanismFilter}
            onChange={(e) => setMechanismFilter(e.target.value)}
            style={{ fontSize: 11.5, padding: '4px 8px' }}
          >
            <option value="all">All Mechanisms</option>
            <option value="recombination">⚡ Recombination</option>
            <option value="contradiction_resolution">⚖️ Tension Resolution</option>
            <option value="limitation_inversion">🛡️ Limitation Inversion</option>
            <option value="gap_realization">🎯 Gap Realization</option>
          </select>

          {/* Provider filter */}
          <select
            className="input"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            style={{ fontSize: 11.5, padding: '4px 8px' }}
          >
            <option value="all">All Engines</option>
            <option value="custom">✨ User Authored</option>
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq LPU</option>
            <option value="ollama">Local Ollama</option>
            <option value="openrouter">OpenRouter</option>
            <option value="nvidia">NVIDIA NIM</option>
            <option value="heuristic">Heuristic</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowCustomModal(true)}
            style={{
              fontSize: 11.5,
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(139, 92, 246, 0.12)',
              color: '#8b5cf6',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              fontWeight: 600,
            }}
            title="Author and save your own custom novelty proposal"
          >
            <Plus size={12} />
            <span>Add Custom</span>
          </button>

          <button
            className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('cards')}
            style={{ fontSize: 11.5, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
            title="Dynamic masonry grid layout based on card height"
          >
            <LayoutGrid size={12} />
            <span>Masonry Grid</span>
          </button>

          {viewMode === 'cards' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: 4,
                padding: '2px 4px',
                border: '1px solid var(--border-subtle)',
                gap: 2,
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '0 3px' }}>Cols:</span>
              {[2, 3, 4].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCustomColumnCount(c)}
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 3,
                    border: 'none',
                    background: activeColumnCount === c && customColumnCount === c ? 'var(--accent-primary)' : 'transparent',
                    color: activeColumnCount === c && customColumnCount === c ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: activeColumnCount === c && customColumnCount === c ? 700 : 400,
                  }}
                  title={`Force ${c} columns`}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomColumnCount(null)}
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: 'none',
                  background: customColumnCount === null ? 'var(--bg-card)' : 'transparent',
                  color: customColumnCount === null ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: customColumnCount === null ? 700 : 400,
                }}
                title={`Auto (${autoColumnCount} cols on current screen)`}
              >
                Auto
              </button>
            </div>
          )}

          <button
            className={`btn btn-sm ${viewMode === 'compare' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('compare')}
            style={{ fontSize: 11.5, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Columns3 size={12} />
            <span>Multi-Model Compare</span>
          </button>

          {noveltyResults.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearAllProposals}
              style={{ fontSize: 11.5, padding: '4px 8px', color: '#ef4444' }}
              title="Clear all proposals from deck"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 7. Results View */}
      {synthesizing ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RotateCw size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: '#10b981' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            Generating Grounded Research Novelty...
          </h3>
          <p style={{ fontSize: 12.5, maxWidth: 440, margin: '0 auto', lineHeight: 1.45 }}>
            Invoking <strong>{selectedProviders.map((p) => p.toUpperCase()).join(', ')}</strong> to evaluate topological gaps, cross-paper tensions, and mathematical recombination candidates.
          </p>
        </div>
      ) : filteredNovelties.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Lightbulb size={40} style={{ margin: '0 auto 14px', opacity: 0.4 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No Novelty Proposals Generated Yet
          </h3>
          <p style={{ fontSize: 12.5, maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.45 }}>
            Select your target LLM engines and click <strong>Fire Synthesis</strong> to formulate publication-grade hypotheses from this workspace.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleSynthesize}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                fontWeight: 600,
                padding: '8px 20px',
              }}
            >
              <Sparkles size={14} style={{ marginRight: 6 }} />
              Fire Novelty Synthesis
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCustomModal(true)}
              style={{
                fontWeight: 600,
                padding: '8px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderColor: 'rgba(139, 92, 246, 0.4)',
                color: '#8b5cf6',
              }}
            >
              <Plus size={14} />
              Add Your Own Novelty
            </button>
          </div>
        </div>
      ) : viewMode === 'compare' ? (
        /* Side-by-side Multi-Model Comparison View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'flex-start' }}>
          {['gemini', 'groq', 'ollama', 'openrouter', 'nvidia', ...(comparisonByEngine.custom?.length > 0 ? ['custom'] : [])].map((eng) => {
            const list = comparisonByEngine[eng] || [];
            return (
              <div key={eng} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {eng === 'gemini' && <Sparkles size={15} style={{ color: '#3b82f6' }} />}
                    {eng === 'groq' && <Zap size={15} style={{ color: '#f59e0b' }} />}
                    {eng === 'ollama' && <Server size={15} style={{ color: '#10b981' }} />}
                    {eng === 'openrouter' && <Layers size={15} style={{ color: '#8b5cf6' }} />}
                    {eng === 'nvidia' && <Cpu size={15} style={{ color: '#76b900' }} />}
                    {eng === 'custom' && <Sparkles size={15} style={{ color: '#a855f7' }} />}
                    <strong style={{ fontSize: 13.5, textTransform: 'capitalize' }}>
                      {eng === 'gemini'
                        ? 'Google Gemini'
                        : eng === 'groq'
                        ? 'Groq LPU'
                        : eng === 'ollama'
                        ? 'Local Ollama'
                        : eng === 'openrouter'
                        ? 'OpenRouter'
                        : eng === 'nvidia'
                        ? 'NVIDIA NIM'
                        : 'User Authored'}
                    </strong>
                  </div>
                  <span className="badge badge-neutral" style={{ fontSize: 10.5 }}>
                    {list.length} Proposals
                  </span>
                </div>

                {list.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                    No proposals from {eng.toUpperCase()} yet. Select this provider and click Fire Synthesis.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {list.map((nov) => (
                      <NoveltyCardItem
                        key={nov.id}
                        novelty={nov}
                        isDark={isDark}
                        isAdded={addedCandidateIds.has(nov.id)}
                        isAdding={addingId === nov.id}
                        copied={copiedId === nov.id}
                        onAddToGraph={handleAddToGraph}
                        onCopy={handleCopyProposal}
                        onDelete={handleDeleteProposal}
                        onDiscussInChat={(n) => {
                          navigate('/chat', {
                            state: {
                              initialPrompt: `Let's discuss and formalize this research novelty proposal:\n\n**${n.title}**\n\n- **Mechanism**: ${n.mechanism}\n- **Engine**: ${n.engine}\n- **Testable Hypothesis**: ${n.testable_hypothesis}\n- **Mathematical Formulation**: ${n.mathematical_formulation || 'N/A'}\n- **Target Benchmarks**: ${(n.target_datasets || []).join(', ') || 'N/A'}\n\nPlease help me construct an experimental verification protocol.`,
                            },
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Dynamic Masonry Multi-Column View based on natural card height */
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {masonryColumns.map((colItems, colIdx) => (
            <div
              key={colIdx}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                minWidth: 0,
              }}
            >
              {colItems.map((nov) => (
                <NoveltyCardItem
                  key={nov.id}
                  novelty={nov}
                  isDark={isDark}
                  isAdded={addedCandidateIds.has(nov.id)}
                  isAdding={addingId === nov.id}
                  copied={copiedId === nov.id}
                  onAddToGraph={handleAddToGraph}
                  onCopy={handleCopyProposal}
                  onDelete={handleDeleteProposal}
                  onDiscussInChat={(n) => {
                    navigate('/chat', {
                      state: {
                        initialPrompt: `Let's discuss and formalize this research novelty proposal:\n\n**${n.title}**\n\n- **Mechanism**: ${n.mechanism}\n- **Engine**: ${n.engine}\n- **Testable Hypothesis**: ${n.testable_hypothesis}\n- **Mathematical Formulation**: ${n.mathematical_formulation || 'N/A'}\n- **Target Benchmarks**: ${(n.target_datasets || []).join(', ') || 'N/A'}\n\nPlease help me construct an experimental verification protocol.`,
                      },
                    });
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 8. Telemetry Terminal Log Box */}
      <div
        className="card"
        style={{
          marginTop: 28,
          padding: '12px 16px',
          background: isDark ? '#050507' : '#1e293b',
          color: '#e2e8f0',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'monospace',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #334155', paddingBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Code2 size={13} style={{ color: '#38bdf8' }} />
            <strong style={{ color: '#f8fafc' }}>Novelty Engine Telemetry Stream</strong>
          </div>
          <button
            onClick={() => setTelemetryLogs([])}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 10 }}
          >
            Clear
          </button>
        </div>

        <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {telemetryLogs.length === 0 ? (
            <span style={{ color: '#64748b' }}>No telemetry events recorded yet.</span>
          ) : (
            telemetryLogs.map((log, idx) => (
              <div key={idx} style={{ color: log.includes('error') || log.includes('failed') ? '#f87171' : log.includes('success') ? '#4ade80' : '#cbd5e1' }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 9. Custom Novelty Creation Modal */}
      {showCustomModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setShowCustomModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px 28px',
              borderRadius: 'var(--radius-md, 10px)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Sparkles size={18} style={{ color: '#a855f7' }} />
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Add Custom Research Novelty
                  </h2>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
                  Author your own scientific hypothesis. It will be stored in SQLite, anchored to literature, and injected into the Knowledge Graph.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomNovelty}>
              {/* Proposal Title */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Proposal Title *
                </label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. Spectral Attention-Gated State Space ODE for Non-Stationary Series"
                  value={customForm.title}
                  onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                  style={{ width: '100%', fontSize: 13, padding: '8px 12px' }}
                />
              </div>

              {/* Mechanism & Confidence */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Innovation Mechanism
                  </label>
                  <select
                    className="input"
                    value={customForm.mechanism}
                    onChange={(e) => setCustomForm({ ...customForm, mechanism: e.target.value })}
                    style={{ width: '100%', fontSize: 12, padding: '7px 10px' }}
                  >
                    <option value="recombination">⚡ Orthogonal Recombination</option>
                    <option value="contradiction_resolution">⚖️ Tension Resolution</option>
                    <option value="limitation_inversion">🛡️ Limitation Inversion</option>
                    <option value="gap_realization">🎯 Gap Realization</option>
                    <option value="empirical_extension">🔬 Empirical Extension</option>
                    <option value="custom">✨ Novel Paradigm</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Confidence Score: {Math.round(customForm.confidence_score * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.05"
                    value={customForm.confidence_score}
                    onChange={(e) => setCustomForm({ ...customForm, confidence_score: parseFloat(e.target.value) })}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                </div>
              </div>

              {/* 1-Sentence Pitch */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  1-Sentence Elevator Pitch
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Unifies continuous-time neural ODE dynamics with frequency-domain attenuation gates."
                  value={customForm.pitch}
                  onChange={(e) => setCustomForm({ ...customForm, pitch: e.target.value })}
                  style={{ width: '100%', fontSize: 12, padding: '7px 10px' }}
                />
              </div>

              {/* Core Novelty Statement */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Core Scientific Novelty & Architecture
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Describe the architectural innovation, inductive biases, or algorithmic differentiation..."
                  value={customForm.novelty_statement}
                  onChange={(e) => setCustomForm({ ...customForm, novelty_statement: e.target.value })}
                  style={{ width: '100%', fontSize: 12, padding: '7px 10px', resize: 'vertical' }}
                />
              </div>

              {/* Mathematical Formulation */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Mathematical Formulation / Core Equations
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. \hat{y} = r_L y_L + r_T y_T + r_{LLM} y_{LLM} or r_{c,h} = \operatorname{softmax}(Wz_{c,h}+b)"
                  value={customForm.mathematical_formulation}
                  onChange={(e) => setCustomForm({ ...customForm, mathematical_formulation: e.target.value })}
                  style={{ width: '100%', fontSize: 11.5, fontFamily: 'monospace', padding: '7px 10px', resize: 'vertical' }}
                />
                {customForm.mathematical_formulation.trim() && (
                  <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 4, border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Dynamic LaTeX Preview:</div>
                    <MathRenderer equation={customForm.mathematical_formulation} block style={{ margin: 0, padding: 0 }} />
                  </div>
                )}
              </div>

              {/* Testable Hypothesis */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Testable Scientific Hypothesis
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Spectral gating will reduce long-horizon forecasting MSE by >= 12% across non-stationary benchmarks."
                  value={customForm.testable_hypothesis}
                  onChange={(e) => setCustomForm({ ...customForm, testable_hypothesis: e.target.value })}
                  style={{ width: '100%', fontSize: 12, padding: '7px 10px', resize: 'vertical' }}
                />
              </div>

              {/* Datasets & Baselines */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Target Datasets (comma-separated)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. ETTh1, Weather, Electricity"
                    value={customForm.target_datasets}
                    onChange={(e) => setCustomForm({ ...customForm, target_datasets: e.target.value })}
                    style={{ width: '100%', fontSize: 12, padding: '7px 10px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                    Baselines to Beat (comma-separated)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. PatchTST, TimesNet, DLinear"
                    value={customForm.baselines_to_beat}
                    onChange={(e) => setCustomForm({ ...customForm, baselines_to_beat: e.target.value })}
                    style={{ width: '100%', fontSize: 12, padding: '7px 10px' }}
                  />
                </div>
              </div>

              {/* Grounding Foundation Papers */}
              {availablePapers.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                    Anchor to Staged Literature Papers (Click to link):
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto', padding: 4 }}>
                    {availablePapers.map((p) => {
                      const isSelected = customForm.grounded_paper_ids.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            const cur = customForm.grounded_paper_ids;
                            const next = isSelected ? cur.filter((id) => id !== p.id) : [...cur, p.id];
                            setCustomForm({ ...customForm, grounded_paper_ids: next });
                          }}
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: isSelected ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                            background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
                            color: isSelected ? '#10b981' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isSelected ? <Check size={11} /> : <Plus size={11} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCustomModal(false)}
                  disabled={creatingCustom}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={creatingCustom || !customForm.title.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    borderColor: '#7c3aed',
                    fontWeight: 600,
                    padding: '6px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {creatingCustom ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  <span>Save & Add to Deck</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Individual Novelty Card Item
function NoveltyCardItem({ novelty, isDark, isAdded, isAdding, copied, onAddToGraph, onCopy, onDiscussInChat, onDelete }) {
  const mech = (novelty.mechanism || '').toLowerCase();
  let badgeBg = 'var(--bg-secondary)';
  let badgeColor = 'var(--accent-primary)';
  let badgeLabel = '💡 Proposal';

  if (mech.includes('recombination') || mech.includes('orthogonal')) {
    badgeBg = isDark ? '#064e3b' : '#ecfdf5';
    badgeColor = isDark ? '#34d399' : '#059669';
    badgeLabel = '⚡ Recombination';
  } else if (mech.includes('contradict') || mech.includes('tension')) {
    badgeBg = isDark ? '#451a03' : '#fffbeb';
    badgeColor = isDark ? '#fbbf24' : '#b45309';
    badgeLabel = '⚖️ Tension Resolution';
  } else if (mech.includes('limitation') || mech.includes('inversion')) {
    badgeBg = isDark ? '#172554' : '#eff6ff';
    badgeColor = isDark ? '#60a5fa' : '#1d4ed8';
    badgeLabel = '🛡️ Limitation Inversion';
  } else if (mech.includes('gap') || mech.includes('realization')) {
    badgeBg = isDark ? '#500724' : '#fdf2f8';
    badgeColor = isDark ? '#f472b6' : '#be185d';
    badgeLabel = '🎯 Gap Realization';
  }

  const eng = (novelty.engine || 'gemini').toLowerCase();
  let engineBadge = 'Gemini';
  let engineColor = '#3b82f6';
  if (eng === 'groq') {
    engineBadge = 'Groq';
    engineColor = '#f59e0b';
  } else if (eng === 'ollama') {
    engineBadge = 'Ollama';
    engineColor = '#10b981';
  } else if (eng === 'openrouter') {
    engineBadge = 'OpenRouter';
    engineColor = '#8b5cf6';
  } else if (eng === 'nvidia') {
    engineBadge = 'NVIDIA NIM';
    engineColor = '#76b900';
  } else if (eng === 'heuristic') {
    engineBadge = 'Heuristic';
    engineColor = '#64748b';
  } else if (eng === 'custom' || novelty.is_custom) {
    engineBadge = '✨ User Authored';
    engineColor = '#a855f7';
  }

  return (
    <div
      className="card"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        transition: 'transform 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 10,
              background: badgeBg,
              color: badgeColor,
              textTransform: 'uppercase',
            }}
          >
            {badgeLabel}
          </span>

          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 4,
              border: `1px solid ${engineColor}`,
              color: engineColor,
              textTransform: 'uppercase',
            }}
          >
            {engineBadge}
          </span>
        </div>

        {novelty.confidence_score && (
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            Confidence: {Math.round(novelty.confidence_score * 100)}%
          </span>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
        {novelty.title}
      </div>

      {novelty.pitch && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
          {novelty.pitch}
        </p>
      )}

      {/* Testable Hypothesis Quote */}
      <div
        style={{
          fontSize: 11.5,
          fontStyle: 'italic',
          color: 'var(--text-primary)',
          lineHeight: 1.45,
          borderLeft: '3px solid var(--accent-primary)',
          paddingLeft: 10,
          background: 'var(--bg-secondary)',
          padding: '8px 10px',
          borderRadius: '0 4px 4px 0',
        }}
      >
        "{novelty.testable_hypothesis}"
      </div>

      {/* Mathematical / Technical Formulation */}
      {novelty.mathematical_formulation && (
        <div
          style={{
            padding: '8px 10px',
            background: isDark ? '#09090b' : '#f1f5f9',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            overflowX: 'auto',
            fontSize: 11.5,
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Formulation
            </span>
          </div>
          <MathRenderer equation={novelty.mathematical_formulation} block style={{ margin: 0, padding: 0 }} />
        </div>
      )}

      {/* Grounded Foundation Papers */}
      {novelty.grounded_paper_titles && novelty.grounded_paper_titles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Grounding:</span>
          {novelty.grounded_paper_titles.map((fp, i) => (
            <span
              key={i}
              className="badge badge-neutral"
              style={{ fontSize: 9.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {fp}
            </span>
          ))}
        </div>
      )}

      {/* Target Datasets & Baselines */}
      {(novelty.target_datasets?.length > 0 || novelty.baselines_to_beat?.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10 }}>
          {novelty.target_datasets?.length > 0 && (
            <div>
              <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Datasets:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{novelty.target_datasets.join(', ')}</strong>
            </div>
          )}
          {novelty.baselines_to_beat?.length > 0 && (
            <div>
              <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>Baselines:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{novelty.baselines_to_beat.join(', ')}</strong>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons Strip */}
      <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingTop: 10, borderTop: '1px dashed var(--border-subtle)' }}>
        {isAdded ? (
          <button
            className="btn btn-secondary btn-sm"
            disabled
            style={{ flex: 1, fontSize: 11, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, color: '#10b981' }}
          >
            <CheckCircle2 size={12} />
            <span>In Canvas</span>
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onAddToGraph(novelty)}
            disabled={isAdding}
            style={{
              flex: 1,
              fontSize: 11,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 5,
              background: '#059669',
              borderColor: '#059669',
              color: '#fff',
            }}
          >
            {isAdding ? <RotateCw size={12} className="animate-spin" /> : <Plus size={12} />}
            <span>Add to Graph</span>
          </button>
        )}

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onDiscussInChat(novelty)}
          style={{ flex: 1, fontSize: 11, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5 }}
        >
          <MessageSquare size={12} />
          <span>Discuss in Chat</span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onCopy(novelty)}
          style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center' }}
          title="Copy Markdown Summary"
        >
          {copied ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
        </button>

        {onDelete && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={(e) => onDelete(novelty.id, e)}
            style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', color: '#ef4444' }}
            title="Delete this proposal from deck"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
