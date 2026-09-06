import React, { useState } from 'react';
import { Icons } from '../common/Icons.jsx';

export function SearchView({
  papers,
  searchQuery,
  onExecuteSearch,
  onSelectPaper,
  onExtractPdf,
  isSearching,
  sourceCounts
}) {
  const [activeTab, setActiveTab] = useState('all');

  const sources = [
    { id: 'all', label: 'All Sources' },
    { id: 'arxiv', label: 'arXiv' },
    { id: 'openalex', label: 'OpenAlex' },
    { id: 'semanticscholar', label: 'Semantic Scholar' },
    { id: 'paperswithcode', label: 'Papers with Code' },
    { id: 'huggingface', label: 'Hugging Face' },
    { id: 'pubmed', label: 'PubMed' },
    { id: 'kaggle', label: 'Kaggle' },
    { id: 'crossref', label: 'Crossref' }
  ];

  const handleTabClick = (sourceId) => {
    setActiveTab(sourceId);
    if (searchQuery) {
      onExecuteSearch(searchQuery, sourceId);
    }
  };

  const getProviderBadgeClass = (source) => {
    const s = (source || '').toLowerCase();
    if (s.includes('arxiv')) return 'badge-arxiv';
    if (s.includes('openalex')) return 'badge-openalex';
    if (s.includes('semantic') || s.includes('s2')) return 'badge-s2';
    if (s.includes('pwc') || s.includes('code')) return 'badge-pwc';
    if (s.includes('hugging')) return 'badge-hf';
    if (s.includes('pubmed')) return 'badge-pubmed';
    if (s.includes('kaggle')) return 'badge-kaggle';
    if (s.includes('crossref')) return 'badge-crossref';
    return 'badge-s2';
  };

  return (
    <div className="view-container search-view">
      {/* Source Filter Tabs */}
      <div className="search-controls-bar">
        <div className="source-tabs">
          {sources.map((src) => {
            const count = sourceCounts ? sourceCounts[src.id] : null;
            return (
              <button
                key={src.id}
                className={`tab-btn ${activeTab === src.id ? 'active' : ''}`}
                onClick={() => handleTabClick(src.id)}
              >
                <span>{src.label}</span>
                {count !== null && count !== undefined && (
                  <span className="ml-1 opacity-75">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Workspace */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <h3>Unified Search Results</h3>
            {searchQuery && (
              <span className="badge-mono badge-openalex">
                QUERY: "{searchQuery}" ({papers?.length || 0} RESULTS)
              </span>
            )}
          </div>
          {isSearching && (
            <div className="flex items-center gap-2 text-muted">
              <Icons.Refresh width={14} height={14} className="animate-spin" />
              <span className="text-xs font-mono">Querying scientific APIs...</span>
            </div>
          )}
        </div>

        {papers && papers.length > 0 ? (
          <div className="papers-list">
            {papers.map((paper, idx) => (
              <div key={paper.id || idx} className="paper-card">
                <div className="paper-card-header">
                  <h4 className="paper-title" onClick={() => onSelectPaper(paper)}>
                    {paper.title}
                  </h4>
                  <span className={`badge-mono ${getProviderBadgeClass(paper.source || paper.provider)}`}>
                    {(paper.source || paper.provider || 'PAPER').toUpperCase()}
                  </span>
                </div>

                {paper.abstract && <p className="paper-abstract">{paper.abstract}</p>}

                <div className="paper-meta-footer">
                  <span className="paper-authors">
                    {Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Unknown Authors')}
                  </span>
                  <div className="paper-actions">
                    {paper.pdf_url && (
                      <button
                        className="btn-secondary"
                        onClick={() => onExtractPdf(paper)}
                      >
                        <Icons.PaperReader width={12} height={12} />
                        <span>Read PDF</span>
                      </button>
                    )}
                    <button
                      className="btn-primary"
                      onClick={() => onSelectPaper(paper)}
                    >
                      <span>Inspect Details</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-inspector">
            <Icons.Search width={32} height={32} />
            <h4>No Scientific Results Loaded</h4>
            <p>Type a topic, keywords, or paper title into the search bar at the top to aggregate research literature across 8 scientific providers.</p>
          </div>
        )}
      </div>
    </div>
  );
}
