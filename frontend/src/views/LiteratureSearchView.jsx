import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Loader2,
  FileText,
  Network,
  Sparkles,
  ArrowRight,
  Database,
  SlidersHorizontal,
  Check,
  RotateCw,
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

const SUGGESTED_TOPICS = [
  'Attention Is All You Need',
  'Direct Preference Optimization (DPO)',
  'Diffusion Models for Image Synthesis',
  'Mamba: Linear-Time Sequence Modeling',
  'Retrieval-Augmented Generation (RAG)',
  'Graph Neural Networks for Drug Discovery',
  'Chain-of-Thought Prompting in LLMs',
  'Self-Rewarding Language Models',
];

export default function LiteratureSearchView() {
  const navigate = useNavigate();
  const {
    searchQuery: globalQuery,
    searchResults: results,
    selectedSources,
    setSelectedSources,
    performSearch,
    searchLoading,
    searchError,
  } = useApp();

  const [query, setQuery] = useState(globalQuery || '');
  const [limit, setLimit] = useState(10);

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

    // Navigate to the View Results page immediately; performSearch runs in background/context
    performSearch(q, limit, selectedSources);
    navigate('/search-results');
  };

  const handleSelectSuggestedTopic = (topic) => {
    setQuery(topic);
    performSearch(topic, limit, selectedSources);
    navigate('/search-results');
  };

  return (
    <section id="view-search-home" className="view-panel active">
      {/* Top 2-Page Segmented Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={13} />
            <span>Search Page</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FileText size={13} />
            <span>View Founded Papers ({results.length})</span>
          </button>
        </div>

        {results.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>View Results ({results.length})</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Main Panel Header */}
      <div className="panel-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Scientific Literature Search
          </h1>
          <p className="panel-subtitle">
            Search across 8 scientific databases in parallel with automated deduplication, citation mapping, and legal open-access full-text retrieval.
          </p>
        </div>
      </div>

      {/* Active Session Notification if results already exist */}
      {results.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: '12px 16px',
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
              You currently have <strong>{results.length} founded research papers</strong> loaded for "<em>{globalQuery}</em>".
            </span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/search-results')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Go to Results View</span>
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
                placeholder="Enter scientific topic, paper title, DOI, or arXiv identifier (e.g. Attention Is All You Need)..."
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

      {/* SUGGESTED / TRENDING RESEARCH TOPICS */}
      <div className="card" style={{ marginBottom: 24, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Sparkles size={15} style={{ color: 'var(--accent-blue)' }} />
          <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Suggested Research Topics (Click to Run Search)
          </h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUGGESTED_TOPICS.map((topic, i) => (
            <button
              key={i}
              className="btn btn-secondary btn-sm"
              onClick={() => handleSelectSuggestedTopic(topic)}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Search size={11} style={{ color: 'var(--text-muted)' }} />
              <span>{topic}</span>
            </button>
          ))}
        </div>
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
            Only papers you explicitly choose via "+ Add to Graph" are imported into the Knowledge Graph topology.
          </p>
        </div>
      </div>
    </section>
  );
}
