/**
 * Module: frontend/src/views/novelty/NoveltyStudioPage.jsx
 *
 * What this file does:
 * Top-level container component for the redesigned Research Novelty Studio.
 * Replaces the crowded monolithic UI with a clean, 3-area layout:
 * - Area A: Research Scope (active workspace, grounding papers, topic input)
 * - Area B: Analysis Configuration (depth mode, prior-art toggle, provider drawer)
 * - Area C: Analysis Execution (primary run trigger, 8-stage progress rail, telemetry)
 * Displays proposal cards, proposal comparison table view, deletion confirmations,
 * and delegates inspection to ProposalDetailDrawer and authoring to CustomProposalModal.
 *
 * Components & Functions:
 * - NoveltyStudioPage: Main view component coordinating novelty analysis workflows.
 */

import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus,
  Lightbulb,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  X,
} from 'lucide-react';
import { useNoveltyWorkspace } from './useNoveltyWorkspace';
import ResearchScopeCard from './ResearchScopeCard';
import AnalysisConfigBar from './AnalysisConfigBar';
import AnalysisExecutionBar from './AnalysisExecutionBar';
import GapsPanel from './GapsPanel';
import ProposalCard from './ProposalCard';
import ProposalDetailDrawer from './ProposalDetailDrawer';
import CustomProposalModal from './CustomProposalModal';
import { MECHANISM_LABELS, resolvePriorArtStatus } from './noveltyConstants';

export default function NoveltyStudioPage() {
  const location = useLocation();
  const initialMechanism = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('mechanism') || 'all';
  }, [location.search]);

  const ws = useNoveltyWorkspace(initialMechanism);
  const [inspectProposal, setInspectProposal] = useState(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompareView, setShowCompareView] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const comparedProposals = useMemo(
    () => ws.proposals.filter((p) => compareIds.includes(p.id)),
    [ws.proposals, compareIds]
  );

  const handleFormulateFromGap = (gap) => {
    setCustomDraft({
      title: `Evaluating ${gap.method_name || gap.method_id} on ${gap.dataset_name || gap.dataset_id}`,
      mechanism: 'gap_realization',
      pitch: gap.description || 'Addressing an unexplored method-dataset intersection.',
      target_datasets: [gap.dataset_name || gap.dataset_id].filter(Boolean),
      baselines_to_beat: [gap.method_name || gap.method_id].filter(Boolean),
    });
    setCustomModalOpen(true);
  };

  const requestDeleteProposal = (proposalOrId) => {
    const target =
      typeof proposalOrId === 'string'
        ? ws.proposals.find((p) => p.id === proposalOrId) || { id: proposalOrId, title: 'this proposal' }
        : proposalOrId;
    setConfirmModal({
      title: 'Delete Research Proposal',
      message: `Remove "${target.title}" from this workspace? This action cannot be undone.`,
      confirmLabel: 'Delete Proposal',
      onConfirm: async () => {
        await ws.deleteProposal(target.id);
        if (inspectProposal?.id === target.id) setInspectProposal(null);
        setCompareIds((prev) => prev.filter((x) => x !== target.id));
      },
    });
  };

  const requestClearAll = () => {
    setConfirmModal({
      title: 'Clear Workspace Proposals',
      message: `Delete all ${ws.proposals.length} saved proposals in "${ws.workspaceTitle}"?`,
      confirmLabel: 'Clear All',
      onConfirm: async () => {
        await ws.clearAllProposals();
        setInspectProposal(null);
        setCompareIds([]);
        setShowCompareView(false);
      },
    });
  };

  return (
    <div className="nov-page">
      <div className="nov-container">
        {/* Page Header */}
        <header className="nov-header">
          <div>
            <h1 className="nov-title">Novelty & Gap Analysis</h1>
            <p className="nov-subtitle">
              Evidence-grounded research gap extraction, candidate synthesis, and prior-art verification.
            </p>
          </div>
          <button
            type="button"
            className="nov-btn secondary"
            onClick={() => {
              setCustomDraft(null);
              setCustomModalOpen(true);
            }}
          >
            <Plus size={14} />
            Author Proposal
          </button>
        </header>

        {/* Toast */}
        {ws.toast && (
          <div className={`nov-toast ${ws.toast.type}`}>
            {ws.toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            <span>{ws.toast.text}</span>
          </div>
        )}

        {/* A. Research Scope */}
        <ResearchScopeCard
          workspaceTitle={ws.workspaceTitle}
          topic={ws.topic}
          onTopicChange={ws.setTopic}
          availablePapers={ws.availablePapers}
          selectedPaperIds={ws.selectedPaperIds}
          loadingPapers={ws.loadingPapers}
          onTogglePaper={ws.togglePaperSelection}
          onSelectAll={ws.selectAllPapers}
          onClearSelection={ws.clearPaperSelection}
        />

        {/* B. Analysis Configuration */}
        <AnalysisConfigBar
          analysisDepth={ws.analysisDepth}
          onDepthChange={ws.setAnalysisDepth}
          verifyPriorArt={ws.verifyPriorArt}
          onVerifyPriorArtChange={ws.setVerifyPriorArt}
          providersStatus={ws.providersStatus}
          selectedProvider={ws.selectedProvider}
          onProviderChange={ws.setSelectedProvider}
          selectedModel={ws.selectedModel}
          onModelChange={ws.setSelectedModel}
        />

        {/* C. Analysis Execution */}
        <AnalysisExecutionBar
          running={ws.running}
          activeStageIdx={ws.activeStageIdx}
          runError={ws.runError}
          lastTelemetry={ws.lastTelemetry}
          onRun={ws.runAnalysis}
        />

        {/* Detected Research Gaps */}
        <GapsPanel
          gaps={ws.gaps}
          loading={ws.loadingGaps}
          onFormulateFromGap={handleFormulateFromGap}
        />

        {/* Results Section */}
        <section className="nov-results-section">
          <div className="nov-results-toolbar">
            <div className="nov-results-heading">
              <h2>Research Proposals ({ws.filteredProposals.length})</h2>
              <div className="nov-filter-pills">
                <button
                  type="button"
                  className={`nov-pill ${ws.mechanismFilter === 'all' ? 'active' : ''}`}
                  onClick={() => ws.setMechanismFilter('all')}
                >
                  All
                </button>
                {Object.entries(MECHANISM_LABELS).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`nov-pill ${ws.mechanismFilter === k ? 'active' : ''}`}
                    onClick={() => ws.setMechanismFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="nov-results-controls">
              <div className="nov-search-wrap">
                <Search size={13} className="nov-search-icon" />
                <input
                  type="text"
                  className="nov-search-input"
                  value={ws.searchFilter}
                  onChange={(e) => ws.setSearchFilter(e.target.value)}
                  placeholder="Filter proposals..."
                />
              </div>
              {compareIds.length >= 2 && (
                <button
                  type="button"
                  className="nov-btn secondary sm"
                  onClick={() => setShowCompareView((v) => !v)}
                >
                  {showCompareView ? 'Exit Compare' : `Compare (${compareIds.length})`}
                </button>
              )}
              {ws.proposals.length > 0 && (
                <button
                  type="button"
                  className="nov-icon-btn danger"
                  onClick={requestClearAll}
                  title="Clear all saved proposals in this workspace"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {showCompareView && comparedProposals.length >= 2 ? (
            <div className="nov-compare-table-wrap">
              <div className="nov-compare-header">
                <span>Comparing {comparedProposals.length} Candidates</span>
                <button
                  type="button"
                  className="nov-btn ghost sm"
                  onClick={() => {
                    setShowCompareView(false);
                    setCompareIds([]);
                  }}
                >
                  <X size={13} /> Clear Compare
                </button>
              </div>
              <table className="nov-compare-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Strategy</th>
                    <th>Prior-Art Status</th>
                    <th>Proposed Contribution</th>
                    <th>Hypothesis</th>
                    <th>Datasets & Metrics</th>
                    <th>Baselines</th>
                  </tr>
                </thead>
                <tbody>
                  {comparedProposals.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.title}</strong>
                      </td>
                      <td>{MECHANISM_LABELS[p.mechanism] || p.mechanism}</td>
                      <td>{resolvePriorArtStatus(p).label}</td>
                      <td>{p.novelty_statement || '—'}</td>
                      <td>{p.testable_hypothesis || '—'}</td>
                      <td>
                        {[...(p.target_datasets || []), ...(p.expected_metrics || [])].join(', ') || '—'}
                      </td>
                      <td>{(p.baselines_to_beat || []).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : ws.filteredProposals.length === 0 ? (
            <div className="nov-empty-state">
              <Lightbulb size={24} className="nov-empty-icon" />
              <h3>No Research Proposals Yet</h3>
              <p>
                Verify your workspace papers above and click <strong>Run Novelty Analysis</strong> to extract gaps and synthesize grounded proposals.
              </p>
            </div>
          ) : (
            <div className="nov-proposals-list">
              {ws.filteredProposals.map((prop) => (
                <ProposalCard
                  key={prop.id}
                  proposal={prop}
                  isSelectedForCompare={compareIds.includes(prop.id)}
                  onToggleCompare={toggleCompare}
                  onInspect={setInspectProposal}
                  onAddToGraph={ws.addProposalToGraph}
                  isAddedToGraph={ws.addedCandidateIds.has(prop.id)}
                  isAddingToGraph={ws.addingGraphId === prop.id}
                  onDelete={requestDeleteProposal}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Proposal Detail Drawer */}
      <ProposalDetailDrawer
        proposal={inspectProposal}
        onClose={() => setInspectProposal(null)}
        onAddToGraph={ws.addProposalToGraph}
        isAddedToGraph={inspectProposal ? ws.addedCandidateIds.has(inspectProposal.id) : false}
        isAddingToGraph={inspectProposal ? ws.addingGraphId === inspectProposal.id : false}
        onRequestDelete={requestDeleteProposal}
      />

      {/* Custom Proposal Modal */}
      <CustomProposalModal
        isOpen={customModalOpen}
        initialDraft={customDraft}
        onClose={() => setCustomModalOpen(false)}
        onSubmit={ws.createCustomProposal}
      />

      {/* Destructive Action Confirmation Modal */}
      {confirmModal && (
        <div className="nov-modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="nov-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nov-confirm-header">
              <AlertTriangle size={17} className="nov-warn-icon" />
              <h3>{confirmModal.title}</h3>
            </div>
            <p className="nov-confirm-body">{confirmModal.message}</p>
            <div className="nov-modal-footer">
              <button
                type="button"
                className="nov-btn secondary"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nov-btn danger"
                onClick={async () => {
                  await confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {confirmModal.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
