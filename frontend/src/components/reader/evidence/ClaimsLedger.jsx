import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Check,
  Flag,
  FileText,
  ArrowRight,
} from 'lucide-react';

export default function ClaimsLedger({ claims = [], onJumpToSource, onClaimReview, reviewingClaimId }) {
  const [claimFilter, setClaimFilter] = useState('all'); // 'all' | 'verified' | 'needs-review'

  const filteredClaims = claims.filter((c) => {
    if (claimFilter === 'verified') return c.confidence === 'verified';
    if (claimFilter === 'needs-review') return c.confidence === 'needs-review';
    return true;
  });

  return (
    <div className="claims-ledger-section">
      {/* Filter Selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {[
          { key: 'all', label: `All (${claims.length})` },
          { key: 'verified', label: `Verified (${claims.filter((c) => c.confidence === 'verified').length})` },
          { key: 'needs-review', label: `Needs Review (${claims.filter((c) => c.confidence === 'needs-review').length})` },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setClaimFilter(f.key)}
            style={{
              padding: '3px 8px',
              borderRadius: '12px',
              border: '1px solid',
              borderColor: claimFilter === f.key ? 'var(--accent-violet, #6366f1)' : 'var(--border-subtle, #e2e8f0)',
              background: claimFilter === f.key ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
              color: claimFilter === f.key ? 'var(--accent-violet, #6366f1)' : 'var(--text-muted, #64748b)',
              fontSize: '11px',
              fontWeight: claimFilter === f.key ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredClaims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
            No claims matching filter.
          </div>
        ) : (
          filteredClaims.map((claim) => {
            const isVerified = claim.confidence === 'verified';
            const firstRef = claim.source_refs?.[0];
            const isAccepted = claim.review_status === 'accepted';
            const isFlagged = claim.review_status === 'flagged';

            return (
              <div
                key={claim.id}
                className="claim-evidence-card"
                style={{
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderLeft: `3px solid ${isVerified ? '#10b981' : '#f59e0b'}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background: isVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: isVerified ? '#10b981' : '#d97706',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      {isVerified ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                      <span>{isVerified ? 'VERIFIED' : 'NEEDS REVIEW'}</span>
                    </span>

                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        background: 'var(--bg-subtle, #f1f5f9)',
                        color: 'var(--text-muted, #64748b)',
                      }}
                    >
                      {claim.kind}
                    </span>
                  </div>

                  {/* Review Sign-off Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => onClaimReview(claim.id, isAccepted ? 'unreviewed' : 'accepted')}
                      disabled={reviewingClaimId === claim.id}
                      title="Accept Claim (Sign-off)"
                      style={{
                        padding: '2px 5px',
                        borderRadius: '4px',
                        border: isAccepted ? '1px solid #10b981' : '1px solid var(--border-subtle, #e2e8f0)',
                        background: isAccepted ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                        color: isAccepted ? '#10b981' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                      }}
                    >
                      <Check size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onClaimReview(claim.id, isFlagged ? 'unreviewed' : 'flagged')}
                      disabled={reviewingClaimId === claim.id}
                      title="Flag Claim (Questionable Grounding)"
                      style={{
                        padding: '2px 5px',
                        borderRadius: '4px',
                        border: isFlagged ? '1px solid #ef4444' : '1px solid var(--border-subtle, #e2e8f0)',
                        background: isFlagged ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                        color: isFlagged ? '#ef4444' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                      }}
                    >
                      <Flag size={11} />
                    </button>
                  </div>
                </div>

                {/* Claim Statement */}
                <div style={{ fontSize: '12.5px', fontWeight: 600, lineHeight: 1.4, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  {claim.statement}
                </div>

                {/* Verbatim Excerpt Block */}
                {firstRef && (
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'var(--bg-subtle, #f8fafc)',
                      border: '1px solid var(--border-subtle, #f1f5f9)',
                      fontSize: '11.5px',
                      color: 'var(--text-secondary, #334155)',
                      lineHeight: 1.35,
                      fontStyle: 'italic',
                      marginBottom: '6px',
                    }}
                  >
                    "{firstRef.excerpt}"
                  </div>
                )}

                {/* Jump To Page Trigger Pill */}
                {firstRef && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                    <button
                      type="button"
                      onClick={() => onJumpToSource(firstRef)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: '#6366f1',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <FileText size={10} />
                      <span>Jump to Page {firstRef.page || 1}</span>
                      {firstRef.highlight_rects && firstRef.highlight_rects.length > 0 && (
                        <span style={{ fontSize: '9.5px', opacity: 0.8 }}>({firstRef.highlight_rects.length} boxes)</span>
                      )}
                      <ArrowRight size={10} />
                    </button>

                    <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                      {firstRef.exact_match ? 'Exact match' : 'Normalized overlap'}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
