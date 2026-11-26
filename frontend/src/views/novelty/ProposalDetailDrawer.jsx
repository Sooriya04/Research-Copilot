import React, { useState, useEffect } from 'react';
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
  Trash2,
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
  onRequestDelete,
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    setActiveTab('overview');
  }, [proposal?.id]);

  if (!proposal) return null;

  const priorArt = resolvePriorArtStatus(proposal);
  const evidenceStatus = resolveEvidenceStatus(proposal);
  const supportingList = proposal.grounded_paper_titles?.length
    ? proposal.grounded_paper_titles
    : proposal.grounded_paper_ids || [];
  const evidenceItems = proposal.structured_evidence || [];
  const priorArtCheck = proposal.prior_art_check || {};

  const handleCopyMarkdown = () => {
    const md = [
      `# ${proposal.title}`,
      `**Strategy:** ${MECHANISM_LABELS[proposal.mechanism] || proposal.mechanism}`,
      `**Prior-Art Status:** ${priorArt.label}`,
      '',
      `## Problem & Motivation`,
      proposal.problem_statement || proposal.pitch || '',
      '',
      `## Proposed Contribution`,
      proposal.novelty_statement || '',
      '',
      proposal.technical_methodology ? `## Methodology\n${proposal.technical_methodology}\n` : '',
      proposal.mathematical_formulation ? `## Mathematical Formulation\n$$${proposal.mathematical_formulation}$$\n` : '',
      `## Testable Hypothesis`,
      proposal.testable_hypothesis || '',
      '',
      `## Experimental Design`,
      `- Target Datasets: ${(proposal.target_datasets || []).join(', ') || 'None specified'}`,
      `- Baselines: ${(proposal.baselines_to_beat || []).join(', ') || 'None specified'}`,
      `- Metrics: ${(proposal.expected_metrics || []).join(', ') || 'None specified'}`,
    ]
      .filter(Boolean)
      .join('\n');

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
          <div className="nov-drawer-header-actions">
            {onRequestDelete && (
              <button
                type="button"
                className="nov-icon-btn danger"
                onClick={() => onRequestDelete(proposal)}
                title="Delete proposal"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button type="button" className="nov-icon-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="nov-drawer-tabs">
          <button
            type="button"
            className={`nov-drawer-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Proposal & Method
          </button>
          <button
            type="button"
            className={`nov-drawer-tab ${activeTab === 'evidence' ? 'active' : ''}`}
            onClick={() => setActiveTab('evidence')}
          >
            Evidence ({supportingList.length})
          </button>
          <button
            type="button"
            className={`nov-drawer-tab ${activeTab === 'prior_art' ? 'active' : ''}`}
            onClick={() => setActiveTab('prior_art')}
          >
            Prior-Art Assessment
          </button>
        </div>

        <div className="nov-drawer-body">
          <h2 className="nov-drawer-title">{proposal.title}</h2>

          {activeTab === 'overview' && (
            <>
              <section className="nov-detail-section">
                <h4>Problem Statement & Motivation</h4>
                <p>{proposal.problem_statement || proposal.pitch}</p>
                {proposal.research_motivation && (
                  <p style={{ marginTop: 6 }}>{proposal.research_motivation}</p>
                )}
              </section>

              {proposal.identified_gap && (
                <section className="nov-detail-section">
                  <h4>Identified Research Gap</h4>
                  <p>{proposal.identified_gap}</p>
                </section>
              )}

              <section className="nov-detail-section">
                <h4>Proposed Contribution</h4>
                <p>{proposal.novelty_statement}</p>
              </section>

              {(proposal.technical_methodology || proposal.algorithmic_approach) && (
                <section className="nov-detail-section">
                  <h4>Technical Methodology & Algorithm</h4>
                  {proposal.technical_methodology && <p>{proposal.technical_methodology}</p>}
                  {proposal.algorithmic_approach && (
                    <p style={{ marginTop: 6 }}>{proposal.algorithmic_approach}</p>
                  )}
                </section>
              )}

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

              {proposal.potential_limitations && (
                <section className="nov-detail-section">
                  <h4>Potential Limitations & Risks</h4>
                  <p>{proposal.potential_limitations}</p>
                </section>
              )}
            </>
          )}

          {activeTab === 'evidence' && (
            <>
              <section className="nov-detail-section">
                <h4>Supporting Papers ({supportingList.length})</h4>
                {supportingList.length > 0 ? (
                  <ul className="nov-citation-list">
                    {supportingList.map((title, idx) => (
                      <li key={idx}>{title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="nov-muted-sm">
                    No explicit workspace paper nodes were linked to this proposal.
                  </p>
                )}
              </section>

              <section className="nov-detail-section">
                <h4>Extracted Claims & Provenance</h4>
                {evidenceItems.length > 0 ? (
                  <div className="nov-evidence-list">
                    {evidenceItems.map((ev, i) => (
                      <div key={i} className="nov-prior-art-box">
                        <div className="nov-evidence-meta">
                          <strong>{ev.paper_id || 'Source'}</strong>
                          {ev.section && <span className="nov-chip">{ev.section}</span>}
                        </div>
                        <p>{ev.claim || ev.excerpt}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="nov-prior-art-box">
                    <p className="nov-muted-sm">
                      This proposal was synthesized from workspace graph metadata and abstracts. Full-text section/page provenance will appear here once structured paper extraction is run.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'prior_art' && (
            <>
              <section className="nov-detail-section">
                <h4>Verification Status</h4>
                <div className="nov-prior-art-box">
                  <div className="nov-prior-art-status">
                    <strong>Status:</strong> {priorArt.label}
                  </div>
                  <p className="nov-muted-sm">
                    {priorArtCheck.summary ||
                      'This candidate is stored as a provisional hypothesis. External prior-art overlap has not yet been adjudicated.'}
                  </p>
                </div>
              </section>

              {priorArtCheck.overlapping_components?.length > 0 && (
                <section className="nov-detail-section">
                  <h4>Overlapping Technical Components</h4>
                  <ul className="nov-citation-list">
                    {priorArtCheck.overlapping_components.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </section>
              )}

              {priorArtCheck.distinct_contributions?.length > 0 && (
                <section className="nov-detail-section">
                  <h4>Potentially Distinct Contributions</h4>
                  <ul className="nov-citation-list">
                    {priorArtCheck.distinct_contributions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </section>
              )}

              {priorArtCheck.closest_papers?.length > 0 && (
                <section className="nov-detail-section">
                  <h4>Retrieved Related Work</h4>
                  <ul className="nov-citation-list">
                    {priorArtCheck.closest_papers.map((cp, i) => (
                      <li key={i}>
                        {cp.title || cp} {cp.year ? `(${cp.year})` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
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
