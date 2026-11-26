import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  BookOpen,
  Database,
  Search,
  Bot,
  Server,
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
  RotateCcw,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
  Play,
  Check,
  Star,
} from 'lucide-react';
import { KNOWN_PROVIDER_DEFS } from '../components/modals/ModelConfigModal';

const API_BASE = '/api/v1/settings';

const SETTINGS_NAV = [
  {
    section: 'MODELS & LITERATURE',
    items: [
      {
        id: 'models',
        label: 'AI Models & Providers',
        icon: Cpu,
        description: 'Manage LLM providers, API credentials, model checkpoints, and default routing.',
      },
      {
        id: 'academic',
        label: 'Academic & Search APIs',
        icon: BookOpen,
        description: 'Configure Semantic Scholar, OpenAlex polite pool, arXiv, CrossRef, and Europe PMC.',
      },
    ],
  },
  {
    section: 'PIPELINE & EXECUTION',
    items: [
      {
        id: 'rag',
        label: 'Embeddings & Vector DB',
        icon: Database,
        description: 'Select embedding backend, model checkpoint, and dense vector dimensions.',
      },
      {
        id: 'retrieval',
        label: 'Research & Retrieval',
        icon: Search,
        description: 'Tune document chunking, overlap windows, Top-K retrieval, and ranking limits.',
      },
      {
        id: 'agents',
        label: 'Agents & Execution',
        icon: Bot,
        description: 'Configure global default LLM provider and multi-agent reasoning loop limits.',
      },
      {
        id: 'infrastructure',
        label: 'Cache & Infrastructure',
        icon: Server,
        description: 'Configure Redis paper cache, TTL policies, Searqon web search, and timeouts.',
      },
    ],
  },
  {
    section: 'SECURITY & OPERATIONS',
    items: [
      {
        id: 'security',
        label: 'Security & Credentials',
        icon: Shield,
        description: 'Audit stored API keys, inspect secret sources (SQLite vs .env), and revoke keys.',
      },
      {
        id: 'diagnostics',
        label: 'Diagnostics & Health',
        icon: Activity,
        description: 'Verify backend health, run live provider & service connectivity tests, and validate config.',
      },
    ],
  },
];

// Map UI category -> backend system_settings keys
const CATEGORY_KEYS = {
  academic: [
    'semantic_scholar_api_key',
    'openalex_email',
    'openalex_api_key',
    'arxiv_base_url',
    'crossref_base_url',
    'europepmc_base_url',
  ],
  rag: ['embedding_provider', 'embedding_model', 'embedding_dim'],
  retrieval: ['rag_top_k', 'rag_chunk_size', 'rag_chunk_overlap', 'default_rank_limit'],
  agents: ['default_llm_provider', 'max_loop_iterations'],
  infrastructure: [
    'redis_enabled',
    'redis_url',
    'redis_active_paper_ttl',
    'web_search_enabled',
    'searqon_base_url',
    'web_search_top_k',
    'web_search_cache_ttl',
    'searqon_timeout',
  ],
};

const ADVANCED_KEYS = new Set([
  'arxiv_base_url',
  'crossref_base_url',
  'europepmc_base_url',
  'rag_chunk_overlap',
  'default_rank_limit',
  'searqon_timeout',
  'web_search_cache_ttl',
  'redis_active_paper_ttl',
]);

export default function SettingsView() {
  const [activeCategory, setActiveCategory] = useState('models');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // System settings state
  const [systemSettings, setSystemSettings] = useState([]);
  const [savedValues, setSavedValues] = useState({});
  const [formValues, setFormValues] = useState({});
  const [revealKeys, setRevealKeys] = useState({});

  // Providers state
  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState('gemini');
  const [providerTestResults, setProviderTestResults] = useState({});

  // Service test & health state
  const [testingService, setTestingService] = useState({});
  const [serviceTestResults, setServiceTestResults] = useState({});
  const [healthStatus, setHealthStatus] = useState(null);

  // Feedback & destructive confirmation modal
  const [banner, setBanner] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sysRes, provRes, healthRes] = await Promise.all([
        fetch(`${API_BASE}/system`),
        fetch(`${API_BASE}/providers`),
        fetch('/api/v1/health').catch(() => null),
      ]);

      if (sysRes.ok) {
        const data = await sysRes.json();
        const items = data.settings || [];
        setSystemSettings(items);
        const vals = {};
        items.forEach((item) => {
          vals[item.key] = item.value ?? '';
        });
        setSavedValues(vals);
        setFormValues(vals);
      }

      if (provRes.ok) {
        const pData = await provRes.json();
        setProviders(pData.providers || []);
      }

      if (healthRes && healthRes.ok) {
        const hData = await healthRes.json();
        setHealthStatus({ ok: true, ...hData });
      } else {
        setHealthStatus({ ok: false, error: 'Backend health endpoint unreachable' });
      }
    } catch (err) {
      setBanner({ type: 'error', text: `Failed to load configuration: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const settingsByKey = useMemo(() => {
    const map = {};
    systemSettings.forEach((s) => {
      map[s.key] = s;
    });
    return map;
  }, [systemSettings]);

  const isCategoryDirty = useCallback(
    (catId) => {
      const keys = CATEGORY_KEYS[catId] || [];
      return keys.some((k) => String(formValues[k] ?? '') !== String(savedValues[k] ?? ''));
    },
    [formValues, savedValues]
  );

  const validationErrors = useMemo(() => {
    const errs = {};
    const chunkSize = Number(formValues.rag_chunk_size);
    const chunkOverlap = Number(formValues.rag_chunk_overlap);
    if (!Number.isNaN(chunkSize) && chunkSize < 100) {
      errs.rag_chunk_size = 'Chunk size must be at least 100 characters.';
    }
    if (!Number.isNaN(chunkOverlap) && !Number.isNaN(chunkSize) && chunkOverlap >= chunkSize) {
      errs.rag_chunk_overlap = 'Chunk overlap must be smaller than chunk size.';
    }
    const topK = Number(formValues.rag_top_k);
    if (!Number.isNaN(topK) && (topK < 1 || topK > 100)) {
      errs.rag_top_k = 'Top-K must be between 1 and 100.';
    }
    const maxLoops = Number(formValues.max_loop_iterations);
    if (!Number.isNaN(maxLoops) && (maxLoops < 1 || maxLoops > 50)) {
      errs.max_loop_iterations = 'Max loop iterations must be between 1 and 50.';
    }
    return errs;
  }, [formValues]);

  const handleFieldChange = (key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleDiscardCategory = (catId) => {
    const keys = CATEGORY_KEYS[catId] || [];
    setFormValues((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = savedValues[k] ?? '';
      });
      return next;
    });
    setBanner({ type: 'info', text: 'Unsaved changes discarded.' });
    setTimeout(() => setBanner(null), 2500);
  };

  const handleSaveCategory = async (catId, overridePayload = null) => {
    const keys = CATEGORY_KEYS[catId] || [];
    const hasErr = keys.some((k) => validationErrors[k]);
    if (hasErr && !overridePayload) {
      setBanner({ type: 'error', text: 'Fix validation errors before saving.' });
      return false;
    }

    setSaving(true);
    setBanner(null);
    try {
      const payload = overridePayload || {};
      if (!overridePayload) {
        keys.forEach((k) => {
          const spec = settingsByKey[k];
          const val = formValues[k];
          // Skip unchanged masked sensitive values
          if (spec?.sensitive && typeof val === 'string' && val.includes('...')) {
            return;
          }
          payload[k] = val;
        });
      }

      const res = await fetch(`${API_BASE}/system`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const refreshedItems = data.data?.settings || [];
        if (refreshedItems.length) {
          setSystemSettings(refreshedItems);
          const newSaved = {};
          refreshedItems.forEach((it) => {
            newSaved[it.key] = it.value ?? '';
          });
          setSavedValues(newSaved);
          setFormValues((prev) => {
            const next = { ...prev };
            Object.keys(payload).forEach((k) => {
              next[k] = newSaved[k] ?? '';
            });
            return next;
          });
        }
        setBanner({ type: 'success', text: 'Configuration saved to SQLite and applied.' });
        setTimeout(() => setBanner(null), 3500);
        return true;
      } else {
        setBanner({ type: 'error', text: data.error || 'Failed to save configuration.' });
        return false;
      }
    } catch (err) {
      setBanner({ type: 'error', text: `Network error: ${err.message}` });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleTestService = async (serviceId, extraPayload = {}) => {
    setTestingService((prev) => ({ ...prev, [serviceId]: true }));
    try {
      const res = await fetch(`${API_BASE}/test-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, ...extraPayload }),
      });
      const data = await res.json();
      setServiceTestResults((prev) => ({ ...prev, [serviceId]: data }));
      return data;
    } catch (err) {
      const errRes = { success: false, error: err.message };
      setServiceTestResults((prev) => ({ ...prev, [serviceId]: errRes }));
      return errRes;
    } finally {
      setTestingService((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const activeNavItem = useMemo(() => {
    for (const group of SETTINGS_NAV) {
      const found = group.items.find((it) => it.id === activeCategory);
      if (found) return found;
    }
    return SETTINGS_NAV[0].items[0];
  }, [activeCategory]);

  const defaultProviderId = savedValues.default_llm_provider || 'ollama';

  return (
    <div className="cfg-root">
      {/* Left Vertical Navigation */}
      <aside className="cfg-sidebar">
        <div className="cfg-sidebar-header">
          <span className="cfg-sidebar-title">Configuration</span>
          <button
            type="button"
            className="cfg-icon-btn"
            onClick={loadAll}
            disabled={loading}
            title="Reload configuration from SQLite"
            aria-label="Reload configuration"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <nav className="cfg-nav">
          {SETTINGS_NAV.map((group) => (
            <div key={group.section} className="cfg-nav-group">
              <div className="cfg-nav-section-label">{group.section}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeCategory === item.id;
                const dirty = isCategoryDirty(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`cfg-nav-item ${active ? 'active' : ''}`}
                    onClick={() => setActiveCategory(item.id)}
                  >
                    <Icon size={15} className="cfg-nav-icon" />
                    <span className="cfg-nav-label">{item.label}</span>
                    {dirty && <span className="cfg-dirty-dot" title="Unsaved changes" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Right Main Content */}
      <main className="cfg-main">
        <div className="cfg-content-inner">
          {/* Section Header */}
          <header className="cfg-page-header">
            <div>
              <h1 className="cfg-page-title">{activeNavItem.label}</h1>
              <p className="cfg-page-desc">{activeNavItem.description}</p>
            </div>
            <div className="cfg-header-status">
              {CATEGORY_KEYS[activeCategory] && (
                isCategoryDirty(activeCategory) ? (
                  <span className="cfg-state-pill unsaved">Unsaved changes</span>
                ) : (
                  <span className="cfg-state-pill saved">
                    <CheckCircle2 size={12} />
                    Saved
                  </span>
                )
              )}
            </div>
          </header>

          {/* Status Banner */}
          {banner && (
            <div className={`cfg-banner ${banner.type}`}>
              {banner.type === 'success' ? (
                <CheckCircle2 size={15} />
              ) : banner.type === 'error' ? (
                <AlertCircle size={15} />
              ) : (
                <AlertTriangle size={15} />
              )}
              <span>{banner.text}</span>
            </div>
          )}

          {/* Category Body */}
          {loading && systemSettings.length === 0 ? (
            <div className="cfg-loading-state">
              <Loader2 size={20} className="animate-spin" />
              <span>Loading platform configuration...</span>
            </div>
          ) : (
            <>
              {activeCategory === 'models' && (
                <ProvidersPanel
                  providers={providers}
                  selectedId={selectedProviderId}
                  onSelect={setSelectedProviderId}
                  defaultProviderId={defaultProviderId}
                  onSetDefault={(pId) => handleSaveCategory('agents', { default_llm_provider: pId })}
                  testResults={providerTestResults}
                  setTestResults={setProviderTestResults}
                  onRefresh={loadAll}
                  setBanner={setBanner}
                  setConfirmModal={setConfirmModal}
                />
              )}

              {CATEGORY_KEYS[activeCategory] && (
                <SystemCategoryPanel
                  categoryId={activeCategory}
                  keys={CATEGORY_KEYS[activeCategory]}
                  settingsByKey={settingsByKey}
                  formValues={formValues}
                  savedValues={savedValues}
                  revealKeys={revealKeys}
                  setRevealKeys={setRevealKeys}
                  validationErrors={validationErrors}
                  onChange={handleFieldChange}
                  onSave={() => handleSaveCategory(activeCategory)}
                  onDiscard={() => handleDiscardCategory(activeCategory)}
                  isDirty={isCategoryDirty(activeCategory)}
                  saving={saving}
                  onTestService={handleTestService}
                  testingService={testingService}
                  serviceTestResults={serviceTestResults}
                />
              )}

              {activeCategory === 'security' && (
                <SecurityPanel
                  providers={providers}
                  systemSettings={systemSettings}
                  onJumpToProvider={(pId) => {
                    setSelectedProviderId(pId);
                    setActiveCategory('models');
                  }}
                  onJumpToCategory={(catId) => setActiveCategory(catId)}
                  onRefresh={loadAll}
                  setBanner={setBanner}
                  setConfirmModal={setConfirmModal}
                />
              )}

              {activeCategory === 'diagnostics' && (
                <DiagnosticsPanel
                  healthStatus={healthStatus}
                  providers={providers}
                  providerTestResults={providerTestResults}
                  setProviderTestResults={setProviderTestResults}
                  serviceTestResults={serviceTestResults}
                  onTestService={handleTestService}
                  testingService={testingService}
                  formValues={formValues}
                  validationErrors={validationErrors}
                  onRefresh={loadAll}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Destructive Action Confirmation Modal */}
      {confirmModal && (
        <div className="cfg-modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="cfg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cfg-modal-header">
              <AlertTriangle size={18} className="cfg-modal-warn-icon" />
              <h3>{confirmModal.title}</h3>
            </div>
            <p className="cfg-modal-body">{confirmModal.message}</p>
            <div className="cfg-modal-actions">
              <button
                type="button"
                className="cfg-btn secondary"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cfg-btn danger"
                onClick={async () => {
                  await confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {confirmModal.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AI MODELS & PROVIDERS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function ProvidersPanel({
  providers,
  selectedId,
  onSelect,
  defaultProviderId,
  onSetDefault,
  testResults,
  setTestResults,
  onRefresh,
  setBanner,
  setConfirmModal,
}) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Merge known defs with any custom providers returned from SQLite
  const providerList = useMemo(() => {
    const map = new Map();
    KNOWN_PROVIDER_DEFS.forEach((def) => {
      map.set(def.id, { ...def });
    });
    providers.forEach((p) => {
      if (!map.has(p.provider_id)) {
        map.set(p.provider_id, {
          id: p.provider_id,
          name: p.provider_id.toUpperCase(),
          tagline: 'Custom OpenAI-compatible endpoint',
          defaultBaseUrl: p.base_url || '',
          modelPlaceholder: p.model || '',
          suggestions: [],
          isLocal: p.provider_id === 'vllm' || p.provider_id === 'lmstudio',
        });
      }
    });
    return Array.from(map.values()).map((def) => {
      const saved = providers.find((p) => p.provider_id === def.id) || {};
      return { ...def, saved };
    });
  }, [providers]);

  const current = useMemo(
    () => providerList.find((p) => p.id === selectedId) || providerList[0],
    [providerList, selectedId]
  );

  useEffect(() => {
    if (current) {
      setApiKeyInput('');
      setShowKey(false);
      setBaseUrlInput(current.saved?.base_url || current.defaultBaseUrl || '');
      setModelInput(current.saved?.model || current.modelPlaceholder || '');
    }
  }, [current]);

  const isDirty = useMemo(() => {
    if (!current) return false;
    const origUrl = current.saved?.base_url || current.defaultBaseUrl || '';
    const origModel = current.saved?.model || current.modelPlaceholder || '';
    return (
      apiKeyInput.trim() !== '' ||
      baseUrlInput.trim() !== origUrl ||
      modelInput.trim() !== origModel
    );
  }, [current, apiKeyInput, baseUrlInput, modelInput]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API_BASE}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: current.id,
          api_key: apiKeyInput.trim() || undefined,
          base_url: baseUrlInput.trim() || undefined,
          model: modelInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [current.id]: data }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [current.id]: { success: false, error: err.message },
      }));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: current.id,
          api_key: apiKeyInput.trim() || undefined,
          base_url: baseUrlInput.trim() || undefined,
          model: modelInput.trim() || undefined,
        }),
      });
      if (res.ok) {
        setApiKeyInput('');
        await onRefresh();
        setBanner({ type: 'success', text: `Saved ${current.name} configuration to SQLite.` });
        setTimeout(() => setBanner(null), 3500);
      } else {
        setBanner({ type: 'error', text: `Failed to save ${current.name} settings.` });
      }
    } catch (err) {
      setBanner({ type: 'error', text: `Network error: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setApiKeyInput('');
    setBaseUrlInput(current.saved?.base_url || current.defaultBaseUrl || '');
    setModelInput(current.saved?.model || current.modelPlaceholder || '');
  };

  const handleClearCredentials = () => {
    setConfirmModal({
      title: `Remove ${current.name} Configuration`,
      message: `This will remove the saved API key, custom base URL, and model selection for ${current.name} from SQLite. Environment variable fallbacks (.env) will still apply if defined.`,
      confirmLabel: 'Remove Configuration',
      onConfirm: async () => {
        const res = await fetch(`${API_BASE}/providers/${current.id}`, { method: 'DELETE' });
        if (res.ok) {
          await onRefresh();
          setBanner({ type: 'info', text: `Cleared SQLite configuration for ${current.name}.` });
          setTimeout(() => setBanner(null), 3000);
        }
      },
    });
  };

  if (!current) return null;
  const lastTest = testResults[current.id];
  const isDefault = defaultProviderId === current.id;
  const hasKey = Boolean(current.saved?.has_key);

  return (
    <div className="cfg-providers-layout">
      {/* Provider List */}
      <div className="cfg-provider-list">
        {providerList.map((p) => {
          const active = p.id === current.id;
          const pTest = testResults[p.id];
          const pDefault = defaultProviderId === p.id;
          const configured = Boolean(p.saved?.has_key);

          return (
            <button
              key={p.id}
              type="button"
              className={`cfg-provider-row ${active ? 'active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <div className="cfg-provider-row-main">
                <div className="cfg-provider-row-title">
                  <span>{p.name}</span>
                  {pDefault && (
                    <span className="cfg-tag default" title="Global default provider">
                      Default
                    </span>
                  )}
                </div>
                <div className="cfg-provider-row-meta">
                  <span className="cfg-mono">{p.saved?.model || p.modelPlaceholder || 'No model'}</span>
                </div>
              </div>
              <div className="cfg-provider-row-status">
                {pTest ? (
                  pTest.success ? (
                    <CheckCircle2 size={14} className="cfg-status-ok" title={`Connected (${pTest.latency_ms}ms)`} />
                  ) : (
                    <XCircle size={14} className="cfg-status-err" title={pTest.error} />
                  )
                ) : configured ? (
                  <span className="cfg-dot ok" title="Configured" />
                ) : (
                  <span className="cfg-dot missing" title="Missing credentials" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Provider Detail Panel */}
      <div className="cfg-card cfg-provider-detail">
        <div className="cfg-detail-header">
          <div>
            <div className="cfg-detail-title-row">
              <h2>{current.name}</h2>
              {hasKey ? (
                <span className="cfg-state-pill saved">
                  {current.isLocal ? 'Local Endpoint' : 'Configured'}
                </span>
              ) : (
                <span className="cfg-state-pill warn">Missing Credentials</span>
              )}
              {current.saved?.key_source && current.saved.key_source !== 'none' && (
                <span className="cfg-source-tag">Source: {current.saved.key_source}</span>
              )}
            </div>
            <p className="cfg-detail-subtitle">{current.tagline}</p>
          </div>

          <div className="cfg-detail-header-actions">
            {current.docUrl && (
              <a
                href={current.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cfg-btn secondary sm"
              >
                API Docs
                <ExternalLink size={12} />
              </a>
            )}
            {!isDefault && (
              <button
                type="button"
                className="cfg-btn secondary sm"
                onClick={() => onSetDefault(current.id)}
              >
                <Star size={12} />
                Set as Default
              </button>
            )}
          </div>
        </div>

        <div className="cfg-form-grid">
          {/* API Key */}
          {!current.isLocal && (
            <div className="cfg-field">
              <label className="cfg-label">
                API Credential
                {current.saved?.api_key_masked && (
                  <span className="cfg-label-hint">
                    Saved: <code className="cfg-mono">{current.saved.api_key_masked}</code>
                  </span>
                )}
              </label>
              <div className="cfg-input-group">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="cfg-input"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    current.saved?.api_key_masked
                      ? `Enter new key to replace (${current.saved.api_key_masked})`
                      : current.keyPlaceholder || 'Enter API key...'
                  }
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="cfg-input-addon-btn"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? 'Hide input' : 'Show input'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Base URL */}
          <div className="cfg-field">
            <label className="cfg-label">
              Base URL
              <span className="cfg-label-hint">Optional override for proxy or self-hosted endpoint</span>
            </label>
            <input
              type="text"
              className="cfg-input cfg-mono"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder={current.defaultBaseUrl || 'https://...'}
            />
          </div>

          {/* Model Selection */}
          <div className="cfg-field">
            <label className="cfg-label">Default Model Checkpoint</label>
            <input
              type="text"
              className="cfg-input cfg-mono"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder={current.modelPlaceholder || 'Enter model identifier...'}
            />
            {current.suggestions?.length > 0 && (
              <div className="cfg-model-chips">
                {current.suggestions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`cfg-model-chip ${modelInput === m ? 'active' : ''}`}
                    onClick={() => setModelInput(m)}
                  >
                    {modelInput === m && <Check size={11} />}
                    <span>{m}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Connection Test Result */}
        {lastTest && (
          <div className={`cfg-test-result ${lastTest.success ? 'ok' : 'err'}`}>
            {lastTest.success ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            <div className="cfg-test-result-text">
              <strong>{lastTest.success ? 'Connection Verified' : 'Connection Failed'}</strong>
              <span>
                {lastTest.message || lastTest.error}
                {lastTest.latency_ms ? ` (${lastTest.latency_ms} ms)` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="cfg-card-footer">
          <div className="cfg-footer-left">
            <button
              type="button"
              className="cfg-btn secondary"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Test Connection
            </button>

            {current.saved?.stored_in_db && (
              <button
                type="button"
                className="cfg-btn ghost-danger"
                onClick={handleClearCredentials}
              >
                <Trash2 size={14} />
                Clear Saved Config
              </button>
            )}
          </div>

          <div className="cfg-footer-right">
            {isDirty && (
              <button type="button" className="cfg-btn secondary" onClick={handleDiscard}>
                <RotateCcw size={14} />
                Discard
              </button>
            )}
            <button
              type="button"
              className="cfg-btn primary"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SYSTEM SETTINGS PANEL (Academic, RAG, Retrieval, Agents, Infrastructure)
// ─────────────────────────────────────────────────────────────────────────────

function SystemCategoryPanel({
  categoryId,
  keys,
  settingsByKey,
  formValues,
  revealKeys,
  setRevealKeys,
  validationErrors,
  onChange,
  onSave,
  onDiscard,
  isDirty,
  saving,
  onTestService,
  testingService,
  serviceTestResults,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const primaryKeys = keys.filter((k) => !ADVANCED_KEYS.has(k) && settingsByKey[k]);
  const advancedKeys = keys.filter((k) => ADVANCED_KEYS.has(k) && settingsByKey[k]);

  const renderField = (key) => {
    const spec = settingsByKey[key];
    if (!spec) return null;
    const val = formValues[key] ?? '';
    const err = validationErrors[key];

    if (spec.type === 'bool') {
      return (
        <div key={key} className="cfg-toggle-row">
          <div className="cfg-toggle-info">
            <div className="cfg-label">{spec.label}</div>
            <div className="cfg-field-desc">{spec.description}</div>
          </div>
          <label className="cfg-switch">
            <input
              type="checkbox"
              checked={Boolean(val)}
              onChange={(e) => onChange(key, e.target.checked)}
            />
            <span className="cfg-switch-slider" />
          </label>
        </div>
      );
    }

    const isMasked = spec.sensitive && typeof val === 'string' && val.includes('...');
    const revealed = revealKeys[key];

    return (
      <div key={key} className="cfg-field">
        <div className="cfg-label-row">
          <label className="cfg-label" htmlFor={`field-${key}`}>
            {spec.label}
          </label>
          {spec.source && (
            <span className="cfg-source-tag">
              {spec.source === 'sqlite' ? 'SQLite' : spec.source === 'env' ? '.env' : 'Default'}
            </span>
          )}
        </div>
        <p className="cfg-field-desc">{spec.description}</p>

        {spec.options ? (
          <select
            id={`field-${key}`}
            className="cfg-input"
            value={val}
            onChange={(e) => onChange(key, e.target.value)}
          >
            {spec.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : spec.sensitive ? (
          <div className="cfg-input-group">
            <input
              id={`field-${key}`}
              type={revealed ? 'text' : 'password'}
              className="cfg-input cfg-mono"
              value={val}
              onChange={(e) => onChange(key, e.target.value)}
              placeholder={spec.placeholder || 'Enter API key...'}
              autoComplete="off"
            />
            <button
              type="button"
              className="cfg-input-addon-btn"
              onClick={() => setRevealKeys((p) => ({ ...p, [key]: !p[key] }))}
              title={isMasked ? 'Masked key cannot be revealed; enter a new key to replace' : 'Toggle visibility'}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        ) : (
          <input
            id={`field-${key}`}
            type={spec.type === 'int' || spec.type === 'float' ? 'number' : 'text'}
            step={spec.type === 'float' ? '0.1' : '1'}
            className={`cfg-input ${spec.type !== 'string' ? 'cfg-mono' : ''}`}
            value={val}
            onChange={(e) =>
              onChange(
                key,
                spec.type === 'int'
                  ? e.target.value === '' ? '' : parseInt(e.target.value, 10)
                  : spec.type === 'float'
                  ? e.target.value === '' ? '' : parseFloat(e.target.value)
                  : e.target.value
              )
            }
            placeholder={spec.placeholder || ''}
          />
        )}

        {err && <div className="cfg-field-error">{err}</div>}
      </div>
    );
  };

  return (
    <div className="cfg-stack">
      <div className="cfg-card">
        <div className="cfg-form-grid">{primaryKeys.map(renderField)}</div>

        {/* Service Live Connectivity Tests */}
        {categoryId === 'academic' && (
          <div className="cfg-service-tests">
            <div className="cfg-subsection-label">Connector Verification</div>
            <div className="cfg-service-test-row">
              <ServiceTestChip
                label="Test Semantic Scholar"
                serviceId="semantic_scholar"
                testing={testingService.semantic_scholar}
                result={serviceTestResults.semantic_scholar}
                onTest={() =>
                  onTestService('semantic_scholar', {
                    api_key:
                      typeof formValues.semantic_scholar_api_key === 'string' &&
                      !formValues.semantic_scholar_api_key.includes('...')
                        ? formValues.semantic_scholar_api_key
                        : undefined,
                  })
                }
              />
              <ServiceTestChip
                label="Test OpenAlex"
                serviceId="openalex"
                testing={testingService.openalex}
                result={serviceTestResults.openalex}
                onTest={() =>
                  onTestService('openalex', {
                    email: formValues.openalex_email || undefined,
                    api_key:
                      typeof formValues.openalex_api_key === 'string' &&
                      !formValues.openalex_api_key.includes('...')
                        ? formValues.openalex_api_key
                        : undefined,
                  })
                }
              />
            </div>
          </div>
        )}

        {categoryId === 'infrastructure' && (
          <div className="cfg-service-tests">
            <div className="cfg-subsection-label">Service Connectivity</div>
            <div className="cfg-service-test-row">
              <ServiceTestChip
                label="Ping Redis"
                serviceId="redis"
                testing={testingService.redis}
                result={serviceTestResults.redis}
                onTest={() =>
                  onTestService('redis', { target_url: formValues.redis_url || undefined })
                }
              />
              <ServiceTestChip
                label="Test Searqon"
                serviceId="searqon"
                testing={testingService.searqon}
                result={serviceTestResults.searqon}
                onTest={() =>
                  onTestService('searqon', { target_url: formValues.searqon_base_url || undefined })
                }
              />
            </div>
          </div>
        )}

        {/* Expandable Advanced Configuration */}
        {advancedKeys.length > 0 && (
          <div className="cfg-advanced-section">
            <button
              type="button"
              className="cfg-advanced-toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span>Advanced Configuration</span>
              <span className="cfg-advanced-count">{advancedKeys.length} parameters</span>
            </button>
            {advancedOpen && (
              <div className="cfg-advanced-body">
                <div className="cfg-form-grid">{advancedKeys.map(renderField)}</div>
              </div>
            )}
          </div>
        )}

        <div className="cfg-card-footer">
          <div className="cfg-footer-left">
            <span className="cfg-footer-note">Changes persist in SQLite and update runtime config immediately.</span>
          </div>
          <div className="cfg-footer-right">
            {isDirty && (
              <button type="button" className="cfg-btn secondary" onClick={onDiscard}>
                <RotateCcw size={14} />
                Discard
              </button>
            )}
            <button
              type="button"
              className="cfg-btn primary"
              onClick={onSave}
              disabled={saving || !isDirty}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceTestChip({ label, testing, result, onTest }) {
  return (
    <div className="cfg-service-chip-wrap">
      <button type="button" className="cfg-btn secondary sm" onClick={onTest} disabled={testing}>
        {testing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
        {label}
      </button>
      {result && (
        <span className={`cfg-inline-test ${result.success ? 'ok' : 'err'}`}>
          {result.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          <span>{result.success ? `${result.latency_ms}ms` : result.error}</span>
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SECURITY & CREDENTIALS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function SecurityPanel({
  providers,
  systemSettings,
  onJumpToProvider,
  onJumpToCategory,
  onRefresh,
  setBanner,
  setConfirmModal,
}) {
  const sensitiveSystem = systemSettings.filter((s) => s.sensitive);

  const handleRevokeProvider = (p) => {
    setConfirmModal({
      title: `Revoke ${p.provider_id.toUpperCase()} Credential`,
      message: `Remove the stored credential for ${p.provider_id} from SQLite?`,
      confirmLabel: 'Revoke Key',
      onConfirm: async () => {
        const res = await fetch(`${API_BASE}/providers/${p.provider_id}`, { method: 'DELETE' });
        if (res.ok) {
          await onRefresh();
          setBanner({ type: 'info', text: `Credential for ${p.provider_id} removed from SQLite.` });
          setTimeout(() => setBanner(null), 3000);
        }
      },
    });
  };

  return (
    <div className="cfg-stack">
      <div className="cfg-card">
        <div className="cfg-card-header-simple">
          <h3>AI Provider Credentials</h3>
          <p>All saved keys are masked at the API boundary. Full secrets are never transmitted back to the browser.</p>
        </div>

        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Masked Credential</th>
                <th>Source</th>
                <th>Status</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider_id}>
                  <td className="cfg-table-primary">{p.provider_id.toUpperCase()}</td>
                  <td>
                    <code className="cfg-mono">
                      {p.api_key_masked || (p.provider_id === 'ollama' ? 'Not required (Local)' : '—')}
                    </code>
                  </td>
                  <td>
                    <span className="cfg-source-tag">{p.key_source || 'none'}</span>
                  </td>
                  <td>
                    {p.has_key ? (
                      <span className="cfg-state-pill saved">Active</span>
                    ) : (
                      <span className="cfg-state-pill warn">Missing</span>
                    )}
                  </td>
                  <td className="align-right">
                    <div className="cfg-table-actions">
                      <button
                        type="button"
                        className="cfg-btn secondary xs"
                        onClick={() => onJumpToProvider(p.provider_id)}
                      >
                        Rotate / Edit
                      </button>
                      {p.stored_in_db && (
                        <button
                          type="button"
                          className="cfg-btn ghost-danger xs"
                          onClick={() => handleRevokeProvider(p)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cfg-card">
        <div className="cfg-card-header-simple">
          <h3>Academic & External API Keys</h3>
          <p>Sensitive system-level keys used by literature connectors.</p>
        </div>
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Masked Value</th>
                <th>Source</th>
                <th className="align-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sensitiveSystem.map((s) => (
                <tr key={s.key}>
                  <td className="cfg-table-primary">{s.label}</td>
                  <td>
                    <code className="cfg-mono">{s.value || '—'}</code>
                  </td>
                  <td>
                    <span className="cfg-source-tag">{s.source || 'default'}</span>
                  </td>
                  <td className="align-right">
                    <button
                      type="button"
                      className="cfg-btn secondary xs"
                      onClick={() => onJumpToCategory(s.category)}
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DIAGNOSTICS & HEALTH PANEL
// ─────────────────────────────────────────────────────────────────────────────

function DiagnosticsPanel({
  healthStatus,
  providers,
  providerTestResults,
  setProviderTestResults,
  serviceTestResults,
  onTestService,
  testingService,
  formValues,
  validationErrors,
  onRefresh,
}) {
  const [runningAll, setRunningAll] = useState(false);

  const runAllDiagnostics = async () => {
    setRunningAll(true);
    try {
      await onRefresh();
      const configuredProviders = providers.filter((p) => p.has_key);
      await Promise.all([
        ...configuredProviders.map(async (p) => {
          try {
            const res = await fetch(`${API_BASE}/test-connection`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider_id: p.provider_id, model: p.model }),
            });
            const data = await res.json();
            setProviderTestResults((prev) => ({ ...prev, [p.provider_id]: data }));
          } catch (err) {
            setProviderTestResults((prev) => ({
              ...prev,
              [p.provider_id]: { success: false, error: err.message },
            }));
          }
        }),
        onTestService('redis', { target_url: formValues.redis_url || undefined }),
        onTestService('searqon', { target_url: formValues.searqon_base_url || undefined }),
        onTestService('semantic_scholar'),
        onTestService('openalex', { email: formValues.openalex_email || undefined }),
      ]);
    } finally {
      setRunningAll(false);
    }
  };

  const defaultProv = formValues.default_llm_provider || 'ollama';
  const defaultProvRecord = providers.find((p) => p.provider_id === defaultProv);
  const configWarnings = [];
  if (defaultProvRecord && !defaultProvRecord.has_key) {
    configWarnings.push(`Global default provider "${defaultProv}" has no API key or endpoint configured.`);
  }
  Object.entries(validationErrors).forEach(([k, msg]) => {
    configWarnings.push(`${k}: ${msg}`);
  });

  return (
    <div className="cfg-stack">
      {/* System Health Summary */}
      <div className="cfg-card">
        <div className="cfg-diag-header">
          <div>
            <h3>Backend API & SQLite Health</h3>
            <p>
              {healthStatus?.ok
                ? `Healthy • API v${healthStatus.version || '2.0'}`
                : healthStatus?.error || 'Checking...'}
            </p>
          </div>
          <button
            type="button"
            className="cfg-btn primary"
            onClick={runAllDiagnostics}
            disabled={runningAll}
          >
            {runningAll ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Run All Diagnostics
          </button>
        </div>

        {/* Config Validation */}
        <div className="cfg-validation-box">
          <div className="cfg-subsection-label">Configuration Validation</div>
          {configWarnings.length === 0 ? (
            <div className="cfg-inline-test ok">
              <CheckCircle2 size={14} />
              <span>All active runtime parameters are valid.</span>
            </div>
          ) : (
            <div className="cfg-warning-list">
              {configWarnings.map((w, idx) => (
                <div key={idx} className="cfg-inline-test err">
                  <AlertTriangle size={14} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Infrastructure & Academic Service Checks */}
      <div className="cfg-card">
        <div className="cfg-card-header-simple">
          <h3>External & Infrastructure Services</h3>
        </div>
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Details</th>
                <th className="align-right">Check</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: 'redis', name: 'Redis Paper Cache' },
                { id: 'searqon', name: 'Searqon Web Search' },
                { id: 'semantic_scholar', name: 'Semantic Scholar API' },
                { id: 'openalex', name: 'OpenAlex API' },
              ].map((svc) => {
                const res = serviceTestResults[svc.id];
                const busy = testingService[svc.id];
                return (
                  <tr key={svc.id}>
                    <td className="cfg-table-primary">{svc.name}</td>
                    <td>
                      {res ? (
                        res.success ? (
                          <span className="cfg-state-pill saved">Connected</span>
                        ) : (
                          <span className="cfg-state-pill err">Failed</span>
                        )
                      ) : (
                        <span className="cfg-state-pill neutral">Not tested</span>
                      )}
                    </td>
                    <td className="cfg-mono">{res?.latency_ms ? `${res.latency_ms} ms` : '—'}</td>
                    <td className="cfg-diag-msg">{res?.message || res?.error || '—'}</td>
                    <td className="align-right">
                      <button
                        type="button"
                        className="cfg-btn secondary xs"
                        onClick={() => onTestService(svc.id)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configured AI Provider Checks */}
      <div className="cfg-card">
        <div className="cfg-card-header-simple">
          <h3>Configured AI Providers</h3>
        </div>
        <div className="cfg-table-wrap">
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Result</th>
                <th>Latency</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {providers
                .filter((p) => p.has_key)
                .map((p) => {
                  const res = providerTestResults[p.provider_id];
                  return (
                    <tr key={p.provider_id}>
                      <td className="cfg-table-primary">{p.provider_id.toUpperCase()}</td>
                      <td className="cfg-mono">{p.model || '—'}</td>
                      <td>
                        {res ? (
                          res.success ? (
                            <span className="cfg-state-pill saved">Connected</span>
                          ) : (
                            <span className="cfg-state-pill err">Failed</span>
                          )
                        ) : (
                          <span className="cfg-state-pill neutral">Not tested</span>
                        )}
                      </td>
                      <td className="cfg-mono">{res?.latency_ms ? `${res.latency_ms} ms` : '—'}</td>
                      <td className="cfg-diag-msg">{res?.message || res?.error || '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
