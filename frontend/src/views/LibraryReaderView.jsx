import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft, ExternalLink, Download, Loader2, FileText, MessageSquare } from 'lucide-react';
import PaperReaderSidebar from '../components/reader/PaperReaderSidebar';

function buildProxyPdfUrl(url) {
  if (!url) return null;
  const t = String(url).trim();
  if (t.startsWith('blob:') || t.startsWith('data:')) return t;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return `/api/v1/pdf/proxy?url=${encodeURIComponent(t)}`;
  }
  return null;
}

function resolvePdf(paper) {
  if (!paper) return null;
  if (paper.pdf_url) return buildProxyPdfUrl(paper.pdf_url);
  if (paper.arxiv_id) {
    const aid = String(paper.arxiv_id).replace(/^arxiv:/i, '').trim();
    return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
  }
  return null;
}

export default function LibraryReaderView() {
  const navigate = useNavigate();

  const [paper, setPaper] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_active_library_paper');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [resolvingPdf, setResolvingPdf] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Background OA resolution if PDF url is missing
  useEffect(() => {
    if (!paper) return;
    const directPdf = resolvePdf(paper);
    if (!directPdf) {
      const ident = paper.arxiv_id || paper.doi || paper.id || paper.title;
      if (ident) {
        setResolvingPdf(true);
        fetch(`/api/v1/paper/${encodeURIComponent(ident)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.paper?.pdf_url) {
              const proxied = buildProxyPdfUrl(data.paper.pdf_url);
              if (proxied) setPaper((prev) => (prev ? { ...prev, pdf_url: proxied } : null));
              return;
            }
            if (data?.candidates?.length > 0) {
              const best = data.candidates.find((c) => c.format === 'pdf') || data.candidates[0];
              if (best?.url) {
                const proxied = buildProxyPdfUrl(best.url);
                if (proxied) setPaper((prev) => (prev ? { ...prev, pdf_url: proxied } : null));
              }
            }
          })
          .catch(() => {})
          .finally(() => setResolvingPdf(false));
      }
    }
  }, [paper?.id, paper?.arxiv_id, paper?.doi]);

  if (!paper) {
    return (
      <section
        className="view-panel active"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
      >
        <div className="card" style={{ padding: '48px 40px', textAlign: 'center', maxWidth: 440 }}>
          <BookOpen size={40} style={{ color: 'var(--accent-primary)', marginBottom: 16 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            No Paper Selected
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 20 }}>
            Select a paper from your Research Library to read it here.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/library')}
          >
            Go to Library
          </button>
        </div>
      </section>
    );
  }

  const pdfUrl = resolvePdf(paper);

  return (
    <section
      className="view-panel active"
      style={{
        padding: 0,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexShrink: 0,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/library')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', fontSize: 12, flexShrink: 0 }}
          >
            <ArrowLeft size={13} />
            <span>Library</span>
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
              title={paper.title || 'Untitled Document'}
            >
              {paper.title || 'Untitled Document'}
            </h2>
            {paper.authors && (
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
                {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {pdfUrl && (
            <>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              >
                <ExternalLink size={13} />
                <span>Open In Tab</span>
              </a>
              <a
                href={pdfUrl}
                download={paper.title ? `${paper.title.slice(0, 40)}.pdf` : 'paper.pdf'}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
              >
                <Download size={13} />
                <span>Download</span>
              </a>
            </>
          )}

          <button
            type="button"
            className={`btn ${sidebarOpen ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setSidebarOpen((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            title={sidebarOpen ? 'Hide Copilot Drawer' : 'Open Copilot Drawer'}
          >
            <MessageSquare size={13} />
            <span>{sidebarOpen ? 'Hide Copilot' : 'Copilot & Benchmarks'}</span>
          </button>
        </div>
      </div>

      {/* Main Container: Native PDF on Left, Copilot Sidebar on Right */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
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
          ) : pdfUrl ? (
            <object
              data={pdfUrl}
              type="application/pdf"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            >
              <iframe
                title="PDF Preview Frame"
                src={pdfUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
              >
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <p style={{ marginBottom: 12 }}>Unable to display inline PDF in this browser frame.</p>
                  <a
                    href={pdfUrl}
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
                Could not resolve an open-access PDF stream for this publication.
              </p>
              {paper.url && (
                <a
                  href={paper.url}
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

        {/* Right Copilot Drawer (Chat, Benchmarks & Details) */}
        {sidebarOpen && (
          <PaperReaderSidebar
            paper={paper}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </section>
  );
}
