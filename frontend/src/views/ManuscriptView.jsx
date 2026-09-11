import React from 'react';
import { PenTool, FileText, CheckCircle2, BookOpen } from 'lucide-react';

export default function ManuscriptView() {
  return (
    <section id="view-manuscript" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Structured Manuscript Draft Studio</h1>
          <p className="panel-subtitle">
            Autonomous publication-ready LaTeX paper generation grounded in verified experimental evidence.
          </p>
        </div>
        <span className="badge badge-blue" style={{ fontSize: 12, padding: '4px 10px' }}>
          Coming Soon
        </span>
      </div>

      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <PenTool size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-violet)', display: 'block' }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Publication-Ready Manuscript Generator
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 24px', lineHeight: 1.6 }}>
          This subsystem translates verified research findings, empirical metric tables, and related work into structured 8-section LaTeX papers with verified citation integrity, mathematical formulations, and figures.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 700, margin: '0 auto', textAlign: 'left' }}>
          <div style={{ padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
              <strong style={{ fontSize: 13 }}>8-Section LaTeX</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Generates full-length research drafts with abstract, method, experiments, and limitations.
            </p>
          </div>

          <div style={{ padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              <strong style={{ fontSize: 13 }}>Citation Verification</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Guarantees zero hallucinated citations by anchoring references to OpenAlex and arXiv DOIs.
            </p>
          </div>

          <div style={{ padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <BookOpen size={16} style={{ color: 'var(--accent-amber)' }} />
              <strong style={{ fontSize: 13 }}>BibTeX Export</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Exports clean, compilable <span style={{ fontFamily: 'var(--font-code)' }}>.tex</span> bundles ready for Overleaf and arXiv submission.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
