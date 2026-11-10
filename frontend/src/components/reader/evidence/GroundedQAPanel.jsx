import React, { useState } from 'react';
import {
  Search,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
  Sparkles,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';

export default function GroundedQAPanel({
  paperId,
  onHighlightEvidence,
  onJumpToPage,
}) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [qaResponse, setQaResponse] = useState(null);
  const [error, setError] = useState(null);

  const suggestedQuestions = [
    'What is the core method and architecture?',
    'What quantitative benchmark results were achieved?',
    'What datasets and compute hardware were used?',
    'What are the primary limitations and constraints?',
  ];

  const handleAsk = async (qToAsk) => {
    const query = (qToAsk || question).trim();
    if (!query || !paperId || loading) return;

    setLoading(true);
    setError(null);
    setQuestion(query);

    try {
      const res = await fetch(`/api/v1/evidence/${encodeURIComponent(paperId)}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paperId,
          question: query,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setQaResponse(data);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || 'Failed to retrieve grounded answer.');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCitationClick = (citation) => {
    if (!citation) return;
    const pageNum = Number(citation.page) || 1;
    if (onHighlightEvidence) {
      onHighlightEvidence({
        page: pageNum,
        quote: citation.excerpt || '',
        text: citation.excerpt || '',
        highlight_rects: citation.highlight_rects || [],
      });
    } else if (onJumpToPage) {
      onJumpToPage(pageNum);
    }
  };

  return (
    <div className="grounded-qa-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header card explaining anti-hallucination guarantee */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'rgba(99, 102, 241, 0.05)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Sparkles size={16} style={{ color: 'var(--accent-violet, #6366f1)', flexShrink: 0 }} />
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #475569)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Evidence-Grounded Q&A:</strong> Every answer is strictly grounded in verbatim paper excerpts with mathematical coordinate verification. Unsupported questions are explicitly flagged.
        </div>
      </div>

      {/* Query Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        style={{ display: 'flex', gap: '6px' }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted, #94a3b8)',
            }}
          />
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this paper (e.g. accuracy, method, datasets)..."
            disabled={loading}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 10px 7px 32px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle, #cbd5e1)',
              background: 'var(--bg-input, #ffffff)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !question.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '0 12px',
            borderRadius: '6px',
            border: 'none',
            background: loading || !question.trim() ? 'var(--border-subtle, #cbd5e1)' : 'var(--accent-violet, #6366f1)',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 500,
            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          {loading ? (
            <>
              <RefreshCw size={13} className="animate-spin" />
              <span>Verifying…</span>
            </>
          ) : (
            <>
              <Send size={13} />
              <span>Ask</span>
            </>
          )}
        </button>
      </form>

      {/* Suggested quick chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {suggestedQuestions.map((sq, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleAsk(sq)}
            disabled={loading}
            style={{
              padding: '3px 8px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              background: 'var(--bg-subtle, #f8fafc)',
              color: 'var(--text-secondary, #475569)',
              fontSize: '11px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <HelpCircle size={10} style={{ color: 'var(--accent-violet, #6366f1)' }} />
            <span>{sq}</span>
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: '10px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {/* QA Answer & Citation Card */}
      {qaResponse && (
        <div
          style={{
            borderRadius: '8px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            background: 'var(--bg-card, #ffffff)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          {/* Header row: Question & Confidence status badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Q: {qaResponse.question}
            </div>
            {qaResponse.insufficient_evidence ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 7px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#dc2626',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <AlertCircle size={11} />
                Insufficient Evidence
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 7px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#059669',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <CheckCircle2 size={11} />
                {qaResponse.confidence === 'verified' ? 'Strictly Grounded' : 'Inferred'}
              </span>
            )}
          </div>

          {/* Answer Text */}
          <div
            style={{
              fontSize: '13px',
              lineHeight: '1.55',
              color: qaResponse.insufficient_evidence ? 'var(--text-secondary, #64748b)' : 'var(--text-primary)',
              fontStyle: qaResponse.insufficient_evidence ? 'italic' : 'normal',
            }}
          >
            {qaResponse.answer}
          </div>

          {/* Supporting Citations Ledger */}
          {qaResponse.citations && qaResponse.citations.length > 0 && (
            <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-subtle, #f1f5f9)', paddingTop: '10px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-muted, #64748b)',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <FileText size={12} />
                <span>Supporting Citations ({qaResponse.citations.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {qaResponse.citations.map((cit, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleCitationClick(cit)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-subtle, #f8fafc)',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                    title="Click to locate and highlight in PDF viewer"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--accent-violet, #6366f1)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        Page {cit.page}
                        <ExternalLink size={10} />
                      </span>
                      {cit.exact_match && (
                        <span style={{ fontSize: '10px', color: '#059669', fontWeight: 500 }}>
                          Exact Substring Verified
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '11.5px',
                        lineHeight: '1.45',
                        color: 'var(--text-secondary, #334155)',
                        fontStyle: 'italic',
                      }}
                    >
                      &ldquo;{cit.excerpt}&rdquo;
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
