import React, { useState } from 'react';
import { Icons } from './Icons.jsx';

export function CommandPalette({ isOpen, onClose, onSelectView, onToggleTheme, onExecuteSearch }) {
  const [inputQuery, setInputQuery] = useState('');

  if (!isOpen) return null;

  const actions = [
    { label: 'Navigate: Overview', action: () => { onSelectView('dashboard'); onClose(); } },
    { label: 'Navigate: Unified Literature Search', action: () => { onSelectView('search'); onClose(); } },
    { label: 'Navigate: Knowledge Graph', action: () => { onSelectView('graph'); onClose(); } },
    { label: 'Navigate: Gap Finder', action: () => { onSelectView('gaps'); onClose(); } },
    { label: 'Navigate: Paper Reader', action: () => { onSelectView('reader'); onClose(); } },
    { label: 'Toggle Color Theme (Dark/Light)', action: () => { onToggleTheme(); onClose(); } }
  ];

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputQuery.trim()) {
      onExecuteSearch(inputQuery);
      onSelectView('search');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card cmd-palette-card" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-container">
          <Icons.Search width={16} height={16} />
          <input
            type="text"
            className="cmd-input"
            placeholder="Type a search query or select a command... (Press Enter)"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button className="btn-icon" onClick={onClose}>
            <Icons.X width={14} height={14} />
          </button>
        </div>

        <div className="cmd-options-list">
          {actions.map((act, idx) => (
            <div key={idx} className="cmd-option-item" onClick={act.action}>
              <span>{act.label}</span>
              <Icons.Command width={12} height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
