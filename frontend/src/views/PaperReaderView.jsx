import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Upload, Loader2, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import AnaraPaperReader from '../components/reader/AnaraPaperReader';

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

export default function PaperReaderView() {
  const navigate = useNavigate();
  const { activeReaderPaper, setActiveReaderPaper } = useApp();

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [convertingMarkdown, setConvertingMarkdown] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Resolve PDF url from OA lookup when no direct link
  const fetchOaCandidate = (lookupQuery) => {
    if (!lookupQuery) return;
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
      .catch(() => {});
  };

  useEffect(() => {
    if (!activeReaderPaper) return;

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
    const mdContent = activeReaderPaper.markdown_content || activeReaderPaper.markdown || null;

    setCurrentDoc({ ...activeReaderPaper, pdfUrl: pdfLink, markdown_content: mdContent });
    setInputVal(cleanArxiv || activeReaderPaper.title || pId);

    // Background markdown conversion if missing
    if (!mdContent) {
      const target = cleanArxiv || activeReaderPaper.pdf_url || activeReaderPaper.url || pId;
      if (target) {
        setConvertingMarkdown(true);
        fetch('/api/v1/paper/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: target }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.paper?.markdown) {
              setCurrentDoc((prev) =>
                prev
                  ? {
                      ...prev,
                      markdown_content: data.paper.markdown,
                      figures: data.paper.figures || prev.figures,
                    }
                  : null
              );
            }
          })
          .catch((err) => console.warn('[PaperReaderView] markdown bg conversion:', err))
          .finally(() => setConvertingMarkdown(false));
      }
    }

    if (!pdfLink) {
      fetchOaCandidate(
        cleanArxiv || activeReaderPaper.doi || pId || activeReaderPaper.title
      );
    }
  }, [activeReaderPaper]);

  const handleExtract = async () => {
    const query = inputVal.trim();
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

  // ─── No paper: show input UI ─────────────────────────────────────────────
  if (!currentDoc) {
    return (
      <section
        id="view-pdf-inspector"
        className="view-panel active"
        style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        <div className="panel-header" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Paper Reader
          </h1>
          <p
            className="panel-subtitle"
            style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)' }}
          >
            Read any research paper with AI assistance — enter an arXiv ID, DOI, URL, or upload a PDF.
          </p>
        </div>

        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
              placeholder="arXiv ID (e.g. 1706.03762), DOI, URL, or paper title..."
              style={{
                flex: 1,
                minWidth: 260,
                padding: '8px 12px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              className="btn btn-primary"
              onClick={handleExtract}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={14} />
              <span>{loading ? 'Loading...' : 'Read Paper'}</span>
            </button>
            <label
              className="btn btn-secondary"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
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
            <div
              style={{
                display: 'flex',
                marginTop: 10,
                fontSize: 12.5,
                color: 'var(--accent-primary)',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              <span>Converting PDF to Markdown with PyMuPDF4LLM…</span>
            </div>
          )}
          {errorMessage && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--accent-rose)' }}>
              {errorMessage}
            </div>
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <div>
            <BookOpen size={44} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
            <p style={{ fontSize: 13, margin: 0 }}>
              No paper loaded. Enter an identifier above to get started.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ─── Paper loaded: Anara-style reader ────────────────────────────────────
  return (
    <section
      id="view-pdf-inspector"
      className="view-panel active"
      style={{
        padding: 0,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Compact input bar — stays for loading different papers */}
      <div
        style={{
          padding: '7px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
          placeholder="Load a different paper: arXiv ID, DOI, URL..."
          style={{
            flex: 1,
            padding: '5px 10px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12.5,
            background: 'var(--bg-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleExtract}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
        >
          <Sparkles size={13} />
          <span>{loading ? 'Loading…' : 'Load'}</span>
        </button>
        <label
          className="btn btn-secondary btn-sm"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
        >
          <Upload size={13} />
          <span>Upload</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
        {convertingMarkdown && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--accent-primary)',
              flexShrink: 0,
            }}
          >
            <Loader2 size={12} className="animate-spin" />
            <span>Extracting markdown…</span>
          </div>
        )}
        {errorMessage && (
          <span style={{ fontSize: 12, color: 'var(--accent-rose)', flexShrink: 0 }}>
            {errorMessage}
          </span>
        )}
      </div>

      {/* Anara Reader fills remaining height */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AnaraPaperReader
          paper={currentDoc}
          pdfUrl={currentDoc.pdfUrl}
          markdownContent={currentDoc.markdown_content}
          onBack={() => navigate(-1)}
          backLabel="Back"
        />
      </div>
    </section>
  );
}
