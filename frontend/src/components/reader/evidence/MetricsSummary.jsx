import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function MetricsSummary({ metrics = [], onJumpToSource }) {
  if (metrics.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
        No numerical metrics reported in paper text.
      </div>
    );
  }

  return (
    <div className="metrics-summary-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {metrics.map((m) => (
        <div
          key={m.id}
          className="metric-summary-card"
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              {m.label} {m.unit ? `(${m.unit})` : ''}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0' }}>
              {m.display_value}
            </div>
            {m.context && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #475569)' }}>
                {m.context}
              </div>
            )}
          </div>

          {m.source_ref && (
            <button
              type="button"
              onClick={() => onJumpToSource(m.source_ref)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle, #cbd5e1)',
                background: 'var(--bg-subtle, #f8fafc)',
                color: 'var(--text-secondary, #334155)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>p.{m.source_ref.page || 1}</span>
              <ArrowRight size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
