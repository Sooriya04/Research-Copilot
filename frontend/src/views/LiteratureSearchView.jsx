import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Database,
  ArrowRight,
  Loader2,
  FolderKanban,
  Check,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AVAILABLE_SOURCES = [
  { id: 'arxiv', name: 'arXiv', desc: 'Preprints & CS/AI/Physics' },
  { id: 'openalex', name: 'OpenAlex', desc: '250M+ global research corpus' },
  { id: 'semanticscholar', name: 'Semantic Scholar', desc: 'Citation graph & influence' },
  { id: 'crossref', name: 'Crossref', desc: 'Official DOI metadata registry' },
  { id: 'europepmc', name: 'Europe PMC', desc: 'Biomedical & life sciences' },
  { id: 'pubmed', name: 'PubMed', desc: 'NIH National Library of Medicine' },
  { id: 'huggingface', name: 'Hugging Face', desc: 'Models & scientific datasets' },
  { id: 'paperswithcode', name: 'Papers with Code', desc: 'SOTA benchmarks & codebases' },
];

export default function LiteratureSearchView() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    searchQuery: globalQuery,
    searchResults: results,
    selectedSources,
    setSelectedSources,
    performSearch,
    searchLoading,
    searchError,
    activeWorkspace,
  } = useApp();

  const [query, setQuery] = useState(activeWorkspace?.title || globalQuery || '');
  const [limit, setLimit] = useState(10);

  // Sync with URL query parameter if navigated with ?q=
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlQuery = params.get('q');
    if (urlQuery && urlQuery.trim()) {
      setQuery(urlQuery.trim());
      performSearch(urlQuery.trim(), limit, selectedSources);
      navigate('/search-results', { replace: true });
    }
  }, [location.search]);

  const toggleSource = (srcId) => {
    setSelectedSources((prev) =>
      prev.includes(srcId) ? prev.filter((s) => s !== srcId) : [...prev, srcId]
    );
  };

  const handleSelectAll = () => {
    setSelectedSources(AVAILABLE_SOURCES.map((s) => s.id));
  };

  const handleClearAll = () => {
    setSelectedSources([]);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const cleanQ = query.trim();
    if (!cleanQ) return;
    performSearch(cleanQ, limit, selectedSources);
    navigate('/search-results');
  };

  return (
    <div className="view-container" style={{ padding: '32px 36px', maxWidth: 1080, margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'rgba(37, 99, 235, 0.1)',
                  color: 'var(--accent-primary, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Search size={16} />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Scientific Literature Search
              </h1>
              {activeWorkspace && (
                <span className="badge badge-emerald" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <FolderKanban size={11} />
                  <span>Workspace: {activeWorkspace.title}</span>
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Discover scientific literature across global repositories in parallel with unified deduplication.
            </p>
          </div>

          {results && results.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/search-results')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <span>View Loaded Results ({results.length})</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Search Form ── */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 28 }}>
        {/* Main Query Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '6px 14px',
            marginBottom: 20,
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by research topic, paper title, DOI, or arXiv identifier (e.g. 2312.00752)..."
            autoFocus
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: 'var(--text-primary)',
              padding: '8px 0',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '4px 8px' }}
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={searchLoading || !query.trim()}
            className="btn btn-primary"
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {searchLoading ? (
              <>
                <Loader2 size={14} className="spin-anim" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <span>Search Research Papers</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>

        {/* Source Configuration Controls */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Scientific Database Sources ({selectedSources.length} Selected)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary, #2563eb)', fontSize: 11.5, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Select All
                </button>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer', padding: 0 }}
                >
                  Clear All
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Max Result Limit:</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  style={{
                    fontSize: 11.5,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs, 4px)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <option value={5}>5 per source</option>
                  <option value={10}>10 per source</option>
                  <option value={15}>15 per source</option>
                  <option value={20}>20 per source</option>
                  <option value={25}>25 per source</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sources Pills Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {AVAILABLE_SOURCES.map((source) => {
              const isSelected = selectedSources.includes(source.id);
              return (
                <div
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-xs, 4px)',
                    border: `1px solid ${isSelected ? 'var(--accent-primary, #2563eb)' : 'var(--border-subtle)'}`,
                    background: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {source.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                      {source.desc}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: `1px solid ${isSelected ? 'var(--accent-primary, #2563eb)' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'var(--accent-primary, #2563eb)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </form>

      {/* Error Notice */}
      {searchError && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--accent-red, #ef4444)',
            color: 'var(--accent-red, #ef4444)',
            borderRadius: 'var(--radius-sm, 6px)',
            fontSize: 12.5,
          }}
        >
          {searchError}
        </div>
      )}
    </div>
  );
}
