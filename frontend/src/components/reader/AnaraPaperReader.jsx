import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  BookmarkIcon,
  Info,
  Send,
  Highlighter,
  MessageCircle,
  ExternalLink,
  FileText,
  AlignLeft,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Copy,
  Check,
  X,
  Award,
  GitFork,
  Star,
  Database,
} from 'lucide-react';
import MarkdownRenderer from '../common/MarkdownRenderer';

// ─── Floating Selection Toolbar ───────────────────────────────────────────────
function FloatingToolbar({ position, onHighlight, onComment, onAsk, onClose }) {
  if (!position) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: position.y - 48,
        left: position.x,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        padding: '4px 6px',
        animation: 'fadeInUp 0.12s ease',
      }}
    >
      <button
        className="btn btn-ghost btn-xs"
        onClick={onHighlight}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px' }}
        title="Highlight"
      >
        <Highlighter size={12} style={{ color: '#f59e0b' }} />
        <span>Highlight</span>
      </button>
      <button
        className="btn btn-ghost btn-xs"
        onClick={onComment}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px' }}
        title="Comment"
      >
        <MessageCircle size={12} style={{ color: '#6366f1' }} />
        <span>Comment</span>
      </button>
      <button
        className="btn btn-ghost btn-xs"
        onClick={onAsk}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px' }}
        title="Ask AI"
      >
        <MessageSquare size={12} style={{ color: '#10b981' }} />
        <span>Ask AI</span>
      </button>
      <button
        className="btn btn-ghost btn-xs"
        onClick={onClose}
        style={{ padding: '4px 6px', color: 'var(--text-muted)' }}
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ─── Sidebar Tab: Ask (AI Chat) ───────────────────────────────────────────────
function AskTab({ paper, initialPrompt, onClearPrompt }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `I've loaded **${paper?.title || 'this paper'}**. Ask me anything about it — methods, results, contributions, or comparisons.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      onClearPrompt?.();
    }
  }, [initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setLoading(true);
    try {
      const context = paper?.abstract
        ? `Paper: "${paper.title}"\nAbstract: ${paper.abstract.slice(0, 800)}`
        : `Paper: "${paper?.title || 'Unknown'}"`;
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          context,
          paper_id: paper?.id || paper?.arxiv_id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response || data.message || 'No response.' }]);
      } else {
        throw new Error('API error');
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I couldn\'t reach the server. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '88%',
                padding: '9px 13px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-subtle)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                fontSize: 13,
                lineHeight: 1.55,
                border: msg.role === 'assistant' ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {msg.role === 'assistant' ? (
                <MarkdownRenderer content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 12.5 }}>
            <Loader2 size={13} className="animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 1 && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['What is the main contribution?', 'Summarize the results', 'What datasets were used?'].map((q) => (
            <button
              key={q}
              className="btn btn-ghost btn-sm"
              onClick={() => sendMessage(q)}
              style={{ textAlign: 'left', fontSize: 12, justifyContent: 'flex-start', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask about this paper..."
            rows={2}
            style={{
              flex: 1,
              resize: 'none',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              fontSize: 13,
              color: 'var(--text-primary)',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{ padding: '8px 10px', flexShrink: 0 }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Tab: Annotations ─────────────────────────────────────────────────
function AnnotationsTab({ annotations, onJumpTo }) {
  if (!annotations.length) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        <Highlighter size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
        <p style={{ margin: 0 }}>No annotations yet.</p>
        <p style={{ margin: '6px 0 0', fontSize: 12 }}>Select text in the document and choose Highlight or Comment.</p>
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
      {annotations.map((a, i) => (
        <div
          key={i}
          onClick={() => onJumpTo?.(a)}
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-subtle)',
            border: `1px solid ${a.type === 'highlight' ? '#f59e0b44' : '#6366f144'}`,
            cursor: 'pointer',
            borderLeft: `3px solid ${a.type === 'highlight' ? '#f59e0b' : '#6366f1'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {a.type === 'highlight' ? (
              <Highlighter size={11} style={{ color: '#f59e0b' }} />
            ) : (
              <MessageCircle size={11} style={{ color: '#6366f1' }} />
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{a.type}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            "{a.text.length > 120 ? a.text.slice(0, 120) + '…' : a.text}"
          </p>
          {a.comment && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {a.comment}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Sidebar Tab: Details ─────────────────────────────────────────────────────
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
  author={${authorsStr}},
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
    { label: 'Citations', value: paper?.citation_count != null ? paper.citation_count.toLocaleString() : null },
  ].filter((r) => r.value);

  return (
    <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Abstract */}
      {paper?.abstract && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Abstract</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            {paper.abstract.slice(0, 600)}{paper.abstract.length > 600 ? '…' : ''}
          </p>
        </div>
      )}

      {/* Meta rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Metadata</p>
        {rows.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 68, flexShrink: 0 }}>{label}</span>
            <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Links */}
      {(paper?.pdf_url || paper?.url || paper?.arxiv_id) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Links</p>
          {paper?.pdf_url && (
            <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none' }}>
              <ExternalLink size={12} /> PDF Source
            </a>
          )}
          {paper?.arxiv_id && (
            <a href={`https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none' }}>
              <ExternalLink size={12} /> arXiv Page
            </a>
          )}
        </div>
      )}

      {/* BibTeX */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>BibTeX</p>
        <pre style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 12px',
          fontSize: 11.5,
          color: 'var(--text-secondary)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
        }}>
          {bibtex}
        </pre>
        <button
          className="btn btn-secondary btn-sm"
          onClick={copyBib}
          style={{ marginTop: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          {copiedBib ? <Check size={12} /> : <Copy size={12} />}
          <span>{copiedBib ? 'Copied!' : 'Copy BibTeX'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar Tab: Benchmarks (Papers With Code) ────────────────────────────────
function BenchmarksTab({ paper }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const arxivId =
    paper?.arxiv_id ||
    (paper?.id && String(paper.id).startsWith('arxiv:') ? String(paper.id).replace('arxiv:', '') : null);
  const title = paper?.title;

  useEffect(() => {
    if (!arxivId && !title) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (arxivId) params.set('arxiv_id', arxivId);
    if (title) params.set('title', title);

    fetch(`/api/v1/graph/benchmarks?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch benchmark evidence');
        return res.json();
      })
      .then((resData) => setData(resData))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [arxivId, title]);

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span>Fetching Papers With Code benchmarks & code...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--accent-rose)', fontSize: 13 }}>
        <p style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  const benchmarks = data?.benchmarks || [];
  const repos = data?.repositories || [];

  if (!benchmarks.length && !repos.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        <Award size={32} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
        <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-secondary)' }}>
          No Papers With Code Evidence
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          This paper does not yet have registered benchmark evaluation tables or code repositories on Papers With Code.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Code Repositories */}
      {repos.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <GitFork size={13} style={{ color: 'var(--accent-primary)' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
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
                  padding: '10px 12px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
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
                        color: 'var(--accent-primary)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {r.url ? r.url.replace(/^https?:\/\/(www\.)?github\.com\//, '') : 'Repository'}
                    </span>
                    {r.is_official && (
                      <span
                        style={{
                          fontSize: 10,
                          background: '#10b98122',
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
                      color: 'var(--text-muted)',
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
                <ExternalLink size={13} style={{ color: 'var(--text-muted)', marginLeft: 8, flexShrink: 0 }} />
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
                color: 'var(--text-muted)',
              }}
            >
              Benchmark Evaluations ({benchmarks.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {benchmarks.map((b, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {b.task || 'Benchmark Evaluation'}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: 'var(--accent-primary, #6366f1)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {b.value}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                  }}
                >
                  {b.dataset && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Database size={11} /> {b.dataset}
                    </span>
                  )}
                  {b.metric && <span>Metric: {b.metric}</span>}
                  {b.model && <span>Model: {b.model}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Main Anara Reader ────────────────────────────────────────────────────────
export default function AnaraPaperReader({ paper, pdfUrl, markdownContent, onBack, backLabel = 'Back' }) {
  const [sidebarTab, setSidebarTab] = useState('ask'); // 'ask' | 'annotations' | 'details'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState('pdf'); // 'pdf' | 'markdown'
  const [annotations, setAnnotations] = useState([]);
  const [floatingToolbar, setFloatingToolbar] = useState(null); // { x, y, text }
  const [askPrompt, setAskPrompt] = useState('');
  const [commentTarget, setCommentTarget] = useState(null);
  const [commentText, setCommentText] = useState('');
  const pdfContainerRef = useRef(null);

  // ── Floating toolbar on text selection (markdown view) ──
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setFloatingToolbar(null);
      return;
    }
    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setFloatingToolbar({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const handleHighlight = () => {
    if (!floatingToolbar) return;
    setAnnotations((prev) => [...prev, { type: 'highlight', text: floatingToolbar.text }]);
    setFloatingToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleComment = () => {
    if (!floatingToolbar) return;
    setCommentTarget(floatingToolbar.text);
    setCommentText('');
    setFloatingToolbar(null);
  };

  const handleAsk = () => {
    if (!floatingToolbar) return;
    setAskPrompt(`Regarding this passage: "${floatingToolbar.text.slice(0, 200)}"  — `);
    setSidebarTab('ask');
    setSidebarOpen(true);
    setFloatingToolbar(null);
  };

  const submitComment = () => {
    if (!commentTarget) return;
    setAnnotations((prev) => [...prev, { type: 'comment', text: commentTarget, comment: commentText }]);
    setCommentTarget(null);
    setCommentText('');
  };

  const hasPdf = !!pdfUrl;
  const hasMarkdown = !!markdownContent;

  // Auto-select best default view
  useEffect(() => {
    if (!hasPdf && hasMarkdown) setViewMode('markdown');
    else setViewMode('pdf');
  }, [hasPdf, hasMarkdown]);

  const SIDEBAR_WIDTH = 320;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      {/* ── Top Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: 48,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Left: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 13 }}
          >
            <ChevronLeft size={15} />
            <span>{backLabel}</span>
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>·</span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {paper?.title || 'Paper Reader'}
          </span>
        </div>

        {/* Center: PDF / Markdown toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            padding: 3,
            gap: 2,
            flexShrink: 0,
          }}
        >
          <button
            className={`btn btn-xs ${viewMode === 'pdf' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('pdf')}
            disabled={!hasPdf}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px' }}
          >
            <FileText size={12} />
            <span>PDF</span>
          </button>
          <button
            className={`btn btn-xs ${viewMode === 'markdown' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('markdown')}
            disabled={!hasMarkdown}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px' }}
          >
            <AlignLeft size={12} />
            <span>Markdown</span>
          </button>
        </div>

        {/* Right: sidebar toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSidebarOpen((v) => !v)}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          <span>{sidebarOpen ? 'Hide' : 'Panel'}</span>
        </button>
      </div>

      {/* ── Body: Document + Sidebar ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Document Panel */}
        <div
          ref={pdfContainerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            background: viewMode === 'pdf' ? '#525659' : 'var(--bg-primary)',
            display: 'flex',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {viewMode === 'pdf' && hasPdf ? (
            <iframe
              src={pdfUrl}
              title="Research Paper PDF"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            />
          ) : viewMode === 'markdown' && hasMarkdown ? (
            <div
              style={{
                width: '100%',
                maxWidth: 820,
                padding: '40px 48px',
                background: 'var(--bg-card)',
                minHeight: '100%',
                boxSizing: 'border-box',
              }}
            >
              <MarkdownRenderer content={markdownContent} />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                gap: 12,
                textAlign: 'center',
                padding: 24,
              }}
            >
              <FileText size={40} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 14, margin: 0 }}>
                {viewMode === 'pdf' ? 'No PDF available for this paper.' : 'No markdown content available.'}
              </p>
              {viewMode === 'pdf' && hasMarkdown && (
                <button className="btn btn-secondary btn-sm" onClick={() => setViewMode('markdown')}>
                  Switch to Markdown
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div
            style={{
              width: SIDEBAR_WIDTH,
              flexShrink: 0,
              borderLeft: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Sidebar Tab Bar */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-subtle)',
                flexShrink: 0,
              }}
            >
              {[
                { key: 'ask', label: 'Ask', Icon: MessageSquare },
                { key: 'benchmarks', label: 'Benchmarks', Icon: Award },
                { key: 'annotations', label: 'Annotations', Icon: BookmarkIcon, badge: annotations.length || null },
                { key: 'details', label: 'Details', Icon: Info },
              ].map(({ key, label, Icon, badge }) => (
                <button
                  key={key}
                  onClick={() => setSidebarTab(key)}
                  style={{
                    flex: 1,
                    padding: '10px 4px',
                    fontSize: 12,
                    fontWeight: sidebarTab === key ? 600 : 400,
                    color: sidebarTab === key ? 'var(--accent-primary)' : 'var(--text-muted)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: sidebarTab === key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    transition: 'color 0.15s',
                    position: 'relative',
                  }}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                  {badge ? (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      background: 'var(--accent-primary)', color: '#fff',
                      borderRadius: '50%', width: 16, height: 16,
                      fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{badge}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Sidebar Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {sidebarTab === 'ask' && (
                <AskTab paper={paper} initialPrompt={askPrompt} onClearPrompt={() => setAskPrompt('')} />
              )}
              {sidebarTab === 'benchmarks' && (
                <BenchmarksTab paper={paper} />
              )}
              {sidebarTab === 'annotations' && (
                <AnnotationsTab annotations={annotations} />
              )}
              {sidebarTab === 'details' && (
                <DetailsTab paper={paper} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Text-Selection Toolbar ── */}
      {floatingToolbar && viewMode === 'markdown' && (
        <FloatingToolbar
          position={floatingToolbar}
          onHighlight={handleHighlight}
          onComment={handleComment}
          onAsk={handleAsk}
          onClose={() => setFloatingToolbar(null)}
        />
      )}

      {/* ── Comment Modal ── */}
      {commentTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setCommentTarget(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 20,
              width: 380,
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>Adding comment to:</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-subtle)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', margin: '0 0 12px', fontStyle: 'italic', lineHeight: 1.5 }}>
              "{commentTarget.slice(0, 160)}{commentTarget.length > 160 ? '…' : ''}"
            </p>
            <textarea
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write your comment..."
              rows={3}
              style={{
                width: '100%', resize: 'none',
                background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                fontSize: 13, color: 'var(--text-primary)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setCommentTarget(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={!commentText.trim()}>
                Save Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
