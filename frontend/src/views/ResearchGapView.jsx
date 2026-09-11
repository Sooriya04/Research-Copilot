import React, { useState } from 'react';
import { Compass, AlertTriangle, Lightbulb, Loader2 } from 'lucide-react';

export default function ResearchGapView() {
  const [topic, setTopic] = useState('audio deepfake detection');
  const [loading, setLoading] = useState(false);

  const [gaps, setGaps] = useState([
    {
      id: 1,
      title: '1. Cross-Environment Generalization Degradation',
      desc: 'Existing detectors drop performance by up to 28% EER when deployed on unseen codecs (MP3, Opus) or noisy acoustic channels.',
    },
    {
      id: 2,
      title: '2. Privacy Leakage in Raw Feature Extractors',
      desc: 'Feature representations trained for spoofing detection inadvertently retain speaker identity and spoken text content.',
    },
    {
      id: 3,
      title: '3. High Computational Overhead for Edge Deployment',
      desc: 'SOTA graph neural networks and transformers exceed 40M parameters, preventing real-time mobile inference.',
    },
  ]);

  const [hypotheses, setHypotheses] = useState([
    {
      id: 1,
      title: 'Hypothesis 1: Privacy-Preserving Adversarial Disentanglement',
      desc: 'Combine a mini-ResNet feature extractor with a reverse gradient privacy loss to project speech into an identity-sanitized manifold.',
    },
    {
      id: 2,
      title: 'Hypothesis 2: Self-Supervised Codec Augmentation',
      desc: 'Pre-train Wav2Vec 2.0 with dynamic lossy compression masks to enforce invariance against telecom codec artifacts.',
    },
    {
      id: 3,
      title: 'Hypothesis 3: Lightweight Sinc-Conformer Architecture',
      desc: 'Replace standard 2D convolutions with learnable band-pass Sinc filters to reduce parameter count by 65% while preserving accuracy.',
    },
  ]);

  const handleAnalyzeGaps = async () => {
    if (!topic.trim()) return;
    setLoading(true);

    try {
      const res = await fetch('/api/v1/hypothesis/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), num_hypotheses: 3 }),
      });

      if (res.ok) {
        const data = await res.json();
        const hypList = data.hypotheses || [];
        if (hypList.length > 0) {
          setHypotheses(
            hypList.map((h, i) => ({
              id: i + 1,
              title: `Hypothesis ${i + 1}: ${h.title || 'Novel Research Direction'}`,
              desc: h.hypothesis_statement || h.rationale || h.experimental_design || 'Testable hypothesis statement.',
            }))
          );
        }
      }
    } catch (err) {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="view-research-gaps" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Research Gap & Hypothesis Finder</h1>
          <p className="panel-subtitle">
            Identify open scientific limitations, unresolved trade-offs, and generate novel paper hypotheses.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAnalyzeGaps();
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            type="text"
            id="gap-query-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter research topic..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            id="btn-analyze-gaps"
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Compass size={14} />}
            <span>{loading ? 'Analyzing...' : 'Analyze Research Gaps'}</span>
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} id="gap-results-container">
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} />
            <span>Key Identified Research Gaps & Limitations</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }} id="gap-limitations-list">
            {gaps.map((g) => (
              <div
                key={g.id}
                style={{
                  padding: 10,
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--accent-amber)',
                }}
              >
                <strong>{g.title}</strong>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{g.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lightbulb size={15} />
            <span>Generated Novel Research Hypotheses</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }} id="gap-hypotheses-list">
            {hypotheses.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: 10,
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--accent-emerald)',
                }}
              >
                <strong>{h.title}</strong>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  <em>Idea:</em> {h.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
