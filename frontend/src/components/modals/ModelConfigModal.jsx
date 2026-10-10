import React, { useState, useEffect, useMemo } from 'react';
import {
  Server,
  Cpu,
  Key,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  X,
  XCircle,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Lock,
  Globe,
  Zap,
} from 'lucide-react';

export const KNOWN_PROVIDER_DEFS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'G',
    tagline: 'Gemini 2.5 Flash, 2.0 Flash, Flash-Lite',
    color: '#4285f4',
    bg: '#eff6ff',
    border: '#bfdbfe',
    keyPlaceholder: 'AIzaSy...',
    modelPlaceholder: 'gemini-2.0-flash-lite',
    defaultBaseUrl: '',
    suggestions: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-pro'],
    docUrl: 'https://aistudio.google.com/apikey',
    isLocal: false,
  },
  {
    id: 'groq',
    name: 'Groq LPU',
    short: 'GQ',
    tagline: 'Ultra-low latency LPU inference',
    color: '#f55036',
    bg: '#fef2f2',
    border: '#fecaca',
    keyPlaceholder: 'gsk_...',
    modelPlaceholder: 'qwen/qwen3.8-27b',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    suggestions: ['qwen/qwen3.8-27b', 'llama-3.3-70b-versatile', 'allam-2-7b'],
    docUrl: 'https://console.groq.com/keys',
    isLocal: false,
  },
  {
    id: 'ollama',
    name: 'Local Ollama',
    short: 'OL',
    tagline: 'Local offline models with zero telemetry',
    color: '#6366f1',
    bg: '#eef2ff',
    border: '#c7d2fe',
    keyPlaceholder: null,
    modelPlaceholder: 'phi4-mini',
    defaultBaseUrl: 'http://localhost:11434',
    suggestions: ['phi4-mini', 'llama3.2', 'mistral', 'deepseek-r1', 'qwen2.5'],
    docUrl: 'https://ollama.com',
    isLocal: true,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    short: 'NV',
    tagline: 'Llama 3.3 70B, Mixtral, Nemotron',
    color: '#76b900',
    bg: '#f7fee7',
    border: '#d9f99d',
    keyPlaceholder: 'nvapi-...',
    modelPlaceholder: 'meta/llama-3.3-70b-instruct',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    suggestions: ['meta/llama-3.3-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1', 'deepseek-ai/deepseek-r1'],
    docUrl: 'https://build.nvidia.com',
    isLocal: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    short: 'OR',
    tagline: 'Claude 3.5, DeepSeek-R1, Llama 3.3, GPT-4o',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    keyPlaceholder: 'sk-or-v1-...',
    modelPlaceholder: 'anthropic/claude-3.5-sonnet',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    suggestions: [
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-r1',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
    ],
    docUrl: 'https://openrouter.ai/keys',
    isLocal: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek AI',
    short: 'DS',
    tagline: 'DeepSeek-V3 & DeepSeek-R1 frontier reasoning',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    keyPlaceholder: 'sk-...',
    modelPlaceholder: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com',
    suggestions: ['deepseek-chat', 'deepseek-reasoner'],
    docUrl: 'https://platform.deepseek.com/api_keys',
    isLocal: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    short: 'OA',
    tagline: 'GPT-4o, GPT-4o-mini, o1, o3-mini',
    color: '#10a37f',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    keyPlaceholder: 'sk-proj-...',
    modelPlaceholder: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
    suggestions: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
    docUrl: 'https://platform.openai.com/api-keys',
    isLocal: false,
  },
];

export default function ModelConfigModal({ isOpen, onClose, onConfigUpdated, initialProviderId = null }) {
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedId, setSelectedId] = useState(initialProviderId || 'gemini');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showUnvalidated, setShowUnvalidated] = useState(false);

  // Form states for current selected provider
  const [displayName, setDisplayName] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [currentModel, setCurrentModel] = useState('');

  // Status & test states
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: bool, message: str, latency_ms: number, error: str }

  const fetchProviders = async () => {
    try {
      setLoadingProviders(true);
      const res = await fetch('/api/v1/settings/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProviders();
      if (initialProviderId) {
        setSelectedId(initialProviderId);
      }
    }
  }, [isOpen, initialProviderId]);

  // Find metadata definition for selected provider
  const currentDef = useMemo(() => {
    return KNOWN_PROVIDER_DEFS.find((d) => d.id === selectedId) || {
      id: selectedId,
      name: selectedId.toUpperCase(),
      short: selectedId.substring(0, 2).toUpperCase(),
      color: '#6366f1',
      bg: '#eef2ff',
      border: '#c7d2fe',
      suggestions: [],
      isLocal: false,
    };
  }, [selectedId]);

  // Current server state for selected provider
  const currentSaved = useMemo(() => {
    return providers.find((p) => p.provider_id === selectedId) || null;
  }, [providers, selectedId]);

  // Sync inputs when selected provider or saved data changes
  useEffect(() => {
    if (currentDef) {
      setDisplayName(currentDef.name);
      setApiKeyInput('');
      setShowApiKey(false);
      setBaseUrlInput(currentSaved?.base_url || currentDef.defaultBaseUrl || '');
      setCurrentModel(currentSaved?.model || currentDef.modelPlaceholder || '');
      setCustomModelInput('');
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [selectedId, currentSaved, currentDef]);

  if (!isOpen) return null;

  // Providers list in left panel: show configured providers or default known providers
  const displayProvidersList = KNOWN_PROVIDER_DEFS.map((def) => {
    const saved = providers.find((p) => p.provider_id === def.id);
    const hasKey = Boolean(saved?.has_key);
    return {
      ...def,
      saved,
      hasKey,
      activeModel: saved?.model || def.modelPlaceholder,
    };
  });

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: selectedId,
          api_key: apiKeyInput.trim() || undefined,
          base_url: baseUrlInput.trim() || undefined,
          model: currentModel.trim() || undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        error: `Network error testing connection: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (modelToSave = currentModel) => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/v1/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: selectedId,
          api_key: apiKeyInput.trim() || undefined,
          base_url: baseUrlInput.trim() || undefined,
          model: modelToSave ? modelToSave.trim() : undefined,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setApiKeyInput('');
        await fetchProviders();
        if (onConfigUpdated) {
          onConfigUpdated({
            provider_id: selectedId,
            model: modelToSave,
          });
        }
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save provider settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Clear configuration and API key for ${currentDef.name}?`)) return;
    try {
      const res = await fetch(`/api/v1/settings/providers/${selectedId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setApiKeyInput('');
        setBaseUrlInput('');
        await fetchProviders();
        if (onConfigUpdated) onConfigUpdated({ provider_id: selectedId, cleared: true });
      }
    } catch (err) {
      console.error('Failed to delete provider config:', err);
    }
  };

  const handleSelectModel = (modelName) => {
    setCurrentModel(modelName);
    handleSave(modelName);
  };

  const handleAddCustomModel = (e) => {
    e?.preventDefault();
    if (!customModelInput.trim()) return;
    const clean = customModelInput.trim();
    setCurrentModel(clean);
    setCustomModelInput('');
    handleSave(clean);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(6px)',
        padding: '24px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          height: '660px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-main, sans-serif)',
          color: '#0f172a',
        }}
      >
        {/* ── Top Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
              }}
            >
              <Cpu size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                AI Model Configuration
              </h2>
              <p style={{ fontSize: 12, margin: 0, color: '#64748b' }}>
                Configure multiple AI providers, API credentials, and models
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body: Two Columns ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left Column: Providers List */}
          <div
            style={{
              width: 280,
              borderRight: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              padding: '14px',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
                paddingLeft: 4,
              }}
            >
              Providers
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {displayProvidersList.map((p) => {
                const isSelected = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      setShowAddMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: 9,
                      border: isSelected ? '1px solid #c7d2fe' : '1px solid transparent',
                      backgroundColor: isSelected ? '#eef2ff' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          backgroundColor: p.bg,
                          color: p.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10.5,
                          fontWeight: 800,
                          flexShrink: 0,
                          border: `1px solid ${p.border}`,
                        }}
                      >
                        {p.short}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? '#4338ca' : '#1e293b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.activeModel || (p.hasKey ? 'Ready' : 'Not configured')}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {p.hasKey ? (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            backgroundColor: '#10b981',
                            display: 'inline-block',
                          }}
                          title="API key configured & active"
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: '#d97706',
                            backgroundColor: '#fef3c7',
                            padding: '1px 5px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                          title="API Key required"
                        >
                          No Key
                        </span>
                      )}
                      <ChevronRight size={14} style={{ color: isSelected ? '#6366f1' : '#94a3b8' }} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom + Add Provider Button */}
            <div style={{ position: 'relative', marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setShowAddMenu((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} />
                  <span>Add Provider</span>
                </div>
                <ChevronDown size={14} style={{ opacity: 0.7 }} />
              </button>

              {showAddMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '105%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    padding: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 100,
                    maxHeight: 220,
                    overflowY: 'auto',
                  }}
                >
                  {KNOWN_PROVIDER_DEFS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        setShowAddMenu(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: '#1e293b',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          backgroundColor: p.bg,
                          color: p.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                        }}
                      >
                        {p.short}
                      </span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Configuration & Models Pane */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              padding: '24px 28px',
              overflowY: 'auto',
            }}
          >
            {/* Header: Selected Provider Title & Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: currentDef.bg,
                    color: currentDef.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 800,
                    border: `1px solid ${currentDef.border}`,
                  }}
                >
                  {currentDef.short}
                </span>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    {currentDef.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {currentSaved?.has_key
                        ? `Configured · Model: ${currentModel || currentSaved.model || 'default'}`
                        : 'No API key configured'}
                    </span>
                    {currentDef.docUrl && (
                      <a
                        href={currentDef.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11,
                          color: '#6366f1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          textDecoration: 'none',
                        }}
                      >
                        <span>Get API Key</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {currentSaved?.has_key && (
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #fee2e2',
                    backgroundColor: '#fff5f5',
                    color: '#e11d48',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  title="Clear configuration"
                >
                  <Trash2 size={13} />
                  <span>Delete Provider</span>
                </button>
              )}
            </div>

            {/* Section 1: CONFIGURATION */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                <Cpu size={12} />
                <span>Configuration</span>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {/* Display Name */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#334155',
                      marginBottom: 5,
                    }}
                  >
                    🏷 Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      fontSize: 13,
                      color: '#0f172a',
                      outline: 'none',
                    }}
                    placeholder={currentDef.name}
                  />
                </div>

                {/* API Key */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                      🔑 API Key
                    </label>
                    {currentSaved?.api_key_masked && !apiKeyInput && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Active: <code style={{ backgroundColor: '#e2e8f0', padding: '1px 4px', borderRadius: 4 }}>{currentSaved.api_key_masked}</code>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={
                          currentSaved?.has_key
                            ? '•••••••••••••••• (Leave blank to keep current)'
                            : currentDef.keyPlaceholder || 'Enter your API key...'
                        }
                        style={{
                          width: '100%',
                          padding: '9px 38px 9px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: 13,
                          fontFamily: 'var(--font-code, monospace)',
                          color: '#0f172a',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          padding: 4,
                        }}
                      >
                        {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing}
                      style={{
                        padding: '9px 18px',
                        borderRadius: 8,
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: testing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: testing ? 0.7 : 1,
                      }}
                    >
                      {testing ? (
                        <>
                          <RefreshCw size={14} className="spin-animation" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <span>Test</span>
                      )}
                    </button>
                  </div>

                  {/* Test Feedback Result */}
                  {testResult && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        backgroundColor: testResult.success ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                        color: testResult.success ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {testResult.success ? (
                        <>
                          <CheckCircle2 size={15} color="#16a34a" />
                          <span>
                            Connection successful! Latency: <strong>{testResult.latency_ms} ms</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={15} color="#dc2626" />
                          <span>{testResult.error || 'Connection failed'}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Base URL (Optional) */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#334155',
                      marginBottom: 5,
                    }}
                  >
                    🔗 Base URL (optional, e.g. {currentDef.defaultBaseUrl || 'https://api.openai.com/v1'})
                  </label>
                  <input
                    type="text"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    placeholder={currentDef.defaultBaseUrl || 'https://...'}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      fontSize: 12.5,
                      fontFamily: 'var(--font-code, monospace)',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Save Button Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                  {saveSuccess && (
                    <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={14} />
                      <span>Saved to SQLite</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSave()}
                    disabled={saving}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      backgroundColor: '#4f46e5',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {saving ? <RefreshCw size={13} className="spin-animation" /> : <Check size={13} />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: MODELS */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  <Sparkles size={12} />
                  <span>Models</span>
                </div>

                {/* Custom Model Input */}
                <form
                  onSubmit={handleAddCustomModel}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="Custom model ID..."
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                      width: 170,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Plus size={13} />
                    <span>Add</span>
                  </button>
                </form>
              </div>

              {/* Models Box */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                  Active Model:
                  <span
                    style={{
                      marginLeft: 8,
                      backgroundColor: '#e0e7ff',
                      color: '#4338ca',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontFamily: 'var(--font-code, monospace)',
                      fontWeight: 600,
                    }}
                  >
                    {currentModel || currentSaved?.model || 'default'}
                  </span>
                </div>

                {/* Suggested Model Chips (from Screenshot 22-58-42) */}
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>
                    Suggested Models:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {currentDef.suggestions.map((sug) => {
                      const isActive = sug === currentModel;
                      return (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => handleSelectModel(sug)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 20,
                            border: isActive ? '1px solid #6366f1' : '1px solid #cbd5e1',
                            backgroundColor: isActive ? '#eef2ff' : '#ffffff',
                            color: isActive ? '#4338ca' : '#334155',
                            fontSize: 12,
                            fontFamily: 'var(--font-code, monospace)',
                            cursor: 'pointer',
                            fontWeight: isActive ? 600 : 400,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isActive ? <Check size={12} color="#6366f1" /> : <Plus size={12} color="#94a3b8" />}
                          <span>{sug}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 24px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            fontSize: 12,
            color: '#64748b',
          }}
        >
          {/* Left: Show unvalidated models toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showUnvalidated}
              onChange={(e) => setShowUnvalidated(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show unvalidated models</span>
          </label>

          {/* Right: Storage guarantee */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b' }}>
            <Lock size={12} />
            <span>API keys are securely stored in SQLite database</span>
          </div>
        </div>
      </div>
    </div>
  );
}
