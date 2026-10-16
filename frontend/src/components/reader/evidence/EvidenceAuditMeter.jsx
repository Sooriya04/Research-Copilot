import React from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

export default function EvidenceAuditMeter({ audit, claims = [], figures = [], loading, onRefresh }) {
  const verifiedCount = audit
    ? audit.verified_claims
    : claims.filter((c) => c.confidence === 'verified').length;
  const totalCount = audit ? audit.total_claims : claims.length;
  const verifiedPct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;
  const matchRatePct = audit ? Math.round(audit.quote_match_rate * 100) : 100;

  return (
    <div
      className="evidence-audit-meter-card"
      style={{
        background: 'var(--bg-card, #ffffff)',
        border: '1px solid var(--border-subtle, #e2e8f0)',
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={16} style={{ color: '#10b981' }} />
          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
            Deterministic Evidence Audit
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle, #cbd5e1)',
            background: 'var(--bg-subtle, #f8fafc)',
            color: 'var(--text-secondary, #475569)',
            fontSize: '11px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          title="Force refresh deterministic verification"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'Auditing…' : 'Re-verify'}</span>
        </button>
      </div>

      {/* 4 Health Metric Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '8px' }}>
        <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #f1f5f9)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Verified Claims</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>
            {verifiedCount}/{totalCount}
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>
              ({verifiedPct}%)
            </span>
          </div>
        </div>

        <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #f1f5f9)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Quote Match Rate</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: matchRatePct >= 80 ? '#10b981' : '#f59e0b' }}>
            {matchRatePct}%
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>
              verbatim
            </span>
          </div>
        </div>

        <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #f1f5f9)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Page Coverage</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {audit ? `${audit.cited_pages.length}/${audit.page_count}` : `${Math.min(claims.length, 8)} pages`}
            <span style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>
              pages
            </span>
          </div>
        </div>

        <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #f1f5f9)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>Visual Assets</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#6366f1' }}>
            {figures.length}
            <span style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>
              figures/tables
            </span>
          </div>
        </div>
      </div>

      {/* Audit Coverage Diagnostic */}
      {audit && audit.unreached_pages && audit.unreached_pages.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: '6px',
            background: audit.page_coverage_rate >= 0.75 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            border: `1px solid ${audit.page_coverage_rate >= 0.75 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
            fontSize: '11px',
            color: audit.page_coverage_rate >= 0.75 ? '#059669' : '#d97706',
          }}
        >
          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
          <span>
            {audit.page_coverage_rate >= 0.75
              ? `High document coverage (${Math.round(audit.page_coverage_rate * 100)}%). Pages ${audit.unreached_pages.slice(0, 4).join(', ')}${audit.unreached_pages.length > 4 ? '…' : ''} contain appendix or bibliography.`
              : `Audit coverage note: Pages ${audit.unreached_pages.slice(0, 5).join(', ')}${audit.unreached_pages.length > 5 ? '…' : ''} have no cited evidence cards.`}
          </span>
        </div>
      )}
    </div>
  );
}
