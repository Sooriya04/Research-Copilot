import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  ExternalLink,
  FileText,
  Award,
  Code,
  Database,
  Layers,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Flame,
  Activity,
  Globe,
  GitBranch,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function PaperDetailModal() {
  const { selectedPaper, closePaperModal, setActiveReaderPaper } = useApp();
  const navigate = useNavigate();

  const [artifacts, setArtifacts] = useState(null);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

  const identifier = selectedPaper?.arxiv_id || selectedPaper?.doi || selectedPaper?.title || selectedPaper?.id;

  useEffect(() => {
    if (!identifier) {
      setArtifacts(null);
      return;
    }

    let isMounted = true;
    setLoadingArtifacts(true);

    fetch(`/api/v1/paper/artifacts/${encodeURIComponent(identifier)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data) => {
        if (isMounted) setArtifacts(data);
      })
      .catch((err) => {
        console.debug('[PaperDetailModal] Artifacts notice:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingArtifacts(false);
      });

    return () => {
      isMounted = false;
    };
  }, [identifier]);

  if (!selectedPaper) return null;

  const title = selectedPaper.title || 'Untitled Research Paper';
  const abstract = selectedPaper.abstract || 'No abstract preview available for this document.';
  const source = selectedPaper.primary_source || selectedPaper.source || 'OpenAlex';
  const url = selectedPaper.url || selectedPaper.pdf_url;
  const score = selectedPaper.score;
  const breakdown = selectedPaper.score_breakdown;
  const checklist = selectedPaper.checklist;

  const rawAuth = selectedPaper.authors;
  const authorsList = Array.isArray(rawAuth)
    ? rawAuth.map((a) => (typeof a === 'string' ? a : a?.name || String(a))).join(', ')
    : typeof rawAuth === 'string'
    ? rawAuth
    : 'Authors listed in publication';

  const openInReader = () => {
    setActiveReaderPaper(selectedPaper);
    closePaperModal();
    navigate('/pdf-inspector');
  };

  const scoreComponents = [
    { key: 'topical_relevance', label: 'Topical Relevance', weight: '30%', val: breakdown?.topical_relevance || 0, icon: <Globe size={12} /> },
    { key: 'citation_impact', label: 'Citation Impact', weight: '20%', val: breakdown?.citation_impact || 0, icon: <Flame size={12} /> },
    { key: 'graph_prestige', label: 'Graph Prestige (PageRank)', weight: '20%', val: breakdown?.graph_prestige || 0, icon: <Activity size={12} /> },
    { key: 'citation_velocity', label: 'Citation Velocity', weight: '10%', val: breakdown?.citation_velocity || 0, icon: <Flame size={12} /> },
    { key: 'methodology_quality', label: 'Methodology Quality', weight: '10%', val: breakdown?.methodology_quality || 0, icon: <Layers size={12} /> },
    { key: 'reproducibility', label: 'Reproducibility & Open Science', weight: '10%', val: breakdown?.reproducibility || 0, icon: <Code size={12} /> },
  ];

  return (
    <div
      className="modal-overlay"
      id="paper-modal-overlay"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => {
        if (e.target.id === 'paper-modal-overlay') closePaperModal();
      }}
    >
      <div
        className="cmd-palette-card"
        style={{
          width: 740,
          maxWidth: '92vw',
          padding: '24px 26px',
          maxHeight: '88vh',
          overflowY: 'auto',
          borderRadius: 'var(--radius-lg, 12px)',
        }}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-blue" style={{ textTransform: 'uppercase', fontWeight: 600 }}>
              {source}
            </span>
            {selectedPaper.year && <span className="badge badge-neutral">{selectedPaper.year}</span>}
            {(selectedPaper.is_open_access || selectedPaper.pdf_url) && (
              <span className="badge badge-emerald">Open Access</span>
            )}
            {selectedPaper.citation_count ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {selectedPaper.citation_count} Citations
              </span>
            ) : null}
          </div>
          <button
            onClick={closePaperModal}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Paper Title */}
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', lineHeight: 1.35 }}>
          {title}
        </h2>

        {/* Authors */}
        {authorsList && (
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.4 }}>
            <strong>Authors:</strong> {authorsList}
          </p>
        )}

        {/* 1. PAPERRANK SCIENTIFIC EVALUATION SECTION */}
        {score !== null && score !== undefined && (
          <div
            className="card"
            style={{
              padding: '16px 18px',
              marginBottom: 16,
              background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-subtle) 100%)',
              border: '1.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={16} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  PaperRank 6-Factor Scientific Quality
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: score >= 70 ? 'rgba(16,185,129,0.12)' : (score >= 45 ? 'rgba(99,102,241,0.12)' : 'var(--bg-subtle)'),
                  color: score >= 70 ? '#059669' : (score >= 45 ? 'var(--accent-primary)' : 'var(--text-muted)'),
                  border: `1px solid ${score >= 70 ? 'rgba(16,185,129,0.3)' : (score >= 45 ? 'rgba(99,102,241,0.3)' : 'var(--border-subtle)')}`,
                }}
              >
                Score: {score} / 100
              </div>
            </div>

            {/* Score Breakdown Progress Bars Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px', marginBottom: 12 }}>
              {scoreComponents.map((c) => (
                <div key={c.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {c.icon} {c.label} ({c.weight})
                    </span>
                    <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-code)' }}>{c.val}</strong>
                  </div>
                  <div style={{ width: '100%', height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, c.val))}%`,
                        height: '100%',
                        background: 'var(--accent-primary, #6366f1)',
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Reproducibility & Methodology Rubric Chips */}
            {checklist && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: checklist.has_code_repo ? 'rgba(16,185,129,0.1)' : 'var(--bg-subtle)',
                    color: checklist.has_code_repo ? '#059669' : 'var(--text-muted)',
                    border: `1px solid ${checklist.has_code_repo ? 'rgba(16,185,129,0.25)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {checklist.has_code_repo ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  <span>Code Repository {checklist.has_code_repo ? 'Verified' : 'Unverified'}</span>
                </span>

                <span
                  style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: checklist.has_dataset_link ? 'rgba(16,185,129,0.1)' : 'var(--bg-subtle)',
                    color: checklist.has_dataset_link ? '#059669' : 'var(--text-muted)',
                    border: `1px solid ${checklist.has_dataset_link ? 'rgba(16,185,129,0.25)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {checklist.has_dataset_link ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  <span>Dataset Link {checklist.has_dataset_link ? 'Verified' : 'Unverified'}</span>
                </span>

                <span
                  style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: checklist.has_ablation ? 'rgba(99,102,241,0.1)' : 'var(--bg-subtle)',
                    color: checklist.has_ablation ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: `1px solid ${checklist.has_ablation ? 'rgba(99,102,241,0.25)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {checklist.has_ablation ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  <span>Ablation Studies</span>
                </span>

                <span
                  style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: checklist.has_empirical_eval ? 'rgba(99,102,241,0.1)' : 'var(--bg-subtle)',
                    color: checklist.has_empirical_eval ? 'var(--accent-primary)' : 'var(--text-muted)',
                    border: `1px solid ${checklist.has_empirical_eval ? 'rgba(99,102,241,0.25)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {checklist.has_empirical_eval ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  <span>Empirical Evaluation</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* 2. PAPERS WITH CODE & HUGGING FACE ARTIFACTS */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <GitBranch size={13} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Reproducibility Artifacts (Papers with Code & Hugging Face)
            </span>
          </div>

          {loadingArtifacts ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <Loader2 size={13} className="animate-spin" />
              <span>Querying Hugging Face and Papers with Code for live weights & benchmarks...</span>
            </div>
          ) : artifacts && (artifacts.code_repositories?.length > 0 || artifacts.benchmarks?.length > 0 || artifacts.hf_models?.length > 0 || artifacts.hf_datasets?.length > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Code Repositories */}
              {artifacts.code_repositories?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Verified Repositories:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {artifacts.code_repositories.map((repo, i) => (
                      <a
                        key={i}
                        href={repo.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11.5,
                          fontFamily: 'var(--font-code)',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--accent-blue)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Code size={11} />
                        <span>{repo.url.replace('https://github.com/', '')}</span>
                        {repo.stars > 0 && <span style={{ color: 'var(--text-muted)' }}>★ {repo.stars}</span>}
                        <ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Benchmarks Table */}
              {artifacts.benchmarks?.length > 0 && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    SOTA Benchmarks:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
                    {artifacts.benchmarks.slice(0, 4).map((b, i) => (
                      <div key={i} style={{ background: 'var(--bg-subtle)', padding: '6px 8px', borderRadius: 4, fontSize: 11.5 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.task}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {b.dataset}: <strong style={{ color: '#059669' }}>{b.value}</strong> ({b.metric})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hugging Face Hub Models & Datasets */}
              {(artifacts.hf_models?.length > 0 || artifacts.hf_datasets?.length > 0) && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Hugging Face Hub Weights & Datasets:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {artifacts.hf_models?.slice(0, 3).map((m, i) => (
                      <a
                        key={i}
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'rgba(255, 172, 51, 0.08)',
                          border: '1px solid rgba(255, 172, 51, 0.3)',
                          color: '#d97706',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Cpu size={11} />
                        <span>{m.name}</span>
                        {m.downloads > 0 && <span style={{ color: 'var(--text-muted)' }}>({m.downloads.toLocaleString()} dl)</span>}
                        <ExternalLink size={10} />
                      </a>
                    ))}
                    {artifacts.hf_datasets?.slice(0, 2).map((ds, i) => (
                      <a
                        key={i}
                        href={ds.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'rgba(139, 92, 246, 0.08)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          color: '#7c3aed',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Database size={11} />
                        <span>{ds.name}</span>
                        <ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
              No public repositories or Hugging Face weights indexed yet for this document.
            </div>
          )}
        </div>

        {/* 3. ABSTRACT & FINDINGS */}
        <div style={{ background: 'var(--bg-subtle)', padding: 14, borderRadius: 'var(--radius-sm, 6px)', marginBottom: 18 }}>
          <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700, letterSpacing: '0.05em' }}>
            Abstract & Scientific Findings
          </h4>
          <p style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
            {abstract}
          </p>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ExternalLink size={13} />
              <span>Source Document</span>
            </a>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={openInReader}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={13} />
            <span>Open in Paper Reader</span>
          </button>
        </div>
      </div>
    </div>
  );
}
