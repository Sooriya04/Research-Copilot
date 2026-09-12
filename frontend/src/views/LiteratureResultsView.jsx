import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  FileText,
  Network,
  ExternalLink,
  Sparkles,
  Info,
  X,
  SlidersHorizontal,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function LiteratureResultsView() {
  const navigate = useNavigate();
  const {
    searchQuery,
    searchResults: results,
    searchLoading,
    searchError,
    addedToGraphPaperIds,
    setAddedToGraphPaperIds,
    setActiveReaderPaper,
    addComparisonPaper,
    comparisonPapers,
    openPaperModal,
  } = useApp();

  const [filterTerm, setFilterTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [onlyOpenAccess, setOnlyOpenAccess] = useState(false);
  const [onlyInGraph, setOnlyInGraph] = useState(false);
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance' | 'citations' | 'year'
  const [expandedAbstracts, setExpandedAbstracts] = useState({});
  const [copiedBibId, setCopiedBibId] = useState(null);
  const [ingestedMap, setIngestedMap] = useState({});

  const toggleAbstract = (pId) => {
    setExpandedAbstracts(prev => ({ ...prev, [pId]: !prev[pId] }));
  };

  const copyBibTeX = (paper) => {
    const paperId = paper.id || paper.arxiv_id || 'paper2024';
    const cleanKey = paperId.replace(/[^a-zA-Z0-9]/g, '');
    const firstAuthor = paper.authors && paper.authors.length > 0
      ? (typeof paper.authors[0] === 'string' ? paper.authors[0] : paper.authors[0].name || 'Author')
      : 'Author';
    const bibtex = `@article{${cleanKey || 'ref'},
  title={${paper.title}},
  author={${firstAuthor} and others},
  journal={Research Copilot Knowledge Base},
  year={${paper.year || 2024}}
}`;
    navigator.clipboard.writeText(bibtex);
    setCopiedBibId(paperId);
    setTimeout(() => setCopiedBibId(null), 2000);
  };

  const openInReader = (paper) => {
    setActiveReaderPaper(paper);
    navigate('/pdf-inspector');
  };

  const handleIngestToGraph = async (paper) => {
    const pId = paper.id || paper.arxiv_id || paper.canonical_id || `paper-${paper.title?.slice(0, 15)}`;
    const currentTopic = searchQuery || 'General Research Literature';
    setIngestedMap(prev => ({ ...prev, [pId]: 'loading' }));

    try {
      const res = await fetch('/api/v1/graph/ingest-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentTopic,
          paper_data: {
            id: pId,
            title: paper.title,
            year: paper.year,
            authors: (paper.authors || []).map(a => (typeof a === 'string' ? a : a.name || String(a))),
            methods: paper.methods || [],
            datasets: paper.datasets || [],
            benchmarks: paper.benchmarks || [],
            metrics: paper.citation_count ? { citations: String(paper.citation_count) } : {},
            claims: [],
            limitations: [],
            cited_papers: paper.referenced_works || [],
          },
        }),
      });

      if (res.ok) {
        setIngestedMap(prev => ({ ...prev, [pId]: 'done' }));
        setAddedToGraphPaperIds(prev => (prev.includes(pId) ? prev : [...prev, pId]));
      } else {
        setIngestedMap(prev => ({ ...prev, [pId]: 'error' }));
      }
    } catch {
      setIngestedMap(prev => ({ ...prev, [pId]: 'error' }));
    }
  };

  // Distinct sources among results
  const availableSources = useMemo(() => {
    const s = new Set();
    results.forEach(p => {
      if (p.primary_source) s.add(p.primary_source.toLowerCase());
    });
    return Array.from(s);
  }, [results]);

  // Filtered & sorted papers
  const filteredPapers = useMemo(() => {
    let list = [...results];

    if (sourceFilter !== 'all') {
      list = list.filter(p => (p.primary_source || '').toLowerCase() === sourceFilter.toLowerCase());
    }

    if (onlyOpenAccess) {
      list = list.filter(p => p.is_open_access || !!p.pdf_url);
    }

    if (onlyInGraph) {
      list = list.filter(p => {
        const pId = p.id || p.arxiv_id || p.canonical_id;
        return addedToGraphPaperIds.includes(pId);
      });
    }

    if (filterTerm.trim()) {
      const term = filterTerm.toLowerCase().trim();
      list = list.filter(p => {
        const titleMatch = (p.title || '').toLowerCase().includes(term);
        const abstractMatch = (p.abstract || '').toLowerCase().includes(term);
        const authorsMatch = (p.authors || []).some(a => {
          const name = typeof a === 'string' ? a : a.name || '';
          return name.toLowerCase().includes(term);
        });
        const yearMatch = String(p.year || '').includes(term);
        const sourceMatch = (p.primary_source || '').toLowerCase().includes(term);
        return titleMatch || abstractMatch || authorsMatch || yearMatch || sourceMatch;
      });
    }

    if (sortBy === 'citations') {
      list.sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
    } else if (sortBy === 'year') {
      list.sort((a, b) => (b.year || 0) - (a.year || 0));
    }

    return list;
  }, [results, filterTerm, sourceFilter, onlyOpenAccess, onlyInGraph, sortBy, addedToGraphPaperIds]);

  const openAccessCount = useMemo(() => {
    return results.filter(p => p.is_open_access || !!p.pdf_url).length;
  }, [results]);

  const inGraphCount = useMemo(() => {
    return results.filter(p => {
      const pId = p.id || p.arxiv_id || p.canonical_id;
      return addedToGraphPaperIds.includes(pId);
    }).length;
  }, [results, addedToGraphPaperIds]);

  return (
    <section id="view-search-results" className="view-panel active">
      {/* Top 2-Page Segmented Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={13} />
            <span>Search Page</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={13} />
            <span>View Founded Papers ({results.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={13} />
            <span>New Search</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Network size={13} />
            <span>Knowledge Graph</span>
          </button>
        </div>
      </div>

      {/* Main Header */}
      <div className="panel-header" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Founded Research Papers</h1>
            {searchQuery && (
              <span className="badge badge-neutral" style={{ fontSize: 12 }}>
                Topic: {searchQuery}
              </span>
            )}
            <span className="badge badge-blue" style={{ fontSize: 12 }}>
              {filteredPapers.length} of {results.length} papers
            </span>
          </div>
          <p className="panel-subtitle">
            Browse and filter papers retrieved across arXiv, OpenAlex, Semantic Scholar, Crossref, and PubMed.
          </p>
        </div>
      </div>

      {/* IN-PAGE SEARCH & FILTER TOOLBAR WITH SEARCH ICONS */}
      <div className="card" style={{ marginBottom: 18, padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Input with Search Icon */}
          <div
            style={{
              flex: 1,
              minWidth: 280,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 12px',
            }}
          >
            <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              id="filter-founded-papers-input"
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              placeholder="Search within founded research papers (filter by title, author, keyword, abstract)..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                padding: '8px 0',
              }}
            />
            {filterTerm && (
              <button
                onClick={() => setFilterTerm('')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                title="Clear filter"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 12.5,
              }}
            >
              <option value="relevance">Relevance</option>
              <option value="citations">Citations (High to Low)</option>
              <option value="year">Publication Year (Newest)</option>
            </select>
          </div>
        </div>

        {/* Filter Chips Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: 4 }}>
              Filter:
            </span>

            <button
              className={`btn btn-sm ${sourceFilter === 'all' && !onlyOpenAccess && !onlyInGraph ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setSourceFilter('all');
                setOnlyOpenAccess(false);
                setOnlyInGraph(false);
              }}
              style={{ padding: '3px 10px', fontSize: 11.5 }}
            >
              All ({results.length})
            </button>

            <button
              className={`btn btn-sm ${onlyOpenAccess ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOnlyOpenAccess(prev => !prev)}
              style={{ padding: '3px 10px', fontSize: 11.5 }}
            >
              Open Access ({openAccessCount})
            </button>

            <button
              className={`btn btn-sm ${onlyInGraph ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOnlyInGraph(prev => !prev)}
              style={{ padding: '3px 10px', fontSize: 11.5 }}
            >
              Added to Graph ({inGraphCount})
            </button>

            {availableSources.map(src => (
              <button
                key={src}
                className={`btn btn-sm ${sourceFilter === src ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSourceFilter(prev => (prev === src ? 'all' : src))}
                style={{ padding: '3px 10px', fontSize: 11.5, textTransform: 'uppercase' }}
              >
                {src}
              </button>
            ))}
          </div>

          {filterTerm && (
            <span style={{ fontSize: 12, color: 'var(--accent-blue)' }}>
              Filtering by "{filterTerm}" ({filteredPapers.length} matches)
            </span>
          )}
        </div>
      </div>

      {/* Loading Indicator */}
      {searchLoading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px', display: 'block', color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Querying Scientific Databases...
          </h3>
          <p style={{ fontSize: 13 }}>
            Retrieving, normalizing, and deduplicating papers across academic repositories.
          </p>
        </div>
      )}

      {/* Error Notice */}
      {searchError && (
        <div className="card" style={{ borderColor: 'var(--accent-rose)', background: 'rgba(244, 63, 94, 0.05)', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--accent-rose)' }}>
            {searchError}
          </p>
        </div>
      )}

      {/* Empty State when no results in session */}
      {!searchLoading && results.length === 0 && (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Search size={40} style={{ margin: '0 auto 14px', display: 'block', color: 'var(--border-hover)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No Research Papers Loaded Yet
          </h3>
          <p style={{ fontSize: 13, maxWidth: 440, margin: '0 auto 18px' }}>
            Run a search on the Literature Search page to discover research papers and import them into this view.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/search')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={14} />
            <span>Go to Search Page</span>
          </button>
        </div>
      )}

      {/* Filter Yielded Zero Matches */}
      {!searchLoading && results.length > 0 && filteredPapers.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Search size={32} style={{ margin: '0 auto 10px', display: 'block', color: 'var(--text-muted)' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            No Papers Match Your In-Page Search
          </h4>
          <p style={{ fontSize: 12.5, marginBottom: 12 }}>
            No founded papers matched "{filterTerm}". Try clearing or changing your search terms.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setFilterTerm('');
              setSourceFilter('all');
              setOnlyOpenAccess(false);
              setOnlyInGraph(false);
            }}
          >
            Clear In-Page Search Filters
          </button>
        </div>
      )}

      {/* LINEAR RESEARCH PAPERS FEED */}
      {!searchLoading && filteredPapers.length > 0 && (
        <div className="papers-linear-list">
          {filteredPapers.map((paper, idx) => {
            const pId = paper.id || paper.arxiv_id || paper.canonical_id || `paper-${idx}`;
            const authorsStr = (paper.authors || [])
              .map(a => (typeof a === 'string' ? a : a.name || 'Author'))
              .join(', ');
            const isAddedToGraph = addedToGraphPaperIds.includes(pId);
            const isAbstractExpanded = !!expandedAbstracts[pId];
            const isInComparison = comparisonPapers.some(cp => (cp.id || cp.canonical_id) === pId);

            return (
              <div
                key={pId}
                className={`paper-linear-card ${isAddedToGraph ? 'in-graph' : ''}`}
                id={`paper-card-${idx}`}
              >
                {/* Header row: badges & citation count */}
                <div className="paper-linear-header">
                  <div className="paper-linear-badges">
                    <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                      {paper.primary_source || 'ARXIV'}
                    </span>
                    {paper.year && (
                      <span className="badge badge-neutral">{paper.year}</span>
                    )}
                    {(paper.is_open_access || paper.pdf_url) && (
                      <span className="badge badge-emerald">Open Access</span>
                    )}
                    {isAddedToGraph && (
                      <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Check size={11} />
                        <span>In Knowledge Graph</span>
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {paper.citation_count ? `${paper.citation_count} Citations` : 'Citation tracked'}
                  </div>
                </div>

                {/* Title */}
                <h3
                  className="paper-linear-title"
                  onClick={() => openInReader(paper)}
                  title="Click to view in Paper Reader"
                >
                  {paper.title}
                </h3>

                {/* Authors */}
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
                  {authorsStr || 'Authors listed in source metadata'}
                </p>

                {/* Abstract Preview */}
                {paper.abstract && (
                  <div style={{ marginTop: 2 }}>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                        margin: 0,
                        display: isAbstractExpanded ? 'block' : '-webkit-box',
                        WebkitLineClamp: isAbstractExpanded ? 'unset' : 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {paper.abstract}
                    </p>
                    {paper.abstract.length > 200 && (
                      <button
                        onClick={() => toggleAbstract(pId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-blue)',
                          fontSize: 11.5,
                          cursor: 'pointer',
                          padding: '2px 0 0',
                          fontWeight: 500,
                        }}
                      >
                        {isAbstractExpanded ? 'Show less' : 'Read full abstract...'}
                      </button>
                    )}
                  </div>
                )}

                {/* Actions Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 6,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className={`btn btn-sm ${isAddedToGraph ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => handleIngestToGraph(paper)}
                      disabled={ingestedMap[pId] === 'loading'}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      {isAddedToGraph ? (
                        <>
                          <Check size={12} />
                          <span>In Graph</span>
                        </>
                      ) : ingestedMap[pId] === 'loading' ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Adding...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          <span>+ Add to Graph</span>
                        </>
                      )}
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openInReader(paper)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <FileText size={12} />
                      <span>Reader</span>
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyBibTeX(paper)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      {copiedBibId === (paper.id || paper.arxiv_id) ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedBibId === (paper.id || paper.arxiv_id) ? 'Copied' : 'Cite'}</span>
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => addComparisonPaper(paper)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <span>{isInComparison ? 'In Compare' : 'Compare'}</span>
                    </button>
                  </div>

                  <div>
                    {paper.url && (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}
                      >
                        <ExternalLink size={12} />
                        <span>Source Link</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
