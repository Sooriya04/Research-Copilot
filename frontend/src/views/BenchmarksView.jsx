import React, { useState } from 'react';
import { Play, Loader2, CheckCircle2, Award } from 'lucide-react';

export default function BenchmarksView() {
  const [isRunning, setIsRunning] = useState(false);
  const [epoch, setEpoch] = useState(14);

  const handleLaunch = () => {
    setIsRunning(true);
    const timer = setInterval(() => {
      setEpoch(prev => {
        if (prev >= 30) {
          clearInterval(timer);
          setIsRunning(false);
          return 30;
        }
        return prev + 1;
      });
    }, 500);
  };

  return (
    <section id="view-experiment-studio" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Benchmarks & SOTA Leaderboards</h1>
          <p className="panel-subtitle">
            Standardized evaluation protocol comparisons, dataset benchmark runs, and reproducible metric tracking.
          </p>
        </div>
        <button
          className="btn btn-primary"
          id="btn-launch-exp"
          onClick={handleLaunch}
          disabled={isRunning}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Running Epoch {epoch}/30...</span>
            </>
          ) : (
            <>
              <Play size={14} />
              <span>Launch Benchmark Run</span>
            </>
          )}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Active Pipeline Run</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12.5 }}>
            <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <strong>1. Repository Ingestion & Dependency Verification</strong>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Cloned repository `dessa-oss/fake-voice-detection`, installed PyTorch 2.1 & Torchaudio.
              </p>
            </div>
            <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <strong>2. ASVspoof 2021 LA Dataset Pipeline Setup</strong>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Loaded 19,200 evaluation audio samples into sandbox memory buffer.
              </p>
            </div>
            <div
              style={{
                padding: '8px 10px',
                background: 'var(--bg-accent-subtle)',
                border: '1px solid var(--accent-blue)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <strong style={{ color: 'var(--accent-blue)' }}>
                3. Model Training & Evaluation {isRunning ? '(Running)' : '(In Progress)'}
              </strong>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Evaluating ResNet-SincNet hybrid feature extractor layer. Epoch {epoch} / 30.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>ASVspoof Benchmark Leaderboard</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Architecture</th>
                <th>EER (%) ↓</th>
                <th>min t-DCF ↓</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--bg-accent-subtle)' }}>
                <td><strong>Research Copilot ResNet-SincNet</strong></td>
                <td><strong style={{ color: 'var(--accent-emerald)' }}>0.84%</strong></td>
                <td><strong style={{ color: 'var(--accent-emerald)' }}>0.0241</strong></td>
                <td><span className="badge badge-emerald">Ours (Best)</span></td>
              </tr>
              <tr>
                <td>RawNet2 Baseline</td>
                <td>1.23%</td>
                <td>0.0382</td>
                <td><span className="badge badge-neutral">Published</span></td>
              </tr>
              <tr>
                <td>AASIST (Graph Neural Net)</td>
                <td>0.91%</td>
                <td>0.0275</td>
                <td><span className="badge badge-neutral">Published</span></td>
              </tr>
              <tr>
                <td>LCNN + LFCC</td>
                <td>1.92%</td>
                <td>0.0520</td>
                <td><span className="badge badge-neutral">Baseline</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
