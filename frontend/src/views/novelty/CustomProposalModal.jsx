import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { MECHANISM_LABELS } from './noveltyConstants';

export default function CustomProposalModal({ isOpen, initialDraft, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: '',
    mechanism: 'recombination',
    pitch: '',
    novelty_statement: '',
    mathematical_formulation: '',
    testable_hypothesis: '',
    target_datasets: '',
    baselines_to_beat: '',
    expected_metrics: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setForm({
        title: initialDraft?.title || '',
        mechanism: initialDraft?.mechanism || 'recombination',
        pitch: initialDraft?.pitch || '',
        novelty_statement: initialDraft?.novelty_statement || '',
        mathematical_formulation: initialDraft?.mathematical_formulation || '',
        testable_hypothesis: initialDraft?.testable_hypothesis || '',
        target_datasets: Array.isArray(initialDraft?.target_datasets)
          ? initialDraft.target_datasets.join(', ')
          : '',
        baselines_to_beat: Array.isArray(initialDraft?.baselines_to_beat)
          ? initialDraft.baselines_to_beat.join(', ')
          : '',
        expected_metrics: Array.isArray(initialDraft?.expected_metrics)
          ? initialDraft.expected_metrics.join(', ')
          : '',
      });
    }
  }, [isOpen, initialDraft]);

  if (!isOpen) return null;

  const splitCsv = (s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.title.trim().length < 2) {
      setError('Proposal title must be at least 2 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: form.title.trim(),
        mechanism: form.mechanism,
        pitch: form.pitch.trim(),
        novelty_statement: form.novelty_statement.trim(),
        mathematical_formulation: form.mathematical_formulation.trim(),
        testable_hypothesis: form.testable_hypothesis.trim(),
        target_datasets: splitCsv(form.target_datasets),
        baselines_to_beat: splitCsv(form.baselines_to_beat),
        expected_metrics: splitCsv(form.expected_metrics),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save custom proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="nov-modal-backdrop" onClick={onClose}>
      <div className="nov-modal" onClick={(e) => e.stopPropagation()}>
        <header className="nov-modal-header">
          <h3>Author Research Proposal</h3>
          <button type="button" className="nov-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="nov-modal-form">
          <div className="nov-field">
            <label className="nov-field-label">Title *</label>
            <input
              type="text"
              className="nov-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Clear publication-ready proposal title..."
              required
            />
          </div>

          <div className="nov-field">
            <label className="nov-field-label">Strategy / Mechanism</label>
            <select
              className="nov-input"
              value={form.mechanism}
              onChange={(e) => setForm({ ...form, mechanism: e.target.value })}
            >
              {Object.entries(MECHANISM_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="nov-field">
            <label className="nov-field-label">Problem & Pitch</label>
            <textarea
              className="nov-textarea"
              rows={2}
              value={form.pitch}
              onChange={(e) => setForm({ ...form, pitch: e.target.value })}
              placeholder="Concise problem statement and core breakthrough..."
            />
          </div>

          <div className="nov-field">
            <label className="nov-field-label">Proposed Contribution</label>
            <textarea
              className="nov-textarea"
              rows={3}
              value={form.novelty_statement}
              onChange={(e) => setForm({ ...form, novelty_statement: e.target.value })}
              placeholder="Technical differentiation vs prior art..."
            />
          </div>

          <div className="nov-field">
            <label className="nov-field-label">Testable Hypothesis</label>
            <input
              type="text"
              className="nov-input"
              value={form.testable_hypothesis}
              onChange={(e) => setForm({ ...form, testable_hypothesis: e.target.value })}
              placeholder="Falsifiable quantitative claim..."
            />
          </div>

          <div className="nov-field">
            <label className="nov-field-label">Mathematical Formulation (LaTeX)</label>
            <input
              type="text"
              className="nov-input"
              value={form.mathematical_formulation}
              onChange={(e) => setForm({ ...form, mathematical_formulation: e.target.value })}
              placeholder="Optional equations..."
            />
          </div>

          <div className="nov-advanced-grid">
            <div className="nov-field">
              <label className="nov-field-label">Target Datasets (comma-separated)</label>
              <input
                type="text"
                className="nov-input"
                value={form.target_datasets}
                onChange={(e) => setForm({ ...form, target_datasets: e.target.value })}
              />
            </div>
            <div className="nov-field">
              <label className="nov-field-label">Baselines (comma-separated)</label>
              <input
                type="text"
                className="nov-input"
                value={form.baselines_to_beat}
                onChange={(e) => setForm({ ...form, baselines_to_beat: e.target.value })}
              />
            </div>
          </div>

          {error && <div className="nov-error-inline">{error}</div>}

          <footer className="nov-modal-footer">
            <button type="button" className="nov-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nov-btn primary" disabled={submitting}>
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Save Proposal
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
