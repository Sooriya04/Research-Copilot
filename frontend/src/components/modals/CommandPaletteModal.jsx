import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Network,
  FlaskConical,
  FileText,
  Lightbulb,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function CommandPaletteModal() {
  const { isCmdPaletteOpen, closeCmdPalette } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  if (!isCmdPaletteOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const q = query.trim();
      if (q) {
        closeCmdPalette();
        navigate(`/search?q=${encodeURIComponent(q)}`);
      }
    }
  };

  const jumpTo = (path) => {
    closeCmdPalette();
    navigate(path);
  };

  return (
    <div
      className="modal-overlay"
      id="cmd-palette-overlay"
      style={{ display: 'flex' }}
      onClick={(e) => {
        if (e.target.id === 'cmd-palette-overlay') closeCmdPalette();
      }}
    >
      <div className="cmd-palette-card">
        <div className="cmd-input-row">
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            id="cmd-palette-input"
            placeholder="Type a paper title, DOI, topic, or command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <span className="kbd-badge" onClick={closeCmdPalette} style={{ cursor: 'pointer' }}>
            ESC
          </span>
        </div>
        <div className="cmd-results-list">
          <div className="cmd-item" onClick={() => jumpTo('/search')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <span>Search Scientific Literature</span>
            </div>
            <span className="kbd-badge">Jump</span>
          </div>
          <div className="cmd-item" onClick={() => jumpTo('/knowledge-graph')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Network size={15} style={{ color: 'var(--text-muted)' }} />
              <span>Explore Knowledge Graph</span>
            </div>
            <span className="kbd-badge">Jump</span>
          </div>
          <div className="cmd-item" onClick={() => jumpTo('/experiment-studio')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlaskConical size={15} style={{ color: 'var(--text-muted)' }} />
              <span>Open SOTA Benchmarks</span>
            </div>
            <span className="kbd-badge">Jump</span>
          </div>
          <div className="cmd-item" onClick={() => jumpTo('/pdf-inspector')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={15} style={{ color: 'var(--text-muted)' }} />
              <span>Open Paper & PDF Reader</span>
            </div>
            <span className="kbd-badge">Jump</span>
          </div>
          <div className="cmd-item" onClick={() => jumpTo('/research-gaps')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={15} style={{ color: 'var(--text-muted)' }} />
              <span>Analyze Research Gaps</span>
            </div>
            <span className="kbd-badge">Jump</span>
          </div>
        </div>
      </div>
    </div>
  );
}
