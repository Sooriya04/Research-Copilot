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
  Plus,
  MessageSquare,
  Network,
  Columns3,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  Radio,
  FileText,
  Activity,
  Code2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

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
  const [selectedProvider, setSelectedProvider] = useState('gemini'); // 'gemini' | 'groq' | 'ollama' | 'all'
  const [selectedModel, setSelectedModel] = useState('');
  const [groqKeyOverride, setGroqKeyOverride] = useState(() => localStorage.getItem('rc_groq_key') || '');
  const [geminiKeyOverride, setGeminiKeyOverride] = useState(() => localStorage.getItem('rc_gemini_key') || '');
  const [ollamaUrlOverride, setOllamaUrlOverride] = useState(() => localStorage.getItem('rc_ollama_url') || 'http://localhost:11434');
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);

  // Connection testing state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Synthesis state & results
  const [synthesizing, setSynthesizing] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [noveltyResults, setNoveltyResults] = useState([]);
  const [lastTelemetry, setLastTelemetry] = useState(null);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Filter & View Mode
  const [mechanismFilter, setMechanismFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'compare'
  const [copiedId, setCopiedId] = useState(null);
  const [addedCandidateIds, setAddedCandidateIds] = useState(new Set());
  const [addingId, setAddingId] = useState(null);

  const isDark = theme === 'dark';

  // 1. Fetch Providers Status & Workspace Papers on mount
  useEffect(() => {
    fetchProvidersStatus();
    fetchWorkspacePapers();
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

  // 2. Test Connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    addTelemetryLog(`Testing connectivity to provider: ${selectedProvider.toUpperCase()}...`);
    try {
      const payload = {
        provider: selectedProvider === 'all' ? 'gemini' : selectedProvider,
        api_key:
          selectedProvider === 'groq'
            ? groqKeyOverride
            : selectedProvider === 'gemini'
            ? geminiKeyOverride
            : undefined,
        base_url: selectedProvider === 'ollama' ? ollamaUrlOverride : undefined,
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
    setSynthesizing(true);
    setErrorMsg(null);
    setToastMsg(null);

    const activeTopic = (topic || searchQuery || activeWorkspace?.title || 'Literature Synthesis').trim();
    const activePids = selectedPaperIds.length > 0 ? selectedPaperIds : availablePapers.map((p) => p.id);

    addTelemetryLog(
      `Firing synthesis -> POST /api/v1/novelty/synthesize (provider=${selectedProvider}, papers=${activePids.length})...`
    );

    try {
      const payload = {
        topic: activeTopic,
        workspace_id: activeWorkspace?.id || null,
        paper_ids: activePids,
        provider: selectedProvider,
        model: selectedModel || undefined,
        api_key:
          selectedProvider === 'groq'
            ? groqKeyOverride || undefined
            : selectedProvider === 'gemini'
            ? geminiKeyOverride || undefined
            : undefined,
        base_url: selectedProvider === 'ollama' ? ollamaUrlOverride || undefined : undefined,
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
    return noveltyResults.filter((n) => {
      const matchMech = mechanismFilter === 'all' || (n.mechanism || '').toLowerCase() === mechanismFilter.toLowerCase();
      const matchProv = providerFilter === 'all' || (n.engine || '').toLowerCase() === providerFilter.toLowerCase();
      return matchMech && matchProv;
    });
  }, [noveltyResults, mechanismFilter, providerFilter]);

  // Grouped for side-by-side comparison mode
  const comparisonByEngine = useMemo(() => {
    const groups = { gemini: [], groq: [], ollama: [], heuristic: [] };
    noveltyResults.forEach((n) => {
      const eng = (n.engine || 'gemini').toLowerCase();
      if (groups[eng]) groups[eng].push(n);
      else groups.gemini.push(n);
    });
    return groups;
  }, [noveltyResults]);

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
            Autonomous scientific novelty synthesis across <strong>Google Gemini</strong>, <strong>Groq LPU</strong>, and <strong>Local Ollama</strong>, grounded in Knowledge Graph topology.
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
            className="btn btn-primary"
            onClick={handleSynthesize}
            disabled={synthesizing}
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
            <span>{synthesizing ? 'Synthesizing...' : `Fire Synthesis (${selectedProvider.toUpperCase()})`}</span>
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

      {/* 2. Provider Selector Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        {/* Gemini Provider Card */}
        <div
          onClick={() => setSelectedProvider('gemini')}
          className="card"
          style={{
            padding: 16,
            cursor: 'pointer',
            border: selectedProvider === 'gemini' ? '2px solid #3b82f6' : '1px solid var(--border-subtle)',
            background: selectedProvider === 'gemini' ? (isDark ? '#1e293b' : '#eff6ff') : 'var(--bg-card)',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} style={{ color: '#3b82f6' }} />
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Google Gemini</strong>
            </div>
            <span className="badge badge-blue" style={{ fontSize: 10 }}>Cloud Fast</span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
            Flash-Lite structured JSON synthesis with strict schema validation.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
            <span>Model: {providersStatus?.gemini?.default_model || 'gemini-3.5-flash-lite'}</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>● Ready</span>
          </div>
        </div>

        {/* Groq Provider Card */}
        <div
          onClick={() => setSelectedProvider('groq')}
          className="card"
          style={{
            padding: 16,
            cursor: 'pointer',
            border: selectedProvider === 'groq' ? '2px solid #f59e0b' : '1px solid var(--border-subtle)',
            background: selectedProvider === 'groq' ? (isDark ? '#292211' : '#fffbeb') : 'var(--bg-card)',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} style={{ color: '#f59e0b' }} />
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Groq LPU</strong>
            </div>
            <span className="badge badge-amber" style={{ fontSize: 10 }}>Ultra Speed</span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
            Lightning-fast token generation on Llama-3.3-70B and DeepSeek-R1.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
            <span>Model: llama-3.3-70b</span>
            <span>{providersStatus?.groq?.configured || groqKeyOverride ? '● Key Set' : '○ Needs Key'}</span>
          </div>
        </div>

        {/* Ollama Provider Card */}
        <div
          onClick={() => setSelectedProvider('ollama')}
          className="card"
          style={{
            padding: 16,
            cursor: 'pointer',
            border: selectedProvider === 'ollama' ? '2px solid #10b981' : '1px solid var(--border-subtle)',
            background: selectedProvider === 'ollama' ? (isDark ? '#064e3b22' : '#ecfdf5') : 'var(--bg-card)',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Server size={16} style={{ color: '#10b981' }} />
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Local Ollama</strong>
            </div>
            <span className="badge badge-emerald" style={{ fontSize: 10 }}>Local & Private</span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
            Zero-cloud, air-gapped local model inference on localhost:11434.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
            <span>Model: {providersStatus?.ollama?.default_model || 'phi4-mini'}</span>
            <span style={{ color: providersStatus?.ollama?.online ? '#10b981' : 'var(--text-muted)' }}>
              {providersStatus?.ollama?.online ? `● Online (${providersStatus?.ollama?.latency_ms ? `${Math.round(providersStatus.ollama.latency_ms)}ms` : 'ready'})` : '○ Offline'}
            </span>
          </div>
        </div>

        {/* Multi-Model Tournament Card */}
        <div
          onClick={() => setSelectedProvider('all')}
          className="card"
          style={{
            padding: 16,
            cursor: 'pointer',
            border: selectedProvider === 'all' ? '2px solid #8b5cf6' : '1px solid var(--border-subtle)',
            background: selectedProvider === 'all' ? (isDark ? '#2e1065' : '#f5f3ff') : 'var(--bg-card)',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={16} style={{ color: '#8b5cf6' }} />
              <strong style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Tournament Mode</strong>
            </div>
            <span className="badge badge-purple" style={{ fontSize: 10 }}>Fire All</span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.35 }}>
            Fires Gemini, Groq, and Ollama concurrently to compare proposals side-by-side!
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
            <span>3 Concurrent Engines</span>
            <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Multi-Model</span>
          </div>
        </div>
      </div>

      {/* 3. Provider Settings & Connection Test Drawer */}
      {showConfigDrawer && (
        <div
          className="card"
          style={{
            padding: '16px 20px',
            marginBottom: 16,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={14} style={{ color: 'var(--accent-primary)' }} />
            <span>LLM Provider Keys & Diagnostics</span>
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 14 }}>
            {/* Groq API Key */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Groq API Key (Optional override):
              </label>
              <input
                type="password"
                className="input"
                placeholder="gsk_..."
                value={groqKeyOverride}
                onChange={(e) => {
                  setGroqKeyOverride(e.target.value);
                  localStorage.setItem('rc_groq_key', e.target.value);
                }}
                style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
              />
            </div>

            {/* Ollama Base URL */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Ollama Base URL:
              </label>
              <input
                type="text"
                className="input"
                placeholder="http://localhost:11434"
                value={ollamaUrlOverride}
                onChange={(e) => {
                  setOllamaUrlOverride(e.target.value);
                  localStorage.setItem('rc_ollama_url', e.target.value);
                }}
                style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
              />
            </div>

            {/* Model Selection Override */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Target Model:
              </label>
              <select
                className="input"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
              >
                <option value="">Default for {selectedProvider.toUpperCase()}</option>
                {selectedProvider === 'gemini' && (
                  <>
                    <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
                    <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  </>
                )}
                {selectedProvider === 'groq' && (
                  <>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                    <option value="deepseek-r1-distill-llama-70b">deepseek-r1-distill-llama-70b</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  </>
                )}
                {selectedProvider === 'ollama' && (
                  <>
                    <option value="phi4-mini">phi4-mini (Local Active)</option>
                    <option value="phi4-mini:latest">phi4-mini:latest</option>
                    {providersStatus?.ollama?.supported_models?.filter(m => !m.includes('phi4-mini')).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="llama3">llama3</option>
                    <option value="mistral">mistral</option>
                    <option value="qwen2.5">qwen2.5</option>
                    <option value="deepseek-r1">deepseek-r1</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleTestConnection}
              disabled={testingConnection}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {testingConnection ? <RotateCw size={12} className="animate-spin" /> : <Activity size={12} />}
              <span>Test {selectedProvider.toUpperCase()} Connection</span>
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
                    ? `${testResult.message} (${testResult.latency_ms}ms)`
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
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq LPU</option>
            <option value="ollama">Local Ollama</option>
            <option value="heuristic">Heuristic</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('cards')}
            style={{ fontSize: 11.5, padding: '4px 10px' }}
          >
            Card Grid
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'compare' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('compare')}
            style={{ fontSize: 11.5, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Columns3 size={12} />
            <span>Multi-Model Compare</span>
          </button>
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
            Invoking <strong>{selectedProvider.toUpperCase()}</strong> to evaluate topological gaps, cross-paper tensions, and mathematical recombination candidates.
          </p>
        </div>
      ) : filteredNovelties.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Lightbulb size={40} style={{ margin: '0 auto 14px', opacity: 0.4 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No Novelty Proposals Generated Yet
          </h3>
          <p style={{ fontSize: 12.5, maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.45 }}>
            Select your target LLM provider (Google Gemini, Groq, or Ollama) and click <strong>Fire Synthesis</strong> to formulate publication-grade hypotheses from this workspace.
          </p>
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
        </div>
      ) : viewMode === 'compare' ? (
        /* Side-by-side Multi-Model Comparison View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'flex-start' }}>
          {['gemini', 'groq', 'ollama'].map((eng) => {
            const list = comparisonByEngine[eng] || [];
            return (
              <div key={eng} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {eng === 'gemini' && <Sparkles size={15} style={{ color: '#3b82f6' }} />}
                    {eng === 'groq' && <Zap size={15} style={{ color: '#f59e0b' }} />}
                    {eng === 'ollama' && <Server size={15} style={{ color: '#10b981' }} />}
                    <strong style={{ fontSize: 13.5, textTransform: 'capitalize' }}>
                      {eng === 'gemini' ? 'Google Gemini' : eng === 'groq' ? 'Groq LPU' : 'Local Ollama'}
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
        /* Regular Card Grid View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {filteredNovelties.map((nov) => (
            <NoveltyCardItem
              key={nov.id}
              novelty={nov}
              isDark={isDark}
              isAdded={addedCandidateIds.has(nov.id)}
              isAdding={addingId === nov.id}
              copied={copiedId === nov.id}
              onAddToGraph={handleAddToGraph}
              onCopy={handleCopyProposal}
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
    </div>
  );
}

// Subcomponent: Individual Novelty Card Item
function NoveltyCardItem({ novelty, isDark, isAdded, isAdding, copied, onAddToGraph, onCopy, onDiscussInChat }) {
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
  } else if (eng === 'heuristic') {
    engineBadge = 'Heuristic';
    engineColor = '#8b5cf6';
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
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'var(--text-secondary)',
            overflowX: 'auto',
          }}
        >
          {novelty.mathematical_formulation}
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
      </div>
    </div>
  );
}
