import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, BookOpen, ChevronDown, ChevronRight, Check, Search, Network } from 'lucide-react';

export default function ResearchScopeCard({
  workspaceTitle,
  topic,
  onTopicChange,
  availablePapers,
  selectedPaperIds,
  loadingPapers,
  onTogglePaper,
  onSelectAll,
  onClearSelection,
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const selectedCount = selectedPaperIds.length;
  const totalCount = availablePapers.length;
  const groundingReady = selectedCount > 0;

  return (
    <section className="nov-card">
      <div className="nov-card-header">
        <div className="nov-card-title-group">
          <span className="nov-section-kicker">A. Research Scope</span>
          <div className="nov-scope-meta">
            <span className="nov-meta-pill">
              <Layers size={12} />
              {workspaceTitle}
            </span>
            <span className={`nov-status-pill ${groundingReady ? 'ok' : 'warn'}`}>
              <BookOpen size={12} />
              {loadingPapers
                ? 'Loading papers...'
                : groundingReady
                ? `${selectedCount} of ${totalCount} papers grounded`
                : 'No workspace papers staged'}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="nov-btn ghost sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{expanded ? 'Hide Papers' : `Select Material (${selectedCount})`}</span>
        </button>
      </div>

      <div className="nov-scope-topic-row">
        <label className="nov-field-label" htmlFor="nov-topic-input">
          Focus Topic
        </label>
        <input
          id="nov-topic-input"
          type="text"
          className="nov-input"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="e.g., Long-context sparse attention or graph-grounded RAG..."
        />
      </div>

      {expanded && (
        <div className="nov-papers-drawer">
          {totalCount === 0 ? (
            <div className="nov-empty-inline">
              <p>
                No papers are currently linked to this workspace graph. Add papers from Literature Search or Knowledge Graph to ground proposals in full evidence.
              </p>
              <div className="nov-empty-actions">
                <button type="button" className="nov-btn secondary sm" onClick={() => navigate('/search')}>
                  <Search size={13} />
                  Literature Search
                </button>
                <button type="button" className="nov-btn secondary sm" onClick={() => navigate('/knowledge-graph')}>
                  <Network size={13} />
                  Knowledge Graph
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="nov-papers-toolbar">
                <span className="nov-muted-sm">
                  {selectedCount} / {totalCount} papers selected for analysis
                </span>
                <div className="nov-papers-toolbar-actions">
                  <button type="button" className="nov-link-btn" onClick={onSelectAll}>
                    Select all
                  </button>
                  <button type="button" className="nov-link-btn" onClick={onClearSelection}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="nov-paper-list">
                {availablePapers.map((p) => {
                  const checked = selectedPaperIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`nov-paper-item ${checked ? 'selected' : ''}`}
                      onClick={() => onTogglePaper(p.id)}
                    >
                      <span className={`nov-checkbox ${checked ? 'checked' : ''}`}>
                        {checked && <Check size={11} />}
                      </span>
                      <span className="nov-paper-title">{p.title}</span>
                      {p.year && <span className="nov-paper-year">{p.year}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
