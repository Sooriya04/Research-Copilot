import React from 'react';
import { Icons } from '../common/Icons.jsx';
import { PaperComparisonMatrix } from './PaperComparisonMatrix.jsx';

export function OverviewView({ papers, graphData, onExecuteSearch, onSelectPaper, onNavigateView, searchQuery }) {
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

  // Dynamically compute active unique sources from current papers
  const activeSourcesCount = papers && papers.length > 0
    ? new Set(papers.map(p => (p.source || p.provider || '').toLowerCase()).filter(Boolean)).size
    : 0;

  return (
    <div className="view-container overview-view">
      <div className="view-intro">
        <div>
          <p className="eyebrow">Literature intelligence</p>
          <h1>Research workspace</h1>
          <p className="view-description">Review the active literature set, inspect cross-paper signals, and move into the next research task.</p>
        </div>
        <button className="btn-primary" onClick={() => onNavigateView('search')}>
          <Icons.Search width={15} height={15} />
          <span>Search literature</span>
        </button>
      </div>

      <div className="overview-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span>Retrieved papers</span>
            <Icons.PaperReader width={14} height={14} />
          </div>
          <div className="stat-value">{papers?.length || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Active sources</span>
            <Icons.Overview width={14} height={14} />
          </div>
          <div className="stat-value">{activeSourcesCount > 0 ? `${activeSourcesCount} SOURCES` : '8 AVAILABLE'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Knowledge nodes</span>
            <Icons.KnowledgeGraph width={14} height={14} />
          </div>
          <div className="stat-value">{graphData?.nodes?.length || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Graph relations</span>
            <Icons.GapFinder width={14} height={14} />
          </div>
          <div className="stat-value">{graphData?.edges?.length || 0}</div>
        </div>
      </div>

      <div className="overview-workspace">
      <section className="panel-card literature-panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <div>
              <h3>Active literature</h3>
              <p className="panel-caption">{searchQuery ? `Results for “${searchQuery}”` : 'Your current research corpus'}</p>
            </div>
          </div>
          <button className="btn-icon" onClick={() => onNavigateView('search')} title="Open literature search" aria-label="Open literature search">
            <Icons.Search width={15} height={15} />
          </button>
        </div>

        {papers && papers.length > 0 ? (
          <div className="papers-list">
            {papers.slice(0, 5).map((paper, idx) => (
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
                    {Array.isArray(paper.authors) ? paper.authors.slice(0, 3).join(', ') : (paper.authors || 'Unknown Authors')}
                  </span>
                  {paper.year && <span>{paper.year}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-inspector">
            <Icons.Search width={32} height={32} />
            <h4>No literature loaded</h4>
            <p>Run a query to collect papers from connected scholarly sources and begin a comparison.</p>
          </div>
        )}
      </section>

      <aside className="panel-card corpus-panel">
        <div className="panel-header">
          <div>
            <h3>Corpus status</h3>
            <p className="panel-caption">Current working set</p>
          </div>
        </div>
        <div className="corpus-stat">
          <strong>{papers?.length || 0}</strong>
          <span>papers ready to inspect</span>
        </div>
        <div className="source-summary">
          <span className="source-summary-label">Connected sources</span>
          <div className="source-stack">
            {activeSourcesCount > 0 ? Array.from(new Set(papers.map(p => p.source || p.provider).filter(Boolean))).slice(0, 6).map((source) => (
              <span key={source} className={`badge-mono ${getProviderBadgeClass(source)}`}>{source}</span>
            )) : <span className="muted-copy">No source data yet</span>}
          </div>
        </div>
        <div className="corpus-actions">
          <button className="text-button" onClick={() => onNavigateView('graph')}>Explore relationships</button>
          <button className="text-button" onClick={() => onNavigateView('gaps')}>Find limitations</button>
        </div>
      </aside>
      </div>

      <PaperComparisonMatrix
        papers={papers}
        onSelectPaper={onSelectPaper}
        onNavigateView={onNavigateView}
      />
    </div>
  );
}
