import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Database, Network, BookOpen, Layers } from 'lucide-react';

export default function OverviewView() {
  const navigate = useNavigate();
  const [graphStats, setGraphStats] = useState({
    total_papers: 0,
    total_methods: 0,
    total_datasets: 0,
    total_gaps: 0,
  });
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    // 1. Fetch real graph summary
    fetch('/api/v1/graph/summary')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) {
          setGraphStats({
            total_papers: data.total_papers || 0,
            total_methods: data.total_methods || 0,
            total_datasets: data.total_datasets || 0,
            total_gaps: data.total_gaps || 0,
          });
        }
      })
      .catch(() => {});

    // 2. Fetch real sessions
    fetch('/api/v1/workbench/sessions')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && Array.isArray(data)) {
          setRecentSessions(data.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  const handleRecentSession = (query) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <section id="view-dashboard" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Scientific Research Overview</h1>
          <p className="panel-subtitle">
            Multi-source literature aggregation, deduplication & knowledge graph ingestion pipeline.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/search')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} />
          <span>New Literature Query</span>
        </button>
      </div>

      {/* Metrics Ribbon */}
      <div className="metrics-strip">
        <div className="metric-box">
          <span className="metric-label">Indexed Scientific Papers</span>
          <span className="metric-val">{graphStats.total_papers}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Extracted Methods</span>
          <span className="metric-val">{graphStats.total_methods}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Benchmark Datasets</span>
          <span className="metric-val">{graphStats.total_datasets}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">Identified Research Gaps</span>
          <span className="metric-val">{graphStats.total_gaps}</span>
        </div>
      </div>

      {/* Content Grid */}
      <div className="dashboard-grid">
        <div className="card">
          <h3>Scientific Sources & Indexing Pipeline</h3>
          <div className="sources-grid">
            <div className="source-chip"><strong>arXiv</strong><span>Preprints & Physics/CS</span></div>
            <div className="source-chip"><strong>Hugging Face</strong><span>Models & Datasets</span></div>
            <div className="source-chip"><strong>Papers with Code</strong><span>SOTA Benchmarks</span></div>
            <div className="source-chip"><strong>GitHub</strong><span>Source Repositories</span></div>
            <div className="source-chip"><strong>OpenAlex</strong><span>Publication Graph</span></div>
            <div className="source-chip"><strong>Semantic Scholar</strong><span>Citations & Metrics</span></div>
            <div className="source-chip"><strong>Crossref</strong><span>Publisher DOIs</span></div>
            <div className="source-chip"><strong>PubMed / Europe PMC</strong><span>Bio & Medical</span></div>
          </div>
        </div>

        <div className="card">
          <h3>Recent Research Sessions</h3>
          <div className="session-list" id="recent-sessions-container">
            {recentSessions.length > 0 ? (
              recentSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="session-row"
                  onClick={() => handleRecentSession(sess.query || '')}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <span className="session-title">{sess.query}</span>
                    <span className="session-sub">Session {sess.id} • {sess.status}</span>
                  </div>
                  <span className="badge badge-blue">Saved</span>
                </div>
              ))
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <BookOpen size={24} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--text-muted)' }} />
                No prior search sessions found. Run a query in <strong>Literature Search</strong> to begin.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
