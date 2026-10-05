import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Upload, Loader2, BookOpen, ExternalLink, Download, FileText, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

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
  const [resolvingPdf, setResolvingPdf] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

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

    setCurrentDoc({ ...activeReaderPaper, pdfUrl: pdfLink });
    setInputVal(cleanArxiv || activeReaderPaper.title || pId);

    if (!pdfLink) {
      setResolvingPdf(true);
      fetchOaCandidate(
        cleanArxiv || activeReaderPaper.doi || pId || activeReaderPaper.title
      );
    } else {
      setResolvingPdf(false);
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
              <span>Fetching paper publication…</span>
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

  // ─── Paper loaded: Default PDF Reader ─────────────────────────────────────
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
      {/* Top Header / Bar */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 300px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentDoc(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', fontSize: 12 }}
            title="Load another paper"
          >
            <ArrowLeft size={13} />
            <span>Close</span>
          </button>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <h2
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={currentDoc.title || 'Untitled Document'}
            >
              {currentDoc.title || 'Untitled Document'}
            </h2>
            {currentDoc.authors && (
              <p
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {Array.isArray(currentDoc.authors) ? currentDoc.authors.join(', ') : currentDoc.authors}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {currentDoc.pdfUrl && (
            <>
              <a
                href={currentDoc.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              >
                <ExternalLink size={13} />
                <span>Open In Tab</span>
              </a>
              <a
                href={currentDoc.pdfUrl}
                download={currentDoc.title ? `${currentDoc.title.slice(0, 40)}.pdf` : 'paper.pdf'}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              >
                <Download size={13} />
                <span>Download</span>
              </a>
            </>
          )}

          {/* Quick inline loader */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
              placeholder="arXiv / DOI..."
              style={{
                width: 140,
                padding: '4px 8px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleExtract}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
            >
              <Sparkles size={12} />
              <span>{loading ? '…' : 'Load'}</span>
            </button>
            <label
              className="btn btn-secondary btn-sm"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
              title="Upload PDF file"
            >
              <Upload size={12} />
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Default Native Browser PDF Viewer */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-subtle)' }}>
        {resolvingPdf ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 28, textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: 14 }} />
            <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Locating Open-Access PDF Stream
            </h4>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5 }}>
              Connecting to arXiv and academic repositories to stream publication...
            </p>
          </div>
        ) : currentDoc.pdfUrl ? (
          <object
            data={currentDoc.pdfUrl}
            type="application/pdf"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          >
            <iframe
              title="PDF Preview Frame"
              src={currentDoc.pdfUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
            >
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p style={{ marginBottom: 12 }}>Unable to display inline PDF in this browser frame.</p>
                <a
                  href={currentDoc.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Open PDF Directly
                </a>
              </div>
            </iframe>
          </object>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center' }}>
            <FileText size={44} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
            <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Direct PDF Stream Unavailable
            </h4>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.5, marginBottom: 16 }}>
              Could not resolve an open-access PDF stream for this publication. You can visit the publication page or upload a local copy.
            </p>
            {currentDoc.url && (
              <a
                href={currentDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={13} />
                <span>Open Source Publication</span>
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
