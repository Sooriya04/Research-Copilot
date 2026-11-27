/**
 * Module: frontend/src/views/novelty/GapsPanel.jsx
 *
 * What this file does:
 * Collapsible panel displaying detected research gaps extracted during Stage 3.
 * Each gap shows its title, description, and a "Draft Proposal" action that pre-fills
 * the Custom Proposal Modal with the gap's premise.
 *
 * Components & Functions:
 * - GapsPanel: Collapsible accordion listing research gaps with quick drafting triggers.
 */

import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';

export default function GapsPanel({ gaps, loading, onFormulateFromGap }) {
  const [open, setOpen] = useState(false);

  if (loading && gaps.length === 0) return null;
  if (gaps.length === 0) return null;

  return (
    <section className="nov-card">
      <div className="nov-card-header">
        <div className="nov-card-title-group">
          <span className="nov-section-kicker">
            <AlertCircle size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            Detected Research Gaps ({gaps.length})
          </span>
        </div>
        <button type="button" className="nov-btn ghost sm" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{open ? 'Hide Gaps' : 'Inspect Gaps'}</span>
        </button>
      </div>

      {open && (
        <div className="nov-gaps-list">
          {gaps.map((g, i) => (
            <div key={g.id || i} className="nov-gap-row">
              <div className="nov-gap-info">
                <div className="nov-gap-title">
                  {g.title || `${g.method_name || g.method_id} × ${g.dataset_name || g.dataset_id}`}
                </div>
                <div className="nov-muted-sm">
                  {g.description || 'Unexplored method-dataset intersection in workspace graph.'}
                </div>
              </div>
              <button
                type="button"
                className="nov-btn secondary sm"
                onClick={() => onFormulateFromGap(g)}
              >
                Draft Proposal
                <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
