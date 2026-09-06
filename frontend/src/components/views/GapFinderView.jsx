import React, { useState, useMemo } from 'react';
import { Icons } from '../common/Icons.jsx';

export function GapFinderView({ papers, searchQuery, onExecuteSearch }) {
  const [analyzing, setAnalyzing] = useState(false);

  // Dynamically extract limitations, gaps, and open challenges directly from retrieved paper abstracts
  const extractedGaps = useMemo(() => {
    if (!papers || papers.length === 0) return [];

    const keywords = [
      'limitation', 'however', 'challenge', 'lack', 'restricted', 'unaddressed',
      'future work', 'open problem', 'bottleneck', 'fails to', 'inconsistency', 'gap'
    ];

    const gapsList = [];

    papers.forEach((paper) => {
      if (!paper.abstract) return;

      // Split abstract into sentences
      const sentences = paper.abstract.split(/(?<=[.?!])\s+/);
      sentences.forEach((sentence) => {
        const lower = sentence.toLowerCase();
        const matched = keywords.find(kw => lower.includes(kw));
        if (matched) {
          gapsList.push({
            title: `Limitation in "${paper.title}"`,
            description: sentence.trim(),
            source: (paper.source || paper.provider || 'PAPER').toUpperCase(),
            tag: matched.toUpperCase() + ' STATEMENT',
            paper: paper
          });
        }
      });
    });

    return gapsList;
  }, [papers]);

  return (
    <div className="view-container gap-finder-view">
      <div className="panel-card">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <h3>AI Research Gap & Limitation Finder</h3>
            {searchQuery && (
              <span className="badge-mono badge-pwc">DOMAIN: "{searchQuery}"</span>
            )}
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setAnalyzing(true);
              setTimeout(() => setAnalyzing(false), 600);
            }}
          >
            <Icons.GapFinder width={14} height={14} />
            <span>{analyzing ? 'Extracting Gaps...' : 'Re-Analyze Literature'}</span>
          </button>
        </div>

        <p className="inspector-abstract mb-4">
          Automated sentence-level NLP parsing extracts open limitations, benchmark gaps, and research challenges directly from the ingested paper abstracts.
        </p>

        {extractedGaps.length > 0 ? (
          <div className="gaps-grid">
            {extractedGaps.map((gap, idx) => (
              <div key={idx} className="gap-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge-mono badge-arxiv">{gap.tag}</span>
                  <span className="badge-mono badge-s2">{gap.source}</span>
                </div>
                <h4 className="gap-title">{gap.title}</h4>
                <p className="gap-desc">"{gap.description}"</p>
              </div>
            ))}
          </div>
        ) : papers && papers.length > 0 ? (
          <div className="empty-inspector">
            <Icons.GapFinder width={32} height={32} />
            <h4>No Explicit Limitation Statements Identified</h4>
            <p>Retrieved paper abstracts do not contain explicit limitation keywords. Run a broader literature query to synthesize additional candidate papers.</p>
          </div>
        ) : (
          <div className="empty-inspector">
            <Icons.GapFinder width={32} height={32} />
            <h4>No Active Literature Loaded</h4>
            <p>Search for a research topic using the top search bar to allow the Agentic RAG engine to parse open research gaps from retrieved literature.</p>
          </div>
        )}
      </div>
    </div>
  );
}
