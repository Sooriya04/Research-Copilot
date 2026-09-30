import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Bookmark,
  Info,
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
  Search,
  Download,
  Printer,
  Columns,
  List,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Trash2,
  ArrowUp,
} from 'lucide-react';
import MarkdownRenderer from '../common/MarkdownRenderer';

// ─── Floating Selection Toolbar (Anara style) ─────────────────────────────────
function FloatingToolbar({ position, onHighlight, onComment, onAsk, onClose }) {
  if (!position) return null;
  return (
    <div
      className="anara-selection-toolbar"
      style={{
        top: position.y - 46,
        left: position.x,
        transform: 'translateX(-50%)',
      }}
    >
      <button onClick={onHighlight} title="Highlight selected text">
        <Highlighter size={13} style={{ color: '#f59e0b' }} />
        <span>Highlight</span>
      </button>
      <button onClick={onComment} title="Add comment">
        <MessageCircle size={13} style={{ color: '#6366f1' }} />
        <span>Comment</span>
      </button>
      <button onClick={onAsk} title="Ask AI about this selection">
        <MessageSquare size={13} style={{ color: '#10b981' }} />
        <span>Chat</span>
      </button>
      <button onClick={onClose} style={{ padding: '4px 6px', color: 'var(--text-muted)' }} title="Close">
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Sidebar Tab: Ask (Conversational AI Chat) ───────────────────────────────
function AskTab({ paper, initialPrompt, onClearPrompt }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `I've loaded **${paper?.title || 'this publication'}**. Ask me anything about its methodology, contributions, experimental baselines, or findings.`,
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
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          paper_title: paper?.title || 'Research Paper',
          paper_abstract: paper?.abstract || '',
          paper_markdown: (paper?.body_markdown || paper?.markdown_content || paper?.markdown || '').slice(0, 4000),
          model: 'gemini-2.0-flash-lite',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response || data.message || 'No response.' },
        ]);
      } else {
        throw new Error(`API error (${res.status})`);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not reach the AI research assistant. Please ensure the backend is running.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'user' ? (
              <div className="anara-chat-bubble-user">
                {msg.content}
              </div>
            ) : (
              <div className="anara-chat-bubble-assistant">
                <MarkdownRenderer content={msg.content} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 12.5, padding: '4px 6px' }}>
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span>Analyzing paper evidence...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 1 && (
        <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            'What is the core contribution of this work?',
            'Explain the proposed architecture and method',
            'What datasets and benchmarks were evaluated?',
            'What are the limitations or open research gaps?',
          ].map((q) => (
            <button
              key={q}
              className="btn btn-ghost btn-sm"
              onClick={() => sendMessage(q)}
              style={{
                textAlign: 'left',
                fontSize: 12,
                justifyContent: 'flex-start',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-subtle)', borderRadius: 24, border: '1px solid var(--border-subtle)', padding: '4px 6px 4px 12px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a question about the paper..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              borderRadius: '50%',
              width: 30,
              height: 30,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title="Send"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar Tab: Annotations ─────────────────────────────────────────────────
function AnnotationsTab({ annotations, onJumpTo, onDelete }) {
  if (!annotations.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        <Highlighter size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
        <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-secondary)' }}>No annotations yet</p>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          Select any text in the publication and click <strong>Highlight</strong> or <strong>Comment</strong>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
      {annotations.map((a, i) => (
        <div
          key={i}
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-subtle)',
            border: `1px solid ${a.type === 'highlight' ? '#f59e0b44' : '#6366f144'}`,
            borderLeft: `3px solid ${a.type === 'highlight' ? '#f59e0b' : '#6366f1'}`,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {a.type === 'highlight' ? (
                <Highlighter size={12} style={{ color: '#f59e0b' }} />
              ) : (
                <MessageCircle size={12} style={{ color: '#6366f1' }} />
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {a.type}
              </span>
            </div>
            {onDelete && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(i);
                }}
                style={{ padding: '2px 4px', color: 'var(--text-muted)' }}
                title="Delete annotation"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <p
            onClick={() => onJumpTo?.(a)}
            style={{
              margin: 0,
              fontSize: 12.5,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              cursor: 'pointer',
            }}
          >
            "{a.text.length > 140 ? a.text.slice(0, 140) + '…' : a.text}"
          </p>
          {a.comment && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--accent-primary)', fontWeight: 500 }}>
              Note: {a.comment}
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

  const affilsStr = Array.isArray(paper?.affiliations)
    ? paper.affiliations.join('; ')
    : paper?.affiliations || '';

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
    { label: 'Affiliations', value: affilsStr },
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
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Abstract
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            {paper.abstract.slice(0, 500)}{paper.abstract.length > 500 ? '…' : ''}
          </p>
        </div>
      )}

      {/* Meta rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
          Publication Details
        </p>
        {rows.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)', minWidth: 74, flexShrink: 0 }}>{label}</span>
            <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Links */}
      {(paper?.pdf_url || paper?.url || paper?.arxiv_id) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
            External References
          </p>
          {paper?.pdf_url && (
            <a
              href={paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--accent-primary)', textDecoration: 'none' }}
            >
              <ExternalLink size={12} /> Original PDF
            </a>
          )}
          {paper?.arxiv_id && (
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--accent-primary)', textDecoration: 'none' }}
            >
              <ExternalLink size={12} /> arXiv Publication Page
            </a>
          )}
        </div>
      )}

      {/* BibTeX */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
          BibTeX Citation
        </p>
        <pre
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
          }}
        >
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
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
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
        <Award size={30} style={{ opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
        <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-secondary)' }}>
          No Papers With Code Evidence
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          This publication does not have registered benchmark tables or code repositories on Papers With Code yet.
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
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
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
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-primary)', wordBreak: 'break-all' }}>
                      {r.url ? r.url.replace(/^https?:\/\/(www\.)?github\.com\//, '') : 'Repository'}
                    </span>
                    {r.is_official && (
                      <span style={{ fontSize: 10, background: '#10b98122', color: '#10b981', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                        Official
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--text-muted)' }}>
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
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
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

// ─── Main Anara Publication Reader ───────────────────────────────────────────
export default function AnaraPaperReader({
  paper,
  pdfUrl,
  markdownContent,
  loadingPdf = false,
  onBack,
  backLabel = 'Back',
}) {
  const [sidebarTab, setSidebarTab] = useState('ask'); // 'ask' | 'annotations' | 'details' | 'benchmarks'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tocOpen, setTocOpen] = useState(true);
  const [viewMode, setViewMode] = useState('markdown'); // 'pdf' | 'markdown'
  const [twoColumn, setTwoColumn] = useState(false);
  const [serifFont, setSerifFont] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('abstract');
  const [lightboxImage, setLightboxImage] = useState(null); // { src, caption }
  const [imageZoom, setImageZoom] = useState(1);
  const [annotations, setAnnotations] = useState([]);
  const [floatingToolbar, setFloatingToolbar] = useState(null); // { x, y, text }
  const [askPrompt, setAskPrompt] = useState('');
  const [commentTarget, setCommentTarget] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [iframeLoading, setIframeLoading] = useState(true);

  const viewportRef = useRef(null);

  const hasPdf = !!pdfUrl;
  const hasMarkdown = !!markdownContent;

  // Auto-select view mode based on availability
  useEffect(() => {
    if (hasMarkdown) {
      setViewMode('markdown');
    } else if (hasPdf) {
      setViewMode('pdf');
    }
  }, [hasPdf, hasMarkdown]);

  // Clean body markdown starting at Section 1 to prevent duplicate title/author/abstract header
  const bodyMarkdown = useMemo(() => {
    let raw = paper?.body_markdown || markdownContent || '';
    if (!raw) return '';

    // If raw contains Section 1 (Introduction/Background/Overview), slice directly from there
    const sec1Match = raw.match(/\n(#{1,4}\s+[\*\s]*(?:\d+[\s\.\)]+|[IVXLCDM]+[\s\.\)]+)?[\*\s]*(?:Introduction|Background|Overview)\b[\s\S]*)$/i);
    if (sec1Match) {
      raw = sec1Match[1].trim();
    } else {
      // Otherwise strip any title/metadata header before the horizontal divider
      const hrIndex = raw.indexOf('\n---\n');
      if (hrIndex !== -1 && hrIndex < 2500) {
        raw = raw.slice(hrIndex + 5).trim();
      }
    }

    // Defensive: strip OCR picture text comments & normalize image paths
    raw = raw.replace(/<!-- Start of picture text -->[\s\S]*?<!-- End of picture text -->/g, '');
    raw = raw.replace(/!\[(.*?)\]\((?:(?:\/)?dump_extract\/)?images\/([^)]+)\)/g, '![$1](/dump_extract/images/$2)');
    return raw.trim();
  }, [paper?.body_markdown, markdownContent]);

  // Table of Contents sections
  const documentSections = useMemo(() => {
    const formatTitle = (t) => {
      if (!t) return '';
      return String(t)
        .replace(/[\*\_]/g, '')
        .replace(/(\d+(?:\.\d+)*)\s*([A-Za-z])/g, '$1 $2')
        .trim();
    };

    if (paper?.sections && paper.sections.length > 0) {
      return paper.sections.map((s) => ({
        ...s,
        title: formatTitle(s.title),
      }));
    }
    const list = [];
    if (paper?.abstract) {
      list.push({ id: 'abstract', title: 'Abstract', level: 2 });
    }
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(bodyMarkdown)) !== null) {
      const level = match[1].length;
      const rawTitle = match[2].replace(/<[^>]*>/g, '').trim();
      const title = formatTitle(rawTitle);
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      list.push({ id, title, level });
    }
    return list;
  }, [paper?.sections, paper?.abstract, bodyMarkdown]);

  // ── Floating toolbar on text selection (markdown view) ──
  const handleMouseUp = useCallback(() => {
    if (viewMode !== 'markdown') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setFloatingToolbar(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 2) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setFloatingToolbar({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text,
    });
  }, [viewMode]);

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
    setAskPrompt(`Regarding this passage: "${floatingToolbar.text.slice(0, 240)}" — `);
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

  // Jump to document section
  const scrollToSection = (sectionId) => {
    setActiveSectionId(sectionId);
    if (sectionId === 'abstract') {
      const el = document.getElementById('anara-abstract-card');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleImageClick = ({ src, caption }) => {
    setLightboxImage({ src, caption });
    setImageZoom(1);
  };

  const toggleBookmark = () => {
    setIsBookmarked((v) => !v);
  };

  const handleDownload = () => {
    if (paper?.markdown_content || paper?.markdown || markdownContent) {
      const content = paper?.markdown_content || paper?.markdown || markdownContent;
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(paper?.title || 'paper').replace(/[^a-zA-Z0-9]+/g, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  // Authors & affiliations formatting
  const authorsList = useMemo(() => {
    if (Array.isArray(paper?.authors)) {
      return paper.authors.map((a) => (typeof a === 'string' ? a : a?.name || String(a)));
    }
    if (typeof paper?.authors === 'string' && paper.authors) {
      return [paper.authors];
    }
    return [];
  }, [paper?.authors]);

  const affiliationsList = useMemo(() => {
    if (Array.isArray(paper?.affiliations)) {
      return paper.affiliations;
    }
    if (typeof paper?.affiliations === 'string' && paper.affiliations) {
      return [paper.affiliations];
    }
    return [];
  }, [paper?.affiliations]);

  const arxivId = paper?.arxiv_id || (paper?.id && String(paper.id).startsWith('arxiv:') ? String(paper.id).replace('arxiv:', '') : null);

  const SIDEBAR_WIDTH = 340;

  return (
    <div className="anara-reader-root">
      {/* ── Top Bar (Anara publication standard) ── */}
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
          gap: 10,
        }}
      >
        {/* Left: Back + Outline toggle + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 12.5, padding: '4px 8px' }}
          >
            <ChevronLeft size={15} />
            <span>{backLabel}</span>
          </button>

          {viewMode === 'markdown' && documentSections.length > 0 && (
            <button
              className={`btn btn-xs ${tocOpen ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setTocOpen((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
              title="Toggle Table of Contents Outline"
            >
              <List size={13} />
              <span>Outline</span>
            </button>
          )}

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
            title={paper?.title}
          >
            {paper?.title || 'Research Publication'}
          </span>
        </div>

        {/* Center: PDF / Reader Toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            padding: 2,
            gap: 2,
            flexShrink: 0,
          }}
        >
          <button
            className={`btn btn-xs ${viewMode === 'pdf' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('pdf')}
            disabled={!hasPdf}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px' }}
          >
            <FileText size={12} />
            <span>PDF</span>
          </button>
          <button
            className={`btn btn-xs ${viewMode === 'markdown' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('markdown')}
            disabled={!hasMarkdown}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px' }}
          >
            <AlignLeft size={12} />
            <span>Reader</span>
          </button>
        </div>

        {/* Right: Reading controls + Action icons + Sidebar toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {viewMode === 'markdown' && (
            <>
              {/* 1 Col / 2 Col layout toggle */}
              <button
                className={`btn btn-ghost btn-xs ${twoColumn ? 'btn-secondary' : ''}`}
                onClick={() => setTwoColumn((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                title={twoColumn ? 'Switch to Single Column' : 'Switch to Two Column Layout'}
              >
                <Columns size={12} />
                <span>{twoColumn ? '2 Col' : '1 Col'}</span>
              </button>

              {/* Serif / Sans font toggle */}
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setSerifFont((v) => !v)}
                style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px' }}
                title={serifFont ? 'Switch to Sans font' : 'Switch to Academic Serif font'}
              >
                {serifFont ? 'Serif' : 'Sans'}
              </button>

              {/* Search button */}
              <button
                className={`btn btn-ghost btn-xs ${searchOpen ? 'btn-secondary' : ''}`}
                onClick={() => setSearchOpen((v) => !v)}
                style={{ padding: '5px 7px' }}
                title="Search in paper"
              >
                <Search size={14} />
              </button>
            </>
          )}

          {/* Bookmark button */}
          <button
            className="btn btn-ghost btn-xs"
            onClick={toggleBookmark}
            style={{ padding: '5px 7px', color: isBookmarked ? '#f59e0b' : 'inherit' }}
            title={isBookmarked ? 'Bookmarked' : 'Bookmark paper'}
          >
            <Bookmark size={14} style={{ fill: isBookmarked ? '#f59e0b' : 'none' }} />
          </button>

          {/* Download button */}
          <button
            className="btn btn-ghost btn-xs"
            onClick={handleDownload}
            style={{ padding: '5px 7px' }}
            title="Download Markdown / Paper"
          >
            <Download size={14} />
          </button>

          {/* Print button */}
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => window.print()}
            style={{ padding: '5px 7px' }}
            title="Print paper"
          >
            <Printer size={14} />
          </button>

          <span style={{ color: 'var(--border-subtle)', margin: '0 2px' }}>|</span>

          {/* Sidebar toggle */}
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setSidebarOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            <span>{sidebarOpen ? 'Hide' : 'Panel'}</span>
          </button>
        </div>
      </div>

      {/* ── Optional In-Paper Search Bar ── */}
      {searchOpen && viewMode === 'markdown' && (
        <div style={{ padding: '6px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <div className="anara-search-bar" style={{ maxWidth: 440, width: '100%' }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find in paper..."
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text-primary)' }}
            />
            {searchQuery && (
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setSearchQuery('')}
                style={{ padding: '2px 4px', color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setSearchOpen(false)}>
            Close
          </button>
        </div>
      )}

      {/* ── Main Body: TOC + Reading Sheet + Sidebar ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left TOC Outline Drawer */}
        {tocOpen && viewMode === 'markdown' && documentSections.length > 0 && (
          <aside className="anara-toc-sidebar">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10, padding: '0 6px' }}>
              Table of Contents
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {documentSections.map((sec, i) => (
                <a
                  key={i}
                  className={`anara-toc-item anara-toc-level-${sec.level || 2} ${activeSectionId === sec.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(sec.id);
                  }}
                  title={String(sec.title).replace(/(\d+(?:\.\d+)*)\s*([A-Za-z])/g, '$1 $2')}
                >
                  {String(sec.title).replace(/(\d+(?:\.\d+)*)\s*([A-Za-z])/g, '$1 $2')}
                </a>
              ))}
            </div>
          </aside>
        )}

        {/* Central Document Viewport */}
        <div ref={viewportRef} className="anara-paper-viewport">
          {viewMode === 'pdf' && hasPdf ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {iframeLoading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#525659',
                    color: '#f8fafc',
                    gap: 12,
                    zIndex: 10,
                  }}
                >
                  <Loader2 size={34} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Loading PDF Document…</div>
                    <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4 }}>
                      Rendering PDF pages and viewer
                    </div>
                  </div>
                </div>
              )}
              <iframe
                src={pdfUrl}
                title="Research Paper PDF"
                onLoad={() => setIframeLoading(false)}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              />
            </div>
          ) : viewMode === 'pdf' && loadingPdf ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 14, textAlign: 'center', padding: 24 }}>
              <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                  Resolving PDF…
                </h4>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, maxWidth: 360 }}>
                  Fetching preprint document and initializing viewer...
                </p>
              </div>
            </div>
          ) : viewMode === 'markdown' && hasMarkdown ? (
            /* ── Anara Publication Paper Sheet ── */
            <article className={`anara-paper-sheet ${twoColumn ? 'two-column-mode' : ''} ${serifFont ? 'font-serif-mode' : 'font-sans-mode'}`}>
              {/* Publication Header Block */}
              <header className="anara-paper-header">
                <h1 className="anara-paper-title">
                  {paper?.title || 'Research Publication'}
                </h1>

                {authorsList.length > 0 && (
                  <div className="anara-paper-byline">
                    {authorsList.join(', ')}
                  </div>
                )}

                {affiliationsList.length > 0 && (
                  <div className="anara-paper-affiliations">
                    {affiliationsList.join(' · ')}
                  </div>
                )}

                <div className="anara-meta-badges">
                  {paper?.year && <span className="anara-meta-pill">{paper.year}</span>}
                  {arxivId && <span className="anara-meta-pill">arXiv:{arxivId}</span>}
                  {paper?.citation_count != null && (
                    <span className="anara-meta-pill">{paper.citation_count.toLocaleString()} citations</span>
                  )}
                  <span className="anara-meta-pill">Open Access</span>
                </div>

                {paper?.abstract && (
                  <div id="anara-abstract-card" className="anara-abstract-card">
                    <div className="anara-abstract-title">Abstract</div>
                    <p className="anara-abstract-text">{paper.abstract}</p>
                  </div>
                )}
              </header>

              {/* Publication Document Body */}
              <div className={`anara-paper-body ${twoColumn ? 'two-column-layout' : ''}`}>
                <MarkdownRenderer content={bodyMarkdown} onImageClick={handleImageClick} />
              </div>
            </article>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12, textAlign: 'center', padding: 24 }}>
              <FileText size={40} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: 14, margin: 0, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {viewMode === 'pdf' ? 'PDF not available for this paper.' : 'No markdown content available.'}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {viewMode === 'pdf' && hasMarkdown && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setViewMode('markdown')}>
                    Switch to Reader View
                  </button>
                )}
                {paper?.url && (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                  >
                    <ExternalLink size={13} />
                    <span>Open Publisher Link</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
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
            {/* Tab Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', flexShrink: 0 }}>
              {[
                { key: 'ask', label: 'Ask', Icon: MessageSquare },
                { key: 'annotations', label: 'Annotations', Icon: Bookmark, badge: annotations.length || null },
                { key: 'details', label: 'Details', Icon: Info },
                { key: 'benchmarks', label: 'Benchmarks', Icon: Award },
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
                    position: 'relative',
                  }}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                  {badge ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 15,
                        height: 15,
                        fontSize: 9.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {sidebarTab === 'ask' && (
                <AskTab paper={paper} initialPrompt={askPrompt} onClearPrompt={() => setAskPrompt('')} />
              )}
              {sidebarTab === 'annotations' && (
                <AnnotationsTab
                  annotations={annotations}
                  onJumpTo={(a) => {
                    const sel = window.find ? window.find(a.text) : false;
                    if (!sel) console.info('Jumped to annotation:', a.text);
                  }}
                  onDelete={(idx) => setAnnotations((prev) => prev.filter((_, i) => i !== idx))}
                />
              )}
              {sidebarTab === 'details' && (
                <DetailsTab paper={paper} />
              )}
              {sidebarTab === 'benchmarks' && (
                <BenchmarksTab paper={paper} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Text-Selection Toolbar (Anara style) ── */}
      {floatingToolbar && viewMode === 'markdown' && (
        <FloatingToolbar
          position={floatingToolbar}
          onHighlight={handleHighlight}
          onComment={handleComment}
          onAsk={handleAsk}
          onClose={() => setFloatingToolbar(null)}
        />
      )}

      {/* ── Add Comment Modal ── */}
      {commentTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>Adding note to passage:</p>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-subtle)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', margin: '0 0 12px', fontStyle: 'italic', lineHeight: 1.5 }}>
              "{commentTarget.slice(0, 160)}{commentTarget.length > 160 ? '…' : ''}"
            </p>
            <textarea
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write your research note..."
              rows={3}
              style={{
                width: '100%',
                resize: 'none',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setCommentTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={!commentText.trim()}>
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Figure Lightbox Modal ── */}
      {lightboxImage && (
        <div className="anara-lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="anara-lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
              {lightboxImage.caption || 'Scientific Figure'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost btn-xs" onClick={() => setImageZoom((z) => Math.min(z + 0.25, 3))} style={{ color: '#fff' }} title="Zoom in">
                <ZoomIn size={14} />
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setImageZoom((z) => Math.max(z - 0.25, 0.5))} style={{ color: '#fff' }} title="Zoom out">
                <ZoomOut size={14} />
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setImageZoom(1)} style={{ color: '#fff' }} title="Reset zoom">
                <RotateCcw size={14} />
              </button>
              <a href={lightboxImage.src} download className="btn btn-ghost btn-xs" style={{ color: '#fff', textDecoration: 'none' }} title="Download image">
                <Download size={14} />
              </a>
              <button className="btn btn-ghost btn-xs" onClick={() => setLightboxImage(null)} style={{ color: '#fff' }} title="Close">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="anara-lightbox-content" onClick={() => setLightboxImage(null)}>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.caption}
              className="anara-lightbox-img"
              style={{ transform: `scale(${imageZoom})` }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
