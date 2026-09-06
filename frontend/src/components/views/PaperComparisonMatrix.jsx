import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../common/Icons.jsx';

const STOP_WORDS = new Set(['about', 'after', 'also', 'among', 'and', 'are', 'based', 'been', 'between', 'but', 'can', 'data', 'for', 'from', 'into', 'its', 'model', 'models', 'more', 'not', 'our', 'paper', 'propose', 'research', 'show', 'that', 'the', 'their', 'these', 'this', 'using', 'with']);

function paperId(paper, index) {
  return String(paper.id || paper.external_id || paper.doi || paper.url || `${paper.title}-${index}`);
}

function keywords(paper) {
  const content = `${paper.title || ''} ${paper.abstract || ''}`.toLowerCase();
  return new Set((content.match(/[a-z][a-z-]{3,}/g) || []).filter(word => !STOP_WORDS.has(word)));
}

function paperFocus(paper) {
  const summary = (paper.abstract || '').split(/(?<=[.!?])\s+/)[0] || 'No abstract available.';
  return summary.length > 122 ? `${summary.slice(0, 119)}...` : summary;
}

export function PaperComparisonMatrix({ papers = [], onSelectPaper, onNavigateView }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const availablePapers = papers.slice(0, 12);

  useEffect(() => {
    const availableIds = new Set(availablePapers.map(paperId));
    setSelectedIds(previous => {
      const retained = previous.filter(id => availableIds.has(id));
      return retained.length ? retained : availablePapers.slice(0, 3).map(paperId);
    });
  }, [papers]);

  const selectedPapers = useMemo(
    () => availablePapers.filter((paper, index) => selectedIds.includes(paperId(paper, index))),
    [availablePapers, selectedIds]
  );

  const relationshipRows = useMemo(() => {
    const rows = [];
    for (let first = 0; first < selectedPapers.length; first += 1) {
      for (let second = first + 1; second < selectedPapers.length; second += 1) {
        const firstTerms = keywords(selectedPapers[first]);
        const sharedTerms = [...keywords(selectedPapers[second])].filter(term => firstTerms.has(term)).slice(0, 3);
        rows.push({
          first: selectedPapers[first],
          second: selectedPapers[second],
          sharedTerms,
          strength: sharedTerms.length >= 3 ? 'Strong' : sharedTerms.length >= 1 ? 'Partial' : 'None'
        });
      }
    }
    return rows;
  }, [selectedPapers]);

  const togglePaper = (paper, index) => {
    const id = paperId(paper, index);
    setSelectedIds(previous => {
      if (previous.includes(id)) return previous.filter(selectedId => selectedId !== id);
      return previous.length >= 5 ? previous : [...previous, id];
    });
  };

  if (!papers.length) {
    return (
      <section className="panel-card comparison-empty">
        <div>
          <p className="eyebrow">Comparison workspace</p>
          <h3>Paper relationship matrix</h3>
          <p className="panel-caption">Select a literature set to compare sources, publication context, and shared evidence signals.</p>
        </div>
        <button className="btn-secondary" onClick={() => onNavigateView('search')}>
          <Icons.Search width={15} height={15} />
          <span>Start a search</span>
        </button>
      </section>
    );
  }

  return (
    <section className="panel-card comparison-panel">
      <div className="panel-header comparison-header">
        <div>
          <p className="eyebrow">Comparison workspace</p>
          <h3>Paper relationship matrix</h3>
          <p className="panel-caption">Compare up to five papers. Relationships are derived from overlapping title and abstract terms.</p>
        </div>
        <span className="selection-count">{selectedPapers.length} / 5 selected</span>
      </div>

      <div className="comparison-picker" aria-label="Select papers to compare">
        {availablePapers.map((paper, index) => {
          const id = paperId(paper, index);
          const isSelected = selectedIds.includes(id);
          const isSelectionFull = selectedIds.length >= 5;
          return (
            <label key={id} className="comparison-choice" title={!isSelected && isSelectionFull ? 'Remove a selected paper to compare this record' : undefined}>
              <input type="checkbox" checked={isSelected} disabled={!isSelected && isSelectionFull} onChange={() => togglePaper(paper, index)} />
              <span>{paper.title || 'Untitled paper'}</span>
            </label>
          );
        })}
      </div>

      {selectedPapers.length ? (
        <div className="comparison-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                {selectedPapers.map((paper, index) => <th scope="col" key={paperId(paper, index)}>{paper.title || 'Untitled paper'}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Source</th>
                {selectedPapers.map((paper, index) => <td key={paperId(paper, index)}>{paper.source || paper.provider || 'Not reported'}</td>)}
              </tr>
              <tr>
                <th scope="row">Year</th>
                {selectedPapers.map((paper, index) => <td key={paperId(paper, index)}>{paper.year || 'Not reported'}</td>)}
              </tr>
              <tr>
                <th scope="row">Authors</th>
                {selectedPapers.map((paper, index) => <td key={paperId(paper, index)}>{Array.isArray(paper.authors) ? paper.authors.slice(0, 3).join(', ') : paper.authors || 'Not reported'}</td>)}
              </tr>
              <tr>
                <th scope="row">Abstract focus</th>
                {selectedPapers.map((paper, index) => <td key={paperId(paper, index)}>{paperFocus(paper)}</td>)}
              </tr>
              <tr>
                <th scope="row">Record</th>
                {selectedPapers.map((paper, index) => (
                  <td key={paperId(paper, index)}>
                    <button className="table-action" onClick={() => onSelectPaper(paper)}>Inspect paper</button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : <p className="comparison-empty-copy">Choose at least one paper from the current literature set.</p>}

      {relationshipRows.length > 0 && (
        <div className="relationship-summary">
          <div className="relationship-heading">
            <span>Detected relationships</span>
            <button className="text-button" onClick={() => onNavigateView('graph')}>Open graph</button>
          </div>
          <div className="relationship-list">
            {relationshipRows.map((row, index) => (
              <div className="relationship-row" key={`${paperId(row.first, index)}-${paperId(row.second, index)}`}>
                <strong>{row.first.title || 'Untitled paper'}</strong>
                <span className="relationship-type">{row.sharedTerms.length ? `Shared: ${row.sharedTerms.join(', ')}` : 'No shared terms in available metadata'}</span>
                <span className={`relationship-strength strength-${row.strength.toLowerCase()}`}>{row.strength}</span>
                <strong>{row.second.title || 'Untitled paper'}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
