import React, { useState } from 'react';
import {
  FileText,
  Table,
  Image,
  Sigma,
  Bookmark,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Search,
  Sparkles,
  Globe,
} from 'lucide-react';

// Get matching icon for evidence source type
export function getEvidenceTypeIcon(type, size = 11) {
  switch (type) {
    case 'table':
      return <Table size={size} />;
    case 'figure':
      return <Image size={size} />;
    case 'equation':
      return <Sigma size={size} />;
    case 'reference':
      return <Bookmark size={size} />;
    case 'web':
      return <Globe size={size} />;
    case 'text':
    default:
      return <FileText size={size} />;
  }
}

// ─── Web Citation Chip with Preview & External Link ─────────────────────────
export function WebCitationChip({ source }) {
  const [hovered, setHovered] = useState(false);
  if (!source) return null;

  const domain = source.domain || (source.url ? (() => { try { return new URL(source.url).hostname.replace('www.', ''); } catch { return 'web'; } })() : 'web');
  const title = source.title || 'External Research Source';
  const snippet = source.snippet || '';

  return (
    <span
      className="web-citation-chip-wrapper"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'inline-block', margin: '2px 4px 2px 0' }}
    >
      <button
        type="button"
        className="citation-chip citation-type-web"
        onClick={() => source.url && window.open(source.url, '_blank', 'noopener,noreferrer')}
        title={`External source: ${title} (${domain})`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 7px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '500',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          color: '#60a5fa',
          cursor: 'pointer',
        }}
      >
        <Globe size={11} />
        <span>[Web · {domain}]</span>
        <ExternalLink size={10} style={{ opacity: 0.7 }} />
      </button>

      {hovered && (
        <div
          className="citation-hover-popover web-source-popover"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            marginBottom: '6px',
            zIndex: 100,
            width: '280px',
            background: '#18181b',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: '10px',
            fontSize: '12px',
            color: '#e4e4e7',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#60a5fa', fontWeight: '600', fontSize: '11px' }}>
              <Globe size={12} />
              <span>{domain}</span>
            </span>
            <span style={{ fontSize: '10px', color: '#a1a1aa' }}>Searqon Research</span>
          </div>

          <div style={{ fontWeight: '600', marginBottom: '4px', lineHeight: '1.3', color: '#fafafa' }}>
            {title}
          </div>

          {snippet && (
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '8px', lineHeight: '1.4', maxHeight: '72px', overflow: 'hidden' }}>
              "{snippet.length > 140 ? snippet.slice(0, 140) + '…' : snippet}"
            </div>
          )}

          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#38bdf8',
                textDecoration: 'none',
                fontWeight: '500',
              }}
            >
              <span>Open source</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </span>
  );
}

// ─── 1. Compact Clickable Citation Chip with Hover Preview ────────────────────
export function CitationChip({ citation, onOpenEvidence, onOpenPaper }) {
  const [hovered, setHovered] = useState(false);

  if (!citation) return null;

  return (
    <span
      className="citation-chip-wrapper"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        className={`citation-chip citation-type-${citation.type || 'text'}`}
        onClick={() => onOpenEvidence && onOpenEvidence(citation)}
        title={`View evidence: ${citation.label || `Page ${citation.page}`}`}
      >
        <span className="citation-chip-icon">
          {getEvidenceTypeIcon(citation.type, 10)}
        </span>
        <span className="citation-chip-text">
          [{citation.label || `p.${citation.page || 1}`}]
        </span>
      </button>

      {/* Lightweight Hover Preview Popover */}
      {hovered && (
        <div className="citation-hover-popover">
          <div className="citation-popover-header">
            <span className="citation-popover-type-icon">
              {getEvidenceTypeIcon(citation.type, 11)}
            </span>
            <span className="citation-popover-location">
              Page {citation.page || 1} {citation.section ? `· ${citation.section}` : ''}
            </span>
          </div>

          <div className="citation-popover-quote">
            "{citation.quote ? (citation.quote.length > 140 ? citation.quote.slice(0, 140) + '…' : citation.quote) : 'Relevant paper passage.'}"
          </div>

          <div className="citation-popover-footer">
            <button
              type="button"
              className="citation-popover-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenEvidence) onOpenEvidence(citation);
              }}
            >
              <span>Open evidence</span>
              <ArrowRight size={10} />
            </button>
            {onOpenPaper && (
              <button
                type="button"
                className="citation-popover-btn secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPaper(citation);
                }}
              >
                <span>Jump to p.{citation.page || 1}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

// ─── 2. Single Evidence Inspection Panel / Modal ──────────────────────────────
export function EvidenceInspectionPanel({ citation, onClose, onOpenPaper, onBackToAnswer }) {
  if (!citation) return null;

  return (
    <div className="evidence-modal-backdrop" onClick={onClose}>
      <div className="evidence-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="evidence-modal-header">
          <div className="evidence-modal-title-group">
            <span className="evidence-modal-badge">
              {getEvidenceTypeIcon(citation.type, 12)}
              <span>Evidence</span>
            </span>
            <span className="evidence-modal-meta">
              Page {citation.page || 1} {citation.section ? `· ${citation.section}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="evidence-modal-close-btn"
            onClick={onClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Confidence Label */}
        <div className="evidence-confidence-row">
          {citation.confidence === 'direct' && (
            <span className="evidence-confidence-tag direct">
              <CheckCircle2 size={11} />
              <span>✓ Direct evidence · p.{citation.page || 1}</span>
            </span>
          )}
          {citation.confidence === 'inferred' && (
            <span className="evidence-confidence-tag inferred">
              <HelpCircle size={11} />
              <span>~ Inferred from paper · p.{citation.page || 1}</span>
            </span>
          )}
          {citation.confidence === 'unsupported' && (
            <span className="evidence-confidence-tag unsupported">
              <AlertTriangle size={11} />
              <span>⚠ Not explicitly stated in the paper</span>
            </span>
          )}
        </div>

        {/* Distinct Original Paper Text Container */}
        <div className="evidence-paper-passage-container">
          <div className="evidence-passage-label">
            <span>Original Paper Text</span>
            <span className="evidence-passage-sublabel">Non-generative excerpt</span>
          </div>
          <blockquote className="evidence-passage-quote">
            "{citation.quote || 'No direct text excerpt available.'}"
          </blockquote>
        </div>

        {/* Actions Bar */}
        <div className="evidence-modal-actions">
          {onBackToAnswer && (
            <button
              type="button"
              className="evidence-action-btn secondary"
              onClick={onBackToAnswer}
            >
              <ArrowLeft size={12} />
              <span>Back to answer</span>
            </button>
          )}

          <button
            type="button"
            className="evidence-action-btn primary"
            onClick={() => {
              if (onOpenPaper) onOpenPaper(citation);
              onClose();
            }}
          >
            <span>Open page {citation.page || 1} in paper</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Full Multi-Source Evidence Drawer ─────────────────────────────────────
export function EvidenceDrawer({ sources, activeCitation, onClose, onOpenPaper, onBackToAnswer }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="evidence-drawer-overlay">
      <div className="evidence-drawer-header">
        <div className="evidence-drawer-header-left">
          <h4 className="evidence-drawer-title">EVIDENCE</h4>
          <span className="evidence-drawer-count">{sources.length} sources</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onBackToAnswer && (
            <button
              type="button"
              className="evidence-drawer-back-btn"
              onClick={onBackToAnswer}
              title="Return to conversation"
            >
              <ArrowLeft size={12} />
              <span>Back to answer</span>
            </button>
          )}
          <button
            type="button"
            className="evidence-drawer-close-btn"
            onClick={onClose}
            title="Close Drawer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="evidence-drawer-body">
        {sources.map((src, idx) => {
          const isSelected = activeCitation && activeCitation.id === src.id;
          return (
            <div
              key={src.id || idx}
              className={`evidence-source-card ${isSelected ? 'active-highlight' : ''}`}
            >
              <div className="evidence-card-top">
                <div className="evidence-card-location">
                  <span className="evidence-card-type-icon">
                    {getEvidenceTypeIcon(src.type, 11)}
                  </span>
                  <span className="evidence-card-page-label">
                    Page {src.page || 1} {src.section ? `· ${src.section}` : ''}
                  </span>
                </div>

                {src.confidence === 'direct' && (
                  <span className="evidence-confidence-pill direct">
                    ✓ Direct
                  </span>
                )}
                {src.confidence === 'inferred' && (
                  <span className="evidence-confidence-pill inferred">
                    ~ Inferred
                  </span>
                )}
                {src.confidence === 'unsupported' && (
                  <span className="evidence-confidence-pill unsupported">
                    ⚠ Unstated
                  </span>
                )}
              </div>

              {/* Distinct Original Paper Text */}
              <div className="evidence-card-passage">
                "{src.quote}"
              </div>

              <div className="evidence-card-bottom">
                <button
                  type="button"
                  className="evidence-card-open-btn"
                  onClick={() => onOpenPaper && onOpenPaper(src)}
                >
                  <span>Open page {src.page || 1} in paper</span>
                  <ArrowRight size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4. Paper Highlighting Banner (Rendered on Reader Canvas) ─────────────────
export function EvidenceHighlightBanner({ highlight, onBackToAnswer, onDismiss }) {
  if (!highlight) return null;

  return (
    <div className="evidence-reader-highlight-banner">
      <div className="highlight-banner-left">
        <div className="highlight-banner-header">
          <span className="highlight-pin-icon">📍</span>
          <span className="highlight-banner-title">
            Evidence Highlight: Page {highlight.page || 1} {highlight.section ? `· ${highlight.section}` : ''}
          </span>
          {highlight.confidence === 'direct' && (
            <span className="highlight-confidence-tag direct">
              ✓ Direct evidence
            </span>
          )}
          {highlight.confidence === 'inferred' && (
            <span className="highlight-confidence-tag inferred">
              ~ Inferred
            </span>
          )}
        </div>
        <div className="highlight-banner-quote">
          "{highlight.quote}"
        </div>
      </div>

      <div className="highlight-banner-actions">
        {onBackToAnswer && (
          <button
            type="button"
            className="highlight-back-btn"
            onClick={onBackToAnswer}
          >
            <ArrowLeft size={12} />
            <span>Back to answer</span>
          </button>
        )}
        <button
          type="button"
          className="highlight-dismiss-btn"
          onClick={onDismiss}
          title="Dismiss Highlight"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── 5. Selected Text Context in Conversation ─────────────────────────────────
export function ContextQuoteBlock({ page = 1, section, quote }) {
  if (!quote) return null;

  return (
    <div className="research-context-quote-block">
      <div className="research-context-quote-header">
        <span>Context from page {page}</span>
        {section && <span>· {section}</span>}
      </div>
      <blockquote className="research-context-quote-text">
        "{quote}"
      </blockquote>
    </div>
  );
}

// ─── 6. Empty / Missing Evidence State Component ──────────────────────────────
export function MissingEvidenceAlert({ message, onSearchWeb }) {
  const [webHint, setWebHint] = useState(false);

  return (
    <div className="missing-evidence-box">
      <div className="missing-evidence-header">
        <AlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span className="missing-evidence-text">
          {message || 'Not found in the paper.'}
        </span>
      </div>

      <div className="missing-evidence-actions">
        <button
          type="button"
          className="missing-evidence-web-btn"
          onClick={() => {
            setWebHint(true);
            if (onSearchWeb) onSearchWeb();
            setTimeout(() => setWebHint(false), 3500);
          }}
        >
          <Search size={11} />
          <span>Search the web for this?</span>
        </button>
        {webHint && (
          <span className="missing-evidence-hint">
            Web search integration available in future knowledge expansion phase.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── 7. Compact Attach Excerpt Popover ────────────────────────────────────────
export function AttachExcerptPopover({ currentPage = 1, onAttach, onClose }) {
  const [page, setPage] = useState(currentPage);
  const [section, setSection] = useState('');
  const [excerpt, setExcerpt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!excerpt.trim()) return;
    onAttach({
      page: Number(page) || 1,
      section: section.trim() || `Section on page ${page}`,
      text: excerpt.trim(),
    });
    onClose();
  };

  return (
    <div className="attach-excerpt-popover-card">
      <div className="attach-popover-header">
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
          Attach Paper Context
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          <X size={12} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Page</label>
            <input
              type="number"
              min="1"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className="attach-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Section (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Methodology"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="attach-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Passage Excerpt</label>
          <textarea
            rows={3}
            placeholder="Paste relevant passage from paper..."
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="attach-textarea"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <button
          type="submit"
          disabled={!excerpt.trim()}
          className="attach-submit-btn"
        >
          Attach Excerpt to Prompt
        </button>
      </form>
    </div>
  );
}
