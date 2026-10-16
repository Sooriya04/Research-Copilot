import React from 'react';
import { ExternalLink } from 'lucide-react';

export default function FiguresGallery({ figures = [], onJumpToPage }) {
  if (figures.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
        No visual figures or tables detected in PDF vector streams.
      </div>
    );
  }

  return (
    <div className="figures-gallery-section" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {figures.map((fig) => (
        <div
          key={fig.id}
          className="figure-asset-card"
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '12px', color: '#6366f1' }}>
              {fig.label}
            </span>
            <button
              type="button"
              onClick={() => onJumpToPage && onJumpToPage(fig.page)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 7px',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle, #cbd5e1)',
                background: 'var(--bg-subtle, #f8fafc)',
                fontSize: '11px',
                color: 'var(--text-secondary, #475569)',
                cursor: 'pointer',
              }}
            >
              <span>p.{fig.page}</span>
              <ExternalLink size={10} />
            </button>
          </div>

          {/* Rendered Asset Image */}
          {fig.image_data_url && (
            <div
              style={{
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                marginBottom: '8px',
                background: '#ffffff',
                textAlign: 'center',
              }}
            >
              <img
                src={fig.image_data_url}
                alt={fig.label}
                style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
            </div>
          )}

          <div style={{ fontSize: '11.5px', color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: '4px' }}>
            {fig.caption}
          </div>

          {fig.why_it_matters && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {fig.why_it_matters}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
