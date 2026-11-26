import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Lightbulb, Search, CheckCircle2, AlertCircle, X } from 'lucide-react';
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
                    <th>Hypothesis</th>
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
                      <td>{p.testable_hypothesis}</td>
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
                  onDelete={ws.deleteProposal}
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
      />

      {/* Custom Proposal Modal */}
      <CustomProposalModal
        isOpen={customModalOpen}
        initialDraft={customDraft}
        onClose={() => setCustomModalOpen(false)}
        onSubmit={ws.createCustomProposal}
      />
    </div>
  );
}
