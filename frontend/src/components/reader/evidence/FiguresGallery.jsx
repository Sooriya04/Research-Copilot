import React, { useState } from 'react';
import { ExternalLink, ZoomIn, X, Image as ImageIcon, Table as TableIcon } from 'lucide-react';

export default function FiguresGallery({ figures = [], onJumpToPage, onHighlightEvidence }) {
  const [filterType, setFilterType] = useState('all'); // 'all' | 'figure' | 'table'
  const [selectedAsset, setSelectedAsset] = useState(null);

  if (figures.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
        <ImageIcon size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
        <div style={{ fontSize: '12px', fontWeight: 500 }}>No visual figures or tables detected.</div>
        <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
          Figures and tables will appear here once ingested from PDF vector streams.
        </div>
      </div>
    );
  }

  const figureList = figures.filter((f) => f.asset_type === 'figure');
  const tableList = figures.filter((f) => f.asset_type === 'table');

  const displayedAssets =
    filterType === 'figure'
      ? figureList
      : filterType === 'table'
      ? tableList
      : figures;

  const handleJump = (fig) => {
    const pageNum = Number(fig.page) || 1;
    if (onHighlightEvidence && fig.bbox && fig.bbox.length === 4) {
      onHighlightEvidence({
        page: pageNum,
        quote: fig.label,
        text: fig.caption || fig.label,
        highlight_rects: [
          {
            x: fig.bbox[0] / 612.0,
            y: fig.bbox[1] / 792.0,
            width: (fig.bbox[2] - fig.bbox[0]) / 612.0,
            height: (fig.bbox[3] - fig.bbox[1]) / 792.0,
          },
        ],
      });
    } else if (onJumpToPage) {
      onJumpToPage(pageNum);
    }
  };

  return (
    <div className="figures-gallery-section" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Filter Pills ── */}
      <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '8px' }}>
        {[
          { key: 'all', label: 'All', count: figures.length },
          { key: 'figure', label: 'Figures', count: figureList.length },
          { key: 'table', label: 'Tables', count: tableList.length },
        ].map((tab) => {
          const isActive = filterType === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterType(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? '#6366f1' : 'var(--bg-subtle, #f1f5f9)',
                color: isActive ? '#ffffff' : 'var(--text-secondary, #475569)',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              <span>{tab.label}</span>
              <span style={{ opacity: 0.8, fontSize: '10px' }}>({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Asset Cards ── */}
      {displayedAssets.map((fig) => {
        const isTable = fig.asset_type === 'table';
        return (
          <div
            key={fig.id}
            className="figure-asset-card"
            style={{
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: '8px',
              padding: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isTable ? <TableIcon size={13} color="#059669" /> : <ImageIcon size={13} color="#6366f1" />}
                <span style={{ fontWeight: 700, fontSize: '12px', color: isTable ? '#059669' : '#6366f1' }}>
                  {fig.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {fig.image_data_url && (
                  <button
                    type="button"
                    onClick={() => setSelectedAsset(fig)}
                    title="Zoom Asset"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '3px',
                      cursor: 'pointer',
                      color: 'var(--text-muted, #64748b)',
                    }}
                  >
                    <ZoomIn size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleJump(fig)}
                  title={`Jump to page ${fig.page}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
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
            </div>

            {/* Rendered Asset Image */}
            {fig.image_data_url && (
              <div
                onClick={() => setSelectedAsset(fig)}
                style={{
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  marginBottom: '8px',
                  background: '#ffffff',
                  textAlign: 'center',
                  cursor: 'zoom-in',
                  position: 'relative',
                }}
              >
                <img
                  src={fig.image_data_url}
                  alt={fig.label}
                  style={{ maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
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
        );
      })}

      {/* ── High-Resolution Lightbox Modal ── */}
      {selectedAsset && (
        <div
          onClick={() => setSelectedAsset(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                {selectedAsset.label} (Page {selectedAsset.page})
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '16px', overflow: 'auto', textAlign: 'center', background: '#f8fafc' }}>
              <img
                src={selectedAsset.image_data_url}
                alt={selectedAsset.label}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            </div>
            <div style={{ padding: '12px 16px', fontSize: '12px', color: '#334155', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
              {selectedAsset.caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
