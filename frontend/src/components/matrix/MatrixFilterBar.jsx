import React from 'react';
import { Search, X } from 'lucide-react';

export default function MatrixFilterBar({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  includeOurs,
  setIncludeOurs,
}) {
  const tabs = [
    { id: 'taxonomy', label: 'Feature Matrix (Taxonomy)' },
    { id: 'all', label: 'All Dimensions' },
    { id: 'gaps', label: 'Research Gaps' },
    { id: 'methodology', label: 'Methodology' },
    { id: 'code', label: 'Code & Artifacts' },
    { id: 'benchmarks', label: 'Benchmarks' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
      }}
    >
      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontSize: 11.5,
              padding: '5px 12px',
              borderRadius: 'var(--radius-xs)',
              border: 'none',
              background: activeTab === tab.id ? 'var(--accent-primary, #2563eb)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quick Search & Ours Toggle */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setIncludeOurs(!includeOurs)}
          style={{
            fontSize: 11.5,
            padding: '4px 10px',
            borderRadius: 'var(--radius-xs)',
            border: `1px solid ${includeOurs ? 'var(--accent-primary, #2563eb)' : 'var(--border-subtle)'}`,
            background: includeOurs ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-card)',
            color: includeOurs ? 'var(--accent-primary, #2563eb)' : 'var(--text-secondary)',
            fontWeight: includeOurs ? 600 : 400,
            cursor: 'pointer',
          }}
          title="Include 'Proposed Method (Ours)' column for paper submission"
        >
          {includeOurs ? '✓ Ours Column Included' : "+ Add 'Ours' Column"}
        </button>

        <div style={{ position: 'relative', width: 220 }}>
          <Search
            size={12}
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search matrix rows..."
            style={{
              width: '100%',
              fontSize: 11.5,
              padding: '4px 8px 4px 26px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
