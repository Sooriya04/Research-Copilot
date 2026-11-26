import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  GitMerge,
  MessageSquare,
  Copy,
  Check,
  ShieldCheck,
  BookOpen,
  Loader2,
} from 'lucide-react';
import MathRenderer from '../../components/common/MathRenderer';
import {
  MECHANISM_LABELS,
  resolvePriorArtStatus,
  resolveEvidenceStatus,
} from './noveltyConstants';

export default function ProposalDetailDrawer({
  proposal,
  onClose,
  onAddToGraph,
  isAddedToGraph,
  isAddingToGraph,
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!proposal) return null;

  const priorArt = resolvePriorArtStatus(proposal);
  const evidenceStatus = resolveEvidenceStatus(proposal);

  const handleCopyMarkdown = () => {
    const md = [
      `# ${proposal.title}`,
      `**Mechanism:** ${MECHANISM_LABELS[proposal.mechanism] || proposal.mechanism}`,
      `**Prior-Art Status:** ${priorArt.label}`,
      '',
      `## Problem & Pitch`,
      proposal.pitch || '',
      '',
      `## Proposed Contribution`,
      proposal.novelty_statement || '',
      '',
      `## Mathematical Formulation`,
      `$$${proposal.mathematical_formulation || ''}$$`,
      '',
      `## Testable Hypothesis`,
      proposal.testable_hypothesis || '',
      '',
      `## Experimental Design`,
      `- Target Datasets: ${(proposal.target_datasets || []).join(', ') || 'None specified'}`,
      `- Baselines: ${(proposal.baselines_to_beat || []).join(', ') || 'None specified'}`,
      `- Metrics: ${(proposal.expected_metrics || []).join(', ') || 'None specified'}`,
    ].join('\n');

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDiscussInChat = () => {
    navigate('/chat', {
      state: {
        initialPrompt: `Critique and design an experiment plan for this research proposal:\n\nTitle: ${proposal.title}\nContribution: ${proposal.novelty_statement}\nHypothesis: ${proposal.testable_hypothesis}`,
      },
    });
  };

  return (
    <div className="nov-drawer-backdrop" onClick={onClose}>
      <aside className="nov-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="nov-drawer-header">
          <div className="nov-proposal-badges">
            <span className="nov-badge neutral">
              {MECHANISM_LABELS[proposal.mechanism] || proposal.mechanism}
            </span>
            <span className={`nov-badge ${priorArt.tone}`}>
              <ShieldCheck size={11} />
              {priorArt.label}
            </span>
            <span className="nov-badge neutral">
              <BookOpen size={11} />
              {evidenceStatus}
            </span>
          </div>
          <button type="button" className="nov-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="nov-drawer-body">
          <h2 className="nov-drawer-title">{proposal.title}</h2>

          <section className="nov-detail-section">
            <h4>Problem & Motivation</h4>
            <p>{proposal.pitch}</p>
          </section>

          <section className="nov-detail-section">
            <h4>Proposed Contribution</h4>
            <p>{proposal.novelty_statement}</p>
          </section>

          {proposal.mathematical_formulation && (
            <section className="nov-detail-section">
              <h4>Mathematical Formulation</h4>
              <div className="nov-formula-box">
                <MathRenderer content={proposal.mathematical_formulation} />
              </div>
            </section>
          )}

          {proposal.testable_hypothesis && (
            <section className="nov-detail-section">
              <h4>Testable Hypothesis</h4>
              <div className="nov-hypothesis-callouts">{proposal.testable_hypothesis}</div>
            </section>
          )}

          <section className="nov-detail-section">
            <h4>Experimental Design</h4>
            <div className="nov-meta-grid">
              <div>
                <span className="nov-meta-key">Target Datasets</span>
                <div className="nov-chip-wrap">
                  {(proposal.target_datasets || []).length > 0 ? (
                    proposal.target_datasets.map((d, i) => (
                      <span key={i} className="nov-chip">
                        {d}
                      </span>
                    ))
                  ) : (
                    <span className="nov-muted-sm">Not specified</span>
                  )}
                </div>
              </div>

              <div>
                <span className="nov-meta-key">Baselines</span>
                <div className="nov-chip-wrap">
                  {(proposal.baselines_to_beat || []).length > 0 ? (
                    proposal.baselines_to_beat.map((b, i) => (
                      <span key={i} className="nov-chip">
                        {b}
                      </span>
                    ))
                  ) : (
                    <span className="nov-muted-sm">Not specified</span>
                  )}
                </div>
              </div>

              <div>
                <span className="nov-meta-key">Expected Metrics</span>
                <div className="nov-chip-wrap">
                  {(proposal.expected_metrics || []).length > 0 ? (
                    proposal.expected_metrics.map((m, i) => (
                      <span key={i} className="nov-chip">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="nov-muted-sm">Not specified</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="nov-detail-section">
            <h4>Supporting Citations ({proposal.grounded_paper_titles?.length || proposal.grounded_paper_ids?.length || 0})</h4>
            {(proposal.grounded_paper_titles || proposal.grounded_paper_ids || []).length > 0 ? (
              <ul className="nov-citation-list">
                {(proposal.grounded_paper_titles?.length
                  ? proposal.grounded_paper_titles
                  : proposal.grounded_paper_ids
                ).map((title, idx) => (
                  <li key={idx}>{title}</li>
                ))}
              </ul>
            ) : (
              <p className="nov-muted-sm">No explicit paper nodes attached yet.</p>
            )}
          </section>

          <section className="nov-detail-section">
            <h4>Prior-Art Assessment</h4>
            <div className="nov-prior-art-box">
              <div className="nov-prior-art-status">
                <strong>Status:</strong> {priorArt.label}
              </div>
              <p className="nov-muted-sm">
                {proposal.prior_art_check?.summary ||
                  'This candidate is stored as a provisional hypothesis. Verify against external literature before treating it as established prior-art clearance.'}
              </p>
            </div>
          </section>
        </div>

        <footer className="nov-drawer-footer">
          <button type="button" className="nov-btn secondary" onClick={handleCopyMarkdown}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Markdown'}
          </button>
          <button type="button" className="nov-btn secondary" onClick={handleDiscussInChat}>
            <MessageSquare size={14} />
            Critique in Chat
          </button>
          <button
            type="button"
            className="nov-btn primary"
            onClick={() => onAddToGraph(proposal)}
            disabled={isAddedToGraph || isAddingToGraph}
          >
            {isAddingToGraph ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isAddedToGraph ? (
              <Check size={14} />
            ) : (
              <GitMerge size={14} />
            )}
            {isAddedToGraph ? 'Added as Candidate' : 'Add to Knowledge Graph'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
