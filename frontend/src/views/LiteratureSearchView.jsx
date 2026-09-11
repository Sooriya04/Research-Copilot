import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Loader2, Copy, Check, FileText, Network, AlertCircle, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DEFAULT_SOURCES = [
  'arxiv',
  'openalex',
  'semanticscholar',
  'crossref',
  'europepmc',
  'pubmed',
  'huggingface',
  'paperswithcode',
];

export default function LiteratureSearchView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    openPaperModal,
    setActiveReaderPaper,
    addComparisonPaper,
    comparisonPapers,
    sessionId,
    setSessionId,
    searchQuery: globalQuery,
    setSearchQuery: setGlobalQuery,
    searchResults: results,
    setSearchResults: setResults,
    sourceCounts,
    setSourceCounts,
    selectedSources,
    setSelectedSources,
  } = useApp();

  const [query, setQuery] = useState(searchParams.get('q') || globalQuery || '');
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(results.length > 0 || !!globalQuery);
  const [copiedBibId, setCopiedBibId] = useState(null);
  const [ingestedMap, setIngestedMap] = useState({});
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q !== globalQuery) {
      setQuery(q);
      setGlobalQuery(q);
      executeSearch(q);
    }
  }, [searchParams]);

  const toggleSource = (src) => {
    setSelectedSources(prev =>
      prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]
    );
  };

  const executeSearch = async (searchQueryText) => {
    const q = (searchQueryText || query).trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    setErrorMessage(null);
    setGlobalQuery(q);

    try {
      const res = await fetch('/api/v1/search/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          sources: selectedSources,
          limit_per_source: Number(limit),
          session_id: sessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.papers || []);
        setSourceCounts(data.source_breakdown || {});
        if (data.session_id) {
          setSessionId(data.session_id);
        }
      } else {
        const err = await res.text();
        setErrorMessage(`Search query returned an error: ${err}`);
      }
    } catch (err) {
      setErrorMessage(`Network error connecting to backend: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };


  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
      executeSearch(query.trim());
    }
  };

  const copyBibTeX = (paper) => {
    const paperId = paper.id || paper.arxiv_id || 'paper2024';
    const cleanKey = paperId.replace(/[^a-zA-Z0-9]/g, '');
    const firstAuthor = paper.authors && paper.authors.length > 0
      ? (typeof paper.authors[0] === 'string' ? paper.authors[0] : paper.authors[0].name || 'Author')
      : 'Author';
    const bibtex = `@article{${cleanKey || 'ref'},
  title={${paper.title || 'Untitled'}},
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
    const currentTopic = query || searchQuery || 'General Research Literature';
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
            authors: (paper.authors || []).map(a => typeof a === 'string' ? a : a.name || String(a)),
            methods: paper.topics && paper.topics.length > 0 ? paper.topics.slice(0, 3) : ['Empirical Method'],
            datasets: paper.topics && paper.topics.length > 3 ? paper.topics.slice(3, 5) : ['Benchmark Evaluation'],
            metrics: { Impact: String(paper.citation_count || 1) },
            claims: paper.abstract ? [{ claim: paper.abstract.slice(0, 100), verified: true }] : [],
            limitations: [],
            cited_papers: paper.referenced_works || [],
          }
        }),
      });

      if (res.ok) {
        setIngestedMap(prev => ({ ...prev, [pId]: 'done' }));
      } else {
        setIngestedMap(prev => ({ ...prev, [pId]: 'error' }));
      }
    } catch {
      setIngestedMap(prev => ({ ...prev, [pId]: 'error' }));
    }
  };

  return (
    <section id="view-search" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Scientific Literature Search</h1>
          <p className="panel-subtitle">
            Query 8 scientific database connectors with automated deduplication & citation schema normalization.
          </p>
        </div>
      </div>

      <div className="search-bar-box">
        <form onSubmit={handleFormSubmit} className="search-input-row">
          <div className="search-input-wrapper">
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              id="search-query-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter research topic, paper title, or DOI (e.g. 'diffusion models protein backbone')..."
            />
          </div>
          <button type="submit" className="btn btn-primary" id="btn-execute-search">
            Execute Search
          </button>
        </form>

        <div className="filter-chips-row">
          <div className="chip-list">
            {DEFAULT_SOURCES.map((src) => (
              <label key={src} className="filter-chip">
                <input
                  type="checkbox"
                  value={src}
                  checked={selectedSources.includes(src)}
                  onChange={() => toggleSource(src)}
                />
                <span style={{ textTransform: 'capitalize' }}>
                  {src === 'huggingface' ? 'HuggingFace' : src === 'paperswithcode' ? 'PapersWithCode' : src === 'semanticscholar' ? 'Semantic Scholar' : src === 'europepmc' ? 'Europe PMC' : src}
                </span>
              </label>
            ))}
          </div>

          <div className="limit-selector" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Limit per source: <strong id="limit-val" style={{ color: 'var(--text-primary)' }}>{limit}</strong>
            <input
              type="range"
              id="search-limit"
              min="1"
              max="20"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ marginLeft: 6, verticalAlign: 'middle' }}
            />
          </div>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div className="loading-box" id="search-loading">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-blue)', marginBottom: 8 }} />
          <p>Aggregating and deduplicating results across scientific database connectors...</p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-sm)', marginTop: 16, color: 'var(--accent-rose)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Results Header */}
      {!loading && results.length > 0 && (
        <div className="panel-header" id="results-header-summary" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15 }}>
            Search Results <span id="total-results-tag" className="badge badge-neutral">{results.length} Items Found</span>
          </h2>
          <div id="source-breakdown-tags" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(sourceCounts).map(([src, count]) => (
              <span key={src} className="badge badge-blue">
                {src}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && searched && results.length === 0 && !errorMessage && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Search size={32} style={{ margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No papers found</h3>
          <p style={{ fontSize: 13 }}>Try refining your search terms or enabling additional source providers.</p>
        </div>
      )}

      {!searched && !loading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Sparkles size={36} style={{ margin: '0 auto 12px', display: 'block', color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Ready to Explore Scientific Literature</h3>
          <p style={{ fontSize: 13 }}>Enter any research query, DOI, or author name above to execute parallel multi-source search.</p>
        </div>
      )}

      {/* Papers Grid */}
      <div className="papers-grid" id="papers-results-grid" style={{ marginTop: 12 }}>
        {results.map((paper, idx) => {
          const pId = paper.id || paper.canonical_id || `p-${idx}`;
          const isComparing = comparisonPapers.some(p => (p.id || p.canonical_id) === pId);
          const ingestState = ingestedMap[pId];

          return (
            <div key={pId} className="card paper-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span className="badge badge-violet" style={{ textTransform: 'uppercase' }}>
                    {paper.primary_source || paper.source || 'Literature'}
                  </span>
                  {paper.year && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{paper.year}</span>
                  )}
                </div>

                <h3
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, cursor: 'pointer' }}
                  onClick={() => openPaperModal(paper)}
                >
                  {paper.title}
                </h3>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {(paper.authors || []).map(a => (typeof a === 'string' ? a : a.name)).slice(0, 3).join(', ')}
                  {(paper.authors || []).length > 3 ? ' et al.' : ''}
                </p>

                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 12 }}>
                  {paper.abstract ? paper.abstract.slice(0, 200) + '...' : 'No abstract preview provided in metadata.'}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openPaperModal(paper)}>
                    Details
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => copyBibTeX(paper)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {copiedBibId === pId ? (
                      <>
                        <Check size={12} />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>BibTeX</span>
                      </>
                    )}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openInReader(paper)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <FileText size={12} />
                    <span>Reader</span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleIngestToGraph(paper)}
                    disabled={ingestState === 'loading' || ingestState === 'done'}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Ingest paper into Knowledge Graph"
                  >
                    <Network size={12} />
                    <span>{ingestState === 'loading' ? '...' : ingestState === 'done' ? '✓ Graph' : '+ Graph'}</span>
                  </button>
                </div>

                <label style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isComparing}
                    onChange={() => addComparisonPaper(paper)}
                  />
                  Compare
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
