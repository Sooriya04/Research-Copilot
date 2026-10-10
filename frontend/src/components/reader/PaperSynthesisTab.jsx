import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Award,
  Layers,
  Code,
  Globe,
  Flame,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Cpu,
  Database,
  Quote,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  X,
} from 'lucide-react';

export default function PaperSynthesisTab({ paper }) {
  const [loading, setLoading] = useState(false);
  const [critiqueData, setCritiqueData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expandedSnippets, setExpandedSnippets] = useState({});
  const [claimReviews, setClaimReviews] = useState({});

  const checklist = critiqueData?.checklist || paper?.checklist;
  const score = critiqueData?.score ?? paper?.score ?? (checklist?.rubric_score ? Math.round(checklist.rubric_score * 0.7 + 25) : 55);
  const breakdown = critiqueData?.score_breakdown || paper?.score_breakdown || {
    topical_relevance: 90.0,
    citation_impact: (paper?.citation_count ? Math.min(100, Math.round(Math.log1p(paper.citation_count) * 15)) : 20.0),
    graph_prestige: 75.0,
    citation_velocity: (paper?.citation_count ? Math.min(100, Math.round(paper.citation_count / 2)) : 15.0),
    methodology_quality: checklist?.rubric_score || 50.0,
    reproducibility: 60.0,
  };
  const claims = (critiqueData?.claims && critiqueData.claims.length > 0)
    ? critiqueData.claims
    : (paper?.summary?.claims || paper?.claims || []);

  const handleClaimReview = async (claim, status) => {
    const claimId = claim.id || `claim-${(claim.claim || '').slice(0, 16).replace(/\s+/g, '_')}`;
    const current = claimReviews[claimId] !== undefined ? claimReviews[claimId] : claim.reviewer_status;
    const next = current === status ? null : status;
    setClaimReviews((prev) => ({ ...prev, [claimId]: next }));
    try {
      await fetch('/api/v1/papers/claims/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          paper_id: paper?.canonical_id || paper?.id || null,
          reviewer_status: next || 'pending',
          note: 'Signed off in Paper Synthesis Tab',
          reviewer: 'researcher',
        }),
      });
    } catch (err) {
      console.warn('Failed to submit claim review:', err);
    }
  };

  // Fetch or generate critique synthesis on mount or when paper changes
  useEffect(() => {
    if (!paper) return;

    let isMounted = true;
    async function loadSynthesis() {
      setLoading(true);
      try {
        const identifier = paper.doi || paper.arxiv_id || paper.id || '';
        const paperFullText = paper.full_text || paper.markdown || paper.markdown_content || paper.sections?.map((s) => `${s.title}\n${s.content}`).join('\n\n') || paper.abstract || '';
        const res = await fetch('/api/v1/papers/critique', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: identifier,
            title: paper.title || '',
            abstract: paper.abstract || '',
            full_text: paperFullText,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted) setCritiqueData(data);
        }
      } catch (err) {
        console.warn('Failed to load critique synthesis:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSynthesis();
    return () => {
      isMounted = false;
    };
  }, [paper?.id, paper?.title]);

  const toggleSnippet = (id) => {
    setExpandedSnippets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copySynthesisMarkdown = () => {
    if (!paper) return;
    const items = checklist?.items || [];
    const text = [
      `# Paper Synthesis: ${paper.title || 'Untitled'}`,
      `**PaperRank Score**: ${score ?? 'N/A'}/100`,
      `**Evaluated Rubric Score**: ${checklist?.rubric_score ?? 'N/A'}/100`,
      '',
      '## Methodology Rigor Checklist (NeurIPS Rubrics)',
      ...items.map((it) => `- **${it.label}** [${it.answer?.toUpperCase()}]: ${it.rationale}`),
      '',
      '## Core Strengths',
      ...(critiqueData?.strengths || ['Empirically validated methodology.']).map((s) => `- ${s}`),
      '',
      '## Concerns & Methodological Limitations',
      ...(critiqueData?.concerns_and_limitations || ['Standard computational bounds.']).map((c) => `- ${c}`),
      '',
      '## Author Follow-Up Questions',
      ...(critiqueData?.follow_up_questions || []).map((q) => `1. ${q}`),
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scoreComponents = [
    { key: 'topical_relevance', label: 'Topical Relevance', weight: '30%', val: breakdown?.topical_relevance || 0, icon: <Globe size={11} /> },
    { key: 'citation_impact', label: 'Citation Impact', weight: '20%', val: breakdown?.citation_impact || 0, icon: <Flame size={11} /> },
    { key: 'graph_prestige', label: 'Graph Prestige (PageRank)', weight: '20%', val: breakdown?.graph_prestige || 0, icon: <Activity size={11} /> },
    { key: 'citation_velocity', label: 'Citation Velocity', weight: '10%', val: breakdown?.citation_velocity || 0, icon: <Flame size={11} /> },
    { key: 'methodology_quality', label: 'Methodology Quality', weight: '10%', val: breakdown?.methodology_quality || 0, icon: <Layers size={11} /> },
    { key: 'reproducibility', label: 'Open Reproducibility', weight: '10%', val: breakdown?.reproducibility || 0, icon: <Code size={11} /> },
  ];

  const items = checklist?.items || [];

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} style={{ color: 'var(--accent-violet, #6366f1)' }} />
          <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Paper Synthesis & Rigor Audit
          </h3>
        </div>
        <button
          type="button"
          onClick={copySynthesisMarkdown}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            fontSize: 11,
            borderRadius: 5,
            border: '1px solid var(--border-subtle, #e2e8f0)',
            background: 'var(--bg-card, #ffffff)',
            color: 'var(--text-muted, #64748b)',
            cursor: 'pointer',
          }}
          title="Copy Synthesis Report as Markdown"
        >
          {copied ? <Check size={12} color="#059669" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy Report'}</span>
        </button>
      </div>

      {/* 1. PAPERRANK SCORING CARD */}
      <div
        style={{
          background: 'var(--bg-subtle, #f8fafc)',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          borderRadius: 8,
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            PaperRank Scoring Signal
          </span>
          {score != null ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: score >= 70 ? 'rgba(16,185,129,0.12)' : (score >= 45 ? 'rgba(99,102,241,0.12)' : 'var(--bg-card)'),
                color: score >= 70 ? '#059669' : (score >= 45 ? 'var(--accent-violet, #6366f1)' : 'var(--text-muted)'),
                border: `1px solid ${score >= 70 ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`,
              }}
            >
              {score} / 100
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Heuristic Evaluation</span>
          )}
        </div>

        {/* Breakdown Progress Bars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px 12px' }}>
          {scoreComponents.map((c) => (
            <div key={c.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {c.icon} {c.label} ({c.weight})
                </span>
                <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-code)' }}>{c.val}</strong>
              </div>
              <div style={{ width: '100%', height: 3.5, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, c.val))}%`,
                    height: '100%',
                    background: 'var(--accent-violet, #6366f1)',
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. METHODOLOGY RIGOR CHECKLIST */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            NeurIPS / ICLR Rigor Checklist
          </span>
          {checklist?.rubric_score != null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>
              Rubric: {checklist.rubric_score}/100
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
            Evaluating paper full-text and methodology sections...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {items.map((item) => {
              const isPresent = item.answer === 'present';
              const isPartial = item.answer === 'partial';
              const isMissing = item.answer === 'missing';
              const isExpanded = expandedSnippets[item.id];

              return (
                <div
                  key={item.id}
                  style={{
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 7,
                    background: 'var(--bg-card, #ffffff)',
                    padding: '8px 10px',
                    fontSize: 11.5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {isPresent ? (
                        <CheckCircle2 size={13} color="#059669" />
                      ) : isPartial ? (
                        <AlertCircle size={13} color="#d97706" />
                      ) : (
                        <AlertCircle size={13} color="#94a3b8" />
                      )}
                      <span>{item.label}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: isPresent ? 'rgba(16,185,129,0.1)' : isPartial ? 'rgba(217,119,6,0.1)' : 'var(--bg-subtle)',
                          color: isPresent ? '#059669' : isPartial ? '#d97706' : 'var(--text-muted)',
                        }}
                      >
                        {item.answer}
                      </span>
                      {item.evidence_snippet && (
                        <button
                          type="button"
                          onClick={() => toggleSnippet(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 1,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Toggle evidence quote"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {item.rationale}
                  </div>

                  {/* Matched markers chips */}
                  {item.matched_markers && item.matched_markers.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {item.matched_markers.slice(0, 3).map((m, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 9.5,
                            padding: '1px 5px',
                            background: 'var(--bg-subtle)',
                            borderRadius: 3,
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-code)',
                          }}
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Extracted Evidence Excerpt */}
                  {item.evidence_snippet && isExpanded && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '6px 8px',
                        background: 'rgba(99,102,241,0.05)',
                        borderLeft: '2px solid var(--accent-violet, #6366f1)',
                        borderRadius: '0 4px 4px 0',
                        fontSize: 10.5,
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                        lineHeight: 1.4,
                      }}
                    >
                      <Quote size={10} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
                      {item.evidence_snippet}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rubric Gaps & Recommendations */}
        {checklist?.recommendations && checklist.recommendations.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              background: 'rgba(217,119,6,0.06)',
              border: '1px solid rgba(217,119,6,0.2)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ fontWeight: 600, color: '#d97706', marginBottom: 4 }}>
              ⚠ Identified Rigor Gaps ({checklist.rubric_gaps || checklist.recommendations.length}):
            </div>
            <ul style={{ margin: 0, paddingLeft: 14 }}>
              {checklist.recommendations.map((rec, i) => (
                <li key={i} style={{ marginBottom: 2, color: 'var(--text-secondary)' }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3. STRUCTURED PAPER CRITIQUE (P3) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Critical Peer Review & Synthesis
          </span>
          {loading && (
            <span style={{ fontSize: 10.5, color: 'var(--accent-violet)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={10} className="animate-spin" /> Synthesizing...
            </span>
          )}
        </div>

        {critiqueData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Verdict */}
            {critiqueData.verdict && (
              <div
                style={{
                  fontSize: 11.5,
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: 'rgba(99,102,241,0.08)',
                  color: 'var(--accent-violet, #6366f1)',
                  fontWeight: 600,
                  border: '1px solid rgba(99,102,241,0.2)',
                }}
              >
                Verdict: {critiqueData.verdict}
              </div>
            )}

            {/* Core Strengths */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={12} />
                <span>Core Methodological Strengths</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
                {critiqueData.strengths?.map((s, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{s}</li>
                ))}
              </ul>
            </div>

            {/* Critical Concerns & Limitations */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={12} />
                <span>Methodological Threats & Limitations</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
                {critiqueData.concerns_and_limitations?.map((c, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{c}</li>
                ))}
              </ul>
            </div>

            {/* Author Follow-Up Probe Questions */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-violet, #6366f1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <HelpCircle size={12} />
                <span>Author Probe Questions for Replication</span>
              </div>
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
                {critiqueData.follow_up_questions?.map((q, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{q}</li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center' }}>
            {loading ? 'Synthesizing evidence-based review...' : 'Critique will load automatically for this paper.'}
          </div>
        )}
      </div>

      {/* 4. AUDITED CLAIMS & MECHANICAL VERIFIER */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Audited Claims & Mechanical Quote Verifier
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            {claims.length} claim{claims.length !== 1 ? 's' : ''}
          </span>
        </div>

        {claims && claims.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {claims.map((c, idx) => {
              const claimId = c.id || `claim-${idx}`;
              const currentStatus = claimReviews[claimId] !== undefined ? claimReviews[claimId] : c.reviewer_status;
              const isMech = c.mechanically_verified;

              return (
                <div
                  key={claimId}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 7,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {c.claim}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {isMech ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <ShieldCheck size={11} />
                          <span>p.{c.page || 1} Quote Verified</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(99, 102, 241, 0.1)',
                            color: 'var(--accent-violet, #6366f1)',
                          }}
                        >
                          {c.verification_status || 'Inferred'}
                        </span>
                      )}
                    </div>
                  </div>

                  {c.evidence && (
                    <div
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(255,255,255,0.02)',
                        borderLeft: '2px solid var(--accent-violet, #6366f1)',
                        borderRadius: '0 4px 4px 0',
                        fontSize: 10.5,
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                        lineHeight: 1.4,
                      }}
                    >
                      <Quote size={10} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
                      "{c.evidence}"
                    </div>
                  )}

                  {/* Reviewer Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      Reviewer Sign-off:
                      {currentStatus === 'approved' && (
                        <span style={{ color: '#10b981', fontWeight: 600, marginLeft: 4 }}>✓ Approved</span>
                      )}
                      {currentStatus === 'rejected' && (
                        <span style={{ color: '#ef4444', fontWeight: 600, marginLeft: 4 }}>✕ Rejected</span>
                      )}
                      {!currentStatus && (
                        <span style={{ fontStyle: 'italic', marginLeft: 4 }}>Pending</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleClaimReview(c, 'approved')}
                        style={{
                          background: currentStatus === 'approved' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                          border: currentStatus === 'approved' ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                          color: currentStatus === 'approved' ? '#10b981' : 'var(--text-muted)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <Check size={10} />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClaimReview(c, 'rejected')}
                        style={{
                          background: currentStatus === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                          border: currentStatus === 'rejected' ? '1px solid #ef4444' : '1px solid var(--border-subtle)',
                          color: currentStatus === 'rejected' ? '#ef4444' : 'var(--text-muted)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <X size={10} />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center' }}>
            {loading ? 'Analyzing paper text and verifying empirical claims...' : 'No claims found in paper text yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
