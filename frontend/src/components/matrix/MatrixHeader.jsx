import React from 'react';
import { Columns3, Database, Download, Copy, FileText, CheckSquare, RefreshCw, X, Network } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MatrixHeader({
  activePapersCount,
  hasMatrixData,
  matrixLoading,
  onExportCSV,
  onExportMarkdown,
  onExportLaTeX,
  onExportTaxonomyLaTeX,
  onRefresh,
  onClear,
  canClear,
}) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 18,
        paddingBottom: 16,
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-blue-subtle, rgba(59, 130, 246, 0.12))',
              color: 'var(--accent-blue, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Columns3 size={18} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Feature Comparison Matrix
          </h2>
          <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 600 }}>
            {activePapersCount} {activePapersCount === 1 ? 'Paper' : 'Papers'}
          </span>
          {hasMatrixData && (
            <span className="badge badge-emerald" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Database size={11} />
              <span>Grounded</span>
            </span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, maxWidth: 820, lineHeight: 1.45 }}>
          Side-by-side architectural taxonomy, methodology, verified code repositories, and ground-truthed research boundaries.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Twin View Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'var(--bg-subtle)',
            padding: 3,
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-subtle)',
            marginRight: 4,
          }}
        >
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <Columns3 size={13} />
            <span>Feature Matrix</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
            title="Switch to Interactive Knowledge Graph"
          >
            <Network size={13} />
            <span>Knowledge Graph</span>
          </button>
        </div>

        {/* Clean Export Actions */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onExportTaxonomyLaTeX}
          title="Copy Academic Survey LaTeX Table (\checkmark & \times)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
        >
          <CheckSquare size={13} style={{ color: 'var(--accent-primary)' }} />
          <span>LaTeX Table</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onExportMarkdown}
          disabled={!hasMatrixData}
          title="Copy clean Markdown table"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
        >
          <Copy size={13} />
          <span>Markdown</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onExportCSV}
          disabled={!hasMatrixData}
          title="Export CSV data"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
        >
          <Download size={13} />
          <span>CSV</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={matrixLoading}
          title="Refresh comparison matrix"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
        >
          <RefreshCw size={13} className={matrixLoading ? 'spin-anim' : ''} />
          <span>{matrixLoading ? 'Loading...' : 'Refresh'}</span>
        </button>

        {canClear && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClear}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
            title="Clear all compared papers"
          >
            <X size={13} />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );
}
