import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  FileText,
  Network,
  ExternalLink,
  Plus,
  Columns3,
  X,
  Code,
  FolderKanban,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function LiteratureResultsView() {
  const navigate = useNavigate();
  const {
    searchQuery,
    searchResults: results,
    searchLoading,
    searchError,
    sourceCounts,
    addedToGraphPaperIds,
    setAddedToGraphPaperIds,
    setActiveReaderPaper,
    addComparisonPaper,
    comparisonPapers,
    activeWorkspace,
  } = useApp();

  // Filters & sorting
  const [filterTerm, setFilterTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [onlyOpenAccess, setOnlyOpenAccess] = useState(false);
  const [onlyCode, setOnlyCode] = useState(false);
  const [yearFilter, setYearFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance' | 'citations' | 'year'

  // Pagination
  const [visibleCount, setVisibleCount] = useState(15);
  const [copiedBibId, setCopiedBibId] = useState(null);
  const [workspaceNotice, setWorkspaceNotice] = useState(null);
  const [ingestedMap, setIngestedMap] = useState({});

  const showToast = (msg) => {
    setWorkspaceNotice(msg);
    setTimeout(() => setWorkspaceNotice(null), 3000);
  };

  // Distinct sources among results
  const availableSources = useMemo(() => {
    const s = new Set();
    results.forEach((p) => {
      if (p.primary_source) s.add(p.primary_source.toLowerCase());
    });
    return Array.from(s);
  }, [results]);

  // Distinct years among results
  const availableYears = useMemo(() => {
    const y = new Set();
    results.forEach((p) => {
      if (p.year) y.add(p.year);
    });
    return Array.from(y).sort((a, b) => b - a);
  }, [results]);

  // Filtered & sorted papers
  const filteredPapers = useMemo(() => {
    let list = [...results];

    // Source filter
    if (sourceFilter !== 'all') {
      list = list.filter((p) => (p.primary_source || '').toLowerCase() === sourceFilter.toLowerCase());
    }

    // Open Access filter
    if (onlyOpenAccess) {
      list = list.filter((p) => p.is_open_access || !!p.pdf_url);
    }

    // Code available filter
    if (onlyCode) {
      list = list.filter((p) => p.code_url || (p.code_repositories && p.code_repositories.length > 0) || p.checklist?.has_code_repo);
    }

    // Year filter
    if (yearFilter !== 'all') {
      list = list.filter((p) => String(p.year) === String(yearFilter));
    }

    // Text search filter
    if (filterTerm.trim()) {
      const q = filterTerm.toLowerCase().trim();
      list = list.filter((p) => {
        const titleMatch = (p.title || '').toLowerCase().includes(q);
        const absMatch = (p.abstract || '').toLowerCase().includes(q);
        const authorMatch = (p.authors || []).some((a) => {
          const name = typeof a === 'string' ? a : a.name || '';
          return name.toLowerCase().includes(q);
        });
        return titleMatch || absMatch || authorMatch;
      });
    }

    // Sorting
    if (sortBy === 'citations') {
      list.sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
    } else if (sortBy === 'year') {
      list.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else {
      // Relevance (default)
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    return list;
  }, [results, sourceFilter, onlyOpenAccess, onlyCode, yearFilter, filterTerm, sortBy]);

  // Paginated slice
  const displayedPapers = useMemo(() => {
    return filteredPapers.slice(0, visibleCount);
  }, [filteredPapers, visibleCount]);

  // Copy BibTeX
  const copyBibTeX = (paper) => {
    const paperId = paper.id || paper.arxiv_id || 'paper';
    const cleanKey = paperId.replace(/[^a-zA-Z0-9]/g, '');
    const firstAuthor = paper.authors && paper.authors.length > 0
      ? (typeof paper.authors[0] === 'string' ? paper.authors[0] : paper.authors[0].name || 'Author')
      : 'Author';
    const bibtex = `@article{${cleanKey || 'ref'},
  title={${paper.title}},
  author={${firstAuthor} and others},
  journal={Research Copilot Knowledge Base},
  year={${paper.year || new Date().getFullYear()}}
}`;
    navigator.clipboard.writeText(bibtex);
    setCopiedBibId(paperId);
    setTimeout(() => setCopiedBibId(null), 2000);
  };

  // Toggle Knowledge Graph Ingestion
  const handleToggleGraph = async (paper) => {
    const pId = paper.id || paper.arxiv_id || paper.canonical_id || `paper-${paper.title?.slice(0, 15)}`;
    const isAdded = addedToGraphPaperIds.includes(pId);
    setIngestedMap((prev) => ({ ...prev, [pId]: 'loading' }));

    if (isAdded) {
      try {
        await fetch('/api/v1/graph/remove-paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper_id: pId }),
        });
        setAddedToGraphPaperIds((prev) => prev.filter((id) => id !== pId));
        setIngestedMap((prev) => {
          const next = { ...prev };
          delete next[pId];
          return next;
        });
      } catch {
        setIngestedMap((prev) => ({ ...prev, [pId]: 'error' }));
      }
    } else {
      try {
        const res = await fetch('/api/v1/graph/ingest-paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: searchQuery || 'Scientific Literature',
            workspace_id: activeWorkspace?.id || null,
            paper_data: {
              id: pId,
              title: paper.title,
              year: paper.year,
              authors: (paper.authors || []).map((a) => (typeof a === 'string' ? a : a.name || String(a))),
              abstract: paper.abstract || '',
              arxiv_id: paper.arxiv_id || (pId.startsWith('arxiv:') ? pId.replace('arxiv:', '') : null),
              doi: paper.doi || null,
              url: paper.url || null,
              primary_source: paper.primary_source || 'unknown',
              citation_count: paper.citation_count || 0,
            },
          }),
        });
        if (res.ok) {
          setIngestedMap((prev) => ({ ...prev, [pId]: 'done' }));
          setAddedToGraphPaperIds((prev) => (prev.includes(pId) ? prev : [...prev, pId]));
        }
      } catch {
        setIngestedMap((prev) => ({ ...prev, [pId]: 'error' }));
      }
    }
  };

  // Add paper to current workspace
  const handleAddToWorkspace = (paper) => {
    if (!activeWorkspace) {
      showToast('No active workspace selected. Switch workspace from sidebar.');
      return;
    }
    const wsKey = `rc_ws_${activeWorkspace.id}_search_results`;
    try {
      const existing = JSON.parse(localStorage.getItem(wsKey) || '[]');
      const pId = paper.id || paper.canonical_id;
      if (!existing.some((p) => (p.id || p.canonical_id) === pId)) {
        existing.push(paper);
        localStorage.setItem(wsKey, JSON.stringify(existing));
        showToast(`Saved "${paper.title.slice(0, 30)}..." to workspace ${activeWorkspace.title}`);
      } else {
        showToast(`Paper already in workspace ${activeWorkspace.title}`);
      }
    } catch (e) {
      showToast('Error saving to workspace');
    }
  };

  return (
    <div className="view-container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── 1. Top Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 18,
          paddingBottom: 14,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/search')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11.5 }}
              title="Return to Literature Search"
            >
              <ArrowLeft size={13} />
              <span>Modify Query</span>
            </button>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Search Results
            </h1>
            {searchQuery && (
              <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                Query: "{searchQuery}"
              </span>
            )}
            <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 600 }}>
              {filteredPapers.length} {filteredPapers.length === 1 ? 'Paper' : 'Papers'}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
            {results.length > 0
              ? `Displaying deduplicated scientific results across ${Object.keys(sourceCounts || {}).length || 'connected'} database sources.`
              : 'Execute a search to view retrieved scientific literature.'}
          </p>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/compare')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
            title="Open Comparison Matrix"
          >
            <Columns3 size={13} />
            <span>Comparison Matrix ({comparisonPapers.length})</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
            title="Open Knowledge Graph"
          >
            <Network size={13} />
            <span>Knowledge Graph</span>
          </button>
        </div>
      </div>

      {/* Toast Notice */}
      {workspaceNotice && (
        <div
          style={{
            padding: '8px 14px',
            background: 'var(--accent-emerald, #10b981)',
            color: '#fff',
            borderRadius: 'var(--radius-sm, 6px)',
            marginBottom: 14,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <CheckCircle2 size={13} />
          <span>{workspaceNotice}</span>
        </div>
      )}

      {/* ── 2. Filters & Toolbar ── */}
      {!searchLoading && results.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '12px 16px',
            marginBottom: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Top row: search filter & sort */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
              <Search
                size={13}
                style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder="Filter results by keyword, title, or author..."
                style={{
                  width: '100%',
                  fontSize: 12,
                  padding: '6px 8px 6px 28px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
              {filterTerm && (
                <button
                  type="button"
                  onClick={() => setFilterTerm('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Sort Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  fontSize: 11.5,
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <option value="relevance">Topical Relevance</option>
                <option value="citations">Citation Count (High to Low)</option>
                <option value="year">Publication Year (Newest)</option>
              </select>
            </div>
          </div>

          {/* Bottom row: Filter Chips */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Filters:
            </span>

            {/* Source dropdown */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs, 4px)',
                border: '1px solid var(--border-subtle)',
                background: sourceFilter !== 'all' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-secondary)',
                color: sourceFilter !== 'all' ? 'var(--accent-primary, #2563eb)' : 'var(--text-secondary)',
                fontWeight: sourceFilter !== 'all' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <option value="all">All Sources</option>
              {availableSources.map((s) => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>

            {/* Year dropdown */}
            {availableYears.length > 0 && (
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs, 4px)',
                  border: '1px solid var(--border-subtle)',
                  background: yearFilter !== 'all' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-secondary)',
                  color: yearFilter !== 'all' ? 'var(--accent-primary, #2563eb)' : 'var(--text-secondary)',
                  fontWeight: yearFilter !== 'all' ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}

            {/* Open Access Toggle */}
            <button
              type="button"
              onClick={() => setOnlyOpenAccess(!onlyOpenAccess)}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 'var(--radius-xs, 4px)',
                border: `1px solid ${onlyOpenAccess ? 'var(--accent-emerald, #10b981)' : 'var(--border-subtle)'}`,
                background: onlyOpenAccess ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)',
                color: onlyOpenAccess ? 'var(--accent-emerald, #10b981)' : 'var(--text-secondary)',
                fontWeight: onlyOpenAccess ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {onlyOpenAccess ? '✓ Open Access Only' : 'Open Access'}
            </button>

            {/* Code Available Toggle */}
            <button
              type="button"
              onClick={() => setOnlyCode(!onlyCode)}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 'var(--radius-xs, 4px)',
                border: `1px solid ${onlyCode ? 'var(--accent-primary, #2563eb)' : 'var(--border-subtle)'}`,
                background: onlyCode ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-secondary)',
                color: onlyCode ? 'var(--accent-primary, #2563eb)' : 'var(--text-secondary)',
                fontWeight: onlyCode ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {onlyCode ? '✓ Public Code Only' : 'Has Code'}
            </button>

            {(sourceFilter !== 'all' || onlyOpenAccess || onlyCode || yearFilter !== 'all' || filterTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('all');
                  setOnlyOpenAccess(false);
                  setOnlyCode(false);
                  setYearFilter('all');
                  setFilterTerm('');
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  textDecoration: 'underline',
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Loading State ── */}
      {searchLoading && (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle)' }}>
          <Loader2 size={32} className="spin-anim" style={{ margin: '0 auto 12px auto', color: 'var(--accent-primary, #2563eb)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Searching Scientific Repositories...</h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
            Querying arXiv, OpenAlex, Semantic Scholar, Crossref, and PubMed in parallel with automated deduplication.
          </p>
        </div>
      )}

      {/* ── 4. Error State ── */}
      {searchError && !searchLoading && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid var(--accent-red, #ef4444)', color: 'var(--accent-red, #ef4444)', borderRadius: 'var(--radius-sm, 6px)', marginBottom: 16, fontSize: 12.5 }}>
          {searchError}
        </div>
      )}

      {/* ── 5. Empty State (No Search Yet) ── */}
      {!searchLoading && results.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
          <Search size={36} style={{ margin: '0 auto 12px auto', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            No Research Papers Loaded
          </h3>
          <p style={{ fontSize: 12.5, margin: '0 auto 18px', maxWidth: 420, lineHeight: 1.5 }}>
            Submit a query on the Literature Search page to discover multi-source scientific papers.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/search')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Search size={13} />
            <span>Go to Search Page</span>
          </button>
        </div>
      )}

      {/* ── 6. Results Feed (Clean Linear Rows) ── */}
      {!searchLoading && displayedPapers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayedPapers.map((paper, idx) => {
            const pId = paper.id || paper.arxiv_id || paper.canonical_id || `paper-${idx}`;
            const authorsStr = (paper.authors || [])
              .map((a) => (typeof a === 'string' ? a : a.name || 'Author'))
              .join(', ');
            const isAddedToGraph = addedToGraphPaperIds.includes(pId);
            const isInCompare = comparisonPapers.some((cp) => (cp.id || cp.canonical_id) === pId);
            const codeUrl = paper.code_url || (paper.code_repositories && paper.code_repositories[0]?.url);

            return (
              <div
                key={pId}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Meta Badges Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral" style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>
                      {paper.primary_source || 'Paper'}
                    </span>
                    {paper.year && (
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>{paper.year}</span>
                    )}
                    {(paper.is_open_access || paper.pdf_url) && (
                      <span className="badge badge-emerald" style={{ fontSize: 10 }}>Open Access</span>
                    )}
                    {codeUrl && (
                      <span className="badge badge-blue" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Code size={10} />
                        <span>Code</span>
                      </span>
                    )}
                    {isAddedToGraph && (
                      <span className="badge badge-purple" style={{ fontSize: 10 }}>In Graph</span>
                    )}
                  </div>

                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {paper.citation_count ? `${paper.citation_count.toLocaleString()} Citations` : 'Indexed'}
                  </div>
                </div>

                {/* Paper Title */}
                <h3
                  onClick={() => {
                    setActiveReaderPaper(paper);
                    navigate(`/pdf-inspector?paper=${encodeURIComponent(pId)}`);
                  }}
                  style={{
                    fontSize: 14.5,
                    fontWeight: 700,
                    margin: 0,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    lineHeight: 1.35,
                  }}
                  title="Open in Paper Reader"
                >
                  {paper.title}
                </h3>

                {/* Authors */}
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {authorsStr || 'Authors listed in source record'}
                </div>

                {/* Abstract Preview */}
                {paper.abstract && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      lineHeight: 1.45,
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {paper.abstract}
                  </p>
                )}

                {/* Actions Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 4,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Read Paper */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setActiveReaderPaper(paper);
                        navigate(`/pdf-inspector?paper=${encodeURIComponent(pId)}`);
                      }}
                      style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <FileText size={12} />
                      <span>Read Paper</span>
                    </button>

                    {/* Cite */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyBibTeX(paper)}
                      style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {copiedBibId === (paper.id || paper.arxiv_id) ? <Check size={11} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={11} />}
                      <span>{copiedBibId === (paper.id || paper.arxiv_id) ? 'Copied' : 'Cite'}</span>
                    </button>

                    {/* Add to Workspace */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleAddToWorkspace(paper)}
                      style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <FolderKanban size={11} />
                      <span>Add to Workspace</span>
                    </button>

                    {/* Add to Knowledge Graph */}
                    <button
                      type="button"
                      className={`btn btn-sm ${isAddedToGraph ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleToggleGraph(paper)}
                      disabled={ingestedMap[pId] === 'loading'}
                      style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {ingestedMap[pId] === 'loading' ? (
                        <Loader2 size={11} className="spin-anim" />
                      ) : isAddedToGraph ? (
                        <Check size={11} />
                      ) : (
                        <Plus size={11} />
                      )}
                      <span>{isAddedToGraph ? 'In Graph' : 'Add to Graph'}</span>
                    </button>

                    {/* Compare */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addComparisonPaper(paper)}
                      style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>{isInCompare ? '✓ In Compare' : 'Compare'}</span>
                    </button>
                  </div>

                  {/* View Source external link */}
                  {paper.url && (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>View Source</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {/* Load More Button */}
          {visibleCount < filteredPapers.length && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setVisibleCount((prev) => prev + 15)}
                style={{ padding: '6px 20px', fontSize: 12 }}
              >
                Load More Papers ({filteredPapers.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
