import React, { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Key,
  Server,
  Globe,
  Cpu,
  ShieldCheck,
} from 'lucide-react';

const API = 'http://localhost:8000/api/v1/settings';

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    short: 'OA',
    tagline: 'GPT-4o, GPT-4o-mini, o1, o3-mini',
    color: '#10a37f',
    bg: 'rgba(16,163,127,0.08)',
    border: 'rgba(16,163,127,0.22)',
    keyPlaceholder: 'sk-proj-...',
    modelPlaceholder: 'gpt-4o',
    suggestions: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini', 'o3-mini'],
    docUrl: 'https://platform.openai.com/api-keys',
    docLabel: 'platform.openai.com',
    isLocal: false,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'G',
    tagline: 'Gemini 2.0 Flash, Flash-Lite, 1.5 Pro',
    color: '#4285f4',
    bg: 'rgba(66,133,244,0.08)',
    border: 'rgba(66,133,244,0.22)',
    keyPlaceholder: 'AIza...',
    modelPlaceholder: 'gemini-2.0-flash',
    suggestions: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    docUrl: 'https://aistudio.google.com/apikey',
    docLabel: 'aistudio.google.com',
    isLocal: false,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    short: 'NV',
    tagline: 'Llama 3.3 70B, Mixtral, DeepSeek-R1',
    color: '#76b900',
    bg: 'rgba(118,185,0,0.08)',
    border: 'rgba(118,185,0,0.22)',
    keyPlaceholder: 'nvapi-...',
    modelPlaceholder: 'meta/llama-3.3-70b-instruct',
    suggestions: ['meta/llama-3.3-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1', 'deepseek-ai/deepseek-r1'],
    docUrl: 'https://build.nvidia.com/explore/discover',
    docLabel: 'build.nvidia.com',
    isLocal: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    short: 'GQ',
    tagline: 'Ultra-low latency LPU inference',
    color: '#f55036',
    bg: 'rgba(245,80,54,0.08)',
    border: 'rgba(245,80,54,0.22)',
    keyPlaceholder: 'gsk_...',
    modelPlaceholder: 'llama-3.3-70b-versatile',
    suggestions: ['llama-3.3-70b-versatile', 'llama3-8b-8192', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b'],
    docUrl: 'https://console.groq.com/keys',
    docLabel: 'console.groq.com',
    isLocal: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    short: 'OL',
    tagline: 'Local offline models with zero telemetry',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.08)',
    border: 'rgba(99,102,241,0.22)',
    keyPlaceholder: null,
    urlPlaceholder: 'http://localhost:11434',
    modelPlaceholder: 'llama3.3',
    suggestions: ['llama3.3', 'mistral', 'phi3', 'gemma2', 'deepseek-r1', 'codellama'],
    docUrl: 'https://ollama.com',
    docLabel: 'ollama.com',
    isLocal: true,
  },
];

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm, 6px)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 12.5,
  fontFamily: 'var(--font-code)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
};

function ProviderRow({ provider, saved, onSave, onDelete }) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(saved?.model || '');
  const [url, setUrl] = useState(saved?.base_url || '');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setModel(saved?.model || '');
    setUrl(saved?.base_url || '');
  }, [saved]);

  const isActive = !!saved?.has_key;
  const canSave = provider.isLocal ? Boolean(url.trim() || model.trim()) : Boolean(key.trim() || model.trim());

  const handleSave = async () => {
    setStatus('saving');
    try {
      await onSave(provider.id, {
        api_key: provider.isLocal ? null : (key || undefined),
        base_url: provider.isLocal ? (url || undefined) : undefined,
        model: model || undefined,
      });
      setKey('');
      setStatus('ok');
      setTimeout(() => setStatus(null), 2500);
    } catch {
      setStatus('err');
      setTimeout(() => setStatus(null), 2500);
    }
  };

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: 'var(--radius-md, 10px)',
        border: isActive ? `1.5px solid ${provider.border}` : '1px solid var(--border-subtle)',
        background: 'var(--bg-card)',
        padding: '16px 18px',
        boxShadow: isActive ? '0 2px 10px rgba(0, 0, 0, 0.03)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div>
        {/* Card Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                flexShrink: 0,
                background: provider.bg,
                border: `1.5px solid ${provider.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                color: provider.color,
                letterSpacing: '-0.02em',
              }}
            >
              {provider.short}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{provider.name}</span>
                {isActive && (
                  <span
                    className="badge badge-emerald"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '1px 7px',
                    }}
                  >
                    Active
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {provider.tagline}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={provider.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = provider.color)}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <ExternalLink size={11} />
              <span>{provider.docLabel}</span>
            </a>
            {isActive && (
              <button
                type="button"
                onClick={() => onDelete(provider.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e11d48';
                  e.currentTarget.style.borderColor = '#e11d48';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                <Trash2 size={11} />
                <span>Remove</span>
              </button>
            )}
          </div>
        </div>

        {/* Inputs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginBottom: 10 }}>
          {provider.isLocal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Base URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={provider.urlPlaceholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                API Key
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name={`apikey_${provider.id}_token`}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={isActive ? 'Saved - enter new to update' : provider.keyPlaceholder}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  style={{
                    ...inputStyle,
                    paddingRight: 32,
                    WebkitTextSecurity: show ? 'none' : 'disc',
                    textSecurity: show ? 'none' : 'disc',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    padding: 2,
                  }}
                  title={show ? 'Hide key' : 'Show key'}
                >
                  {show ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Default Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider.modelPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
            />
          </div>
        </div>

        {/* Suggestions Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {provider.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setModel(s)}
              style={{
                fontSize: 10.5,
                fontFamily: 'var(--font-code)',
                padding: '2px 7px',
                background: model === s ? provider.bg : 'var(--bg-subtle)',
                borderRadius: 4,
                border: model === s ? `1px solid ${provider.border}` : '1px solid var(--border-subtle)',
                color: model === s ? provider.color : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: model === s ? 600 : 400,
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={(e) => {
                if (model !== s) {
                  e.target.style.color = 'var(--text-primary)';
                  e.target.style.borderColor = 'var(--border-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (model !== s) {
                  e.target.style.color = 'var(--text-muted)';
                  e.target.style.borderColor = 'var(--border-subtle)';
                }
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Footer / Save Button Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 10,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isActive && saved.model && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-code)' }}>
              Active: <strong>{saved.model}</strong>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {status === 'ok' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#059669', fontWeight: 600 }}>
              <CheckCircle2 size={13} /> Saved
            </span>
          )}
          {status === 'err' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#e11d48', fontWeight: 600 }}>
              <XCircle size={13} /> Failed
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || status === 'saving'}
            className={isActive ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: !canSave ? 0.5 : 1,
            }}
          >
            {status === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            <span>{isActive ? 'Update' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsView() {
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/providers`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const map = {};
      for (const p of data.providers) map[p.provider_id] = p;
      setSaved(map);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (providerId, config) => {
    const res = await fetch(`${API}/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, ...config }),
    });
    if (!res.ok) throw new Error('Save failed');
    await load();
  };

  const handleDelete = async (providerId) => {
    await fetch(`${API}/providers/${providerId}`, { method: 'DELETE' });
    await load();
  };

  const activeCount = Object.values(saved).filter((p) => p.has_key).length;

  return (
    <section id="view-settings" className="view-panel active">
      {/* Main Panel Header */}
      <div className="panel-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Settings & API Providers
              </h1>
              <span className="badge badge-blue" style={{ fontSize: 11.5, padding: '2px 8px' }}>
                {activeCount} of {PROVIDERS.length} Configured
              </span>
            </div>
            <p className="panel-subtitle" style={{ margin: 0 }}>
              Configure AI model providers, credentials, and custom model choices stored securely in your local SQLite database.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} />
            <span>Refresh Status</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            marginBottom: 16,
            background: 'rgba(225,29,72,0.06)',
            border: '1px solid rgba(225,29,72,0.2)',
          }}
        >
          <AlertCircle size={15} style={{ color: '#e11d48', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: '#e11d48' }}>
            Cannot reach backend at http://localhost:8000 ({error}). Ensure the FastAPI server is running.
          </span>
        </div>
      )}

      {/* Security Info Card */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 18px',
          marginBottom: 20,
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <ShieldCheck size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong>SQLite Local Storage:</strong> Keys are stored directly in your local research database and injected at request time on the backend. The browser UI only receives masked previews.
        </span>
      </div>

      {/* Section Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Key size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Configured AI Providers
        </span>
      </div>

      {/* Responsive Providers Grid (fills the entire screen naturally) */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: '24px 0', fontSize: 13 }}>
          <Loader2 size={16} className="animate-spin" />
          <span>Loading provider settings from database...</span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))',
            gap: 16,
            marginBottom: 28,
          }}
        >
          {PROVIDERS.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              saved={saved[p.id] || null}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* App Environment Info Card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Server size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Environment & Architecture
        </span>
      </div>

      <div
        className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          padding: '16px 20px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md, 10px)',
        }}
      >
        {[
          { label: 'Backend API Server', value: 'http://localhost:8000', icon: <Globe size={14} /> },
          { label: 'Database Engine', value: 'SQLite (user_settings table)', icon: <Server size={14} /> },
          { label: 'Frontend Interface', value: 'React 18 · Vite · Localhost', icon: <Cpu size={14} /> },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {item.icon}
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: 12.5, fontFamily: 'var(--font-code)', color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
