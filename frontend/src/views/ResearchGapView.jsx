import React, { useState, useEffect } from 'react';
import { Compass, AlertTriangle, Lightbulb, Loader2, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ResearchGapView() {
  const { searchQuery } = useApp();
  const [topic, setTopic] = useState(searchQuery || '');
  const [loading, setLoading] = useState(false);
  const [gaps, setGaps] = useState([]);
  const [hypotheses, setHypotheses] = useState([]);

  useEffect(() => {
    if (searchQuery && !topic) {
      setTopic(searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => {
    // Load real detected gaps from SQLite / Knowledge Graph
    fetch('/api/v1/graph/gaps')
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setGaps(data.map((g, i) => ({
            id: g.id || `gap-${i}`,
            title: `${i + 1}. Unexplored: ${g.method_id || 'Method'} on ${g.dataset_id || 'Dataset'}`,
            desc: g.description || 'No existing publication evaluates this methodology on this benchmark dataset.',
            confidence: g.confidence,
          })));
        }
      })
      .catch(() => {});
  }, []);

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
              desc: h.hypothesis_statement || h.rationale || h.experimental_design || 'Testable research hypothesis.',
            }))
          );
        }
      }
    } catch (err) {
      // Keep state
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
            Identify open scientific limitations, combinatorial graph gaps, and generate novel paper hypotheses.
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
            placeholder="Enter research topic (e.g. 'sparse autoencoders mechanistic interpretability')..."
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
            <span>{loading ? 'Analyzing...' : 'Generate Hypotheses'}</span>
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} id="gap-results-container">
        {/* Left Column: Combinatorial Graph Gaps */}
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} />
            <span>Detected Combinatorial Literature Gaps</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }} id="gap-limitations-list">
            {gaps.length > 0 ? (
              gaps.map((g) => (
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
              ))
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No combinatorial gaps detected yet. Ingest multiple papers in the <strong>Knowledge Graph</strong> to automatically compute unproven Method × Dataset pairs.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Generated Hypotheses */}
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lightbulb size={15} />
            <span>Generated Novel Research Hypotheses</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }} id="gap-hypotheses-list">
            {hypotheses.length > 0 ? (
              hypotheses.map((h) => (
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
                    <em>Rationale:</em> {h.desc}
                  </p>
                </div>
              ))
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <Sparkles size={24} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--accent-emerald)' }} />
                Enter a scientific topic above and click <strong>Generate Hypotheses</strong> to formulate novel research questions grounded in scientific evidence.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
