/**
 * Module: frontend/src/views/novelty/AnalysisConfigBar.jsx
 *
 * What this file does:
 * Renders Area B (Analysis Configuration) of the Research Novelty Studio.
 * Allows researchers to choose analysis depth (Focused vs. Comprehensive), toggle
 * automated Prior-Art Verification, and configure provider/model selection via a collapsible
 * advanced drawer without crowding the primary interface.
 *
 * Components & Functions:
 * - AnalysisConfigBar: Card component exposing high-level configuration toggles
 *   and optional advanced provider controls linking to the Settings page.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sliders, ChevronDown, ChevronRight, Settings } from 'lucide-react';

export default function AnalysisConfigBar({
  analysisDepth,
  onDepthChange,
  verifyPriorArt,
  onVerifyPriorArtChange,
  providersStatus,
  selectedProvider,
  onProviderChange,
  selectedModel,
  onModelChange,
}) {
  const navigate = useNavigate();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const providerEntries = Object.entries(providersStatus || {});
  const activeProvMeta = providersStatus?.[selectedProvider] || {};
  const supportedModels = activeProvMeta.supported_models || [];

  return (
    <section className="nov-card">
      <div className="nov-card-header">
        <div className="nov-card-title-group">
          <span className="nov-section-kicker">B. Analysis Configuration</span>
        </div>
        <button
          type="button"
          className="nov-btn ghost sm"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <Sliders size={13} />
          <span>Advanced Provider</span>
          {advancedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      </div>

      <div className="nov-config-row">
        {/* Depth mode */}
        <div className="nov-config-group">
          <span className="nov-field-label">Analysis Mode</span>
          <div className="nov-segmented">
            <button
              type="button"
              className={`nov-seg-btn ${analysisDepth === 'focused' ? 'active' : ''}`}
              onClick={() => onDepthChange('focused')}
            >
              Focused
            </button>
            <button
              type="button"
              className={`nov-seg-btn ${analysisDepth === 'comprehensive' ? 'active' : ''}`}
              onClick={() => onDepthChange('comprehensive')}
            >
              Comprehensive
            </button>
          </div>
        </div>

        {/* Prior-Art Verification toggle */}
        <label className="nov-toggle-check">
          <input
            type="checkbox"
            checked={verifyPriorArt}
            onChange={(e) => onVerifyPriorArtChange(e.target.checked)}
          />
          <span>Run prior-art verification against workspace & academic sources</span>
        </label>
      </div>

      {advancedOpen && (
        <div className="nov-advanced-panel">
          <div className="nov-advanced-grid">
            <div className="nov-field">
              <label className="nov-field-label" htmlFor="nov-provider-select">
                Synthesis Provider
              </label>
              <select
                id="nov-provider-select"
                className="nov-input"
                value={selectedProvider}
                onChange={(e) => {
                  const next = e.target.value;
                  onProviderChange(next);
                  const defModel = providersStatus?.[next]?.default_model || '';
                  onModelChange(defModel);
                }}
              >
                {providerEntries.length === 0 ? (
                  <option value="gemini">Google Gemini</option>
                ) : (
                  providerEntries.map(([id, info]) => {
                    const ready = info.configured || info.online;
                    return (
                      <option key={id} value={id}>
                        {info.name || id} {ready ? '(Ready)' : '(Key missing)'}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div className="nov-field">
              <label className="nov-field-label" htmlFor="nov-model-select">
                Model Checkpoint
              </label>
              <select
                id="nov-model-select"
                className="nov-input"
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
              >
                {supportedModels.length === 0 ? (
                  <option value={selectedModel}>{selectedModel || 'Default'}</option>
                ) : (
                  supportedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="nov-advanced-footer">
            <span className="nov-muted-sm">
              API keys and provider defaults are managed centrally in Platform Settings.
            </span>
            <button
              type="button"
              className="nov-btn secondary sm"
              onClick={() => navigate('/settings')}
            >
              <Settings size={13} />
              Configure Providers
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
