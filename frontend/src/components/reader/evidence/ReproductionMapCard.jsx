import React, { useState } from 'react';
import {
  Code,
  Cpu,
  Database,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Terminal,
  ShieldAlert,
  PlayCircle
} from 'lucide-react';

export default function ReproductionMapCard({ reproductionMap, loading, onRefresh }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
        <p style={{ margin: 0, fontSize: '12px' }}>Synthesizing reproduction map and verifying artifacts...</p>
      </div>
    );
  }

  if (!reproductionMap) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
        <p style={{ margin: 0, fontSize: '12px' }}>No reproduction map available for this paper.</p>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            style={{
              marginTop: '10px',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle, #cbd5e1)',
              background: 'var(--bg-card, #ffffff)',
              fontSize: '11.5px',
              cursor: 'pointer',
            }}
          >
            Generate Reproduction Map
          </button>
        )}
      </div>
    );
  }

  const {
    reproducibility_score = 0,
    code_availability = {},
    compute_budget = {},
    dataset_checklist = [],
    steps = [],
    missing_critical_elements = [],
    friction_summary = '',
  } = reproductionMap;

  const scoreColor =
    reproducibility_score >= 70
      ? '#10b981'
      : reproducibility_score >= 40
      ? '#f59e0b'
      : '#ef4444';

  const scoreBg =
    reproducibility_score >= 70
      ? 'rgba(16, 185, 129, 0.08)'
      : reproducibility_score >= 40
      ? 'rgba(245, 158, 11, 0.08)'
      : 'rgba(239, 68, 68, 0.08)';

  const handleCopy = (command, idx) => {
    if (!command) return;
    navigator.clipboard.writeText(command);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="reproduction-map-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Top Score Banner ── */}
      <div
        style={{
          background: scoreBg,
          border: `1px solid ${scoreColor}40`,
          borderRadius: '8px',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: scoreColor, letterSpacing: '0.05em' }}>
            Reproducibility Friction Score
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>
            {friction_summary}
          </div>
        </div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: scoreColor,
            textAlign: 'right',
            flexShrink: 0,
            marginLeft: '12px',
          }}
        >
          {Math.round(reproducibility_score)}
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>/100</span>
        </div>
      </div>

      {/* ── Missing Critical Elements Warning ── */}
      {missing_critical_elements.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: 700, fontSize: '11px', marginBottom: '6px' }}>
            <ShieldAlert size={14} />
            <span>Missing Critical Reproduction Information</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: 'var(--text-secondary, #475569)', lineHeight: 1.4 }}>
            {missing_critical_elements.map((elem, i) => (
              <li key={i}>{elem}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Code & Framework Availability ── */}
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '11.5px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          <Code size={14} style={{ color: '#6366f1' }} />
          <span>Code & Framework Disclosures</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Repository:</span>
            {code_availability.has_repo && code_availability.repo_url ? (
              <a
                href={code_availability.repo_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#6366f1',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <span>{code_availability.repo_url.replace(/^https?:\/\//, '')}</span>
                <ExternalLink size={11} />
              </a>
            ) : (
              <span style={{ color: '#ef4444', fontWeight: 600 }}>Not Disclosed</span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Framework:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {code_availability.framework || 'Undisclosed'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Pretrained Checkpoints:</span>
            <span style={{ fontWeight: 600, color: code_availability.has_checkpoints ? '#10b981' : '#f59e0b' }}>
              {code_availability.has_checkpoints ? 'Available' : 'Re-training Required'}
            </span>
          </div>

          {code_availability.dependencies && code_availability.dependencies.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dependencies:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {code_availability.dependencies.map((dep, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'var(--bg-subtle, #f1f5f9)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10.5px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Compute & Hardware Budget ── */}
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '11.5px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          <Cpu size={14} style={{ color: '#ec4899' }} />
          <span>Compute & Hardware Budget</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Hardware:</span>
            <span style={{ fontWeight: 600, color: compute_budget.hardware_mentioned ? 'var(--text-primary)' : '#ef4444' }}>
              {compute_budget.gpu_type
                ? `${compute_budget.gpu_count ? `${compute_budget.gpu_count}x ` : ''}${compute_budget.gpu_type}`
                : compute_budget.hardware_mentioned
                ? 'Mentioned (Details Unspecified)'
                : 'Undisclosed'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Estimated Training Time:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {compute_budget.estimated_hours
                ? `${compute_budget.estimated_hours} GPU Hours`
                : 'Unspecified'}
            </span>
          </div>

          {compute_budget.notes && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
              {compute_budget.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── Dataset Accessibility ── */}
      {dataset_checklist.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '11.5px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            <Database size={14} style={{ color: '#3b82f6' }} />
            <span>Dataset Accessibility Checklist</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {dataset_checklist.map((ds, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  background: 'var(--bg-subtle, #f8fafc)',
                  fontSize: '11.5px',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ds.name}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    background:
                      ds.access_type === 'public'
                        ? 'rgba(16, 185, 129, 0.12)'
                        : ds.access_type === 'gated'
                        ? 'rgba(245, 158, 11, 0.12)'
                        : 'rgba(239, 68, 68, 0.12)',
                    color:
                      ds.access_type === 'public'
                        ? '#10b981'
                        : ds.access_type === 'gated'
                        ? '#f59e0b'
                        : '#ef4444',
                  }}
                >
                  {ds.access_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step-by-Step Reproduction Sequence ── */}
      {steps.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            borderRadius: '8px',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '11.5px', color: 'var(--text-primary)', marginBottom: '10px' }}>
            <PlayCircle size={14} style={{ color: '#8b5cf6' }} />
            <span>Multi-Phase Reproduction Roadmap</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {steps.map((st, idx) => (
              <div
                key={idx}
                style={{
                  borderLeft: '2px solid #8b5cf6',
                  paddingLeft: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '9.5px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      background: 'var(--bg-subtle, #f1f5f9)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      color: '#8b5cf6',
                    }}
                  >
                    Step {st.step_number} • {st.phase}
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {st.action}
                  </span>
                </div>

                {st.suggested_command && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#1e293b',
                      color: '#f8fafc',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      $ {st.suggested_command}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(st.suggested_command, idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedIndex === idx ? '#10b981' : '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        marginLeft: '8px',
                      }}
                      title="Copy command"
                    >
                      {copiedIndex === idx ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                )}

                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 600 }}>Verify:</span> {st.verification_criteria}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
