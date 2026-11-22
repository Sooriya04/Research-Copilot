import React from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';

export default function ScientificRows({
  showTab,
  papers,
  copiedGapId,
  onCopyGap,
}) {
  const showGaps = showTab === 'all' || showTab === 'gaps';
  const showMethod = showTab === 'all' || showTab === 'methodology';
  const showCode = showTab === 'all' || showTab === 'code';
  const showBenchmarks = showTab === 'all' || showTab === 'benchmarks';

  return (
    <>
      {/* ── 1. METHODOLOGY & PROBLEM ── */}
      {showMethod && (
        <>
          <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-subtle)' }}>
            <td colSpan={papers.length + 1} style={{ padding: '8px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              METHODOLOGY & PROBLEM FORMULATION
            </td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--bg-card)',
                zIndex: 1,
                borderRight: '1px solid var(--border-subtle)',
                verticalAlign: 'top',
                padding: '10px 16px',
              }}
            >
              <strong style={{ fontSize: 12 }}>Proposed Methodology</strong>
              <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Core mechanism & architecture</p>
            </td>
            {papers.map((p, i) => (
              <td
                key={i}
                style={{
                  verticalAlign: 'top',
                  padding: '10px 16px',
                  borderRight: '1px solid var(--border-subtle)',
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: 'var(--text-secondary)',
                  background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                }}
              >
                {p.methodology
                  ? p.methodology.slice(0, 220) + (p.methodology.length > 220 ? '...' : '')
                  : p.abstract
                  ? p.abstract.slice(0, 180) + (p.abstract.length > 180 ? '...' : '')
                  : 'Empirical formulation grounded in literature.'}
              </td>
            ))}
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--bg-card)',
                zIndex: 1,
                borderRight: '1px solid var(--border-subtle)',
                verticalAlign: 'middle',
                padding: '10px 16px',
              }}
            >
              <strong style={{ fontSize: 12 }}>Ablation Analysis</strong>
            </td>
            {papers.map((p, i) => (
              <td
                key={i}
                style={{
                  verticalAlign: 'middle',
                  padding: '10px 16px',
                  borderRight: '1px solid var(--border-subtle)',
                  background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                }}
              >
                {p.has_ablation ? (
                  <span className="badge badge-emerald" style={{ fontSize: 10.5 }}>
                    Verified Ablation Included
                  </span>
                ) : (
                  <span className="badge badge-amber" style={{ fontSize: 10.5 }}>
                    No Formal Ablation
                  </span>
                )}
              </td>
            ))}
          </tr>
        </>
      )}

      {/* ── 2. CODE & REPRODUCIBILITY ── */}
      {showCode && (
        <>
          <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-subtle)' }}>
            <td colSpan={papers.length + 1} style={{ padding: '8px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              CODE & REPRODUCIBILITY ARTIFACTS
            </td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--bg-card)',
                zIndex: 1,
                borderRight: '1px solid var(--border-subtle)',
                verticalAlign: 'middle',
                padding: '10px 16px',
              }}
            >
              <strong style={{ fontSize: 12 }}>Source Code Repo</strong>
            </td>
            {papers.map((p, i) => {
              const repoUrl = p.code_url || (p.code_repositories && p.code_repositories[0]?.url);
              return (
                <td
                  key={i}
                  style={{
                    verticalAlign: 'middle',
                    padding: '10px 16px',
                    borderRight: '1px solid var(--border-subtle)',
                    background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                  }}
                >
                  {repoUrl ? (
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                    >
                      <span>GitHub Repository</span>
                    </a>
                  ) : (
                    <span className="badge badge-gray" style={{ fontSize: 10.5 }}>
                      No public code detected
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--bg-card)',
                zIndex: 1,
                borderRight: '1px solid var(--border-subtle)',
                verticalAlign: 'middle',
                padding: '10px 16px',
              }}
            >
              <strong style={{ fontSize: 12 }}>Compute Budget</strong>
            </td>
            {papers.map((p, i) => (
              <td
                key={i}
                style={{
                  verticalAlign: 'middle',
                  padding: '10px 16px',
                  borderRight: '1px solid var(--border-subtle)',
                  background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                }}
              >
                {p.has_compute_budget ? (
                  <span className="badge badge-emerald" style={{ fontSize: 10.5 }}>
                    {p.compute_details || 'Hardware Disclosed'}
                  </span>
                ) : (
                  <span className="badge badge-gray" style={{ fontSize: 10.5 }}>
                    Undisclosed
                  </span>
                )}
              </td>
            ))}
          </tr>
        </>
      )}

      {/* ── 3. GROUND-TRUTHED RESEARCH GAPS ── */}
      {showGaps && (
        <>
          <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-subtle)' }}>
            <td colSpan={papers.length + 1} style={{ padding: '8px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              GROUNDED RESEARCH GAPS & LIMITATIONS
            </td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--bg-card)',
                zIndex: 1,
                borderRight: '1px solid var(--border-subtle)',
                verticalAlign: 'top',
                padding: '12px 16px',
              }}
            >
              <strong style={{ fontSize: 12 }}>Identified Gaps</strong>
              <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Methodological bottlenecks</p>
            </td>
            {papers.map((p, i) => {
              const gaps = p.research_gaps || [];
              return (
                <td
                  key={i}
                  style={{
                    verticalAlign: 'top',
                    padding: '12px 16px',
                    borderRight: '1px solid var(--border-subtle)',
                    background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                  }}
                >
                  {gaps.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {gaps.map((gap, gIdx) => (
                        <div
                          key={gIdx}
                          style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '6px 8px',
                            fontSize: 11,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{gap.title}</strong>
                            <button
                              type="button"
                              onClick={() => onCopyGap(p, gap, gIdx)}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                padding: 0,
                              }}
                              title="Copy gap"
                            >
                              {copiedGapId === `${p.id}-${gIdx}` ? <CheckCircle2 size={10} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={10} />}
                            </button>
                          </div>
                          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                            {gap.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {p.isOurs ? 'Addresses baseline limitations.' : 'No severe gaps identified.'}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        </>
      )}

      {/* ── 4. EMPIRICAL BENCHMARKS ── */}
      {showBenchmarks && (
        <>
          <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border-subtle)' }}>
            <td colSpan={papers.length + 1} style={{ padding: '8px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              EMPIRICAL BENCHMARKS (Papers with Code)
            </td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--bg-card)',
                zIndex: 1,
                borderRight: '1px solid var(--border-subtle)',
                verticalAlign: 'top',
                padding: '10px 16px',
              }}
            >
              <strong style={{ fontSize: 12 }}>Evaluated Tasks</strong>
            </td>
            {papers.map((p, i) => {
              const bmList = p.benchmarks || [];
              return (
                <td
                  key={i}
                  style={{
                    verticalAlign: 'top',
                    padding: '10px 16px',
                    borderRight: '1px solid var(--border-subtle)',
                    background: p.isOurs ? 'rgba(37, 99, 235, 0.03)' : 'transparent',
                  }}
                >
                  {bmList.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {bmList.slice(0, 3).map((bm, bIdx) => (
                        <div
                          key={bIdx}
                          style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '4px 6px',
                            fontSize: 10.5,
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{bm.task || 'Task'}</div>
                          <div style={{ color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{bm.dataset}</span>
                            <strong style={{ color: 'var(--accent-primary, #2563eb)' }}>{bm.metric} = {bm.value}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Standard academic benchmarks.</span>
                  )}
                </td>
              );
            })}
          </tr>
        </>
      )}
    </>
  );
}
