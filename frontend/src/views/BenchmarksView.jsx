import React from 'react';
import { FlaskConical, Clock, ShieldCheck, Cpu } from 'lucide-react';

export default function BenchmarksView() {
  return (
    <section id="view-experiment-studio" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Benchmarks & SOTA Leaderboards</h1>
          <p className="panel-subtitle">
            Autonomous sandboxed experiment execution, benchmark evaluation, and reproducible metric tracking.
          </p>
        </div>
        <span className="badge badge-blue" style={{ fontSize: 12, padding: '4px 10px' }}>
          Coming Soon
        </span>
      </div>

      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <FlaskConical size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-blue)', display: 'block' }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Sandboxed Benchmark & Experiment Execution Engine
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 24px', lineHeight: 1.6 }}>
          This engineering subsystem will integrate containerized reproduction environments (Docker, Modal, RunPod) to clone official repositories, verify dependencies, run baseline evaluations, and log metrics against SOTA leaderboards automatically.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 700, margin: '0 auto', textAlign: 'left' }}>
          <div style={{ padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <ShieldCheck size={16} style={{ color: 'var(--accent-emerald)' }} />
              <strong style={{ fontSize: 13 }}>Codebase Audit</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Verifies equations and hyperparameters against linked GitHub repositories.
            </p>
          </div>

          <div style={{ padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Cpu size={16} style={{ color: 'var(--accent-blue)' }} />
              <strong style={{ fontSize: 13 }}>Compute Sandbox</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Dispatches remote execution jobs to cloud GPUs with strict hardware budgets.
            </p>
          </div>

          <div style={{ padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Clock size={16} style={{ color: 'var(--accent-violet)' }} />
              <strong style={{ fontSize: 13 }}>Automated SOTA Logs</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Ingests leaderboard metrics directly from Papers With Code.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
