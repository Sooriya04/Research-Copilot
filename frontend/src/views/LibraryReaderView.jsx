import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Loader2 } from 'lucide-react';
import AnaraPaperReader from '../components/reader/AnaraPaperReader';

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

  const [converting, setConverting] = useState(false);

  // If paper lacks markdown, attempt background conversion via PyMuPDF4LLM
  useEffect(() => {
    if (!paper) return;
    const hasMarkdown = !!(paper.markdown || paper.markdown_content);
    if (!hasMarkdown && (paper.arxiv_id || paper.url || paper.pdf_url || paper.id)) {
      const ident = paper.arxiv_id || paper.url || paper.pdf_url || paper.id;
      setConverting(true);
      fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: ident }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.paper?.markdown) {
            const updated = {
              ...paper,
              markdown: data.paper.markdown,
              markdown_content: data.paper.markdown,
              figures: data.paper.figures || paper.figures,
              sections: data.paper.sections || paper.sections,
            };
            setPaper(updated);
            try {
              localStorage.setItem('rc_active_library_paper', JSON.stringify(updated));
              const savedList = JSON.parse(localStorage.getItem('rc_user_library_papers_v2') || '[]');
              const updatedList = savedList.map((p) => (p.id === paper.id ? { ...p, ...updated } : p));
              localStorage.setItem('rc_user_library_papers_v2', JSON.stringify(updatedList));
            } catch {}
          }
        })
        .catch((err) => console.warn('Library paper markdown conversion error:', err))
        .finally(() => setConverting(false));
    }
  }, [paper?.id]);

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
  const markdownContent = paper.markdown_content || paper.markdown || null;

  return (
    <section className="view-panel active" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
      {converting && (
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 14px',
            fontSize: 12.5,
            color: 'var(--accent-primary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <Loader2 size={13} className="animate-spin" />
          <span>Extracting markdown with PyMuPDF4LLM…</span>
        </div>
      )}
      <AnaraPaperReader
        paper={paper}
        pdfUrl={pdfUrl}
        markdownContent={markdownContent}
        onBack={() => navigate('/library')}
        backLabel="Library"
      />
    </section>
  );
}
