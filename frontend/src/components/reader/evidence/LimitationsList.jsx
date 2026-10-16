import React from 'react';

export default function LimitationsList({ limitations = [], onJumpToSource }) {
  if (limitations.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
        No explicitly documented limitations extracted.
      </div>
    );
  }

  return (
    <div className="limitations-list-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {limitations.map((lim) => (
        <div
          key={lim.id}
          className="limitation-item-card"
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderLeft: '3px solid #f59e0b',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: '#d97706' }}>
              {lim.kind}
            </span>
            {lim.source_ref && (
              <button
                type="button"
                onClick={() => onJumpToSource(lim.source_ref)}
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  background: 'transparent',
                  fontSize: '10.5px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                p.{lim.source_ref.page || 1}
              </button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {lim.statement}
          </div>
        </div>
      ))}
    </div>
  );
}
