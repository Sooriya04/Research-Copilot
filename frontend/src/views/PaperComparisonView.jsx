import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Columns3, Loader2, CheckCircle2, Sparkles, X, Database } from 'lucide-react';
import { useApp } from '../context/AppContext';

import MatrixHeader from '../components/matrix/MatrixHeader';
import MatrixPaperTray, { formatPaperDisplayTitle } from '../components/matrix/MatrixPaperTray';
import MatrixFilterBar from '../components/matrix/MatrixFilterBar';
import TaxonomySection from '../components/matrix/TaxonomySection';
import ScientificRows from '../components/matrix/ScientificRows';

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

  // Matrix states
  const [matrixData, setMatrixData] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [activeTab, setActiveTab] = useState('taxonomy'); // 'taxonomy' | 'all' | 'gaps' | 'methodology' | 'code' | 'benchmarks'
  const [searchQuery, setSearchQuery] = useState('');
  const [customPaperInput, setCustomPaperInput] = useState('');
  const [addingCustomPaper, setAddingCustomPaper] = useState(false);
  const [copiedGapId, setCopiedGapId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Taxonomy states
  const [includeOurs, setIncludeOurs] = useState(true);
  const [oursTitle, setOursTitle] = useState('Proposed Method (Ours)');
  const [customCriteria, setCustomCriteria] = useState([]);
  const [newCriterionInput, setNewCriterionInput] = useState('');
  const [featureOverrides, setFeatureOverrides] = useState({});

  // Active comparison papers
  const activePapers = useMemo(() => {
    if (comparisonPapers && comparisonPapers.length > 0) return comparisonPapers;
    if (searchResults && searchResults.length > 0) return searchResults.slice(0, 4);
    return [];
  }, [comparisonPapers, searchResults]);

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  // Cache key helper
  const getMatrixCacheKey = (papers) => {
    if (!papers || papers.length === 0) return '';
    const ids = papers.map((p) => p.canonical_id || p.id || p.title).sort();
    return `rc_compare_matrix_${ids.join('_')}`;
  };

  // Fetch comparison matrix
  const fetchComparisonMatrix = async (papersToCompare = activePapers, force = false) => {
    if (!papersToCompare || papersToCompare.length === 0) {
      setMatrixData(null);
      return;
    }

    const cacheKey = getMatrixCacheKey(papersToCompare);
    let loadedFromCache = false;

    if (!force && cacheKey) {
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached?.matrix?.length > 0) {
            setMatrixData(cached);
            loadedFromCache = true;
          }
        }
      } catch (e) {
        // ignore cache read error
      }
    }

    if (!loadedFromCache) setMatrixLoading(true);
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
          } catch (e) {}
        }
      } else {
        const errText = await res.text();
        setMatrixError(`Comparison failed: ${errText}`);
      }
    } catch (err) {
      setMatrixError(`Error loading comparison: ${err.message}`);
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    if (activePapers.length > 0) {
      fetchComparisonMatrix(activePapers);
    }
  }, [activePapers]);

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
        if (data?.paper) {
          addComparisonPaper(data.paper);
          setCustomPaperInput('');
          return;
        }
      }
      const searchRes = await fetch(`/api/v1/search/openalex?query=${encodeURIComponent(query)}&limit=1`);
      if (searchRes.ok) {
        const sData = await searchRes.json();
        if (sData?.papers?.length > 0) {
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

  // Quick presets
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

  // Criteria definition
  const allCriteria = useMemo(() => {
    const base = [
      { id: 'multimodal', label: 'Multi-Modal', tooltip: 'Vision, audio, text, or multi-modal representations' },
      { id: 'zero_shot', label: 'Zero-Shot', tooltip: 'Evaluated on unseen zero-shot tasks' },
      { id: 'training_free', label: 'Training-Free / Adapters', tooltip: 'Uses frozen backbones or lightweight parameter adapters' },
      { id: 'real_time', label: 'Real-Time Inference', tooltip: 'Low-latency / linear complexity execution' },
      { id: 'open_source', label: 'Open-Source Code', tooltip: 'Verified public code and model checkpoints' },
      { id: 'compute_disclosed', label: 'Compute Disclosed', tooltip: 'Discloses GPU/TPU hours and training compute budget' },
      { id: 'ablation_verified', label: 'Ablation Verified', tooltip: 'Includes empirical component ablation studies' },
      { id: 'sota_benchmarked', label: 'SOTA Benchmarked', tooltip: 'Benchmarked against standard published baselines' },
    ];
    return [...base, ...customCriteria];
  }, [customCriteria]);

  const getFeatureStatus = (paper, criterionId) => {
    const key = `${paper.canonical_id || paper.id}_${criterionId}`;
    if (featureOverrides[key]) return featureOverrides[key];
    if (paper.isOurs) return 'present';
    const fc = paper.features_checklist || {};
    if (fc[criterionId]) return fc[criterionId];
    if (criterionId === 'open_source') return paper.has_code_repo ? 'present' : 'missing';
    if (criterionId === 'ablation_verified') return paper.has_ablation ? 'present' : 'missing';
    if (criterionId === 'sota_benchmarked') return paper.has_baselines ? 'present' : 'missing';
    if (criterionId === 'compute_disclosed') return paper.has_compute_budget ? 'present' : 'missing';
    return 'missing';
  };

  const toggleFeatureStatus = (paper, criterionId) => {
    const key = `${paper.canonical_id || paper.id}_${criterionId}`;
    const curr = getFeatureStatus(paper, criterionId);
    const next = curr === 'present' ? 'partial' : curr === 'partial' ? 'missing' : 'present';
    setFeatureOverrides((prev) => ({ ...prev, [key]: next }));
  };

  const handleAddCriterion = (e) => {
    e.preventDefault();
    const cleanLabel = newCriterionInput.trim();
    if (!cleanLabel) return;
    const cleanId = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (allCriteria.some((c) => c.id === cleanId)) {
      showToast('Criterion already exists');
      return;
    }
    setCustomCriteria((prev) => [
      ...prev,
      { id: cleanId, label: cleanLabel, tooltip: `Custom criterion: ${cleanLabel}`, isCustom: true },
    ]);
    setNewCriterionInput('');
    showToast(`Added criterion: ${cleanLabel}`);
  };

  const handleDeleteCriterion = (id) => {
    setCustomCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  // Filter papers
  const displayedPapers = useMemo(() => {
    const list = matrixData?.matrix || activePapers;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((p) => {
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchMethod = (p.methodology || '').toLowerCase().includes(q);
      const matchGaps = (p.research_gaps || []).some(
        (g) => (g.title || '').toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q)
      );
      return matchTitle || matchMethod || matchGaps;
    });
  }, [matrixData, activePapers, searchQuery]);

  // Combined papers with "Ours"
  const papersToDisplay = useMemo(() => {
    if (includeOurs) {
      return [
        ...displayedPapers,
        {
          id: 'ours_method',
          canonical_id: 'ours_method',
          title: oursTitle,
          isOurs: true,
          year: new Date().getFullYear(),
          primary_source: 'Our Work',
          authors: ['Proposed Method'],
          research_gaps: [],
          has_ablation: true,
          has_baselines: true,
          has_code_repo: true,
          has_compute_budget: true,
          compute_details: 'Disclosed',
        },
      ];
    }
    return displayedPapers;
  }, [displayedPapers, includeOurs, oursTitle]);

  // Exporters
  const handleExportCSV = () => {
    if (!papersToDisplay.length) return;
    const headers = ['Method', ...allCriteria.map((c) => `"${c.label}"`)];
    const rows = [headers.join(',')];
    papersToDisplay.forEach((p) => {
      const row = [
        `"${p.title.replace(/"/g, '""')}"`,
        ...allCriteria.map((c) => {
          const st = getFeatureStatus(p, c.id);
          return st === 'present' ? 'Yes' : st === 'partial' ? 'Partial' : 'No';
        }),
      ];
      rows.push(row.join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature_matrix_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded');
  };

  const handleExportMarkdown = () => {
    if (!papersToDisplay.length) return;
    const cols = ['| Method', ...allCriteria.map((c) => `| ${c.label}`)].join(' ') + ' |';
    const sep = ['| :---', ...allCriteria.map(() => '| :---:')].join(' ') + ' |';
    const lines = [cols, sep];
    papersToDisplay.forEach((p) => {
      const name = p.isOurs ? `**${p.title}**` : p.title.slice(0, 24);
      const cells = allCriteria.map((c) => {
        const st = getFeatureStatus(p, c.id);
        return st === 'present' ? '✓' : st === 'partial' ? '~' : '✕';
      });
      lines.push([`| ${name}`, ...cells.map((c) => `| ${c}`)].join(' ') + ' |');
    });
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Markdown table copied');
  };

  const handleExportTaxonomyLaTeX = () => {
    if (!papersToDisplay.length) return;
    const cols = 'l' + 'c'.repeat(allCriteria.length);
    const lines = [
      '% --- Qualitative Architectural Feature Comparison Matrix ---',
      '% Standard survey table for Section 2 (Related Work)',
      '\\begin{table*}[t]',
      '\\centering',
      '\\small',
      `\\begin{tabular}{${cols}}`,
      '\\toprule',
      ['\\textbf{Method}', ...allCriteria.map((c) => `\\textbf{${c.label.replace('&', '\\&')}}`)].join(' & ') + ' \\\\',
      '\\midrule',
    ];
    papersToDisplay.forEach((p) => {
      const name = p.isOurs ? `\\textbf{${p.title}}` : p.title.slice(0, 24).replace(/[&%$#_{}]/g, '');
      const cells = allCriteria.map((c) => {
        const st = getFeatureStatus(p, c.id);
        if (st === 'present') return p.isOurs ? '\\textbf{\\checkmark}' : '$\\checkmark$';
        if (st === 'partial') return '$\\sim$';
        return '$\\times$';
      });
      lines.push([name, ...cells].join(' & ') + ' \\\\');
    });
    lines.push(
      '\\bottomrule',
      '\\end{tabular}',
      '\\caption{Architectural feature comparison against published baselines. ($\\checkmark$: Supported, $\\sim$: Partial, $\\times$: Not supported).}',
      '\\label{tab:feature_matrix}',
      '\\end{table*}'
    );
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('LaTeX table copied');
  };

  const handleCopyGap = (paper, gap, idx) => {
    navigator.clipboard.writeText(`[${gap.title}] in ${paper.title}:\n${gap.description}`);
    setCopiedGapId(`${paper.id}-${idx}`);
    setTimeout(() => setCopiedGapId(null), 2000);
  };

  return (
    <div className="view-container" style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      {/* ── 1. Top Header ── */}
      <MatrixHeader
        activePapersCount={activePapers.length}
        hasMatrixData={!!matrixData}
        matrixLoading={matrixLoading}
        onExportCSV={handleExportCSV}
        onExportMarkdown={handleExportMarkdown}
        onExportTaxonomyLaTeX={handleExportTaxonomyLaTeX}
        onRefresh={() => fetchComparisonMatrix(activePapers, true)}
        onClear={clearComparisonPapers}
        canClear={comparisonPapers.length > 0}
      />

      {/* Toast Notification */}
      {notice && (
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
          <span>{notice}</span>
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

      {/* ── 2. Paper Tray & Presets ── */}
      <MatrixPaperTray
        activePapers={activePapers}
        onRemovePaper={removeComparisonPaper}
        customPaperInput={customPaperInput}
        setCustomPaperInput={setCustomPaperInput}
        onAddCustomPaper={handleAddCustomPaper}
        addingCustomPaper={addingCustomPaper}
        onLoadPreset={handleLoadPreset}
      />

      {/* ── 3. Filter & Dimension Bar ── */}
      <MatrixFilterBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        includeOurs={includeOurs}
        setIncludeOurs={setIncludeOurs}
      />

      {/* ── 4. Main Matrix Table ── */}
      {matrixLoading && !matrixData ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <Loader2 size={30} className="spin-anim" style={{ margin: '0 auto 12px auto', color: 'var(--accent-primary)' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px 0' }}>
            Building Feature Comparison Matrix...
          </h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Grounding literature metadata, verifying open source repositories, and preparing taxonomy.
          </p>
        </div>
      ) : papersToDisplay.length > 0 ? (
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

                {papersToDisplay.map((paper, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: '14px 16px',
                      verticalAlign: 'top',
                      minWidth: 260,
                      borderRight: '1px solid var(--border-subtle)',
                      background: paper.isOurs ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                      borderTop: paper.isOurs ? '3px solid var(--accent-primary, #2563eb)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <span className={paper.isOurs ? 'badge badge-blue' : 'badge badge-neutral'} style={{ fontSize: 10, textTransform: 'uppercase' }}>
                          {paper.isOurs ? 'OUR PROPOSED METHOD' : (paper.primary_source || 'Open Access')} {paper.year ? `· ${paper.year}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => (paper.isOurs ? setIncludeOurs(false) : removeComparisonPaper(paper.id))}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                          }}
                          title={paper.isOurs ? 'Hide proposed method column' : 'Remove paper'}
                        >
                          <X size={12} />
                        </button>
                      </div>

                      {paper.isOurs ? (
                        <input
                          type="text"
                          value={oursTitle}
                          onChange={(e) => setOursTitle(e.target.value)}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: 'var(--accent-primary, #2563eb)',
                            border: '1px solid var(--accent-primary)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '3px 8px',
                            background: '#fff',
                          }}
                          title="Rename your method"
                        />
                      ) : (
                        <a
                          href={`#/pdf-inspector?paper=${encodeURIComponent(paper.canonical_id || paper.id)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveReaderPaper(paper);
                            navigate(`/pdf-inspector?paper=${encodeURIComponent(paper.canonical_id || paper.id)}`);
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
                      )}

                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {paper.isOurs
                          ? 'Your Project / Submission Authors'
                          : (paper.authors || [])
                              .map((a) => (typeof a === 'string' ? a : a.name))
                              .slice(0, 2)
                              .join(', ') || 'Academic Authors'}
                        {!paper.isOurs && (paper.authors || []).length > 2 ? ' et al.' : ''}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Feature Matrix / Taxonomy Section */}
              {(activeTab === 'taxonomy' || activeTab === 'all') && (
                <TaxonomySection
                  criteria={allCriteria}
                  papers={papersToDisplay}
                  getFeatureStatus={getFeatureStatus}
                  toggleFeatureStatus={toggleFeatureStatus}
                  onAddCriterion={handleAddCriterion}
                  newCriterionInput={newCriterionInput}
                  setNewCriterionInput={setNewCriterionInput}
                  onDeleteCriterion={handleDeleteCriterion}
                />
              )}

              {/* Scientific Rows: Methodology, Code, Gaps, Benchmarks */}
              {activeTab !== 'taxonomy' && (
                <ScientificRows
                  showTab={activeTab}
                  papers={papersToDisplay}
                  copiedGapId={copiedGapId}
                  onCopyGap={handleCopyGap}
                />
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Clean Empty State */
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
            Stage papers using the input box above, pick papers from search results, or load a quick preset baseline to immediately inspect side-by-side features.
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
