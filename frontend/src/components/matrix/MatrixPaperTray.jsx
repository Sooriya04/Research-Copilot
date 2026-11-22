import React from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

export function formatPaperDisplayTitle(paper) {
  if (!paper) return 'Untitled Paper';
  const t = (paper.title || paper.id || '').trim();
  if (t.toLowerCase().startsWith('arxiv:s2:') || t.toLowerCase().startsWith('s2:')) {
    const rawHash = t.replace(/^arxiv:s2:/i, '').replace(/^s2:/i, '');
    return `Semantic Scholar: ${rawHash.slice(0, 14)}...`;
  }
  return t;
}

export default function MatrixPaperTray({
  activePapers,
  onRemovePaper,
  customPaperInput,
  setCustomPaperInput,
  onAddCustomPaper,
  addingCustomPaper,
  onLoadPreset,
}) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Active Staged Paper Chips */}
      {activePapers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Compared Papers ({activePapers.length}):
          </span>
          {activePapers.map((paper, idx) => (
            <div
              key={paper.id || idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 16,
                fontSize: 11.5,
                color: 'var(--text-primary)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <span
                style={{
                  maxWidth: 240,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                }}
                title={paper.title}
              >
                {formatPaperDisplayTitle(paper)}
              </span>
              {paper.year && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 2 }}>
                  ({paper.year})
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemovePaper(paper.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove paper"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Box & Standard Presets */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={onAddCustomPaper} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 260 }}>
          <input
            type="text"
            value={customPaperInput}
            onChange={(e) => setCustomPaperInput(e.target.value)}
            placeholder="Add paper by arXiv ID (e.g. 2312.00752), DOI, or title..."
            style={{
              flex: 1,
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="submit"
            disabled={addingCustomPaper || !customPaperInput.trim()}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            {addingCustomPaper ? <Loader2 size={12} className="spin-anim" /> : <Plus size={13} />}
            <span>Add Paper</span>
          </button>
        </form>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Quick Presets:</span>
          <button
            type="button"
            onClick={() => onLoadPreset('transformers')}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '4px 9px' }}
            title="Attention vs Mamba vs LoRA"
          >
            Attention vs Mamba vs LoRA
          </button>
          <button
            type="button"
            onClick={() => onLoadPreset('hallucination')}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '4px 9px' }}
            title="Hallucination Detection Baselines"
          >
            Hallucination Detection
          </button>
          <button
            type="button"
            onClick={() => onLoadPreset('flashattention')}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '4px 9px' }}
            title="FlashAttention 1 vs 2"
          >
            FlashAttention 1 vs 2
          </button>
        </div>
      </div>
    </div>
  );
}
