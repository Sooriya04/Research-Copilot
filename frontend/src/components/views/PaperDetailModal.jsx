import React from 'react';
import { Icons } from '../common/Icons.jsx';

export function PaperDetailModal({ paper, onClose, onExtractPdf, onNavigateView }) {
  if (!paper) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <span className="badge-mono badge-openalex">
              {(paper.source || paper.provider || 'PAPER').toUpperCase()}
            </span>
            <h3>Paper Inspector</h3>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <Icons.X width={16} height={16} />
          </button>
        </div>

        <div className="modal-body">
          <h2 className="paper-title mb-4">{paper.title}</h2>

          <div className="inspector-meta-list mb-4">
            <div className="inspector-meta-item">
              <span>Authors:</span>
              <strong>
                {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown')}
              </strong>
            </div>
            {paper.year && (
              <div className="inspector-meta-item">
                <span>Year:</span>
                <strong>{paper.year}</strong>
              </div>
            )}
            {paper.citations !== undefined && (
              <div className="inspector-meta-item">
                <span>Citations:</span>
                <strong>{paper.citations}</strong>
              </div>
            )}
          </div>

          {paper.abstract && (
            <div className="mb-6">
              <h4 className="text-xs font-mono uppercase text-muted mb-2">Abstract</h4>
              <p className="paper-abstract" style={{ WebkitLineClamp: 'none' }}>{paper.abstract}</p>
            </div>
          )}

          <div className="flex gap-4 mt-6">
            {paper.pdf_url && (
              <button
                className="btn-primary"
                onClick={() => {
                  onExtractPdf(paper);
                  onClose();
                }}
              >
                <Icons.PaperReader width={14} height={14} />
                <span>Open in Paper Reader</span>
              </button>
            )}

            {paper.url && (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <span>View Publisher Source</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
