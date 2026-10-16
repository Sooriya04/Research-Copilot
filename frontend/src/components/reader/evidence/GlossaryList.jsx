import React from 'react';

export default function GlossaryList({ glossary = [], onJumpToSource }) {
  if (glossary.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
        No paper-specific glossary terms identified.
      </div>
    );
  }

  return (
    <div className="glossary-list-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {glossary.map((item, idx) => (
        <div
          key={idx}
          className="glossary-term-card"
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#6366f1' }}>
              {item.term}
            </span>
            {item.source_ref && (
              <button
                type="button"
                onClick={() => onJumpToSource(item.source_ref)}
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
                p.{item.source_ref.page || 1}
              </button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #334155)', lineHeight: 1.4 }}>
            {item.definition}
          </div>
        </div>
      ))}
    </div>
  );
}
