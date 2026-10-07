import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Award,
  Info,
  X,
  Send,
  Loader2,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  GitFork,
  Star,
  Database,
  Cpu,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

// ─── Tab 1: Chat (Ask AI Copilot) ─────────────────────────────────────────────
function AskTab({ paper }) {
  const { activeWorkspace, workspaceMemories } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = { role: 'user', content: query };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const payload = {
        messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        paper_title: paper?.title || null,
        paper_abstract: paper?.abstract || null,
        workspace_topic: activeWorkspace?.title || null,
        workspace_id: activeWorkspace?.id || null,
        workspace_memories: workspaceMemories || [],
        model: 'gemini-2.0-flash-lite',
      };

      const res = await fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response || 'No response.' },
        ]);
      } else {
        const errTxt = await res.text();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${errTxt || 'Failed to generate answer.'}` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Network error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', background: 'var(--bg-card, #ffffff)', flexShrink: 0 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} style={{ color: 'var(--accent-violet, #6366f1)' }} />
          <span>AI Copilot</span>
        </h3>
        <div className="copilot-context-badge">
          Context: Current Paper
        </div>
      </div>

      {/* Messages list / Empty State */}
      {messages.length === 0 ? (
        <div className="copilot-empty-state">
          <div className="copilot-empty-icon">
            <Sparkles size={20} />
          </div>
          <h4 className="copilot-empty-title">
            Ask anything about this paper
          </h4>
          <div className="copilot-suggestions-list">
            <button
              type="button"
              className="copilot-suggestion-btn"
              onClick={() => handleSend('Summarize paper')}
            >
              <span>Summarize paper</span>
              <ChevronRight size={13} style={{ opacity: 0.4 }} />
            </button>
            <button
              type="button"
              className="copilot-suggestion-btn"
              onClick={() => handleSend('Explain methodology')}
            >
              <span>Explain methodology</span>
              <ChevronRight size={13} style={{ opacity: 0.4 }} />
            </button>
            <button
              type="button"
              className="copilot-suggestion-btn"
              onClick={() => handleSend('Find key contributions')}
            >
              <span>Find key contributions</span>
              <ChevronRight size={13} style={{ opacity: 0.4 }} />
            </button>
            <button
              type="button"
              className="copilot-suggestion-btn"
              onClick={() => handleSend('Explain this section')}
            >
              <span>Explain this section</span>
              <ChevronRight size={13} style={{ opacity: 0.4 }} />
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '88%',
                  padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user' ? 'var(--accent-violet, #6366f1)' : 'var(--bg-subtle, #f4f4f5)',
                  color: m.role === 'user' ? '#ffffff' : 'var(--text-primary, #09090b)',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  border: m.role === 'assistant' ? '1px solid var(--border-subtle, #e2e8f0)' : 'none',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
              <Loader2 size={13} className="animate-spin" />
              <span>Analyzing paper…</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Bottom input box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="copilot-input-container"
      >
        <div className="copilot-input-box">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this paper..."
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="copilot-input-send-btn"
            title="Send"
          >
            <Send size={13} />
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Tab 2: Benchmarks & Code ────────────────────────────────────────────────
function BenchmarksTab({ paper }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Extract normalized arXiv ID e.g. 2310.06625 or DOI
  const rawArxiv =
    paper?.arxiv_id ||
    paper?.arxivId ||
    (paper?.id && String(paper.id).match(/\d{4}\.\d{4,5}/) ? String(paper.id) : '') ||
    (paper?.url && String(paper.url).match(/\d{4}\.\d{4,5}/) ? String(paper.url) : '');
  const arxivMatch = String(rawArxiv).match(/(\d{4}\.\d{4,5})/);
  const arxivId = arxivMatch ? arxivMatch[1] : null;

  const rawDoi = paper?.doi || (paper?.id && String(paper.id).startsWith('10.') ? String(paper.id) : '');
  const doiMatch = String(rawDoi).match(/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/);
  const doi = doiMatch ? doiMatch[1] : (paper?.doi || null);

  const paperId = paper?.id ? String(paper.id) : null;
  const title = paper?.title;

  useEffect(() => {
    if (!arxivId && !doi && !paperId && !title) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (arxivId) params.set('arxiv_id', arxivId);
    if (doi) params.set('doi', doi);
    if (paperId) params.set('paper_id', paperId);
    if (title) params.set('title', title);

    fetch(`/api/v1/graph/benchmarks?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch benchmark evidence');
        return res.json();
      })
      .then((resData) => setData(resData))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [arxivId, doi, paperId, title]);

  if (loading) {
    return (
      <div
        style={{
          padding: 28,
          textAlign: 'center',
          color: 'var(--text-muted, #64748b)',
          fontSize: 12.5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary, #6366f1)' }} />
        <span>Fetching Papers With Code benchmarks & code...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontSize: 12.5 }}>
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  const benchmarks = data?.benchmarks || [];
  const repos = data?.repositories || [];
  const methods = data?.methods || (benchmarks.length > 0 && benchmarks[0]?.methods) || [];

  if (!benchmarks.length && !repos.length && !methods.length) {
    return (
      <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 12.5 }}>
        <Award size={32} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-secondary, #334155)' }}>
          No Benchmark Records Found
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          This paper does not yet have registered benchmark evaluation tables or code repositories in Papers With Code.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Architectural Methods & Techniques */}
      {methods.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Cpu size={13} style={{ color: 'var(--accent-primary, #6366f1)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              Architectural Methods ({methods.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {methods.map((m, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'var(--bg-subtle, #f8fafc)',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  color: 'var(--text-primary, #0f172a)',
                }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Code Repositories */}
      {repos.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <GitFork size={13} style={{ color: 'var(--accent-primary, #6366f1)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              Code Repositories ({repos.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {repos.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 11px',
                  background: 'var(--bg-subtle, #f8fafc)',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--accent-primary, #6366f1)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {r.url ? r.url.replace(/^https?:\/\/(www\.)?github\.com\//, '') : 'Repository'}
                    </span>
                    {r.is_official && (
                      <span
                        style={{
                          fontSize: 10,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          padding: '1px 5px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        Official
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 11.5,
                      color: 'var(--text-muted, #64748b)',
                    }}
                  >
                    {r.framework && <span>{r.framework}</span>}
                    {r.stars != null && r.stars > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Star size={11} style={{ color: '#f59e0b', fill: '#f59e0b' }} /> {r.stars.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <ExternalLink size={13} style={{ color: 'var(--text-muted, #64748b)', marginLeft: 8, flexShrink: 0 }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Benchmark Evaluations */}
      {benchmarks.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Award size={13} style={{ color: '#f59e0b' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              Benchmark Evaluations ({benchmarks.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {benchmarks.map((b, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-subtle, #f8fafc)',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                      {b.task || b.task_name || 'Benchmark Evaluation'}
                    </span>
                    {b.rank && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#d97706',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🏆 {b.rank}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: 'var(--accent-primary, #6366f1)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    {b.value || b.metric_value || '—'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: 11.5,
                    color: 'var(--text-muted, #64748b)',
                  }}
                >
                  {(b.dataset || b.dataset_name) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Database size={11} /> {b.dataset || b.dataset_name}
                    </span>
                  )}
                  {(b.metric || b.metric_name) && <span>Metric: {b.metric || b.metric_name}</span>}
                  {b.model && <span>Model: {b.model}</span>}
                </div>
                {b.methodology && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted, #64748b)',
                      background: 'var(--bg-card, #ffffff)',
                      padding: '5px 8px',
                      borderRadius: 4,
                      borderLeft: '2px solid var(--accent-primary, #6366f1)',
                      lineHeight: 1.45,
                    }}
                  >
                    {b.methodology}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Details ──────────────────────────────────────────────────────────
function DetailsTab({ paper }) {
  const [copiedBib, setCopiedBib] = useState(false);

  const rawAuthors = paper?.authors;
  const authorsStr = Array.isArray(rawAuthors)
    ? rawAuthors.map((a) => (typeof a === 'string' ? a : a?.name || String(a))).join(', ')
    : typeof rawAuthors === 'string'
    ? rawAuthors
    : '';

  const bibtex = `@article{${((paper?.arxiv_id || paper?.id || 'paper') + '').replace(/[^a-zA-Z0-9]/g, '')},
  title={${paper?.title || 'Untitled'}},
  author={${authorsStr || 'Unknown'}},
  year={${paper?.year || 2024}}
}`;

  const copyBib = () => {
    navigator.clipboard.writeText(bibtex);
    setCopiedBib(true);
    setTimeout(() => setCopiedBib(false), 2000);
  };

  const rows = [
    { label: 'Title', value: paper?.title },
    { label: 'Authors', value: authorsStr },
    { label: 'Year', value: paper?.year },
    { label: 'Source', value: paper?.source },
    { label: 'Venue', value: paper?.venue },
    { label: 'DOI', value: paper?.doi },
  ].filter((r) => r.value);

  return (
    <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Abstract */}
      {paper?.abstract && (
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-muted, #64748b)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: '0 0 6px',
            }}
          >
            Abstract
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary, #334155)', lineHeight: 1.6, margin: 0 }}>
            {paper.abstract}
          </p>
        </div>
      )}

      {/* Meta rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted, #64748b)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 4px',
          }}
        >
          Metadata
        </p>
        {rows.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted, #64748b)', minWidth: 64, flexShrink: 0 }}>{label}:</span>
            <span style={{ color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* External links */}
      {(paper?.pdf_url || paper?.url || paper?.arxiv_id) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-muted, #64748b)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: '0 0 4px',
            }}
          >
            Links
          </p>
          {paper?.pdf_url && (
            <a
              href={paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
                color: 'var(--accent-primary, #6366f1)',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} /> Direct PDF
            </a>
          )}
          {paper?.arxiv_id && (
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12.5,
                color: 'var(--accent-primary, #6366f1)',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} /> arXiv Abstract Page
            </a>
          )}
        </div>
      )}

      {/* BibTeX */}
      <div>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted, #64748b)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 6px',
          }}
        >
          BibTeX
        </p>
        <pre
          style={{
            background: 'var(--bg-subtle, #f8fafc)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            color: 'var(--text-secondary, #475569)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
          }}
        >
          {bibtex}
        </pre>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={copyBib}
          style={{ marginTop: 8, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          {copiedBib ? <Check size={12} /> : <Copy size={12} />}
          <span>{copiedBib ? 'Copied' : 'Copy BibTeX'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Master Sidebar Component ─────────────────────────────────────────────────
export default function PaperReaderSidebar({ paper, onClose }) {
  const [activeTab, setActiveTab] = useState('ask'); // 'ask' | 'benchmarks' | 'details'

  return (
    <aside className="reader-assistant-panel" aria-label="AI Copilot">
      {/* Navigation Tab Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
          background: 'var(--bg-subtle, #f8fafc)',
          padding: '5px 8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => setActiveTab('ask')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'ask' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: activeTab === 'ask' ? 'var(--accent-violet, #6366f1)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'ask' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: activeTab === 'ask' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.12s ease',
            }}
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('benchmarks')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'benchmarks' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: activeTab === 'benchmarks' ? 'var(--accent-violet, #6366f1)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'benchmarks' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: activeTab === 'benchmarks' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.12s ease',
            }}
          >
            <Award size={13} />
            <span>Benchmarks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('details')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'details' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: activeTab === 'details' ? 'var(--accent-violet, #6366f1)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'details' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: activeTab === 'details' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.12s ease',
            }}
          >
            <Info size={13} />
            <span>Details</span>
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
            title="Close Sidebar"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Tab Body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'ask' && <AskTab paper={paper} />}
        {activeTab === 'benchmarks' && <BenchmarksTab paper={paper} />}
        {activeTab === 'details' && <DetailsTab paper={paper} />}
      </div>
    </aside>
  );
}
