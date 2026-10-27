import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import EvidenceAuditMeter from './evidence/EvidenceAuditMeter';
import ClaimsLedger from './evidence/ClaimsLedger';
import FiguresGallery from './evidence/FiguresGallery';
import MetricsSummary from './evidence/MetricsSummary';
import GlossaryList from './evidence/GlossaryList';
import LimitationsList from './evidence/LimitationsList';
import NarrativeTimeline from './evidence/NarrativeTimeline';
import ReproductionMapCard from './evidence/ReproductionMapCard';

export default function EvidenceStudioTab({ paper, onHighlightEvidence, onJumpToPage }) {
  const [loading, setLoading] = useState(false);
  const [evidencePkg, setEvidencePkg] = useState(null);
  const [reproductionMap, setReproductionMap] = useState(null);
  const [reproLoading, setReproLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('claims'); // 'claims' | 'figures' | 'metrics' | 'glossary' | 'limitations' | 'timeline' | 'reproduction'
  const [reviewingClaimId, setReviewingClaimId] = useState(null);

  const paperId = paper?.arxiv_id || paper?.id || (paper?.canonical_id ? String(paper.canonical_id) : '');

  const fetchEvidence = async (force = false) => {
    if (!paperId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/evidence/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paperId,
          title: paper?.title || paperId,
          pdf_url: paper?.pdf_url || null,
          force_refresh: force,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvidencePkg(data);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || 'Failed to load evidence studio data.');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchReproductionMap = async (force = false) => {
    if (!paperId) return;
    setReproLoading(true);
    try {
      const url = `/api/v1/evidence/${encodeURIComponent(paperId)}/reproduction-map${force ? '?force_refresh=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setReproductionMap(data);
      }
    } catch (err) {
      console.debug('Failed to fetch reproduction map:', err);
    } finally {
      setReproLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence(false);
    fetchReproductionMap(false);
  }, [paperId]);

  const handleClaimReview = async (claimId, nextStatus) => {
    setReviewingClaimId(claimId);
    try {
      const res = await fetch(`/api/v1/evidence/${encodeURIComponent(paperId)}/claims/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          reviewer_status: nextStatus,
          note: `Signed off in Evidence Studio`,
          reviewer: 'researcher',
        }),
      });
      if (res.ok) {
        setEvidencePkg((prev) => {
          if (!prev) return prev;
          const updatedClaims = (prev.claims || []).map((c) =>
            c.id === claimId ? { ...c, review_status: nextStatus } : c
          );
          return { ...prev, claims: updatedClaims };
        });
      }
    } catch (err) {
      console.warn('Failed to submit claim review:', err);
    } finally {
      setReviewingClaimId(null);
    }
  };

  const handleJumpToSource = (ref) => {
    if (!ref) return;
    const pageNum = Number(ref.page) || 1;
    if (onHighlightEvidence) {
      onHighlightEvidence({
        page: pageNum,
        quote: ref.excerpt || '',
        text: ref.excerpt || '',
        highlight_rects: ref.highlight_rects || [],
      });
    } else if (onJumpToPage) {
      onJumpToPage(pageNum);
    }
  };

  if (!paperId) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ margin: 0, fontSize: '13px' }}>Select or open a paper to inspect evidence.</p>
      </div>
    );
  }

  const audit = evidencePkg?.audit;
  const claims = evidencePkg?.claims || [];
  const figures = evidencePkg?.figures || [];
  const metrics = evidencePkg?.metrics || [];
  const glossary = evidencePkg?.glossary || [];
  const limitations = evidencePkg?.limitations || [];
  const timeline = evidencePkg?.timeline || [];

  return (
    <div className="evidence-studio-container" style={{ padding: '14px', fontSize: '13px', color: 'var(--text-primary)' }}>
      {/* ── 1. Top Audit Health & Evidence Meter Card ── */}
      <EvidenceAuditMeter
        audit={audit}
        claims={claims}
        figures={figures}
        loading={loading}
        onRefresh={() => fetchEvidence(true)}
      />

      {/* ── 2. Segment Navigation Tabs ── */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          overflowX: 'auto',
          paddingBottom: '8px',
          marginBottom: '12px',
          borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
        }}
      >
        {[
          { key: 'claims', label: 'Claims', count: claims.length },
          { key: 'reproduction', label: 'Reproduction Map', count: (reproductionMap?.steps?.length || (evidencePkg?.reproduction_map?.steps?.length) || 0) },
          { key: 'figures', label: 'Figures & Tables', count: figures.length },
          { key: 'metrics', label: 'Metrics', count: metrics.length },
          { key: 'glossary', label: 'Glossary', count: glossary.length },
          { key: 'limitations', label: 'Limitations', count: limitations.length },
          { key: 'timeline', label: 'Timeline', count: timeline.length },
        ].map((tab) => {
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSubTab(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? 'var(--accent-violet, #6366f1)' : 'var(--bg-subtle, #f1f5f9)',
                color: isActive ? '#ffffff' : 'var(--text-secondary, #475569)',
                fontSize: '11.5px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  padding: '1px 5px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--border-subtle, #e2e8f0)',
                  color: isActive ? '#ffffff' : 'var(--text-muted, #64748b)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loading state indicator */}
      {loading && !evidencePkg && (
        <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 10px', color: '#6366f1' }} />
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Ingesting Evidence Coordinates</div>
          <div style={{ fontSize: '11.5px' }}>Parsing text streams, extracting visual vector assets, and verifying quotes…</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* ── 3. Decoupled Subcomponent Views ── */}
      {activeSubTab === 'reproduction' && (
        <ReproductionMapCard
          reproductionMap={reproductionMap || evidencePkg?.reproduction_map}
          loading={reproLoading}
          onRefresh={() => fetchReproductionMap(true)}
        />
      )}

      {activeSubTab === 'claims' && (
        <ClaimsLedger
          claims={claims}
          onJumpToSource={handleJumpToSource}
          onClaimReview={handleClaimReview}
          reviewingClaimId={reviewingClaimId}
        />
      )}

      {activeSubTab === 'figures' && (
        <FiguresGallery
          figures={figures}
          onJumpToPage={onJumpToPage}
          onHighlightEvidence={onHighlightEvidence}
        />
      )}

      {activeSubTab === 'metrics' && (
        <MetricsSummary
          metrics={metrics}
          onJumpToSource={handleJumpToSource}
        />
      )}

      {activeSubTab === 'glossary' && (
        <GlossaryList
          glossary={glossary}
          onJumpToSource={handleJumpToSource}
        />
      )}

      {activeSubTab === 'limitations' && (
        <LimitationsList
          limitations={limitations}
          onJumpToSource={handleJumpToSource}
        />
      )}

      {activeSubTab === 'timeline' && (
        <NarrativeTimeline
          timeline={timeline}
          onJumpToPage={onJumpToPage}
        />
      )}
    </div>
  );
}
