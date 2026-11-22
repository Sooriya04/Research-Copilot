import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Columns3,
  Network,
  X,
  Plus,
  Search,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// The exact 8 attributes required for the scientific research comparison matrix
export const MATRIX_ATTRIBUTES = [
  { id: 'objective', label: '1. Research Objective', short: 'Objective' },
  { id: 'methodology', label: '2. Proposed Methodology', short: 'Methodology' },
  { id: 'algorithms', label: '3. Algorithms & Models', short: 'Algorithms & Models' },
  { id: 'novelty', label: '4. Novelty & Contributions', short: 'Novelty' },
  { id: 'experimental_design', label: '5. Experimental Design', short: 'Experimental Design' },
  { id: 'metrics', label: '6. Performance Metrics', short: 'Metrics' },
  { id: 'results', label: '7. Results & Findings', short: 'Results' },
  { id: 'limitations', label: '8. Limitations & Future Scope', short: 'Limitations & Future' },
];

// Helper to format clean display titles avoiding raw hash strings
function formatTitle(paper) {
  if (!paper) return 'Untitled Paper';
  const t = (paper.title || paper.id || '').trim();
  if (t.toLowerCase().startsWith('arxiv:s2:') || t.toLowerCase().startsWith('s2:')) {
    const rawHash = t.replace(/^arxiv:s2:/i, '').replace(/^s2:/i, '');
    return `Semantic Scholar: ${rawHash.slice(0, 14)}...`;
  }
  return t;
}

// Extract attribute values from existing paper metadata without fabricating content
function getAttributeValue(paper, attrId) {
  if (!paper) return null;

  switch (attrId) {
    case 'objective':
      return (
        paper.research_objective ||
        paper.objective ||
        paper.problem_statement ||
        (paper.abstract
          ? paper.abstract.slice(0, 240) + (paper.abstract.length > 240 ? '...' : '')
          : null)
      );

    case 'methodology':
      return (
        paper.methodology ||
        paper.method ||
        paper.proposed_method ||
        (paper.methods_summary || null)
      );

    case 'algorithms':
      if (paper.algorithms_and_models) return paper.algorithms_and_models;
      if (paper.models && paper.models.length > 0) return paper.models.join(', ');
      if (paper.framework) return paper.framework;
      return null;

    case 'novelty':
      if (paper.novelty_contributions) return paper.novelty_contributions;
      if (paper.contributions && paper.contributions.length > 0) {
        return Array.isArray(paper.contributions) ? paper.contributions.join('; ') : paper.contributions;
      }
      return null;

    case 'experimental_design':
      if (paper.experimental_design) return paper.experimental_design;
      if (paper.datasets && paper.datasets.length > 0) {
        return `Evaluated on: ${paper.datasets.map((d) => (typeof d === 'string' ? d : d.name)).join(', ')}`;
      }
      if (paper.has_ablation) return 'Includes component ablation studies and baseline comparisons.';
      return null;

    case 'metrics':
      if (paper.performance_metrics) return paper.performance_metrics;
      if (paper.benchmarks && paper.benchmarks.length > 0) {
        return paper.benchmarks
          .slice(0, 3)
          .map((b) => `${b.metric || 'Metric'}: ${b.value || 'N/A'} (${b.dataset || 'Dataset'})`)
          .join('; ');
      }
      return null;

    case 'results':
      if (paper.results_and_findings) return paper.results_and_findings;
      if (paper.findings) return paper.findings;
      if (paper.verdict) return paper.verdict;
      return null;

    case 'limitations':
      if (paper.limitations_and_future_scope) return paper.limitations_and_future_scope;
      if (paper.limitations && paper.limitations.length > 0) {
        return Array.isArray(paper.limitations) ? paper.limitations.join('; ') : paper.limitations;
      }
      if (paper.research_gaps && paper.research_gaps.length > 0) {
        return paper.research_gaps.map((g) => g.title || g.description).slice(0, 2).join('; ');
      }
      return null;

    default:
      return null;
  }
}

export default function PaperComparisonView() {
  const {
    comparisonPapers,
    addComparisonPaper,
    removeComparisonPaper,
    clearComparisonPapers,
    setActiveReaderPaper,
    searchResults,
  } = useApp();
  const navigate = useNavigate();

  const [searchFilter, setSearchFilter] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [expandedCell, setExpandedCell] = useState(null); // { rowKey, colId }
  const [addingPaper, setAddingPaper] = useState(false);

  // Active papers to compare (from comparison tray or search results)
  const papers = useMemo(() => {
    if (comparisonPapers && comparisonPapers.length > 0) return comparisonPapers;
    if (searchResults && searchResults.length > 0) return searchResults.slice(0, 4);
    return [];
  }, [comparisonPapers, searchResults]);

  // Filtered papers based on user search term
  const displayedPapers = useMemo(() => {
    if (!searchFilter.trim()) return papers;
    const q = searchFilter.toLowerCase();
    return papers.filter((p) => {
      const titleMatch = (p.title || '').toLowerCase().includes(q);
      const absMatch = (p.abstract || '').toLowerCase().includes(q);
      return titleMatch || absMatch;
    });
  }, [papers, searchFilter]);

  // Add custom paper by ID/title
  const handleAddPaper = async (e) => {
    e?.preventDefault();
    const query = customInput.trim();
    if (!query) return;
    setAddingPaper(true);
    try {
      const res = await fetch(`/api/v1/paper/${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.paper) {
          addComparisonPaper(data.paper);
          setCustomInput('');
          return;
        }
      }
      const searchRes = await fetch(`/api/v1/search/openalex?query=${encodeURIComponent(query)}&limit=1`);
      if (searchRes.ok) {
        const sData = await searchRes.json();
        if (sData?.papers?.length > 0) {
          addComparisonPaper(sData.papers[0]);
          setCustomInput('');
          return;
        }
      }
      addComparisonPaper({
        id: query,
        canonical_id: query,
        title: query,
        primary_source: query.includes('.') ? 'arXiv' : 'External',
      });
      setCustomInput('');
    } catch (err) {
      console.error('Error adding paper:', err);
    } finally {
      setAddingPaper(false);
    }
  };

  // Quick preset loading
  const handleLoadPreset = (type) => {
    clearComparisonPapers();
    if (type === 'transformers') {
      addComparisonPaper({
        id: 'arxiv:1706.03762',
        canonical_id: 'arxiv:1706.03762',
        title: 'Attention Is All You Need',
        primary_source: 'arXiv',
        year: 2017,
        abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, based solely on attention mechanisms.',
        methodology: 'Multi-head self-attention mechanisms and sinusoidal positional encodings without recurrent cells.',
        algorithms_and_models: 'Transformer, Scaled Dot-Product Attention, Multi-Head Attention.',
        novelty_contributions: 'Replaced recurrence entirely with parallel self-attention, establishing modern LLM foundation.',
        experimental_design: 'WMT 2014 English-to-German and English-to-French translation benchmarks on 8 P100 GPUs.',
        performance_metrics: 'BLEU score: 28.4 (EN-DE), 41.8 (EN-FR).',
        results_and_findings: 'Outperformed state-of-the-art translation models while training significantly faster.',
        limitations_and_future_scope: 'Quadratic O(N^2) time and memory complexity with sequence length.',
        code_url: 'https://github.com/tensorflow/tensor2tensor',
      });
      addComparisonPaper({
        id: 'arxiv:2312.00752',
        canonical_id: 'arxiv:2312.00752',
        title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',
        primary_source: 'arXiv',
        year: 2023,
        abstract: 'Foundation models rely on Transformers but suffer quadratic compute. We introduce selective state space models (SSMs) with linear-time inference.',
        methodology: 'Selective state spaces with hardware-aware parallel scans and data-dependent gating.',
        algorithms_and_models: 'Mamba SSM, Selective State Spaces, Hardware-Aware Scan.',
        novelty_contributions: 'Selective state parameters allowing context-dependent memory in linear time.',
        experimental_design: 'Downstream synthetic tasks (Selective Copying), Pile pretraining up to 2.8B parameters.',
        performance_metrics: '5x higher throughput than Transformers of equivalent size.',
        results_and_findings: 'Matches or exceeds Transformer performance across language, audio, and genomics at linear scale.',
        limitations_and_future_scope: 'Requires specialized GPU SRAM kernels; multi-head cross-attention integration remains challenging.',
        code_url: 'https://github.com/state-spaces/mamba',
      });
      addComparisonPaper({
        id: 'arxiv:2106.09685',
        canonical_id: 'arxiv:2106.09685',
        title: 'LoRA: Low-Rank Adaptation of Large Language Models',
        primary_source: 'arXiv',
        year: 2021,
        abstract: 'An important paradigm consists of large-scale pre-training on general domain data and adaptation to specific tasks. Full fine-tuning becomes prohibitive.',
        methodology: 'Freezes pretrained model weights and injects trainable rank decomposition matrices into Transformer layers.',
        algorithms_and_models: 'Low-Rank Adaptation (LoRA), Rank Decomposition.',
        novelty_contributions: 'Reduces trainable parameters by 10,000x and GPU memory requirement by 3x with zero inference latency overhead.',
        experimental_design: 'Evaluated on RoBERTa, DeBERTa, and GPT-3 175B across GLUE, E2E, and WikiSQL benchmarks.',
        performance_metrics: 'Matches or exceeds full fine-tuning performance across all evaluation benchmarks.',
        results_and_findings: 'Shows that model weight updates possess a low intrinsic rank during task adaptation.',
        limitations_and_future_scope: 'Batching inputs for different tasks simultaneously requires distinct parameter handling.',
        code_url: 'https://github.com/microsoft/LoRA',
      });
    }
  };

  return (
    <div className="view-container" style={{ padding: '24px 28px', maxWidth: 1800, margin: '0 auto' }}>
      {/* ── 1. Clean Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-blue-subtle, rgba(59, 130, 246, 0.12))',
                color: 'var(--accent-blue, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Columns3 size={18} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Research Paper Comparison Matrix
            </h2>
            <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 600 }}>
              {papers.length} {papers.length === 1 ? 'Paper' : 'Papers'}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
            Side-by-side comparison matrix with research papers as rows and the 8 core scientific attributes as columns.
          </p>
        </div>

        {/* View Switcher & Clear */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}
            title="Switch to Knowledge Graph"
          >
            <Network size={13} />
            <span>Knowledge Graph</span>
          </button>
          {papers.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearComparisonPapers}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
              title="Clear all compared papers"
            >
              <X size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Paper Selector & Filter Strip ── */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Selected Paper Chips */}
        {papers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Comparing ({papers.length}):
            </span>
            {papers.map((p, idx) => (
              <div
                key={p.id || idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 16,
                  fontSize: 11.5,
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={p.title}
                >
                  {formatTitle(p)}
                </span>
                {p.year && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({p.year})</span>}
                <button
                  type="button"
                  onClick={() => removeComparisonPaper(p.id)}
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Remove paper"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Input & Search Filter */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <form onSubmit={handleAddPaper} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 260 }}>
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Add paper by arXiv ID, DOI, or title..."
              style={{
                flex: 1,
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              disabled={addingPaper || !customInput.trim()}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
            >
              <Plus size={13} />
              <span>Add</span>
            </button>
          </form>

          {/* Preset Buttons */}
          <button
            type="button"
            onClick={() => handleLoadPreset('transformers')}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title="Load Transformer vs Mamba vs LoRA"
          >
            <Sparkles size={12} />
            <span>Preset: Transformers vs SSM</span>
          </button>

          {/* Filter Table Row */}
          <div style={{ position: 'relative', width: 220 }}>
            <Search
              size={12}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter matrix rows..."
              style={{
                width: '100%',
                fontSize: 11.5,
                padding: '5px 8px 5px 26px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 3. The 8-Attribute Comparison Matrix Table (Papers as Rows) ── */}
      {displayedPapers.length > 0 ? (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            overflowX: 'auto',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1200 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-subtle)' }}>
                {/* Paper Row Header Column */}
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    background: 'var(--bg-secondary)',
                    zIndex: 3,
                    width: 260,
                    minWidth: 240,
                    padding: '14px 16px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    borderRight: '1px solid var(--border-subtle)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Research Paper
                </th>

                {/* The Exact 8 Attributes as Columns */}
                {MATRIX_ATTRIBUTES.map((attr) => (
                  <th
                    key={attr.id}
                    style={{
                      padding: '14px 16px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      borderRight: '1px solid var(--border-subtle)',
                      minWidth: 200,
                      maxWidth: 260,
                    }}
                  >
                    {attr.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {displayedPapers.map((paper, rIdx) => {
                const paperId = paper.canonical_id || paper.id || `paper-${rIdx}`;
                const title = formatTitle(paper);
                const authors = (paper.authors || [])
                  .map((a) => (typeof a === 'string' ? a : a.name))
                  .slice(0, 2)
                  .join(', ');

                return (
                  <tr
                    key={paperId}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: rIdx % 2 === 1 ? 'rgba(0,0,0,0.01)' : 'transparent',
                    }}
                  >
                    {/* Paper Info Sticky Column */}
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        background: 'var(--bg-card)',
                        zIndex: 2,
                        borderRight: '1px solid var(--border-subtle)',
                        verticalAlign: 'top',
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <span className="badge badge-neutral" style={{ fontSize: 9.5 }}>
                            {paper.primary_source || 'Paper'} {paper.year ? `· ${paper.year}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeComparisonPaper(paper.id)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                            title="Remove from comparison"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        <a
                          href={`#/pdf-inspector?paper=${encodeURIComponent(paperId)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveReaderPaper(paper);
                            navigate(`/pdf-inspector?paper=${encodeURIComponent(paperId)}`);
                          }}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            lineHeight: 1.35,
                            textDecoration: 'none',
                          }}
                          title="Open in PDF Reader"
                        >
                          {title}
                        </a>

                        {authors && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                            {authors}
                            {(paper.authors || []).length > 2 ? ' et al.' : ''}
                          </div>
                        )}

                        {paper.code_url && (
                          <a
                            href={paper.code_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10.5,
                              color: 'var(--accent-primary, #2563eb)',
                              textDecoration: 'none',
                              marginTop: 2,
                            }}
                          >
                            <ExternalLink size={10} />
                            <span>GitHub Code</span>
                          </a>
                        )}
                      </div>
                    </td>

                    {/* 8 Attribute Value Cells */}
                    {MATRIX_ATTRIBUTES.map((attr) => {
                      const val = getAttributeValue(paper, attr.id);
                      const isExpanded =
                        expandedCell?.rowKey === paperId && expandedCell?.colId === attr.id;

                      return (
                        <td
                          key={attr.id}
                          style={{
                            verticalAlign: 'top',
                            padding: '14px 16px',
                            borderRight: '1px solid var(--border-subtle)',
                            fontSize: 12,
                            lineHeight: 1.45,
                            color: val ? 'var(--text-secondary)' : 'var(--text-muted)',
                          }}
                        >
                          {val ? (
                            <div>
                              <div
                                style={{
                                  maxHeight: isExpanded ? 'none' : 88,
                                  overflow: 'hidden',
                                  textOverflow: isExpanded ? 'clip' : 'ellipsis',
                                }}
                              >
                                {val}
                              </div>
                              {val.length > 110 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCell(isExpanded ? null : { rowKey: paperId, colId: attr.id })
                                  }
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    color: 'var(--accent-primary, #2563eb)',
                                    cursor: 'pointer',
                                    padding: '4px 0 0 0',
                                    fontSize: 10.5,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  {isExpanded ? (
                                    <>
                                      <span>Show less</span>
                                      <ChevronUp size={11} />
                                    </>
                                  ) : (
                                    <>
                                      <span>Expand</span>
                                      <ChevronDown size={11} />
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontStyle: 'italic', color: 'var(--text-muted)' }}>
                              <Info size={11} />
                              <span>Not specified in paper</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div
          style={{
            padding: 60,
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Columns3 size={36} style={{ margin: '0 auto 12px auto', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
            No Research Papers Selected
          </h3>
          <p style={{ fontSize: 12, margin: '0 auto 18px auto', maxWidth: 440, lineHeight: 1.5 }}>
            Add papers using the input box above, pick papers from search results, or load the Transformers preset to inspect the 8-attribute comparison matrix.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleLoadPreset('transformers')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Sparkles size={13} />
            <span>Load Transformers vs SSM Preset</span>
          </button>
        </div>
      )}
    </div>
  );
}
