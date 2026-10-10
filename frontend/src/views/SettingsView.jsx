import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  BookOpen,
  Layers,
  Server,
  Brain,
  Key,
  Globe,
  Database,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import ModelConfigModal from '../components/modals/ModelConfigModal';

const API_BASE = '/api/v1/settings';

const TABS = [
  {
    id: 'models',
    label: 'AI Models & Providers',
    icon: Cpu,
    description: 'LLM inference providers, API credentials, and active models',
    badge: 'Core',
  },
  {
    id: 'academic',
    label: 'Academic & Search APIs',
    icon: BookOpen,
    description: 'Literature graph APIs: Semantic Scholar, OpenAlex, arXiv, CrossRef',
    badge: 'Literature',
  },
  {
    id: 'rag',
    label: 'Embeddings & Vector RAG',
    icon: Layers,
    description: 'Dense vector embeddings, chunk sizes, and hybrid retrieval params',
    badge: 'Vector DB',
  },
  {
    id: 'infrastructure',
    label: 'Cache & Infrastructure',
    icon: Server,
    description: 'Redis active paper cache, Searqon web research, and network timeouts',
    badge: 'System',
  },
  {
    id: 'reasoning',
    label: 'Reasoning & Agent Limits',
    icon: Brain,
    description: 'Default LLM provider, multi-agent loop depth, and candidate rank limits',
    badge: 'Engine',
  },
];

export default function SettingsView() {
  let isDark = false;
  try {
    const appCtx = useApp();
    if (appCtx?.theme === 'dark') isDark = true;
  } catch (e) {
    if (typeof document !== 'undefined') {
      isDark = document.body.classList.contains('dark-theme');
    }
  }

  const [activeTab, setActiveTab] = useState('models');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemData, setSystemData] = useState({ categories: [], settings: [] });
  const [formValues, setFormValues] = useState({});
  const [revealKeys, setRevealKeys] = useState({});
  const [saveBanner, setSaveBanner] = useState(null);
  const [testingService, setTestingService] = useState({});
  const [testResults, setTestResults] = useState({});

  const t = {
    canvasBg: isDark ? '#09090b' : '#f8fafc',
    headerBg: isDark ? '#141417' : '#ffffff',
    headerBorder: isDark ? '#27272a' : '#e2e8f0',
    cardBg: isDark ? '#141417' : '#ffffff',
    cardBorder: isDark ? '#27272a' : '#e2e8f0',
    cardSubtleBg: isDark ? '#18181c' : '#f8fafc',
    inputBg: isDark ? '#1c1c22' : '#ffffff',
    inputBorder: isDark ? '#3f3f46' : '#cbd5e1',
    inputText: isDark ? '#fafafa' : '#0f172a',
    textPrimary: isDark ? '#fafafa' : '#0f172a',
    textSecondary: isDark ? '#d4d4d8' : '#334155',
    textMuted: isDark ? '#a1a1aa' : '#64748b',
    tabInactiveBg: isDark ? '#18181c' : '#f1f5f9',
    tabInactiveText: isDark ? '#a1a1aa' : '#475569',
    tabActiveBg: isDark ? 'rgba(99, 102, 241, 0.18)' : '#eef2ff',
    tabActiveBorder: isDark ? 'rgba(99, 102, 241, 0.5)' : '#c7d2fe',
    tabActiveText: isDark ? '#a5b4fc' : '#4338ca',
    btnSecondaryBg: isDark ? '#1c1c22' : '#ffffff',
    btnSecondaryBorder: isDark ? '#3f3f46' : '#cbd5e1',
    btnSecondaryText: isDark ? '#e4e4e7' : '#475569',
  };

  const fetchSystemSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/system`);
      if (res.ok) {
        const data = await res.json();
        setSystemData(data);
        const initialForm = {};
        (data.settings || []).forEach((item) => {
          initialForm[item.key] = item.value ?? '';
        });
        setFormValues(initialForm);
      }
    } catch (err) {
      console.error('Failed loading system settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemSettings();
  }, [fetchSystemSettings]);

  const handleInputChange = (key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    if (testResults[key]) {
      setTestResults((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleSaveTab = async (category) => {
    setSaving(true);
    setSaveBanner(null);
    try {
      const categorySettings = (systemData.settings || []).filter((s) => s.category === category);
      const payload = {};
      categorySettings.forEach((s) => {
        const currentVal = formValues[s.key];
        if (s.sensitive && typeof currentVal === 'string' && currentVal.includes('...')) {
          return;
        }
        payload[s.key] = currentVal;
      });

      const res = await fetch(`${API_BASE}/system`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });
      const data = await res.json();

      if (data.ok) {
        setSaveBanner({
          type: 'success',
          text: `Settings for ${category.toUpperCase()} saved persistently to SQLite & applied to live engine!`,
        });
        if (data.data) {
          setSystemData(data.data);
          const updatedForm = { ...formValues };
          (data.data.settings || []).forEach((item) => {
            if (item.category === category) {
              updatedForm[item.key] = item.value ?? '';
            }
          });
          setFormValues(updatedForm);
        }
        setTimeout(() => setSaveBanner(null), 4000);
      } else {
        setSaveBanner({
          type: 'error',
          text: data.error || 'Failed to save settings to SQLite',
        });
      }
    } catch (err) {
      setSaveBanner({
        type: 'error',
        text: `Network error saving settings: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestService = async (serviceId, payload = {}) => {
    setTestingService((prev) => ({ ...prev, [serviceId]: true }));
    setTestResults((prev) => {
      const copy = { ...prev };
      delete copy[serviceId];
      return copy;
    });

    try {
      const res = await fetch(`${API_BASE}/test-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, ...payload }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [serviceId]: data }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [serviceId]: { success: false, error: err.message || 'Failed to test service' },
      }));
    } finally {
      setTestingService((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const getSettingsForCategory = (cat) => {
    return (systemData.settings || []).filter((s) => s.category === cat);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: t.canvasBg,
        color: t.textPrimary,
        overflow: 'hidden',
        fontFamily: 'var(--font-main, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      }}
    >
      {/* ── Page Header ── */}
      <div
        style={{
          padding: '20px 28px 16px',
          backgroundColor: t.headerBg,
          borderBottom: `1px solid ${t.headerBorder}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
                border: isDark ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
              }}
            >
              <Sliders size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: t.textPrimary }}>
                  Platform Settings & Configuration
                </h1>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5',
                    color: isDark ? '#34d399' : '#059669',
                    border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #a7f3d0',
                  }}
                >
                  <Database size={11} />
                  SQLite Persistent
                </span>
              </div>
              <p style={{ fontSize: 12.5, margin: '2px 0 0', color: t.textMuted }}>
                All environment variables (.env) and runtime preferences persist locally in SQLite with instant engine reload
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={fetchSystemSettings}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 13px',
                borderRadius: 7,
                border: `1px solid ${t.btnSecondaryBorder}`,
                backgroundColor: t.btnSecondaryBg,
                color: t.btnSecondaryText,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              title="Refresh database state"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Reload DB
            </button>
          </div>
        </div>

        {/* ── Category Tabs ── */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  border: isActive ? `1px solid ${t.tabActiveBorder}` : '1px solid transparent',
                  backgroundColor: isActive ? t.tabActiveBg : t.tabInactiveBg,
                  color: isActive ? t.tabActiveText : t.tabInactiveText,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={15} style={{ color: isActive ? (isDark ? '#a5b4fc' : '#4f46e5') : t.textMuted }} />
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                    backgroundColor: isActive ? (isDark ? 'rgba(99, 102, 241, 0.3)' : '#e0e7ff') : (isDark ? '#27272a' : '#e2e8f0'),
                    color: isActive ? (isDark ? '#c7d2fe' : '#3730a3') : t.textMuted,
                  }}
                >
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Save Banner Notification ── */}
      {saveBanner && (
        <div
          style={{
            padding: '10px 24px',
            backgroundColor: saveBanner.type === 'success' ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5') : (isDark ? 'rgba(239, 68, 68, 0.18)' : '#fef2f2'),
            borderBottom: `1px solid ${saveBanner.type === 'success' ? (isDark ? 'rgba(34, 197, 94, 0.35)' : '#a7f3d0') : (isDark ? 'rgba(239, 68, 68, 0.35)' : '#fecaca')}`,
            color: saveBanner.type === 'success' ? (isDark ? '#34d399' : '#065f46') : (isDark ? '#f87171' : '#991b1b'),
            fontSize: 12.5,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {saveBanner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{saveBanner.text}</span>
        </div>
      )}

      {/* ── Tab Content Container ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
        {/* ── TAB 1: AI Models & Providers (Reusing ModelConfigModal inline) ── */}
        {activeTab === 'models' && (
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            <ModelConfigModal inline={true} />
          </div>
        )}

        {/* ── TAB 2: Academic & Search APIs ── */}
        {activeTab === 'academic' && (
          <AcademicTabContent
            settings={getSettingsForCategory('academic')}
            formValues={formValues}
            revealKeys={revealKeys}
            setRevealKeys={setRevealKeys}
            onChange={handleInputChange}
            onSave={() => handleSaveTab('academic')}
            saving={saving}
            onTest={handleTestService}
            testingService={testingService}
            testResults={testResults}
            t={t}
            isDark={isDark}
          />
        )}

        {/* ── TAB 3: Embeddings & Vector RAG ── */}
        {activeTab === 'rag' && (
          <RagTabContent
            settings={getSettingsForCategory('rag')}
            formValues={formValues}
            onChange={handleInputChange}
            onSave={() => handleSaveTab('rag')}
            saving={saving}
            t={t}
            isDark={isDark}
          />
        )}

        {/* ── TAB 4: Cache & Infrastructure ── */}
        {activeTab === 'infrastructure' && (
          <InfrastructureTabContent
            settings={getSettingsForCategory('infrastructure')}
            formValues={formValues}
            onChange={handleInputChange}
            onSave={() => handleSaveTab('infrastructure')}
            saving={saving}
            onTest={handleTestService}
            testingService={testingService}
            testResults={testResults}
            t={t}
            isDark={isDark}
          />
        )}

        {/* ── TAB 5: Reasoning & Agent Limits ── */}
        {activeTab === 'reasoning' && (
          <ReasoningTabContent
            settings={getSettingsForCategory('reasoning')}
            formValues={formValues}
            onChange={handleInputChange}
            onSave={() => handleSaveTab('reasoning')}
            saving={saving}
            t={t}
            isDark={isDark}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function AcademicTabContent({
  settings,
  formValues,
  revealKeys,
  setRevealKeys,
  onChange,
  onSave,
  saving,
  onTest,
  testingService,
  testResults,
  t,
  isDark,
}) {
  const inputStyleCurrent = makeInputStyle(t);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Intro Card */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
              border: isDark ? '1px solid rgba(37, 99, 235, 0.4)' : '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
            }}
          >
            <BookOpen size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: t.textPrimary }}>
              Academic Sources & Literature APIs
            </h2>
            <p style={{ fontSize: 12.5, margin: '2px 0 0', color: t.textMuted }}>
              Credentials and endpoints for fetching papers, citation networks, metadata, and abstracts
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 18px',
            borderRadius: 8,
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Academic Settings
        </button>
      </div>

      {/* Grid of Sources */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Semantic Scholar Card */}
        <div
          style={{
            backgroundColor: t.cardBg,
            borderRadius: 12,
            border: `1px solid ${t.cardBorder}`,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: isDark ? 'rgba(22, 163, 74, 0.2)' : '#f0fdf4',
                  color: isDark ? '#4ade80' : '#16a34a',
                  border: isDark ? '1px solid rgba(22, 163, 74, 0.4)' : '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                S2
              </span>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: t.textPrimary }}>
                  Semantic Scholar API
                </h3>
                <span style={{ fontSize: 11, color: t.textMuted }}>Literature graph & citation lookup</span>
              </div>
            </div>
            <a
              href="https://www.semanticscholar.org/product/api"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11.5,
                color: '#3b82f6',
                textDecoration: 'none',
              }}
            >
              Get Key <ExternalLink size={12} />
            </a>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Semantic Scholar API Key (SEMANTIC_SCHOLAR_API_KEY)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={revealKeys.semantic_scholar_api_key ? 'text' : 'password'}
                value={formValues.semantic_scholar_api_key ?? ''}
                placeholder="s2k-..."
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                onChange={(e) => onChange('semantic_scholar_api_key', e.target.value)}
                style={inputStyleCurrent}
              />
              <button
                type="button"
                onClick={() =>
                  setRevealKeys((prev) => ({
                    ...prev,
                    semantic_scholar_api_key: !prev.semantic_scholar_api_key,
                  }))
                }
                style={revealIconStyle}
                title="Toggle key visibility"
              >
                {revealKeys.semantic_scholar_api_key ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Enables higher rate limits (100 req/min) for deep citation expansion and batch paper retrieval
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 8, minHeight: 34 }}>
            <button
              type="button"
              onClick={() =>
                onTest('semantic_scholar', { api_key: formValues.semantic_scholar_api_key || undefined })
              }
              disabled={testingService.semantic_scholar}
              style={makeTestButtonStyle(t)}
            >
              {testingService.semantic_scholar ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Zap size={13} />
              )}
              Test Semantic Scholar
            </button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', flex: 1, minWidth: 0 }}>
              <ServiceStatusBadge result={testResults.semantic_scholar} isDark={isDark} />
            </div>
          </div>
        </div>

        {/* OpenAlex Card */}
        <div
          style={{
            backgroundColor: t.cardBg,
            borderRadius: 12,
            border: `1px solid ${t.cardBorder}`,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#fef3c7',
                  color: isDark ? '#fbbf24' : '#d97706',
                  border: isDark ? '1px solid rgba(217, 119, 6, 0.4)' : '1px solid #fde68a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                OA
              </span>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: t.textPrimary }}>
                  OpenAlex (Polite Pool)
                </h3>
                <span style={{ fontSize: 11, color: t.textMuted }}>Global bibliometric index & author disambiguation</span>
              </div>
            </div>
            <a
              href="https://openalex.org"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11.5,
                color: '#3b82f6',
                textDecoration: 'none',
              }}
            >
              Docs <ExternalLink size={12} />
            </a>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              OpenAlex Polite Pool Email (OPENALEX_EMAIL)
            </label>
            <input
              type="email"
              value={formValues.openalex_email ?? ''}
              placeholder="researcher@example.com"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-form-type="other"
              onChange={(e) => onChange('openalex_email', e.target.value)}
              style={inputStyleCurrent}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Enters OpenAlex polite pool for 10x faster concurrent queries and priority queueing
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              OpenAlex Premium API Key (Optional) (OPENALEX_API_KEY)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={revealKeys.openalex_api_key ? 'text' : 'password'}
                value={formValues.openalex_api_key ?? ''}
                placeholder="b4z..."
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                onChange={(e) => onChange('openalex_api_key', e.target.value)}
                style={inputStyleCurrent}
              />
              <button
                type="button"
                onClick={() =>
                  setRevealKeys((prev) => ({
                    ...prev,
                    openalex_api_key: !prev.openalex_api_key,
                  }))
                }
                style={revealIconStyle}
                title="Toggle key visibility"
              >
                {revealKeys.openalex_api_key ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 8, minHeight: 34 }}>
            <button
              type="button"
              onClick={() =>
                onTest('openalex', {
                  email: formValues.openalex_email || undefined,
                  api_key: formValues.openalex_api_key || undefined,
                })
              }
              disabled={testingService.openalex}
              style={makeTestButtonStyle(t)}
            >
              {testingService.openalex ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Test OpenAlex
            </button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', flex: 1, minWidth: 0 }}>
              <ServiceStatusBadge result={testResults.openalex} isDark={isDark} />
            </div>
          </div>
        </div>
      </div>

      {/* Endpoints Table */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '20px',
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: t.textPrimary }}>
          Literature Pre-print & DOI Repository Endpoints
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              arXiv Query API Endpoint URL
            </label>
            <input
              type="text"
              value={formValues.arxiv_base_url ?? ''}
              placeholder="https://export.arxiv.org/api/query"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange('arxiv_base_url', e.target.value)}
              style={inputStyleCurrent}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
                CrossRef Metadata API URL
              </label>
              <input
                type="text"
                value={formValues.crossref_base_url ?? ''}
                placeholder="https://api.crossref.org"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onChange('crossref_base_url', e.target.value)}
                style={inputStyleCurrent}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
                Europe PMC Biomedical Search API URL
              </label>
              <input
                type="text"
                value={formValues.europepmc_base_url ?? ''}
                placeholder="https://www.ebi.ac.uk/europepmc/webservices/rest"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onChange('europepmc_base_url', e.target.value)}
                style={inputStyleCurrent}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RagTabContent({ settings, formValues, onChange, onSave, saving, t, isDark }) {
  const inputStyleCurrent = makeInputStyle(t);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#f5f3ff',
              border: isDark ? '1px solid rgba(124, 58, 237, 0.4)' : '1px solid #ddd6fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8b5cf6',
            }}
          >
            <Layers size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: t.textPrimary }}>
              Vector Embeddings & RAG Chunking Parameters
            </h2>
            <p style={{ fontSize: 12.5, margin: '2px 0 0', color: t.textMuted }}>
              Dense embedding checkpoints, vector dimensionality, chunk sliding windows, and top-K semantic search
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 18px',
            borderRadius: 8,
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save RAG Settings
        </button>
      </div>

      {/* Embedding Backend */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: t.textPrimary }}>
          Dense Vector Embedding Provider
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Embedding Provider (EMBEDDING_PROVIDER)
            </label>
            <select
              value={formValues.embedding_provider ?? 'ollama'}
              onChange={(e) => onChange('embedding_provider', e.target.value)}
              style={makeSelectStyle(t)}
            >
              <option value="ollama">Ollama (Local / Offline)</option>
              <option value="gemini">Google Gemini Embedding</option>
              <option value="openai">OpenAI (text-embedding-3)</option>
              <option value="huggingface">HuggingFace Inference</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Model Checkpoint (EMBEDDING_MODEL)
            </label>
            <input
              type="text"
              value={formValues.embedding_model ?? ''}
              placeholder="nomic-embed-text"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange('embedding_model', e.target.value)}
              style={inputStyleCurrent}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Vector Dimension (EMBEDDING_DIM)
            </label>
            <input
              type="number"
              value={formValues.embedding_dim ?? 768}
              placeholder="768"
              autoComplete="off"
              onChange={(e) => onChange('embedding_dim', parseInt(e.target.value, 10) || 768)}
              style={inputStyleCurrent}
            />
          </div>
        </div>
      </div>

      {/* RAG Chunking & Retrieval */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: t.textPrimary }}>
          Document Parsing & Semantic Retrieval Configuration
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
          {/* Chunk Size */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary }}>
                Chunk Size (RAG_CHUNK_SIZE)
              </label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
                {formValues.rag_chunk_size ?? 800} chars
              </span>
            </div>
            <input
              type="range"
              min="200"
              max="2000"
              step="50"
              value={formValues.rag_chunk_size ?? 800}
              onChange={(e) => onChange('rag_chunk_size', parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Target length of paragraph chunks extracted from research papers
            </p>
          </div>

          {/* Chunk Overlap */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary }}>
                Chunk Overlap (RAG_CHUNK_OVERLAP)
              </label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
                {formValues.rag_chunk_overlap ?? 150} chars
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="500"
              step="25"
              value={formValues.rag_chunk_overlap ?? 150}
              onChange={(e) => onChange('rag_chunk_overlap', parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Sliding context preservation across adjacent paragraph boundaries
            </p>
          </div>

          {/* Top-K */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary }}>
                Retrieved Passages (RAG_TOP_K)
              </label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
                Top {formValues.rag_top_k ?? 5}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={formValues.rag_top_k ?? 5}
              onChange={(e) => onChange('rag_top_k', parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Passages retrieved into LLM reasoning context per question or hypothesis
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfrastructureTabContent({
  settings,
  formValues,
  onChange,
  onSave,
  saving,
  onTest,
  testingService,
  testResults,
  t,
  isDark,
}) {
  const inputStyleCurrent = makeInputStyle(t);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ecfdf5',
              border: isDark ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #a7f3d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <Server size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: t.textPrimary }}>
              Cache & Infrastructure Services
            </h2>
            <p style={{ fontSize: 12.5, margin: '2px 0 0', color: t.textMuted }}>
              Redis high-speed in-memory paper graph cache and Searqon autonomous web crawler configuration
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 18px',
            borderRadius: 8,
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Infrastructure Settings
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Redis Cache Card */}
        <div
          style={{
            backgroundColor: t.cardBg,
            borderRadius: 12,
            border: `1px solid ${t.cardBorder}`,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
                  color: isDark ? '#f87171' : '#dc2626',
                  border: isDark ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                RD
              </span>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: t.textPrimary }}>
                  Redis Active Cache
                </h3>
                <span style={{ fontSize: 11, color: t.textMuted }}>Sub-millisecond paper graph retrieval</span>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: t.textSecondary }}>
              <input
                type="checkbox"
                checked={Boolean(formValues.redis_enabled)}
                onChange={(e) => onChange('redis_enabled', e.target.checked)}
                style={{ accentColor: '#2563eb', cursor: 'pointer', width: 16, height: 16 }}
              />
              <span>Enabled</span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Redis Connection URL (REDIS_URL)
            </label>
            <input
              type="text"
              value={formValues.redis_url ?? 'redis://localhost:6379'}
              placeholder="redis://localhost:6379"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange('redis_url', e.target.value)}
              style={inputStyleCurrent}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Active Paper TTL (REDIS_ACTIVE_PAPER_TTL)
            </label>
            <input
              type="number"
              value={formValues.redis_active_paper_ttl ?? 3600}
              placeholder="3600"
              autoComplete="off"
              onChange={(e) => onChange('redis_active_paper_ttl', parseInt(e.target.value, 10) || 3600)}
              style={inputStyleCurrent}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '4px 0 0' }}>
              Seconds to retain full parsed paper AST before automatic eviction (3600s = 1 hr)
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 6, minHeight: 34 }}>
            <button
              type="button"
              onClick={() => onTest('redis', { target_url: formValues.redis_url || undefined })}
              disabled={testingService.redis}
              style={makeTestButtonStyle(t)}
            >
              {testingService.redis ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Test Redis Ping
            </button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', flex: 1, minWidth: 0 }}>
              <ServiceStatusBadge result={testResults.redis} isDark={isDark} />
            </div>
          </div>
        </div>

        {/* Searqon Web Research Card */}
        <div
          style={{
            backgroundColor: t.cardBg,
            borderRadius: 12,
            border: `1px solid ${t.cardBorder}`,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff',
                  color: isDark ? '#a5b4fc' : '#4338ca',
                  border: isDark ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid #c7d2fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                SQ
              </span>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: t.textPrimary }}>
                  Searqon Web Crawler
                </h3>
                <span style={{ fontSize: 11, color: t.textMuted }}>Live code repos & SOTA benchmark search</span>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: t.textSecondary }}>
              <input
                type="checkbox"
                checked={Boolean(formValues.web_search_enabled)}
                onChange={(e) => onChange('web_search_enabled', e.target.checked)}
                style={{ accentColor: '#2563eb', cursor: 'pointer', width: 16, height: 16 }}
              />
              <span>Enabled</span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Searqon Base URL (SEARQON_BASE_URL)
            </label>
            <input
              type="text"
              value={formValues.searqon_base_url ?? 'http://localhost:7493'}
              placeholder="http://localhost:7493"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange('searqon_base_url', e.target.value)}
              style={inputStyleCurrent}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
                Timeout (Seconds)
              </label>
              <input
                type="number"
                step="0.5"
                value={formValues.searqon_timeout ?? 10.0}
                placeholder="10.0"
                autoComplete="off"
                onChange={(e) => onChange('searqon_timeout', parseFloat(e.target.value) || 10.0)}
                style={inputStyleCurrent}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
                Top Search Results
              </label>
              <input
                type="number"
                value={formValues.web_search_top_k ?? 5}
                placeholder="5"
                autoComplete="off"
                onChange={(e) => onChange('web_search_top_k', parseInt(e.target.value, 10) || 5)}
                style={inputStyleCurrent}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 6, minHeight: 34 }}>
            <button
              type="button"
              onClick={() => onTest('searqon', { target_url: formValues.searqon_base_url || undefined })}
              disabled={testingService.searqon}
              style={makeTestButtonStyle(t)}
            >
              {testingService.searqon ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Test Searqon Health
            </button>
            <div style={{ display: 'flex', justifyContent: 'flex-end', flex: 1, minWidth: 0 }}>
              <ServiceStatusBadge result={testResults.searqon} isDark={isDark} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReasoningTabContent({ settings, formValues, onChange, onSave, saving, t, isDark }) {
  const inputStyleCurrent = makeInputStyle(t);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2',
              border: isDark ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
            }}
          >
            <Brain size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: t.textPrimary }}>
              Autonomous Reasoning & Multi-Agent Execution Limits
            </h2>
            <p style={{ fontSize: 12.5, margin: '2px 0 0', color: t.textMuted }}>
              Safety thresholds, default reasoning provider, and candidate ranking limits
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 18px',
            borderRadius: 8,
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Reasoning Settings
        </button>
      </div>

      <div
        style={{
          backgroundColor: t.cardBg,
          borderRadius: 12,
          border: `1px solid ${t.cardBorder}`,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Default LLM Provider (DEFAULT_LLM_PROVIDER)
            </label>
            <select
              value={formValues.default_llm_provider ?? 'ollama'}
              onChange={(e) => onChange('default_llm_provider', e.target.value)}
              style={makeSelectStyle(t)}
            >
              <option value="ollama">Ollama (Local Offline)</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq LPU</option>
              <option value="openrouter">OpenRouter</option>
              <option value="nvidia">NVIDIA NIM</option>
              <option value="deepseek">DeepSeek AI</option>
              <option value="openai">OpenAI</option>
            </select>
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Engine used by default when none is explicitly requested in chat or synthesis tools
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Max Multi-Agent Loop Iterations (MAX_LOOP_ITERATIONS)
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={formValues.max_loop_iterations ?? 10}
              placeholder="10"
              autoComplete="off"
              onChange={(e) => onChange('max_loop_iterations', parseInt(e.target.value, 10) || 10)}
              style={inputStyleCurrent}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Safety ceiling preventing unbounded recursive reasoning during deep research passes
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: 6 }}>
              Default Paper Ranking Limit (DEFAULT_RANK_LIMIT)
            </label>
            <input
              type="number"
              min="5"
              max="100"
              value={formValues.default_rank_limit ?? 25}
              placeholder="25"
              autoComplete="off"
              onChange={(e) => onChange('default_rank_limit', parseInt(e.target.value, 10) || 25)}
              style={inputStyleCurrent}
            />
            <p style={{ fontSize: 11.5, color: t.textMuted, margin: '6px 0 0' }}>
              Number of papers scored by the cross-encoder reranker during literature survey
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE SUBCOMPONENTS & STYLES
// ─────────────────────────────────────────────────────────────────────────────

function ServiceStatusBadge({ result, isDark }) {
  if (!result) return null;
  if (result.success) {
    const rawMsg = result.message || 'Connected';
    const displayMsg = rawMsg.includes('ms') ? rawMsg : `${rawMsg} (${result.latency_ms} ms)`;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11.5,
          color: isDark ? '#34d399' : '#059669',
          fontWeight: 600,
          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5',
          padding: '4px 9px',
          borderRadius: 6,
          border: isDark ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #a7f3d0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          flexShrink: 1,
        }}
        title={result.message}
      >
        <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayMsg}
        </span>
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        color: isDark ? '#f87171' : '#dc2626',
        fontWeight: 600,
        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#fef2f2',
        padding: '4px 9px',
        borderRadius: 6,
        border: isDark ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid #fecaca',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        flexShrink: 1,
      }}
      title={result.error}
    >
      <XCircle size={13} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {result.error?.substring(0, 45) || 'Failed'}
      </span>
    </span>
  );
}

function makeInputStyle(t) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${t.inputBorder}`,
    backgroundColor: t.inputBg,
    color: t.inputText,
    fontSize: '12.5px',
    fontFamily: 'monospace, var(--font-code, monospace)',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  };
}

function makeSelectStyle(t) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${t.inputBorder}`,
    backgroundColor: t.inputBg,
    color: t.inputText,
    fontSize: '12.5px',
    outline: 'none',
    cursor: 'pointer',
  };
}

const revealIconStyle = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#94a3b8',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function makeTestButtonStyle(t) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
    height: '32px',
    borderRadius: '6px',
    border: `1px solid ${t.btnSecondaryBorder}`,
    backgroundColor: t.btnSecondaryBg,
    color: t.btnSecondaryText,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  };
}
