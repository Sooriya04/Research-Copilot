import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, X, Sparkles, ArrowRight, Layers, BookOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const PRESET_TOPICS = [
  { title: 'Attention & Transformer Architectures', desc: 'Investigating self-attention scaling laws and KV-cache optimizations.' },
  { title: 'Mechanistic Interpretability in LLMs', desc: 'Sparse autoencoders, circuit discovery, and internal feature analysis.' },
  { title: 'Diffusion Models & Generative AI', desc: 'Continuous-time diffusion equations and latent image generation.' },
  { title: 'Liquid Neural Networks & Time Series', desc: 'Continuous-depth ODE models for dynamic forecasting benchmarks.' },
];

export default function CreateWorkspaceModal() {
  const navigate = useNavigate();
  const {
    isWorkspaceModalOpen,
    closeWorkspaceModal,
    createWorkspace,
    activeWorkspace,
    workspaces,
    workspaceModalInitialTitle,
  } = useApp();

  const [title, setTitle] = useState(workspaceModalInitialTitle || '');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (workspaceModalInitialTitle) {
      setTitle(workspaceModalInitialTitle);
    }
  }, [workspaceModalInitialTitle]);

  if (!isWorkspaceModalOpen) return null;

  const isMandatory = false; // Always allow user to browse overview freely!

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Workspace title or paper name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createWorkspace(cleanTitle, description.trim());
      if (res) {
        setTitle('');
        setDescription('');
        navigate('/search');
      } else {
        setError('Failed to initialize workspace in SQLite database.');
      }
    } catch (err) {
      setError(`Error creating workspace: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setTitle(preset.title);
    setDescription(preset.desc);
    setError(null);
  };

  return (
    <div
      className="modal-overlay"
      id="workspace-modal-overlay"
      onClick={(e) => {
        if (e.target.id === 'workspace-modal-overlay' && !isMandatory) {
          closeWorkspaceModal();
        }
      }}
    >
      <div className="cmd-palette-card" style={{ width: 560, padding: '24px 28px', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #6366f1)',
              }}
            >
              <FolderPlus size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {isMandatory ? 'Initialize Research Workspace' : 'Create New Research Workspace'}
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {isMandatory
                  ? 'Name your research project to begin exploring literature, graphs, and reader tools.'
                  : 'Group literature queries, knowledge graph structures, and paper reader notes in an isolated research environment.'}
              </p>
            </div>
          </div>
          {!isMandatory && (
            <button
              onClick={closeWorkspaceModal}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 4,
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Quick Suggestion Presets */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Suggested Topic Presets:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {PRESET_TOPICS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleApplyPreset(p)}
                style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 'var(--radius-pill)' }}
              >
                <Sparkles size={11} style={{ marginRight: 4, color: 'var(--accent-blue)' }} />
                <span>{p.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="workspace-title-input"
              style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
            >
              Workspace Name or Paper Title <span style={{ color: 'var(--accent-rose)' }}>*</span>
            </label>
            <input
              id="workspace-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Attention Is All You Need or Quantum Computing..."
              autoFocus
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13.5,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="workspace-desc-input"
              style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
            >
              Research Goal or Notes <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span>
            </label>
            <textarea
              id="workspace-desc-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the research objectives, target hypotheses, or architectures under investigation..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--accent-rose)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
            {!isMandatory && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeWorkspaceModal}
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !title.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}
            >
              <span>{loading ? 'Creating Workspace...' : 'Launch Workspace'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
