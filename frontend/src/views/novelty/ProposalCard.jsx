/**
 * Module: frontend/src/views/novelty/ProposalCard.jsx
 *
 * What this file does:
 * Renders an evidence-grounded research proposal card (replacing the old masonry grid).
 * Displays title, problem statement, core contribution, strategy tag, prior-art
 * verification badge, evidence source badge, supporting paper count, comparison checkbox,
 * graph injection button, and delete action.
 *
 * Components & Functions:
 * - ProposalCard: Structured card component with inspect and comparison actions.
 */

import React from 'react';
import {
  FileText,
  ShieldCheck,
  BookOpen,
  ChevronRight,
  GitMerge,
  Check,
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  MECHANISM_LABELS,
  resolvePriorArtStatus,
  resolveEvidenceStatus,
} from './noveltyConstants';

export default function ProposalCard({
  proposal,
  isSelectedForCompare,
  onToggleCompare,
  onInspect,
  onAddToGraph,
  isAddedToGraph,
  isAddingToGraph,
  onDelete,
}) {
  const paperCount =
    proposal.grounded_paper_ids?.length || proposal.grounded_paper_titles?.length || 0;
  const priorArt = resolvePriorArtStatus(proposal);
  const evidenceStatus = resolveEvidenceStatus(proposal);
  const mechLabel = MECHANISM_LABELS[proposal.mechanism] || proposal.mechanism || 'Proposal';

  return (
    <article className="nov-proposal-card" onClick={() => onInspect(proposal)}>
      <div className="nov-proposal-top">
        <div className="nov-proposal-badges">
          <span className="nov-badge neutral">{mechLabel}</span>
          <span className={`nov-badge ${priorArt.tone}`}>
            <ShieldCheck size={11} />
            {priorArt.label}
          </span>
          <span className="nov-badge neutral">
            <BookOpen size={11} />
            {evidenceStatus}
          </span>
        </div>

        <div className="nov-proposal-actions" onClick={(e) => e.stopPropagation()}>
          <label className="nov-compare-check" title="Select for side-by-side comparison">
            <input
              type="checkbox"
              checked={isSelectedForCompare}
              onChange={() => onToggleCompare(proposal.id)}
            />
            <span>Compare</span>
          </label>
          <button
            type="button"
            className="nov-icon-btn"
            onClick={() => onAddToGraph(proposal)}
            disabled={isAddedToGraph || isAddingToGraph}
            title={isAddedToGraph ? 'Added to Knowledge Graph' : 'Add provisional candidate to Knowledge Graph'}
          >
            {isAddingToGraph ? (
              <Loader2 size={13} className="animate-spin" />
            ) : isAddedToGraph ? (
              <Check size={13} className="nov-ok-icon" />
            ) : (
              <GitMerge size={13} />
            )}
          </button>
          <button
            type="button"
            className="nov-icon-btn danger"
            onClick={() => onDelete(proposal.id)}
            title="Delete proposal"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <h3 className="nov-proposal-title">{proposal.title}</h3>
      <p className="nov-proposal-pitch">{proposal.pitch}</p>

      <div className="nov-proposal-contribution">
        <span className="nov-contrib-label">Proposed contribution:</span>{' '}
        <span>{proposal.novelty_statement}</span>
      </div>

      <div className="nov-proposal-footer">
        <span className="nov-muted-sm">
          <FileText size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {paperCount} supporting {paperCount === 1 ? 'paper' : 'papers'}
        </span>

        <button
          type="button"
          className="nov-link-btn"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(proposal);
          }}
        >
          Inspect Evidence & Details
          <ChevronRight size={13} />
        </button>
      </div>
    </article>
  );
}
