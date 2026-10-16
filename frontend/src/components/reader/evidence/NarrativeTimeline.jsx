import React from 'react';

export default function NarrativeTimeline({ timeline = [], onJumpToPage }) {
  if (timeline.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
        No narrative timeline generated.
      </div>
    );
  }

  return (
    <div className="narrative-timeline-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative', paddingLeft: '8px' }}>
      {timeline.map((node, idx) => (
        <div
          key={idx}
          className="timeline-node-item"
          style={{
            display: 'flex',
            gap: '10px',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--accent-violet, #6366f1)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              flexShrink: 0,
              zIndex: 2,
            }}
          >
            {idx + 1}
          </div>

          <div
            style={{
              flex: 1,
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                {node.title}
              </span>
              {node.page && (
                <button
                  type="button"
                  onClick={() => onJumpToPage && onJumpToPage(node.page)}
                  style={{
                    padding: '1px 5px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    background: 'transparent',
                    fontSize: '10.5px',
                    color: '#6366f1',
                    cursor: 'pointer',
                  }}
                >
                  p.{node.page}
                </button>
              )}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              {node.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
