/**
 * Module: frontend/src/views/novelty/AnalysisExecutionBar.jsx
 *
 * What this file does:
 * Renders Area C (Analysis Execution) of the Research Novelty Studio.
 * Houses the primary "Run Novelty Analysis" button, live 8-stage progress tracker rail,
 * run duration telemetry, and error alerts with retry triggers.
 *
 * Components & Functions:
 * - AnalysisExecutionBar: Execution status header and 8-stage animated step indicator.
 */

import React from 'react';
import { Play, RotateCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { PIPELINE_STAGES } from './noveltyConstants';

export default function AnalysisExecutionBar({
  running,
  activeStageIdx,
  runError,
  lastTelemetry,
  onRun,
}) {
  return (
    <section className="nov-card nov-exec-card">
      <div className="nov-exec-top">
        <div>
          <span className="nov-section-kicker">C. Analysis Execution</span>
          <p className="nov-muted-sm">
            {running
              ? `Executing stage ${Math.max(1, activeStageIdx + 1)} of ${PIPELINE_STAGES.length}: ${
                  PIPELINE_STAGES[Math.max(0, activeStageIdx)]?.label
                }`
              : lastTelemetry
              ? `Last run completed in ${Math.round(lastTelemetry.duration_ms || 0)} ms (${
                  lastTelemetry.proposals_generated || 0
                } proposals${lastTelemetry.cached ? ', cached' : ''})`
              : 'Synthesize grounded research gaps, candidates, and structured proposals.'}
          </p>
        </div>

        <button
          type="button"
          className="nov-btn primary"
          onClick={onRun}
          disabled={running}
        >
          {running ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running Analysis...
            </>
          ) : runError ? (
            <>
              <RotateCw size={14} />
              Retry Analysis
            </>
          ) : (
            <>
              <Play size={14} />
              Run Novelty Analysis
            </>
          )}
        </button>
      </div>

      {/* Stage-by-stage progress rail */}
      {(running || activeStageIdx >= 0) && (
        <div className="nov-stage-rail">
          {PIPELINE_STAGES.map((stage, idx) => {
            const done = !running && activeStageIdx >= idx;
            const current = running && activeStageIdx === idx;
            const passed = running && activeStageIdx > idx;
            return (
              <div
                key={stage.id}
                className={`nov-stage-step ${
                  done || passed ? 'done' : current ? 'current' : 'pending'
                }`}
              >
                <span className="nov-stage-dot">
                  {done || passed ? (
                    <CheckCircle2 size={12} />
                  ) : current ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <span className="nov-stage-num">{idx + 1}</span>
                  )}
                </span>
                <span className="nov-stage-label">{stage.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {runError && (
        <div className="nov-error-inline">
          <AlertCircle size={14} />
          <span>{runError}</span>
        </div>
      )}
    </section>
  );
}
