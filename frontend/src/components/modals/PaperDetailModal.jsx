import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function PaperDetailModal() {
  const { selectedPaper, closePaperModal, setActiveReaderPaper } = useApp();
  const navigate = useNavigate();

  if (!selectedPaper) return null;

  const title = selectedPaper.title || 'Untitled Research Paper';
  const abstract = selectedPaper.abstract || 'No abstract preview available for this document.';
  const source = selectedPaper.primary_source || selectedPaper.source || 'OpenAlex';
  const url = selectedPaper.url || selectedPaper.pdf_url;

  const authorsList = (selectedPaper.authors || []).map(a => (typeof a === 'string' ? a : a.name)).join(', ');

  const openInReader = () => {
    setActiveReaderPaper(selectedPaper);
    closePaperModal();
    navigate('/pdf-inspector');
  };

  return (
    <div
      className="modal-overlay"
      id="paper-modal-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => {
        if (e.target.id === 'paper-modal-overlay') closePaperModal();
      }}
    >
      <div className="cmd-palette-card" style={{ width: 620, padding: 22, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-blue" style={{ textTransform: 'uppercase' }}>
              {source}
            </span>
            {selectedPaper.year && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedPaper.year}</span>
            )}
          </div>
          <button
            onClick={closePaperModal}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
          {title}
        </h2>

        {authorsList && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
            <strong>Authors:</strong> {authorsList}
          </p>
        )}

        <div style={{ background: 'var(--bg-subtle)', padding: 12, borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            Abstract & Findings
          </h4>
          <p style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.55 }}>
            {abstract}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ExternalLink size={13} />
              <span>Source Document</span>
            </a>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={openInReader}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={13} />
            <span>Open in Paper Reader</span>
          </button>
        </div>
      </div>
    </div>
  );
}
