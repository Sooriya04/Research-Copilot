import React, { useState, useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import {
  Network as NetworkIcon,
  Table2,
  Columns3,
  RotateCw,
  Maximize2,
  Info,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function KnowledgeGraphView() {
  const { theme, comparisonPapers, clearComparisonPapers, removeComparisonPaper } = useApp();
  const [graphMode, setGraphMode] = useState('graph'); // 'graph' | 'matrix' | 'compare'
  const [selectedEntity, setSelectedEntity] = useState(null);
  const containerRef = useRef(null);
  const networkRef = useRef(null);

  // Default Graph Data
  const defaultGraphData = {
    nodes: [
      { id: '1', label: 'Audio DeepFake Detection', group: 'topic', title: 'Root Research Domain' },
      { id: '2', label: 'Are audio DeepFake models polyglots?', group: 'paper', title: 'Kinnunen et al., 2024' },
      { id: '3', label: 'ASVspoof 2021 Challenge Baseline', group: 'paper', title: 'Yamagishi et al., 2021' },
      { id: '4', label: 'Self-Supervised Wav2Vec 2.0', group: 'method', title: 'Speech Feature Extractor' },
      { id: '5', label: 'Cross-lingual Generalization', group: 'concept', title: 'Acoustic Generalization' },
      { id: '6', label: 'Mamba State Space Models', group: 'paper', title: 'Gu & Dao, 2023' },
    ],
    edges: [
      { from: '1', to: '2', label: 'investigates' },
      { from: '1', to: '3', label: 'benchmark' },
      { from: '2', to: '5', label: 'evaluates' },
      { from: '2', to: '4', label: 'uses' },
      { from: '3', to: '4', label: 'baseline' },
      { from: '6', to: '4', label: 'extends' },
    ]
  };

  useEffect(() => {
    if (graphMode === 'graph' && containerRef.current) {
      renderVisGraph();
    }
  }, [graphMode, theme]);

  const renderVisGraph = () => {
    if (!containerRef.current) return;

    const isDark = theme === 'dark';
    const textColor = isDark ? '#fafafa' : '#09090b';
    const bgNodeColor = isDark ? '#27272a' : '#ffffff';
    const borderNodeColor = isDark ? '#3b82f6' : '#2563eb';
    const edgeColor = isDark ? '#52525b' : '#cbd5e1';

    const nodes = defaultGraphData.nodes.map(n => ({
      ...n,
      color: {
        background: bgNodeColor,
        border: borderNodeColor,
        highlight: { background: '#2563eb', border: '#1d4ed8' },
      },
      font: { color: textColor, size: 12, face: 'Plus Jakarta Sans' },
      shape: 'box',
      margin: 10,
      shadow: true,
    }));

    const edges = defaultGraphData.edges.map(e => ({
      ...e,
      color: { color: edgeColor, highlight: '#2563eb' },
      font: { color: isDark ? '#a1a1aa' : '#71717a', size: 10, align: 'middle' },
      arrows: 'to',
      smooth: { type: 'continuous' },
    }));

    const options = {
      physics: {
        stabilization: true,
        barnesHut: {
          gravitationalConstant: -3000,
          springLength: 120,
          springConstant: 0.04,
        },
      },
      interaction: { hover: true, tooltipDelay: 200 },
    };

    const network = new Network(containerRef.current, { nodes, edges }, options);
    networkRef.current = network;

    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = defaultGraphData.nodes.find(n => n.id === nodeId);
        if (node) {
          setSelectedEntity({
            id: node.id,
            title: node.label,
            type: node.group ? node.group.toUpperCase() : 'ENTITY',
            summary: node.title || 'Connected literature entity in the Research Copilot Knowledge Graph.',
            connections: defaultGraphData.edges.filter(e => e.from === node.id || e.to === node.id).length,
          });
        }
      }
    });
  };

  const handleResetFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    }
  };

  return (
    <section id="view-knowledge-graph" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Research Knowledge Graph</h1>
          <p className="panel-subtitle">
            Paper-to-Paper network graph linking Research Papers by shared technical methodologies & concepts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-secondary btn-sm ${graphMode === 'graph' ? 'btn-primary' : ''}`}
            onClick={() => setGraphMode('graph')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <NetworkIcon size={13} />
            <span>Graph Canvas View</span>
          </button>
          <button
            className={`btn btn-secondary btn-sm ${graphMode === 'matrix' ? 'btn-primary' : ''}`}
            onClick={() => setGraphMode('matrix')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Table2 size={13} />
            <span>Relationship Matrix Table</span>
          </button>
          <button
            className={`btn btn-secondary btn-sm ${graphMode === 'compare' ? 'btn-primary' : ''}`}
            onClick={() => setGraphMode('compare')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Columns3 size={13} />
            <span>Multi-Paper Comparison Matrix</span>
          </button>
          {graphMode === 'graph' && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={renderVisGraph}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RotateCw size={13} />
                <span>Reload</span>
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleResetFit}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Maximize2 size={13} />
                <span>Reset Fit</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 1. Graph Canvas View */}
      {graphMode === 'graph' && (
        <div className="graph-workspace" id="graph-workspace-view">
          <div className="card graph-canvas-box" style={{ height: 600, position: 'relative' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
            <div className="graph-legend-strip">
              <div><span className="dot dot-paper"></span> Research Paper Node</div>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 2,
                    background: 'var(--accent-emerald)',
                    verticalAlign: 'middle',
                    marginRight: 4,
                  }}
                ></span>
                Shared Methodology Link
              </div>
            </div>
          </div>

          <div className="card" id="graph-inspector-panel">
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Entity Inspector</h3>
            <p className="panel-subtitle" style={{ fontSize: 12 }}>
              Select any graph node on the canvas to inspect its metadata relationships.
            </p>

            {selectedEntity ? (
              <div id="inspector-details-content" style={{ marginTop: 14 }}>
                <span className="badge badge-blue">{selectedEntity.type}</span>
                <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: '8px 0 4px' }}>
                  {selectedEntity.title}
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {selectedEntity.summary}
                </p>
                <div className="inspector-meta-list" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong>Direct Relations:</strong> {selectedEntity.connections} edges
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <Info size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                Click a node in the graph to view properties.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Relationship Matrix Table */}
      {graphMode === 'matrix' && (
        <div className="card table-box" id="matrix-workspace-view">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Paper Content Relationship Matrix</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Source Paper</th>
                <th>Target Paper</th>
                <th>Shared Concept</th>
                <th>Scientific Link Rationale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Are audio DeepFake models polyglots?</strong></td>
                <td>ASVspoof 2021 Challenge Baseline</td>
                <td><span className="badge badge-blue">Wav2Vec 2.0</span></td>
                <td>Shared pre-trained feature representation benchmarked across language partitions.</td>
              </tr>
              <tr>
                <td><strong>Attention Is All You Need</strong></td>
                <td>Language Models are Few-Shot Learners</td>
                <td><span className="badge badge-violet">Transformer Decoder</span></td>
                <td>Autoregressive self-attention architecture scaled from 65M to 175B parameters.</td>
              </tr>
              <tr>
                <td><strong>Mamba: Linear-Time Sequence Modeling</strong></td>
                <td>Attention Is All You Need</td>
                <td><span className="badge badge-emerald">Selective State Space</span></td>
                <td>Replaces quadratic O(N^2) attention with O(N) hardware-aware scan kernels.</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Multi-Paper Comparison Matrix */}
      {graphMode === 'compare' && (
        <div className="card table-box" id="compare-workspace-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Side-by-Side Multi-Paper Comparison Matrix</h3>
              <p className="panel-subtitle" style={{ fontSize: 12 }}>
                Compare selected research papers across architecture, datasets, loss formulations, compute budget, and metrics.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-blue">
                {comparisonPapers.length} / 5 Papers Selected
              </span>
              {comparisonPapers.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={clearComparisonPapers}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <X size={13} />
                  <span>Clear Selection</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 750 }}>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Comparison Dimension</th>
                  {comparisonPapers.length > 0 ? (
                    comparisonPapers.map((paper, idx) => (
                      <th key={paper.id || idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{paper.title.slice(0, 30)}...</span>
                          <button
                            onClick={() => removeComparisonPaper(paper.id || paper.canonical_id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </th>
                    ))
                  ) : (
                    <>
                      <th>Mamba (Gu & Dao, 2023)</th>
                      <th>Transformer (Vaswani et al., 2017)</th>
                      <th>ASVspoof Deepfake Polyglot (2024)</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Core Architecture</strong></td>
                  {comparisonPapers.length > 0 ? (
                    comparisonPapers.map((p, i) => (
                      <td key={i}>{p.methods ? p.methods.join(', ') : 'State Space / Attention Layer'}</td>
                    ))
                  ) : (
                    <>
                      <td>Selective State Space (SSM) with GPU scan</td>
                      <td>Multi-Head Scaled Dot-Product Attention</td>
                      <td>ResNet-SincNet Hybrid Feature Extractor</td>
                    </>
                  )}
                </tr>
                <tr>
                  <td><strong>Complexity</strong></td>
                  {comparisonPapers.length > 0 ? (
                    comparisonPapers.map((p, i) => <td key={i}>Linear O(N) / Quadratic O(N²)</td>)
                  ) : (
                    <>
                      <td><span className="badge badge-emerald">O(N) Linear Time</span></td>
                      <td><span className="badge badge-neutral">O(N²) Quadratic</span></td>
                      <td><span className="badge badge-blue">O(N) Temporal Scan</span></td>
                    </>
                  )}
                </tr>
                <tr>
                  <td><strong>Evaluation Datasets</strong></td>
                  {comparisonPapers.length > 0 ? (
                    comparisonPapers.map((p, i) => <td key={i}>{p.datasets ? p.datasets.join(', ') : 'The Pile, WikiText-103'}</td>)
                  ) : (
                    <>
                      <td>The Pile, LAMBADA, WikiText-103</td>
                      <td>WMT 2014 English-to-German, WMT En-Fr</td>
                      <td>ASVspoof 2021 LA & DF, In-the-Wild Voice</td>
                    </>
                  )}
                </tr>
                <tr>
                  <td><strong>Reported Metric</strong></td>
                  {comparisonPapers.length > 0 ? (
                    comparisonPapers.map((p, i) => <td key={i}>SOTA Empirical Benchmark Result</td>)
                  ) : (
                    <>
                      <td>5x inference throughput, 5.6 perplexity</td>
                      <td>28.4 BLEU on WMT 2014 En-De</td>
                      <td>0.84% Equal Error Rate (EER)</td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
