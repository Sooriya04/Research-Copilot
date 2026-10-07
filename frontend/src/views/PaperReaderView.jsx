import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Upload,
  Loader2,
  BookOpen,
  ExternalLink,
  Download,
  FileText,
  ArrowLeft,
  MessageSquare,
  Search,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Highlighter,
  FileEdit,
  Copy,
  Check,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PaperReaderSidebar from '../components/reader/PaperReaderSidebar';
import { EvidenceHighlightBanner } from '../components/reader/EvidenceDrawer';

function extractArxivId(idStr) {
  if (!idStr) return null;
  const s = String(idStr).trim();
  const urlMatch = s.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})(?:\.pdf)?/i);
  if (urlMatch) return urlMatch[1];
  const prefixMatch = s.match(/^arxiv:\s*([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})$/i);
  if (prefixMatch) return prefixMatch[1];
  const exactMatch = s.match(/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/i);
  if (exactMatch) return exactMatch[1];
  const oldExact = s.match(/^([a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})$/i);
  if (oldExact) return oldExact[1];
  return null;
}

function buildProxyPdfUrl(directUrl) {
  if (!directUrl) return null;
  const t = String(directUrl).trim();
  if (t.startsWith('blob:') || t.startsWith('data:')) return t;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return `/api/v1/pdf/proxy?url=${encodeURIComponent(t)}`;
  }
  return null;
}

function resolvePaperPdf(paper) {
  if (!paper) return null;
  if (paper.pdf_url && (paper.pdf_url.startsWith('http') || paper.pdf_url.startsWith('blob'))) {
    if (paper.pdf_url.includes('arxiv.org/')) {
      const aid = extractArxivId(paper.pdf_url);
      if (aid) return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
    }
    return buildProxyPdfUrl(paper.pdf_url);
  }
  if (paper.arxiv_id) {
    const aid = extractArxivId(paper.arxiv_id);
    if (aid) return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
  }
  const fromId = extractArxivId(paper.id);
  if (fromId) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromId}.pdf`);
  const fromCanonical = extractArxivId(paper.canonical_id);
  if (fromCanonical) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromCanonical}.pdf`);
  const fromUrl = extractArxivId(paper.url);
  if (fromUrl) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromUrl}.pdf`);
  return null;
}

const SAMPLE_PAPERS = [
  {
    title: 'HalluCounter: Towards Holistic Hallucination Evaluation',
    arxiv_id: '2503.04615',
    authors: ['Sooriya et al.'],
    year: '2025',
    abstract: 'HalluCounter provides fine-grained, holistic evaluation and detection for hallucinations in large language models.',
  },
  {
    title: 'Attention Is All You Need',
    arxiv_id: '1706.03762',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
    year: '2017',
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, based solely on attention mechanisms.',
  },
  {
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via RL',
    arxiv_id: '2501.12948',
    authors: ['DeepSeek-AI'],
    year: '2025',
    abstract: 'We present DeepSeek-R1, which demonstrates that reasoning capabilities can be incentivized directly through large-scale reinforcement learning.',
  },
  {
    title: 'LoRA: Low-Rank Adaptation of Large Language Models',
    arxiv_id: '2106.09685',
    authors: ['Edward J. Hu', 'Yelong Shen', 'Phillip Wallis', 'Zeyuan Allen-Zhu'],
    year: '2021',
    abstract: 'An efficient adaptation strategy that freezes pretrained model weights and injects trainable rank decomposition matrices.',
  },
];

export default function PaperReaderView() {
  const navigate = useNavigate();
  const { activeReaderPaper, setActiveReaderPaper } = useApp();

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvingPdf, setResolvingPdf] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Document Toolbar Controls
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(12);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(false);
  const [inDocSearch, setInDocSearch] = useState('');
  const [highlightActive, setHighlightActive] = useState(false);
  const [annotationActive, setAnnotationActive] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState(null); // { page, section, quote, confidence, type }

  const handleHighlightEvidence = (evidence) => {
    if (!evidence) return;
    setActiveHighlight(evidence);
    if (evidence.page) {
      setCurrentPage(Number(evidence.page) || 1);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (moreMenuOpen && !e.target.closest('.reader-dropdown-container')) {
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [moreMenuOpen]);

  // Resolve PDF url from OA lookup when no direct link
  const fetchOaCandidate = (lookupQuery) => {
    if (!lookupQuery) return;
    setResolvingPdf(true);
    fetch(`/api/v1/paper/${encodeURIComponent(lookupQuery)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.paper?.pdf_url) {
          const proxied = buildProxyPdfUrl(data.paper.pdf_url);
          if (proxied) setCurrentDoc((prev) => (prev ? { ...prev, pdfUrl: proxied } : null));
          return;
        }
        if (data?.candidates?.length > 0) {
          const best = data.candidates.find((c) => c.format === 'pdf') || data.candidates[0];
          if (best?.url) {
            const proxied = buildProxyPdfUrl(best.url);
            if (proxied) setCurrentDoc((prev) => (prev ? { ...prev, pdfUrl: proxied } : null));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setResolvingPdf(false);
      });
  };

  useEffect(() => {
    // If activeReaderPaper exists in context, load it
    if (activeReaderPaper) {
      const pId =
        activeReaderPaper.id ||
        activeReaderPaper.arxiv_id ||
        activeReaderPaper.canonical_id ||
        '';
      const cleanArxiv =
        extractArxivId(pId) ||
        extractArxivId(activeReaderPaper.arxiv_id) ||
        extractArxivId(activeReaderPaper.url);
      const pdfLink = resolvePaperPdf(activeReaderPaper);

      setCurrentDoc({ ...activeReaderPaper, pdfUrl: pdfLink });
      setInputVal(cleanArxiv || activeReaderPaper.title || pId);

      if (!pdfLink) {
        setResolvingPdf(true);
        fetchOaCandidate(cleanArxiv || activeReaderPaper.doi || pId || activeReaderPaper.title);
      } else {
        setResolvingPdf(false);
      }
      return;
    }

    // Check localStorage fallback for library paper
    try {
      const saved = localStorage.getItem('rc_active_library_paper');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.title || parsed?.id || parsed?.arxiv_id) {
          const pdfLink = resolvePaperPdf(parsed);
          setCurrentDoc({ ...parsed, pdfUrl: pdfLink });
          if (!pdfLink) {
            fetchOaCandidate(parsed.arxiv_id || parsed.doi || parsed.id || parsed.title);
          }
        }
      }
    } catch {}

    // Ensure paper RAG chunks & embeddings are indexed in SQLite
    const activeDoc = activeReaderPaper || (localStorage.getItem('rc_active_library_paper') ? JSON.parse(localStorage.getItem('rc_active_library_paper')) : null);
    const paperId = activeDoc?.id || activeDoc?.arxiv_id;
    if (paperId) {
      fetch(`/api/v1/papers/${encodeURIComponent(paperId)}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeDoc.title || 'Research Paper',
          abstract: activeDoc.abstract || '',
          pages: activeDoc.sections?.map((s, idx) => ({
            page_number: idx + 1,
            text: `${s.title}\n\n${s.content}`,
          })) || null,
          doi: activeDoc.doi || null,
          arxiv_id: activeDoc.arxiv_id || null,
          authors: Array.isArray(activeDoc.authors) ? activeDoc.authors : [],
        }),
      }).catch(() => {});
    }
  }, [activeReaderPaper]);

  const handleExtract = async (overrideQuery) => {
    const query = (overrideQuery || inputVal).trim();
    if (!query || loading) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: query }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveReaderPaper(data.paper);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.detail || 'Failed to import paper.');
      }
    } catch (err) {
      setErrorMessage(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/paper/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const paper = await res.json();
        paper.pdf_url = URL.createObjectURL(file);
        paper.markdown_content = paper.markdown;
        setActiveReaderPaper(paper);
      } else {
        setErrorMessage(`Upload error: ${await res.text()}`);
      }
    } catch (err) {
      setErrorMessage(`Upload error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = (sample) => {
    setInputVal(sample.arxiv_id);
    setActiveReaderPaper(sample);
  };

  const formatAuthors = (authors) => {
    if (!authors) return 'Academic Authors';
    if (typeof authors === 'string') return authors;
    if (Array.isArray(authors)) {
      const list = authors
        .map((a) => {
          if (!a) return '';
          if (typeof a === 'string') return a.trim();
          if (typeof a === 'object') return (a.name || a.author || a.display_name || '').trim();
          return String(a).trim();
        })
        .filter(Boolean);
      return list.length > 0 ? list.join(', ') : 'Academic Authors';
    }
    return String(authors);
  };

  const handleCopyBibtex = () => {
    if (!currentDoc) return;
    const authorList = Array.isArray(currentDoc.authors)
      ? currentDoc.authors
          .map((a) => (typeof a === 'object' && a ? a.name || a.author || a.display_name || '' : String(a)))
          .filter(Boolean)
      : [typeof currentDoc.authors === 'string' ? currentDoc.authors : 'Unknown'];
    const firstAuthor = (authorList[0] || 'author').split(' ').pop().toLowerCase();
    const year = currentDoc.year || '2025';
    const bib = `@article{${firstAuthor}${year},
  title={${currentDoc.title || 'Untitled'}},
  author={${authorList.join(' and ')}},
  journal={arXiv preprint arXiv:${cleanArxiv || ''}},
  year={${year}}
}`;
    navigator.clipboard.writeText(bib);
    setCopiedBibtex(true);
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  const handleCopyLink = () => {
    if (!currentDoc) return;
    const link = currentDoc.url || (currentDoc.arxiv_id ? `https://arxiv.org/abs/${currentDoc.arxiv_id}` : window.location.href);
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Metadata labels
  const cleanArxiv =
    currentDoc &&
    (extractArxivId(currentDoc.arxiv_id) ||
      extractArxivId(currentDoc.id) ||
      extractArxivId(currentDoc.url));
  const doi = currentDoc?.doi;
  const badgeLabel = cleanArxiv ? `arXiv: ${cleanArxiv}` : doi ? `DOI: ${doi}` : 'Preprint';
  const badgeUrl = cleanArxiv
    ? `https://arxiv.org/abs/${cleanArxiv}`
    : doi
    ? `https://doi.org/${doi}`
    : currentDoc?.url;

  const authorsText = formatAuthors(currentDoc?.authors);

  const downloadFilename = currentDoc?.title
    ? `${currentDoc.title.slice(0, 36).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    : 'research_paper.pdf';

  // ─── No paper: show clean reading desk empty state ─────────────────────────
  if (!currentDoc) {
    return (
      <div className="reader-workspace-root">
        <div className="reader-center-panel">
          {/* Top Bar Placeholder */}
          <div className="reader-topbar">
            <div className="reader-topbar-left">
              <button
                type="button"
                className="reader-topbar-btn"
                onClick={() => navigate(-1)}
                title="Back"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <div className="reader-meta-divider" />
              <h1 className="reader-paper-title" style={{ color: 'var(--text-muted)' }}>
                Paper Reader Workspace
              </h1>
            </div>
            <div className="reader-topbar-right">
              <button
                type="button"
                className={`reader-topbar-btn ${sidebarOpen ? 'active' : ''}`}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <MessageSquare size={13} />
                <span>AI Copilot</span>
              </button>
            </div>
          </div>

          {/* Reading Canvas with Minimal Desk Card */}
          <div className="reader-canvas" style={{ alignItems: 'center' }}>
            <div className="reader-empty-sheet">
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'rgba(99, 102, 241, 0.08)',
                    color: 'var(--accent-violet, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <FileText size={22} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                  Research Paper Reader
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Read any research paper with AI assistance — enter an arXiv ID, DOI, URL, or upload a PDF.
                </p>
              </div>

              {/* Input Row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                  placeholder="arXiv ID (e.g. 2503.04615, 1706.03762), DOI, or title..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 8,
                    fontSize: 13,
                    background: 'var(--bg-subtle, #f4f4f5)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="reader-topbar-btn primary"
                  onClick={() => handleExtract()}
                  disabled={loading}
                  style={{ padding: '0 14px', height: 38 }}
                >
                  <Sparkles size={14} />
                  <span>{loading ? 'Loading…' : 'Read Paper'}</span>
                </button>
                <label
                  className="reader-topbar-btn"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 38,
                    padding: '0 12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    background: 'var(--bg-card, #ffffff)',
                  }}
                >
                  <Upload size={14} />
                  <span>Upload PDF</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--accent-violet, #6366f1)', marginBottom: 16 }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Resolving publication and open-access stream…</span>
                </div>
              )}

              {errorMessage && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontSize: 12.5, marginBottom: 16 }}>
                  {errorMessage}
                </div>
              )}

              {/* Quick Sample Papers */}
              <div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 10 }}>
                  Quick Start Sample Papers
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SAMPLE_PAPERS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleLoadSample(sample)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border-subtle, #e2e8f0)',
                        background: 'var(--bg-card, #ffffff)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-violet, #6366f1)';
                        e.currentTarget.style.background = 'var(--bg-subtle, #f8fafc)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-subtle, #e2e8f0)';
                        e.currentTarget.style.background = 'var(--bg-card, #ffffff)';
                      }}
                    >
                      <div style={{ minWidth: 0, paddingRight: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {sample.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {sample.authors.join(', ')} • {sample.year}
                        </div>
                      </div>
                      <span className="reader-arxiv-badge">
                        arXiv:{sample.arxiv_id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Assistant Panel */}
        {sidebarOpen && (
          <PaperReaderSidebar
            paper={null}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>
    );
  }

  // ─── Paper Loaded: Full Clean Research IDE Reader ─────────────────────────
  return (
    <div className="reader-workspace-root">
      <div className="reader-center-panel">
        {/* ── 1. Clean Top Bar ── */}
        <div className="reader-topbar">
          <div className="reader-topbar-left">
            <button
              type="button"
              className="reader-topbar-btn"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  setCurrentDoc(null);
                }
              }}
              title="Back"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>

            <div className="reader-meta-divider" />

            {/* Paper Title & Authors */}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <h1 className="reader-paper-title" title={currentDoc.title || 'Untitled Document'}>
                {currentDoc.title || 'Untitled Document'}
              </h1>
              <span className="reader-paper-authors" title={authorsText}>
                {authorsText}
              </span>
            </div>

            {/* arXiv / DOI Badge */}
            {badgeUrl ? (
              <a
                href={badgeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="reader-arxiv-badge"
                title={`Open publication link (${badgeLabel})`}
              >
                <FileText size={11} />
                <span>{badgeLabel}</span>
              </a>
            ) : (
              <span className="reader-arxiv-badge">
                <FileText size={11} />
                <span>{badgeLabel}</span>
              </span>
            )}
          </div>

          <div className="reader-topbar-right">
            {/* Quick search to switch papers */}
            <div className="reader-quick-search" title="Load another paper by arXiv ID, DOI, or title">
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                placeholder="arXiv / DOI..."
              />
            </div>

            {/* Download Button */}
            {currentDoc.pdfUrl && (
              <a
                href={currentDoc.pdfUrl}
                download={downloadFilename}
                className="reader-topbar-btn"
                title="Download PDF"
              >
                <Download size={13} />
                <span>Download</span>
              </a>
            )}

            {/* More Actions Dropdown */}
            <div className="reader-dropdown-container" style={{ position: 'relative' }}>
              <button
                type="button"
                className="reader-topbar-btn"
                onClick={() => setMoreMenuOpen((v) => !v)}
                title="More actions"
              >
                <MoreHorizontal size={14} />
                <span>More</span>
              </button>

              {moreMenuOpen && (
                <div className="reader-dropdown-menu">
                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={handleCopyBibtex}
                  >
                    {copiedBibtex ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                    <span>{copiedBibtex ? 'BibTeX Copied' : 'Copy BibTeX Citation'}</span>
                  </button>

                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={handleCopyLink}
                  >
                    {copiedLink ? <Check size={13} style={{ color: '#10b981' }} /> : <ExternalLink size={13} />}
                    <span>{copiedLink ? 'Link Copied' : 'Copy Paper Link'}</span>
                  </button>

                  {currentDoc.pdfUrl && (
                    <a
                      href={currentDoc.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reader-dropdown-item"
                      style={{ textDecoration: 'none' }}
                      onClick={() => setMoreMenuOpen(false)}
                    >
                      <ExternalLink size={13} />
                      <span>Open PDF in Tab</span>
                    </a>
                  )}

                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={() => {
                      setCurrentDoc(null);
                      setMoreMenuOpen(false);
                    }}
                  >
                    <BookOpen size={13} />
                    <span>Open Another Paper</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. Compact Document Toolbar ── */}
        <div className="reader-doc-toolbar">
          {/* Left: Page Navigation */}
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            <span className="toolbar-page-indicator">
              Page {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>

            <div className="toolbar-divider" />

            {/* Zoom Controls */}
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>

            <span className="toolbar-zoom-label">
              {zoom}%
            </span>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>

            {/* Fit Width */}
            <button
              type="button"
              className={`toolbar-btn ${fitWidth ? 'active' : ''}`}
              onClick={() => setFitWidth((w) => !w)}
              title="Fit to width"
            >
              <Maximize2 size={13} />
              <span>Fit Width</span>
            </button>
          </div>

          {/* Right: In-Paper Search, Highlight, Annotation, AI Copilot Toggle */}
          <div className="toolbar-group">
            {/* Search within paper */}
            <div className="toolbar-search-input" title="Search inside paper text">
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={inDocSearch}
                onChange={(e) => setInDocSearch(e.target.value)}
                placeholder="Find in paper..."
              />
            </div>

            <div className="toolbar-divider" />

            {/* Highlight Tool */}
            <button
              type="button"
              className={`toolbar-btn ${highlightActive ? 'active' : ''}`}
              onClick={() => setHighlightActive((h) => !h)}
              title="Highlight text mode"
            >
              <Highlighter size={13} />
              <span>Highlight</span>
            </button>

            {/* Annotation Tool */}
            <button
              type="button"
              className={`toolbar-btn ${annotationActive ? 'active' : ''}`}
              onClick={() => setAnnotationActive((a) => !a)}
              title="Add note or annotation"
            >
              <FileEdit size={13} />
              <span>Annotation</span>
            </button>

            <div className="toolbar-divider" />

            {/* AI Copilot Drawer Toggle */}
            <button
              type="button"
              className={`toolbar-btn ${sidebarOpen ? 'active' : ''}`}
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? 'Hide AI Assistant' : 'Open AI Assistant'}
            >
              <Sparkles size={13} />
              <span>AI Copilot</span>
            </button>
          </div>
        </div>

        {/* ── 3. Subtle Gray Reading Canvas with Clean White Document Surface ── */}
        <div className="reader-canvas">
          {activeHighlight && (
            <EvidenceHighlightBanner
              highlight={activeHighlight}
              onBackToAnswer={() => {
                setSidebarOpen(true);
                const el = document.querySelector('.reader-assistant-panel');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onDismiss={() => setActiveHighlight(null)}
            />
          )}

          <div
            className="reader-document-sheet"
            style={{
              width: fitWidth ? '100%' : `${Math.round(860 * (zoom / 100))}px`,
              maxWidth: fitWidth ? '1180px' : 'none',
              minHeight: 'calc(100vh - 128px)',
            }}
          >
            {resolvingPdf ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 480, padding: 32, textAlign: 'center' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-violet, #6366f1)', marginBottom: 14 }} />
                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Locating Open-Access PDF Stream
                </h4>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5 }}>
                  Connecting to arXiv and academic repositories to stream publication...
                </p>
              </div>
            ) : currentDoc.pdfUrl ? (
              <object
                data={`${currentDoc.pdfUrl}#page=${currentPage}&zoom=${zoom}`}
                type="application/pdf"
                className="reader-pdf-frame"
              >
                <iframe
                  title="PDF Preview Frame"
                  src={`${currentDoc.pdfUrl}#page=${currentPage}&zoom=${zoom}`}
                  className="reader-pdf-frame"
                >
                  <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <p style={{ marginBottom: 16 }}>Unable to display inline PDF in this frame.</p>
                    <a
                      href={currentDoc.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reader-topbar-btn primary"
                    >
                      Open PDF Directly
                    </a>
                  </div>
                </iframe>
              </object>
            ) : (
              <div style={{ padding: '48px 56px' }}>
                <div style={{ textAlign: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.3, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                    {currentDoc.title || 'Untitled Research Publication'}
                  </h1>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                    {authorsText}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <span className="reader-arxiv-badge">
                      {badgeLabel}
                    </span>
                  </div>
                </div>

                {currentDoc.abstract && (
                  <div
                    style={{
                      background: 'rgba(99, 102, 241, 0.04)',
                      borderLeft: '3px solid var(--accent-violet, #6366f1)',
                      borderRadius: '0 8px 8px 0',
                      padding: '18px 24px',
                      marginBottom: 32,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-violet, #6366f1)', marginBottom: 8 }}>
                      Abstract
                    </div>
                    <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-primary)', margin: 0 }}>
                      {currentDoc.abstract}
                    </p>
                  </div>
                )}

                <div style={{ textAlign: 'center', paddingTop: 20 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
                    Direct inline PDF stream unavailable for this preprint.
                  </p>
                  {badgeUrl && (
                    <a
                      href={badgeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reader-topbar-btn primary"
                      style={{ display: 'inline-flex', padding: '6px 14px' }}
                    >
                      <ExternalLink size={13} />
                      <span>Open Source Publication</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Right AI Assistant Panel ── */}
      {sidebarOpen && (
        <PaperReaderSidebar
          paper={currentDoc}
          onClose={() => setSidebarOpen(false)}
          onJumpToPage={(p) => setCurrentPage(p)}
          onClearContext={() => {
            setCurrentDoc(null);
            setActiveHighlight(null);
          }}
          onHighlightEvidence={handleHighlightEvidence}
        />
      )}
    </div>
  );
}
