import React from 'react';
import { Check, Minus, X, Plus } from 'lucide-react';

export default function TaxonomySection({
  criteria,
  papers,
  getFeatureStatus,
  toggleFeatureStatus,
  onAddCriterion,
  newCriterionInput,
  setNewCriterionInput,
  onDeleteCriterion,
}) {
  return (
    <>
      <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-subtle)' }}>
        <td
          colSpan={papers.length + 1}
          style={{ padding: '9px 16px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>QUALITATIVE ARCHITECTURAL FEATURE MATRIX (TAXONOMY)</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
              Click any badge to toggle: Supported (✓) → Limited (~) → Not Supported (✕)
            </span>
          </div>
        </td>
      </tr>

      {/* Criteria Rows */}
      {criteria.map((criterion) => (
        <tr key={criterion.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <td
            style={{
              position: 'sticky',
              left: 0,
              background: 'var(--bg-card)',
              zIndex: 1,
              borderRight: '1px solid var(--border-subtle)',
              verticalAlign: 'middle',
              padding: '10px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{criterion.label}</strong>
              {criterion.isCustom && (
                <button
                  type="button"
                  onClick={() => onDeleteCriterion(criterion.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                  title="Remove criterion"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              {criterion.tooltip}
            </p>
          </td>

          {papers.map((p, i) => {
            const status = getFeatureStatus(p, criterion.id);
            return (
              <td
                key={i}
                style={{
                  verticalAlign: 'middle',
                  textAlign: 'center',
                  padding: '10px 16px',
                  borderRight: '1px solid var(--border-subtle)',
                  background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFeatureStatus(p, criterion.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title="Click to cycle status"
                >
                  {status === 'present' ? (
                    <span
                      className="badge badge-emerald"
                      style={{
                        fontSize: 11,
                        fontWeight: p.isOurs ? 700 : 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                      }}
                    >
                      <Check size={12} strokeWidth={2.5} />
                      <span>Supported</span>
                    </span>
                  ) : status === 'partial' ? (
                    <span
                      className="badge badge-amber"
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                      }}
                    >
                      <Minus size={12} strokeWidth={2.5} />
                      <span>Limited</span>
                    </span>
                  ) : (
                    <span
                      className="badge badge-gray"
                      style={{
                        fontSize: 11,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                      }}
                    >
                      <X size={12} />
                      <span>No</span>
                    </span>
                  )}
                </button>
              </td>
            );
          })}
        </tr>
      ))}

      {/* Add Custom Criterion Row */}
      <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-subtle)' }}>
        <td
          colSpan={papers.length + 1}
          style={{ padding: '8px 16px' }}
        >
          <form onSubmit={onAddCriterion} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>+ Add Custom Criterion:</span>
            <input
              type="text"
              value={newCriterionInput}
              onChange={(e) => setNewCriterionInput(e.target.value)}
              placeholder="e.g. FlashAttention-2, Zero-Shot, Quantized <8-bit..."
              style={{
                fontSize: 11.5,
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                minWidth: 260,
              }}
            />
            <button
              type="submit"
              disabled={!newCriterionInput.trim()}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={11} />
              <span>Add</span>
            </button>
          </form>
        </td>
      </tr>
    </>
  );
}
