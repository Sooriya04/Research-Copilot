import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Loader2,
  FileText,
  Network,
  ArrowRight,
  Database,
  Check,
  FolderKanban,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const AVAILABLE_SOURCES = [
  { id: 'arxiv', name: 'arXiv', desc: 'Preprints & CS/AI papers' },
  { id: 'openalex', name: 'OpenAlex', desc: '250M+ global research corpus' },
  { id: 'semanticscholar', name: 'Semantic Scholar', desc: 'Citation graph & influence' },
  { id: 'crossref', name: 'Crossref', desc: 'Official DOI publisher metadata' },
  { id: 'europepmc', name: 'Europe PMC', desc: 'Biomedical & life sciences' },
  { id: 'pubmed', name: 'PubMed', desc: 'NIH National Library of Medicine' },
  { id: 'huggingface', name: 'Hugging Face', desc: 'Model weights & datasets' },
  { id: 'paperswithcode', name: 'Papers with Code', desc: 'SOTA benchmarks & repos' },
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

  // Initialize query strictly from active workspace title or globalQuery
  const currentWorkspaceTopic = activeWorkspace?.title || globalQuery || '';
  const [query, setQuery] = useState(currentWorkspaceTopic);
  const [limit, setLimit] = useState(10);

  // Sync with URL query parameter (e.g. from Command Palette) or active workspace topic
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlQuery = params.get('q');
    if (urlQuery && urlQuery.trim()) {
      setQuery(urlQuery.trim());
      performSearch(urlQuery.trim(), limit, selectedSources);
      navigate('/search-results', { replace: true });
    } else {
      const wsTopic = activeWorkspace?.title || globalQuery || '';
      setQuery(wsTopic);
    }
  }, [location.search, activeWorkspace?.id, activeWorkspace?.title, globalQuery]);

  const toggleSource = (srcId) => {
    setSelectedSources(prev =>
      prev.includes(srcId) ? prev.filter(s => s !== srcId) : [...prev, srcId]
    );
  };

  const selectAllSources = () => {
    setSelectedSources(AVAILABLE_SOURCES.map(s => s.id));
  };

  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;

    performSearch(q, limit, selectedSources);
    navigate('/search-results');
  };

  const handleSearchWorkspaceTopic = () => {
    const topicToSearch = (activeWorkspace?.title || query).trim();
    if (!topicToSearch) return;
    setQuery(topicToSearch);
    performSearch(topicToSearch, limit, selectedSources);
    navigate('/search-results');
  };

  return (
    <section id="view-search-home" className="view-panel active">
      {/* Top Segmented Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={13} />
            <span>Search Literature</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={13} />
            <span>Founded Papers ({results.length})</span>
          </button>
        </div>

        {results.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>View Founded Papers ({results.length})</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Main Panel Header */}
      <div className="panel-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                Scientific Literature Search
              </h1>
              {activeWorkspace && (
                <span className="badge badge-emerald" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <FolderKanban size={11} />
                  <span>Workspace: {activeWorkspace.title}</span>
                </span>
              )}
            </div>
            <p className="panel-subtitle" style={{ margin: 0 }}>
              Search across 8 scientific databases in parallel with automated deduplication, citation mapping, and legal open-access full-text retrieval.
            </p>
          </div>
        </div>
      </div>

      {/* Active Workspace Quick Launch Banner */}
      {activeWorkspace && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: '16px 20px',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-subtle) 100%)',
            border: '1px solid var(--border-hover, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Active Research Focus
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {activeWorkspace.title}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSearchWorkspaceTopic}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '7px 16px' }}
          >
            <Search size={13} />
            <span>Search Workspace Topic</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Active Session Notification if results already exist */}
      {results.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              You currently have <strong>{results.length} founded research papers</strong> loaded for "<em>{globalQuery || query}</em>".
            </span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Open Results View</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* PRIMARY SEARCH BOX CARD */}
      <div className="card" style={{ padding: '24px 22px', marginBottom: 24 }}>
        <form onSubmit={handleSearchSubmit}>
          {/* Main Search Input */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 14px',
              }}
            >
              <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                id="literature-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter scientific topic, paper title, DOI, or arXiv identifier..."
                autoFocus
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 14.5,
                  padding: '10px 0',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
                >
                  Clear
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={searchLoading || !query.trim()}
              style={{ padding: '12px 22px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {searchLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search size={16} />
                  <span>Search Research Papers</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

          {/* Database Connectors Selector */}
          <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Database size={13} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Scientific Database Connectors ({selectedSources.length} Active)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={selectAllSources}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 11.5, cursor: 'pointer', fontWeight: 500 }}
                >
                  Select All
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Limit/source:</span>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    style={{
                      padding: '3px 8px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                    }}
                  >
                    <option value={5}>5 papers</option>
                    <option value={10}>10 papers</option>
                    <option value={15}>15 papers</option>
                    <option value={20}>20 papers</option>
                    <option value={25}>25 papers</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Source Pill Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AVAILABLE_SOURCES.map(source => {
                const isSelected = selectedSources.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => toggleSource(source.id)}
                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '4px 12px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 'var(--radius-pill)',
                    }}
                    title={source.desc}
                  >
                    {isSelected && <Check size={11} />}
                    <span>{source.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {searchError && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--accent-rose)' }}>
            {searchError}
          </div>
        )}
      </div>

      {/* ARCHITECTURAL CAPABILITIES GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Database size={15} style={{ color: 'var(--accent-blue)' }} />
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Multi-Source Deduplication</h4>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Merges duplicate scientific entries across arXiv preprints, publisher DOIs, and OpenAlex records into a unified research record.
          </p>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <FileText size={15} style={{ color: 'var(--accent-emerald)' }} />
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Open Access Resolver</h4>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Identifies legal, unrestricted PDF full-text streams through Unpaywall, Europe PMC, and arXiv repository links.
          </p>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Network size={15} style={{ color: 'var(--accent-violet)' }} />
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Selective Graph Ingestion</h4>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Only papers you explicitly choose via "Add to Graph" are imported into the Knowledge Graph topology.
          </p>
        </div>
      </div>
    </section>
  );
}


