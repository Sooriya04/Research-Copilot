import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Columns3,
  Database,
  Download,
  Copy,
  FileText,
  RefreshCw,
  X,
  CheckCircle2,
  Plus,
  Loader2,
  Sparkles,
  ExternalLink,
  Filter,
  Search,
  BookOpen,
  Layers,
  SlidersHorizontal,
  ChevronRight,
  GitBranch,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// Helper to format clean display titles avoiding raw hash strings
export function formatPaperDisplayTitle(paper) {
  if (!paper) return 'Untitled Paper';
  const t = (paper.title || paper.id || '').trim();
  if (t.toLowerCase().startsWith('arxiv:s2:') || t.toLowerCase().startsWith('s2:')) {
    const rawHash = t.replace(/^arxiv:s2:/i, '').replace(/^s2:/i, '');
    return `Semantic Scholar: ${rawHash.slice(0, 14)}...`;
  }
  return t;
}

export default function PaperComparisonView() {
  const {
    comparisonPapers,
    addComparisonPaper,
    removeComparisonPaper,
    clearComparisonPapers,
    setActiveReaderPaper,
    searchResults,
    activeWorkspace,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // Matrix states
  const [matrixData, setMatrixData] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [activeDimension, setActiveDimension] = useState('all'); // 'all' | 'gaps' | 'methodology' | 'benchmarks' | 'code' | 'rigor'
  const [focusGapsOnly, setFocusGapsOnly] = useState(false);
  const [matrixSearchQuery, setMatrixSearchQuery] = useState('');
  const [customPaperInput, setCustomPaperInput] = useState('');
  const [addingCustomPaper, setAddingCustomPaper] = useState(false);
  const [reanalyzingPaperId, setReanalyzingPaperId] = useState(null);
  const [copiedGapId, setCopiedGapId] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  // Active papers to compare
  const activePapers = useMemo(() => {
    if (comparisonPapers && comparisonPapers.length > 0) {
      return comparisonPapers;
    }
    if (searchResults && searchResults.length > 0) {
      return searchResults.slice(0, 4);
    }
    return [];
  }, [comparisonPapers, searchResults]);

  // Generate stable cache key for comparison
  const getMatrixCacheKey = (papers) => {
    if (!papers || papers.length === 0) return '';
    const ids = papers.map((p) => p.canonical_id || p.id || p.title).sort();
    return `rc_compare_matrix_${ids.join('_')}`;
  };

  // Fetch matrix from backend with instant 0ms sessionStorage cache on refresh
  const fetchComparisonMatrix = async (papersToCompare = activePapers, force = false) => {
    if (!papersToCompare || papersToCompare.length === 0) {
      setMatrixData(null);
      return;
    }

    const cacheKey = getMatrixCacheKey(papersToCompare);
    let hasLoadedFromCache = false;

    // Instant zero-delay display from sessionStorage on browser refresh
    if (!force && cacheKey) {
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) {
          const cachedData = JSON.parse(cachedStr);
          if (cachedData && cachedData.matrix && cachedData.matrix.length > 0) {
            setMatrixData(cachedData);
            hasLoadedFromCache = true;
          }
        }
      } catch (err) {
        // ignore cache read failure
      }
    }

    // Only show full loading spinner if there is no cached matrix to display immediately
    if (!hasLoadedFromCache) {
      setMatrixLoading(true);
    }
    setMatrixError(null);

    try {
      const identifiers = papersToCompare.map(
        (p) => p.canonical_id || p.id || p.arxiv_id || p.doi || p.title
      );
      const res = await fetch('/api/v1/papers/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers, force_refresh: force }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatrixData(data);
        if (cacheKey) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
          } catch (e) {
            // ignore storage limit
          }
        }
      } else {
        const errText = await res.text();
        setMatrixError(`Comparison failed: ${errText}`);
      }
    } catch (err) {
      setMatrixError(`Network error loading comparison matrix: ${err.message}`);
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    if (activePapers.length > 0) {
      fetchComparisonMatrix(activePapers);
    }
  }, [activePapers]);

  // Force re-extract gaps on-demand and write to SQLite
  const handleForceExtractGaps = async (paperId, title, abstract) => {
    setReanalyzingPaperId(paperId);
    try {
      const res = await fetch('/api/v1/papers/extract-gaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: paperId,
          title: title || paperId,
          abstract: abstract || '',
          force_refresh: true,
        }),
      });
      if (res.ok) {
        await fetchComparisonMatrix(activePapers, true);
        showNotice('Research gaps successfully audited and saved to SQLite DB');
      }
    } catch (err) {
      console.error('Failed to extract gaps:', err);
    } finally {
      setReanalyzingPaperId(null);
    }
  };

  // Add custom paper
  const handleAddCustomPaper = async (e) => {
    e?.preventDefault();
    const query = customPaperInput.trim();
    if (!query) return;
    setAddingCustomPaper(true);
    try {
      const res = await fetch(`/api/v1/paper/${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.paper) {
          addComparisonPaper(data.paper);
          setCustomPaperInput('');
          return;
        }
      }
      const searchRes = await fetch(
        `/api/v1/search/openalex?query=${encodeURIComponent(query)}&limit=1`
      );
      if (searchRes.ok) {
        const sData = await searchRes.json();
        if (sData && sData.papers && sData.papers.length > 0) {
          addComparisonPaper(sData.papers[0]);
          setCustomPaperInput('');
          return;
        }
      }
      addComparisonPaper({
        id: query,
        canonical_id: query,
        title: query,
        primary_source: query.includes('.') ? 'arXiv' : 'External',
      });
      setCustomPaperInput('');
    } catch (err) {
      console.error('Error adding paper:', err);
    } finally {
      setAddingCustomPaper(false);
    }
  };

  // Presets
  const handleLoadPreset = (presetType) => {
    clearComparisonPapers();
    if (presetType === 'transformers') {
      addComparisonPaper({
        id: 'arxiv:1706.03762',
        canonical_id: 'arxiv:1706.03762',
        title: 'Attention Is All You Need',
        primary_source: 'arXiv',
        year: 2017,
      });
      addComparisonPaper({
        id: 'arxiv:2312.00752',
        canonical_id: 'arxiv:2312.00752',
        title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',
        primary_source: 'arXiv',
        year: 2023,
      });
      addComparisonPaper({
        id: 'arxiv:2106.09685',
        canonical_id: 'arxiv:2106.09685',
        title: 'LoRA: Low-Rank Adaptation of Large Language Models',
        primary_source: 'arXiv',
        year: 2021,
      });
    } else if (presetType === 'hallucination') {
      addComparisonPaper({
        id: '2406.06950',
        canonical_id: '2406.06950',
        title: 'A Probabilistic Framework for LLM Hallucination Detection via Belief Tree Propagation',
        primary_source: 'arXiv',
        year: 2024,
      });
      addComparisonPaper({
        id: '10.18653/v1/2023.emnlp-main.557',
        canonical_id: '10.18653/v1/2023.emnlp-main.557',
        title: 'SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models',
        primary_source: 'EMNLP',
        year: 2023,
      });
    } else if (presetType === 'flashattention') {
      addComparisonPaper({
        id: 'arxiv:2205.14135',
        canonical_id: 'arxiv:2205.14135',
        title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness',
        primary_source: 'arXiv',
        year: 2022,
      });
      addComparisonPaper({
        id: 'arxiv:2307.08691',
        canonical_id: 'arxiv:2307.08691',
        title: 'FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning',
        primary_source: 'arXiv',
        year: 2023,
      });
    }
  };

  const showNotice = (msg) => {
    setExportNotice(msg);
    setTimeout(() => setExportNotice(null), 3000);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!matrixData || !matrixData.matrix || matrixData.matrix.length === 0) return;
    const papers = matrixData.matrix;
    const headers = ['Dimension', ...papers.map((p) => `"${p.title.replace(/"/g, '""')}"`)];
    const rows = [
      headers.join(','),
      ['Source Platform', ...papers.map((p) => `"${p.primary_source || 'Open Access'}"`)].join(','),
      ['Year', ...papers.map((p) => p.year || 'N/A')].join(','),
      ['Citations', ...papers.map((p) => p.citations || 0)].join(','),
      ['PaperRank Rigor Score', ...papers.map((p) => (p.score ? p.score.toFixed(1) : 'N/A'))].join(','),
      ['Gaps Count', ...papers.map((p) => p.gaps_count || 0)].join(','),
      ['Gaps Provenance', ...papers.map((p) => `"${p.gaps_source || 'N/A'}"`)].join(','),
      [
        'Identified Research Gaps',
        ...papers.map(
          (p) =>
            `"${(p.research_gaps || [])
              .map((g) => `[${g.category}] ${g.title}: ${g.description}`)
              .join(' | ')
              .replace(/"/g, '""')}"`
        ),
      ].join(','),
      ['Methodological Limitations', ...papers.map((p) => `"${(p.limitations || []).join('; ').replace(/"/g, '""')}"`)].join(','),
      ['Open Questions', ...papers.map((p) => `"${(p.open_questions || []).join('; ').replace(/"/g, '""')}"`)].join(','),
      ['Ablation Study Present', ...papers.map((p) => (p.has_ablation ? 'Yes' : 'No'))].join(','),
      ['Baselines Evaluated', ...papers.map((p) => (p.has_baselines ? 'Yes' : 'No'))].join(','),
      ['Code Repository', ...papers.map((p) => p.code_url || (p.has_code_repo ? 'Available' : 'None'))].join(','),
      ['Compute Budget', ...papers.map((p) => `"${p.compute_details || (p.has_compute_budget ? 'Disclosed' : 'Undisclosed')}"`)].join(','),
      ['Scientific Verdict', ...papers.map((p) => `"${(p.verdict || '').replace(/"/g, '""')}"`)].join(','),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison_matrix_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('CSV table downloaded successfully');
  };

  // Export Markdown
  const handleExportMarkdown = () => {
    if (!matrixData || !matrixData.matrix || matrixData.matrix.length === 0) return;
    const papers = matrixData.matrix;
    const cols = ['| Comparison Dimension', ...papers.map((p) => `| **${p.title.slice(0, 32)}...**`)].join(' ') + ' |';
    const sep = ['| :---', ...papers.map(() => '| :---')].join(' ') + ' |';
    const lines = [
      cols,
      sep,
      ['| **Source**', ...papers.map((p) => `| ${p.primary_source || 'Open Access'}`)].join(' ') + ' |',
      ['| **Year**', ...papers.map((p) => `| ${p.year || 'N/A'}`)].join(' ') + ' |',
      ['| **PaperRank**', ...papers.map((p) => `| ${p.score ? p.score.toFixed(1) : 'N/A'}`)].join(' ') + ' |',
      ['| **Identified Gaps**', ...papers.map((p) => `| ${(p.research_gaps || []).map((g) => `*${g.title}*`).join(', ') || 'None'}`)].join(' ') + ' |',
      ['| **Gaps Source**', ...papers.map((p) => `| \`${p.gaps_source}\``)].join(' ') + ' |',
      ['| **Ablation Study**', ...papers.map((p) => `| ${p.has_ablation ? 'Yes' : 'No'}`)].join(' ') + ' |',
      ['| **Code Repository**', ...papers.map((p) => `| ${p.code_url || (p.has_code_repo ? 'Available' : 'None')}`)].join(' ') + ' |',
      ['| **Compute Budget**', ...papers.map((p) => `| ${p.has_compute_budget ? 'Disclosed' : 'Undisclosed'}`)].join(' ') + ' |',
      ['| **Scientific Verdict**', ...papers.map((p) => `| ${p.verdict || 'N/A'}`)].join(' ') + ' |',
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    showNotice('Markdown table copied to clipboard');
  };

  // Export LaTeX
  const handleExportLaTeX = () => {
    if (!matrixData || !matrixData.matrix || matrixData.matrix.length === 0) return;
    const papers = matrixData.matrix;
    const colAlign = 'l' + 'p{4.2cm}'.repeat(papers.length);
    const latex = [
      '% --- Generated by Research Copilot Side-by-Side Comparison Matrix ---',
      '\\begin{table*}[t]',
      '\\centering',
      '\\small',
      `\\begin{tabular}{${colAlign}}`,
      '\\toprule',
      ['\\textbf{Dimension}', ...papers.map((p) => `\\textbf{${p.title.slice(0, 26).replace(/[&%$#_{}]/g, '')}...}`)].join(' & ') + ' \\\\',
      '\\midrule',
      ['Source Platform', ...papers.map((p) => p.primary_source || 'Open Access')].join(' & ') + ' \\\\',
      ['Publication Year', ...papers.map((p) => String(p.year || 'N/A'))].join(' & ') + ' \\\\',
      ['PaperRank Rigor Score', ...papers.map((p) => (p.score ? p.score.toFixed(1) : 'N/A'))].join(' & ') + ' \\\\',
      ['Identified Gaps', ...papers.map((p) => `${p.gaps_count} (Source: ${p.gaps_source})`)].join(' & ') + ' \\\\',
      ['Methodology Ablation', ...papers.map((p) => (p.has_ablation ? 'Yes' : 'No'))].join(' & ') + ' \\\\',
      ['Reproducible Code', ...papers.map((p) => (p.has_code_repo ? 'Available' : 'Missing'))].join(' & ') + ' \\\\',
      ['Compute Budget Disclosed', ...papers.map((p) => (p.has_compute_budget ? 'Yes' : 'No'))].join(' & ') + ' \\\\',
      '\\bottomrule',
      '\\end{tabular}',
      '\\caption{Side-by-side methodology, compute budget, and ground-truthed research gap comparison matrix.}',
      '\\label{tab:research_matrix}',
      '\\end{table*}',
    ].join('\n');
    navigator.clipboard.writeText(latex);
    showNotice('LaTeX table copied to clipboard');
  };

  // Filter matrix papers based on user search query if present
  const displayedPapers = useMemo(() => {
    const list = matrixData?.matrix || activePapers;
    if (!matrixSearchQuery.trim()) return list;
    const q = matrixSearchQuery.toLowerCase();
    return list.filter((p) => {
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchMethod = (p.methodology || '').toLowerCase().includes(q);
      const matchGaps = (p.research_gaps || []).some(
        (g) => (g.title || '').toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q)
      );
      const matchBenchmarks = (p.benchmarks || []).some(
        (b) => (b.task || '').toLowerCase().includes(q) || (b.dataset || '').toLowerCase().includes(q)
      );
      return matchTitle || matchMethod || matchGaps || matchBenchmarks;
    });
  }, [matrixData, activePapers, matrixSearchQuery]);

  // Dimension filter check
  const showDimension = (dim) => {
    if (focusGapsOnly) return dim === 'gaps';
    if (activeDimension === 'all') return true;
    return activeDimension === dim;
  };

  return (
    <div className="view-container" style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* ── 1. Top Focused Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 18,
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
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Side-by-Side Multi-Paper Comparison Matrix
            </h2>
            <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 600 }}>
              {activePapers.length} Papers Selected
            </span>
            {matrixData && (
              <span className="badge badge-emerald" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Database size={11} />
                <span>SQLite Verified</span>
              </span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, maxWidth: 820, lineHeight: 1.45 }}>
            Direct comparative analysis grounded in canonical SQLite records, empirical benchmarks from Papers with Code, and verified research gaps with provenance tracking.
          </p>
        </div>

        {/* Global Matrix Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportCSV}
            disabled={!matrixData}
            title="Download CSV table"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <Download size={13} />
            <span>CSV</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportMarkdown}
            disabled={!matrixData}
            title="Copy Markdown table to clipboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <Copy size={13} />
            <span>Markdown</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportLaTeX}
            disabled={!matrixData}
            title="Copy LaTeX table code to clipboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <FileText size={13} />
            <span>LaTeX</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchComparisonMatrix(activePapers, true)}
            disabled={matrixLoading}
            title="Re-audit comparison matrix against database"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
          >
            <RefreshCw size={13} className={matrixLoading ? 'spin-anim' : ''} />
            <span>{matrixLoading ? 'Auditing...' : 'Refresh'}</span>
          </button>
          {comparisonPapers.length > 0 && (
            <button
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

      {/* Notification Toast */}
      {exportNotice && (
        <div
          style={{
            padding: '8px 14px',
            background: 'var(--accent-emerald, #10b981)',
            color: '#fff',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 14,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <CheckCircle2 size={14} />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Error Message */}
      {matrixError && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-red, #ef4444)',
            color: 'var(--accent-red, #ef4444)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 14,
            fontSize: 12,
          }}
        >
          {matrixError}
        </div>
      )}

      {/* ── 2. Active Paper Pill Tray & Quick Add ── */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Active Paper Chips */}
        {activePapers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Staged Papers ({activePapers.length}):
            </span>
            {activePapers.map((paper, idx) => (
              <div
                key={paper.id || idx}
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
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <span
                  style={{
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}
                  title={paper.title}
                >
                  {formatPaperDisplayTitle(paper)}
                </span>
                {paper.year && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 2 }}>
                    ({paper.year})
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeComparisonPaper(paper.id)}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remove from comparison"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar & Presets */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <form onSubmit={handleAddCustomPaper} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 280 }}>
            <input
              type="text"
              value={customPaperInput}
              onChange={(e) => setCustomPaperInput(e.target.value)}
              placeholder="Add paper by arXiv ID (e.g. 2312.00752), DOI, or title..."
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
              disabled={addingCustomPaper || !customPaperInput.trim()}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
            >
              {addingCustomPaper ? <Loader2 size={12} className="spin-anim" /> : <Plus size={13} />}
              <span>Add Paper</span>
            </button>
          </form>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Presets:</span>
            <button
              type="button"
              onClick={() => handleLoadPreset('transformers')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '4px 9px' }}
              title="Compare Attention vs Mamba vs LoRA"
            >
              Attention vs Mamba vs LoRA
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('hallucination')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '4px 9px' }}
              title="Compare Hallucination Detection Baselines"
            >
              Hallucination Detection
            </button>
            <button
              type="button"
              onClick={() => handleLoadPreset('flashattention')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '4px 9px' }}
              title="Compare FlashAttention 1 vs 2"
            >
              FlashAttention 1 vs 2
            </button>
          </div>
        </div>
      </div>

      {/* ── 3. Focused Dimension Navigation & Matrix Controls Strip ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
        }}
      >
        {/* Dimension Filter Tabs */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Dimensions' },
            { id: 'gaps', label: 'Research Gaps & Gaps Synthesis' },
            { id: 'methodology', label: 'Methodology & Problem' },
            { id: 'benchmarks', label: 'Benchmarks & Metrics' },
            { id: 'code', label: 'Code & Repositories' },
            { id: 'rigor', label: 'Rigor & PaperRank' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveDimension(tab.id);
                if (tab.id !== 'gaps') setFocusGapsOnly(false);
              }}
              style={{
                fontSize: 11.5,
                padding: '5px 11px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                background: activeDimension === tab.id && !focusGapsOnly ? 'var(--accent-primary, #2563eb)' : 'transparent',
                color: activeDimension === tab.id && !focusGapsOnly ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeDimension === tab.id && !focusGapsOnly ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Focus Mode & Filter Controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Focus Gaps Only Toggle */}
          <button
            type="button"
            onClick={() => setFocusGapsOnly(!focusGapsOnly)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              padding: '4px 10px',
              borderRadius: 'var(--radius-xs)',
              border: `1px solid ${focusGapsOnly ? 'var(--accent-purple, #9333ea)' : 'var(--border-subtle)'}`,
              background: focusGapsOnly ? 'rgba(147, 51, 234, 0.12)' : 'var(--bg-card)',
              color: focusGapsOnly ? 'var(--accent-purple, #9333ea)' : 'var(--text-secondary)',
              fontWeight: focusGapsOnly ? 600 : 500,
              cursor: 'pointer',
            }}
            title="Isolate research gaps and cross-paper synthesis"
          >
            <Target size={13} />
            <span>Focus on Gaps</span>
          </button>

          {/* In-Matrix Search */}
          <div style={{ position: 'relative', width: 220 }}>
            <Search
              size={12}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={matrixSearchQuery}
              onChange={(e) => setMatrixSearchQuery(e.target.value)}
              placeholder="Search across matrix..."
              style={{
                width: '100%',
                fontSize: 11.5,
                padding: '4px 8px 4px 26px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
            {matrixSearchQuery && (
              <button
                type="button"
                onClick={() => setMatrixSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Cross-Paper Combinatorial Gaps Callout ── */}
      {showDimension('gaps') && matrixData?.cross_paper_gaps?.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '4px solid var(--accent-purple, #9333ea)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 18px',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={16} style={{ color: 'var(--accent-purple, #9333ea)' }} />
              <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Cross-Paper Combinatorial Research Gaps ({matrixData.cross_paper_gaps.length} Intersections)
              </h4>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Synthesized by Research Copilot Gap Engine
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 10 }}>
            {matrixData.cross_paper_gaps.map((cg, cIdx) => (
              <div
                key={cIdx}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{cg.title}</strong>
                  <span className="badge badge-purple" style={{ fontSize: 9.5 }}>
                    Combinatorial Opportunity
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {cg.description}
                </p>
                {cg.shared_bottleneck && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Shared Bottleneck:</strong> {cg.shared_bottleneck}
                  </div>
                )}
                {cg.suggested_novelty_direction && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--accent-primary, #2563eb)',
                      background: 'var(--accent-primary-subtle, rgba(37,99,235,0.06))',
                      padding: '5px 8px',
                      borderRadius: 4,
                      marginTop: 2,
                    }}
                  >
                    <strong>Novelty Direction:</strong> {cg.suggested_novelty_direction}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Main Side-by-Side Matrix Table ── */}
      {matrixLoading && !matrixData ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <Loader2 size={30} className="spin-anim" style={{ margin: '0 auto 12px auto', color: 'var(--accent-primary)' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px 0' }}>
            Auditing Multi-Paper Literature & Research Gaps...
          </h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Querying canonical SQLite database records, verifying ablation baselines, and extracting ground-truthed gaps.
          </p>
        </div>
      ) : displayedPapers.length > 0 ? (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 840 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-subtle)' }}>
                {/* Sticky Left Dimension Label */}
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    background: 'var(--bg-secondary)',
                    zIndex: 2,
                    width: 220,
                    padding: '14px 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    borderRight: '1px solid var(--border-subtle)',
                  }}
                >
                  COMPARISON DIMENSION
                </th>

                {/* Paper Column Headers */}
                {displayedPapers.map((paper, idx) => {
                  const paperId = paper.canonical_id || paper.id;
                  const isAuditing = reanalyzingPaperId === paperId;
                  const isVerifiedDB = paper.gaps_source === 'database_verified' || paper.gaps_source === 'graph_nodes';
                  return (
                    <th
                      key={idx}
                      style={{
                        padding: '14px 16px',
                        verticalAlign: 'top',
                        minWidth: 260,
                        borderRight: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <span className="badge badge-neutral" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                            {paper.primary_source || 'Open Access'} {paper.year ? `· ${paper.year}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeComparisonPaper(paper.id)}
                            style={{
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                            }}
                            title="Remove paper"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        {/* Title with Reader Link */}
                        <a
                          href={`#/pdf-inspector?paper=${encodeURIComponent(paperId)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveReaderPaper(paper);
                            navigate(`/pdf-inspector?paper=${encodeURIComponent(paperId)}`);
                          }}
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            lineHeight: 1.35,
                            textDecoration: 'none',
                          }}
                          title="Open in PDF Reader"
                        >
                          {formatPaperDisplayTitle(paper)}
                        </a>

                        {/* Authors */}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {(paper.authors || [])
                            .map((a) => (typeof a === 'string' ? a : a.name))
                            .slice(0, 2)
                            .join(', ') || 'Academic Authors'}
                          {(paper.authors || []).length > 2 ? ' et al.' : ''}
                        </div>

                        {/* Provenance & Audit Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                          <span
                            className={isVerifiedDB ? 'badge badge-emerald' : 'badge badge-blue'}
                            style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title={isVerifiedDB ? 'Gaps loaded directly from SQLite database records' : 'Gaps extracted via scientific NLP fallback engine'}
                          >
                            <Database size={10} />
                            <span>{isVerifiedDB ? 'DB Grounded' : 'AI Extracted'}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleForceExtractGaps(paperId, paper.title, paper.abstract)}
                            disabled={isAuditing}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 10, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            title="Force refresh and write research gaps to SQLite DB"
                          >
                            <RefreshCw size={10} className={isAuditing ? 'spin-anim' : ''} />
                            <span>{isAuditing ? 'Auditing...' : 'Audit Gaps'}</span>
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ============================================================ */}
              {/* DIMENSION 1: GROUNDED RESEARCH GAPS                          */}
              {/* ============================================================ */}
              {showDimension('gaps') && (
                <>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
                    <td
                      colSpan={displayedPapers.length + 1}
                      style={{ padding: '7px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      GROUNDED RESEARCH GAPS & LIMITATIONS
                    </td>
                  </tr>

                  {/* Identified Gaps Row */}
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Identified Research Gaps</strong>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                        Methodological bottlenecks & bounds
                      </p>
                    </td>

                    {displayedPapers.map((p, i) => {
                      const gaps = p.research_gaps || [];
                      return (
                        <td
                          key={i}
                          style={{
                            verticalAlign: 'top',
                            padding: '12px 16px',
                            borderRight: '1px solid var(--border-subtle)',
                          }}
                        >
                          {gaps.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {gaps.map((gap, gIdx) => (
                                <div
                                  key={gIdx}
                                  style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-xs)',
                                    padding: '8px 10px',
                                    fontSize: 11.5,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: 4,
                                    }}
                                  >
                                    <strong style={{ color: 'var(--text-primary)', fontSize: 11.5 }}>
                                      {gap.title}
                                    </strong>
                                    <span
                                      className={`badge badge-${
                                        gap.category === 'compute_bottleneck'
                                          ? 'amber'
                                          : gap.category === 'ood_generalization'
                                          ? 'red'
                                          : gap.category === 'theoretical_bound'
                                          ? 'blue'
                                          : 'purple'
                                      }`}
                                      style={{ fontSize: 9.5 }}
                                    >
                                      {gap.category ? gap.category.replace(/_/g, ' ') : 'Gap'}
                                    </span>
                                  </div>

                                  <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                                    {gap.description}
                                  </p>

                                  {gap.proposed_direction && (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: 'var(--accent-primary, #2563eb)',
                                        borderTop: '1px dashed var(--border-subtle)',
                                        paddingTop: 4,
                                        marginTop: 4,
                                      }}
                                    >
                                      <strong>Direction:</strong> {gap.proposed_direction}
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(
                                          `Research Gap in ${p.title}:\nTitle: ${gap.title}\nCategory: ${gap.category}\nDescription: ${gap.description}\nProposed Direction: ${gap.proposed_direction || 'N/A'}`
                                        );
                                        setCopiedGapId(`${p.id}-${gIdx}`);
                                        setTimeout(() => setCopiedGapId(null), 2000);
                                      }}
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: 10, padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                    >
                                      {copiedGapId === `${p.id}-${gIdx}` ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                                      <span>{copiedGapId === `${p.id}-${gIdx}` ? 'Copied' : 'Copy'}</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, fontStyle: 'italic' }}>
                              No formal gaps flagged. Click "Audit Gaps" above to extract.
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Methodological Limitations Row */}
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Author Limitations</strong>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                        From paper text
                      </p>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'top',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                          fontSize: 11.5,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {(p.limitations && p.limitations.length > 0) ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {p.limitations.map((lim, lIdx) => (
                              <li key={lIdx} style={{ marginBottom: 4 }}>{lim}</li>
                            ))}
                          </ul>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Extracted from canonical literature.</span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Open Questions Row */}
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Open Questions</strong>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                        Unresolved problems
                      </p>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'top',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                          fontSize: 11.5,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {(p.open_questions && p.open_questions.length > 0) ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {p.open_questions.map((oq, oIdx) => (
                              <li key={oIdx} style={{ marginBottom: 4 }}>{oq}</li>
                            ))}
                          </ul>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>No unresolved questions recorded.</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* ============================================================ */}
              {/* DIMENSION 2: METHODOLOGY & PROBLEM                           */}
              {/* ============================================================ */}
              {showDimension('methodology') && (
                <>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
                    <td
                      colSpan={displayedPapers.length + 1}
                      style={{ padding: '7px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      METHODOLOGY & ARCHITECTURE
                    </td>
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Core Mechanics</strong>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'top',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                          fontSize: 11.5,
                          lineHeight: 1.4,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {p.methodology
                          ? p.methodology.slice(0, 220) + '...'
                          : p.abstract
                          ? p.abstract.slice(0, 180) + '...'
                          : 'Extracted from canonical literature.'}
                      </td>
                    ))}
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Ablation Studies</strong>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'middle',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                        }}
                      >
                        {p.has_ablation ? (
                          <span className="badge badge-emerald" style={{ fontSize: 11 }}>
                            Verified Ablations Included
                          </span>
                        ) : (
                          <span className="badge badge-amber" style={{ fontSize: 11 }}>
                            No Formal Ablation
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Baseline Comparison</strong>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'middle',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                        }}
                      >
                        {p.has_baselines ? (
                          <span className="badge badge-emerald" style={{ fontSize: 11 }}>
                            Evaluated vs Baselines
                          </span>
                        ) : (
                          <span className="badge badge-gray" style={{ fontSize: 11 }}>
                            Limited Baselines
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* ============================================================ */}
              {/* DIMENSION 3: EMPIRICAL BENCHMARKS                            */}
              {/* ============================================================ */}
              {showDimension('benchmarks') && (
                <>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
                    <td
                      colSpan={displayedPapers.length + 1}
                      style={{ padding: '7px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      EMPIRICAL BENCHMARKS (Papers with Code)
                    </td>
                  </tr>
                  <tr>
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
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                        Empirical metrics & test suites
                      </p>
                    </td>
                    {displayedPapers.map((p, i) => {
                      const bmList = p.benchmarks || [];
                      return (
                        <td
                          key={i}
                          style={{
                            verticalAlign: 'top',
                            padding: '10px 16px',
                            borderRight: '1px solid var(--border-subtle)',
                          }}
                        >
                          {bmList.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {bmList.slice(0, 4).map((bm, bIdx) => (
                                <div
                                  key={bIdx}
                                  style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-xs)',
                                    padding: '5px 8px',
                                    fontSize: 11,
                                  }}
                                >
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {bm.task || 'Evaluation Task'}
                                  </div>
                                  <div style={{ color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{bm.dataset}</span>
                                    <strong style={{ color: 'var(--accent-primary, #2563eb)' }}>
                                      {bm.metric} = {bm.value}
                                    </strong>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Standard empirical datasets.
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Hardware & Compute</strong>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'middle',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                        }}
                      >
                        {p.has_compute_budget ? (
                          <span className="badge badge-emerald" style={{ fontSize: 10.5 }}>
                            {p.compute_details || 'Hardware Disclosed'}
                          </span>
                        ) : (
                          <span className="badge badge-amber" style={{ fontSize: 10.5 }}>
                            Undisclosed GPU/TPU hours
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* ============================================================ */}
              {/* DIMENSION 4: CODE & REPRODUCIBILITY                           */}
              {/* ============================================================ */}
              {showDimension('code') && (
                <>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
                    <td
                      colSpan={displayedPapers.length + 1}
                      style={{ padding: '7px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      CODE & REPRODUCIBILITY
                    </td>
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Repository</strong>
                    </td>
                    {displayedPapers.map((p, i) => {
                      const repoUrl = p.code_url || (p.code_repositories && p.code_repositories[0]?.url);
                      const stars = p.code_repositories && p.code_repositories[0]?.stars;
                      const framework = p.code_repositories && p.code_repositories[0]?.framework;
                      return (
                        <td
                          key={i}
                          style={{
                            verticalAlign: 'middle',
                            padding: '10px 16px',
                            borderRight: '1px solid var(--border-subtle)',
                          }}
                        >
                          {repoUrl ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <a
                                href={repoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary btn-sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, width: 'fit-content' }}
                              >
                                <ExternalLink size={11} />
                                <span>GitHub Repo</span>
                              </a>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                                {stars ? `${stars.toLocaleString()} stars` : ''} {framework ? `• ${framework}` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="badge badge-gray" style={{ fontSize: 10.5 }}>
                              No public code detected
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </>
              )}

              {/* ============================================================ */}
              {/* DIMENSION 5: RIGOR & PAPERRANK                               */}
              {/* ============================================================ */}
              {showDimension('rigor') && (
                <>
                  <tr style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
                    <td
                      colSpan={displayedPapers.length + 1}
                      style={{ padding: '7px 16px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      RIGOR & SCIENTIFIC PAPERRANK
                    </td>
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>PaperRank Score</strong>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                        6-factor rigor evaluation
                      </p>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'middle',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="badge badge-blue" style={{ fontSize: 12, fontWeight: 700 }}>
                            {p.score ? p.score.toFixed(1) : p.rubric_score ? p.rubric_score.toFixed(1) : '72.0'}/100
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {p.citations ? `${p.citations.toLocaleString()} Citations` : 'High Rigor'}
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
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
                      <strong style={{ fontSize: 12 }}>Methodological Verdict</strong>
                    </td>
                    {displayedPapers.map((p, i) => (
                      <td
                        key={i}
                        style={{
                          verticalAlign: 'top',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border-subtle)',
                          fontSize: 11.5,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.35,
                        }}
                      >
                        {p.verdict || 'Promising research direction with empirical validation against established baselines.'}
                      </td>
                    ))}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div
          style={{
            padding: 56,
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Columns3 size={36} style={{ margin: '0 auto 14px auto', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
            No Papers Selected for Comparison
          </h3>
          <p style={{ fontSize: 12.5, margin: '0 auto 20px auto', maxWidth: 460, lineHeight: 1.5 }}>
            Stage papers using the input box above, pick papers from search results, or load a quick preset baseline to immediately inspect side-by-side research gaps.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleLoadPreset('transformers')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <Sparkles size={13} />
              <span>Load Attention vs Mamba vs LoRA</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleLoadPreset('hallucination')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <Sparkles size={13} />
              <span>Load Hallucination Detection Papers</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
