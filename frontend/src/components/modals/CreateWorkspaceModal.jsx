import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderPlus,
  X,
  Sparkles,
  ArrowRight,
  Upload,
  Link as LinkIcon,
  FileText,
  Loader2,
  Check,
  Globe,
  DownloadCloud,
  Library,
  BookOpen,
  Search,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const PRESET_TOPICS = [
  { title: 'Attention & Transformer Architectures', desc: 'Investigating self-attention scaling laws and KV-cache optimizations.' },
  { title: 'Mechanistic Interpretability in LLMs', desc: 'Sparse autoencoders, circuit discovery, and internal feature analysis.' },
  { title: 'Diffusion Models & Generative AI', desc: 'Continuous-time diffusion equations and latent image generation.' },
  { title: 'Liquid Neural Networks & Time Series', desc: 'Continuous-depth ODE models for dynamic forecasting benchmarks.' },
];

const QUICK_IMPORT_EXAMPLES = [
  { label: 'Attention Is All You Need', id: '1706.03762' },
  { label: 'Mamba State Space', id: '2312.00752' },
  { label: 'Llama 2 Architecture', id: '2307.09288' },
  { label: 'FlashAttention-2', id: '2307.08691' },
];

const CURATED_LIBRARY = [
  {
    id: '1706.03762',
    title: 'Attention Is All You Need',
    authors: 'Vaswani et al. (Google Brain / Google Research)',
    year: 2017,
    category: 'Transformers & Attention',
    desc: 'The foundational paper introducing the Transformer architecture, multi-head self-attention, and positional encodings.',
    benchmarks: ['WMT-14 En-De: 28.4 BLEU', 'WMT-14 En-Fr: 41.8 BLEU'],
    arxiv_id: '1706.03762',
  },
  {
    id: '2312.00752',
    title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',
    authors: 'Albert Gu, Tri Dao (CMU & Together AI)',
    year: 2023,
    category: 'State Space Models',
    desc: 'Introduces selective state space models (SSMs) achieving 5x higher throughput and linear-time sequence scaling matching Transformers.',
    benchmarks: ['Pile Pretraining', 'Long Range Arena (LRA)'],
    arxiv_id: '2312.00752',
  },
  {
    id: '2501.12948',
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via RL',
    authors: 'DeepSeek-AI Research Team',
    year: 2025,
    category: 'LLM Reasoning & RL',
    desc: 'Pure reinforcement learning on base models unlocking long chain-of-thought, self-reflection, and mathematical problem solving.',
    benchmarks: ['AIME 2024: 79.8%', 'MATH-500: 97.3%', 'Codeforces: 2029 Elo'],
    arxiv_id: '2501.12948',
  },
  {
    id: '2112.10752',
    title: 'High-Resolution Image Synthesis with Latent Diffusion Models',
    authors: 'Rombach et al. (CompVis / Runway)',
    year: 2021,
    category: 'Diffusion & Generative AI',
    desc: 'Stable Diffusion foundation: applies continuous-time diffusion processes to autoencoder latent representations for high-fidelity generation.',
    benchmarks: ['ImageNet 256x256 FID: 1.42', 'MS-COCO Text-to-Image'],
    arxiv_id: '2112.10752',
  },
  {
    id: '2001.08361',
    title: 'Scaling Laws for Neural Language Models',
    authors: 'Kaplan, McCandlish, Henighan, Brown, Radford, Amodei et al. (OpenAI)',
    year: 2020,
    category: 'Scaling & Optimization',
    desc: 'Empirical proof that cross-entropy loss scales smoothly as a power-law against parameter count, dataset size, and compute budgets.',
    benchmarks: ['Cross-Entropy Loss Scaling: 10M to 100B Params'],
    arxiv_id: '2001.08361',
  },
  {
    id: '2307.08691',
    title: 'FlashAttention-2: Faster Attention with Better Parallelism',
    authors: 'Tri Dao (Princeton University)',
    year: 2023,
    category: 'Hardware & GPU Kernels',
    desc: 'IO-aware exact attention kernel reaching up to 73% theoretical peak FLOPs on NVIDIA H100/A100 GPUs.',
    benchmarks: ['2x Speedup over FlashAttention-1', 'Up to 64k Contexts'],
    arxiv_id: '2307.08691',
  },
  {
    id: '2106.09685',
    title: 'LoRA: Low-Rank Adaptation of Large Language Models',
    authors: 'Hu, Shen, Wallis, Allen-Zhu, Li, Wang, Chen (Microsoft)',
    year: 2021,
    category: 'Efficient Fine-Tuning',
    desc: 'Freezes model backbone and decomposes weight update matrices into low-rank matrices ($W + BA$), reducing VRAM usage by 3x.',
    benchmarks: ['GPT-3 175B Fine-Tuning', 'GLUE Benchmark'],
    arxiv_id: '2106.09685',
  },
  {
    id: '2005.11401',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive Tasks',
    authors: 'Lewis, Perez, Piktus, Petroni, Karpukhin, Kiela et al. (FAIR / UCL)',
    year: 2020,
    category: 'Agentic RAG & Search',
    desc: 'The original RAG paper unifying parametric neural memory with non-parametric dense vector retrieval over Wikipedia indices.',
    benchmarks: ['Natural Questions', 'TriviaQA', 'FEVER Fact Verification'],
    arxiv_id: '2005.11401',
  },
];

export default function CreateWorkspaceModal() {
  const navigate = useNavigate();
  const {
    isWorkspaceModalOpen,
    closeWorkspaceModal,
    createWorkspace,
    workspaceModalInitialTitle,
    setActiveReaderPaper,
  } = useApp();

  const [activeTab, setActiveTab] = useState('create'); // 'create', 'upload', 'import', 'library'
  
  // Tab 1: New Workspace form
  const [title, setTitle] = useState(typeof workspaceModalInitialTitle === 'string' ? workspaceModalInitialTitle : '');
  const [description, setDescription] = useState('');
  
  // Tab 2: Upload File form
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadWorkspaceName, setUploadWorkspaceName] = useState('');
  
  // Tab 3: Import via ID / URL form
  const [importQuery, setImportQuery] = useState('');
  
  // Tab 4: Library search filter
  const [libraryFilter, setLibraryFilter] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('all');

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof workspaceModalInitialTitle === 'string') {
      setTitle(workspaceModalInitialTitle);
    } else {
      setTitle('');
    }
  }, [workspaceModalInitialTitle]);

  if (!isWorkspaceModalOpen) return null;

  // Handle Tab 1: Create Blank Workspace
  const handleCreateSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
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
        closeWorkspaceModal();
        navigate('/workspaces');
      } else {
        setError('Failed to initialize workspace in database.');
      }
    } catch (err) {
      setError(`Error creating workspace: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Tab 2: Upload PDF File
  const handleUploadSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile) {
      setError('Please select a PDF file to upload.');
      return;
    }
    setLoading(true);
    setLoadingStep('Uploading PDF & extracting Markdown, figures, and KaTeX equations...');
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const uploadRes = await fetch('/api/v1/paper/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errTxt = await uploadRes.text();
        throw new Error(errTxt || 'PDF parsing failed.');
      }

      const uploadData = await uploadRes.json();
      const paper = uploadData.paper;

      const wsName = uploadWorkspaceName.trim() || paper.title || selectedFile.name.replace('.pdf', '');
      await createWorkspace(wsName, `Uploaded paper analysis: ${paper.title}`);

      setActiveReaderPaper({
        ...paper,
        markdown_content: paper.markdown,
      });

      closeWorkspaceModal();
      navigate('/pdf-inspector');
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle Tab 3: Import via arXiv ID, DOI, or URL
  const handleImportSubmit = async (e) => {
    if (e) e.preventDefault();
    const q = importQuery.trim();
    if (!q) {
      setError('Please enter an arXiv identifier, DOI, or direct paper URL.');
      return;
    }
    setLoading(true);
    setLoadingStep(`Resolving "${q}" & generating structured Markdown document with figures...`);
    setError(null);

    try {
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: q }),
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(errTxt || 'Import resolution failed.');
      }

      const data = await res.json();
      const paper = data.paper;

      const wsName = paper.title || q;
      await createWorkspace(wsName, `Imported literature analysis: ${paper.title}`);

      setActiveReaderPaper({
        ...paper,
        markdown_content: paper.markdown,
      });

      closeWorkspaceModal();
      navigate('/pdf-inspector');
    } catch (err) {
      setError(`Import error: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle Tab 4: Open Paper from Curated Library
  const handleSelectLibraryPaper = async (paperItem) => {
    setLoading(true);
    setLoadingStep(`Loading "${paperItem.title}" into research workspace & reader...`);
    setError(null);

    try {
      // Import via arXiv ID
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: paperItem.arxiv_id }),
      });

      let loadedPaper = null;
      if (res.ok) {
        const data = await res.json();
        loadedPaper = data.paper;
      } else {
        // Fallback to summarize endpoint
        const sumRes = await fetch('/api/v1/paper/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: paperItem.arxiv_id, include_pdf: true }),
        });
        if (sumRes.ok) {
          const sData = await sumRes.json();
          loadedPaper = sData.canonical_paper;
        }
      }

      await createWorkspace(paperItem.title, `Research workspace for ${paperItem.title} (${paperItem.authors}, ${paperItem.year})`);

      if (loadedPaper) {
        setActiveReaderPaper({
          ...loadedPaper,
          markdown_content: loadedPaper.markdown || loadedPaper.markdown_content,
        });
      } else {
        setActiveReaderPaper({
          id: paperItem.id,
          title: paperItem.title,
          authors: [paperItem.authors],
          year: paperItem.year,
          abstract: paperItem.desc,
          pdf_url: `https://arxiv.org/pdf/${paperItem.arxiv_id}.pdf`,
          source: 'Curated Library',
        });
      }

      closeWorkspaceModal();
      navigate('/pdf-inspector');
    } catch (err) {
      setError(`Failed to load library paper: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleApplyPreset = (preset) => {
    setTitle(preset.title);
    setDescription(preset.desc);
    setError(null);
  };

  const filteredLibrary = CURATED_LIBRARY.filter((p) => {
    const matchesCategory = libraryCategory === 'all' || p.category.toLowerCase().includes(libraryCategory.toLowerCase());
    const term = libraryFilter.toLowerCase().trim();
    if (!term) return matchesCategory;
    return (
      matchesCategory &&
      (p.title.toLowerCase().includes(term) ||
        p.authors.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        p.desc.toLowerCase().includes(term))
    );
  });

  return (
    <div
      className="modal-overlay"
      id="workspace-modal-overlay"
      onClick={(e) => {
        if (e.target.id === 'workspace-modal-overlay') {
          closeWorkspaceModal();
        }
      }}
    >
      <div className="cmd-palette-card" style={{ width: 680, padding: '24px 28px', position: 'relative', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
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
                Research Ingestion & Workspaces
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Create workspace, upload PDF, import via arXiv/URL, or browse the curated paper library.
              </p>
            </div>
          </div>
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
        </div>

        {/* 4-Way Mode Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-subtle)',
            padding: 3,
            borderRadius: 'var(--radius-md)',
            marginBottom: 18,
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => { setActiveTab('create'); setError(null); }}
            style={{
              flex: 1,
              padding: '7px 8px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'create' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'create' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'create' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              boxShadow: activeTab === 'create' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <FolderPlus size={13} style={{ color: activeTab === 'create' ? 'var(--accent-primary)' : 'inherit' }} />
            <span>+ Create</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('upload'); setError(null); }}
            style={{
              flex: 1,
              padding: '7px 8px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'upload' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'upload' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'upload' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              boxShadow: activeTab === 'upload' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <Upload size={13} style={{ color: activeTab === 'upload' ? 'var(--accent-emerald)' : 'inherit' }} />
            <span>Upload File</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('import'); setError(null); }}
            style={{
              flex: 1,
              padding: '7px 8px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'import' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'import' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'import' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              boxShadow: activeTab === 'import' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <Globe size={13} style={{ color: activeTab === 'import' ? 'var(--accent-violet)' : 'inherit' }} />
            <span>Import via ID / URL</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('library'); setError(null); }}
            style={{
              flex: 1,
              padding: '7px 8px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'library' ? 'var(--bg-card)' : 'transparent',
              color: activeTab === 'library' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'library' ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              boxShadow: activeTab === 'library' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <Library size={13} style={{ color: activeTab === 'library' ? 'var(--accent-amber)' : 'inherit' }} />
            <span>Library</span>
          </button>
        </div>

        {/* TAB 1: CREATE BLANK WORKSPACE */}
        {activeTab === 'create' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ marginBottom: 14 }}>
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

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor="workspace-title-input"
                  style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
                >
                  Workspace Name or Topic <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <input
                  id="workspace-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Attention Is All You Need or Diffusion Scaling Laws..."
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

              <div style={{ marginBottom: 16 }}>
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
                  placeholder="Brief description of the research objectives or target hypotheses..."
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
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeWorkspaceModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !(typeof title === 'string' && title.trim())}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}
                >
                  <span>{loading ? 'Creating Workspace...' : 'Launch Workspace'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: UPLOAD PDF FILE */}
        {activeTab === 'upload' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <form onSubmit={handleUploadSubmit}>
              <div
                style={{
                  border: '2px dashed var(--border-hover, #6366f1)',
                  borderRadius: 'var(--radius-md)',
                  padding: '28px 20px',
                  textAlign: 'center',
                  background: selectedFile ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-subtle)',
                  marginBottom: 16,
                  cursor: 'pointer',
                }}
                onClick={() => document.getElementById('modal-pdf-file-picker')?.click()}
              >
                <input
                  id="modal-pdf-file-picker"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    if (file) {
                      setSelectedFile(file);
                      if (!uploadWorkspaceName) {
                        setUploadWorkspaceName(file.name.replace('.pdf', ''));
                      }
                    }
                  }}
                  style={{ display: 'none' }}
                />

                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                    color: 'var(--accent-primary)',
                  }}
                >
                  <Upload size={22} />
                </div>

                {selectedFile ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--accent-emerald)', fontWeight: 600, fontSize: 13.5 }}>
                      <Check size={16} />
                      <span>{selectedFile.name}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to convert to Markdown with images
                    </span>
                  </div>
                ) : (
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      Click to Browse or Drag & Drop PDF Document
                    </h4>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      Extracts structured sections, figures (as base64 images), and LaTeX formulas.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="upload-ws-name"
                  style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
                >
                  Workspace Name for this Paper <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Auto-filled)</span>
                </label>
                <input
                  id="upload-ws-name"
                  type="text"
                  value={uploadWorkspaceName}
                  onChange={(e) => setUploadWorkspaceName(e.target.value)}
                  placeholder="e.g. Scaling Laws for Neural Language Models"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12.5, color: 'var(--accent-blue)' }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{loadingStep || 'Processing publication...'}</span>
                </div>
              )}

              {error && (
                <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--accent-rose)' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeWorkspaceModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !selectedFile}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}
                >
                  <span>{loading ? 'Ingesting PDF...' : 'Convert & Read Markdown'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: IMPORT VIA ARXIV / DOI / URL */}
        {activeTab === 'import' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <form onSubmit={handleImportSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor="import-query-input"
                  style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
                >
                  arXiv ID, DOI, or Paper URL <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <input
                  id="import-query-input"
                  type="text"
                  value={importQuery}
                  onChange={(e) => setImportQuery(e.target.value)}
                  placeholder="e.g. 2310.07240, 10.1145/3318464, https://arxiv.org/abs/1706.03762"
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

              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Quick Import Examples:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {QUICK_IMPORT_EXAMPLES.map((ex, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setImportQuery(ex.id)}
                      style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 'var(--radius-pill)' }}
                    >
                      <DownloadCloud size={11} style={{ marginRight: 4, color: 'var(--accent-violet)' }} />
                      <span>{ex.label} ({ex.id})</span>
                    </button>
                  ))}
                </div>
              </div>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12.5, color: 'var(--accent-blue)' }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{loadingStep || 'Resolving paper & parsing PDF...'}</span>
                </div>
              )}

              {error && (
                <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--accent-rose)' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeWorkspaceModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !importQuery.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}
                >
                  <span>{loading ? 'Importing...' : 'Fetch & Render Markdown'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: LIBRARY (ONLY IN CREATE OPTION) */}
        {activeTab === 'library' && (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0 10px',
                }}
              >
                <Search size={13} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={libraryFilter}
                  onChange={(e) => setLibraryFilter(e.target.value)}
                  placeholder="Search curated library papers by title, author, or keywords..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 12.5,
                    padding: '7px 0',
                  }}
                />
                {libraryFilter && (
                  <button
                    type="button"
                    onClick={() => setLibraryFilter('')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--accent-blue)', fontSize: 12.5 }}>
                <Loader2 size={14} className="animate-spin" />
                <span>{loadingStep || 'Loading paper...'}</span>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12.5, color: 'var(--accent-rose)', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 6 }}>
                {error}
              </div>
            )}

            {/* Library Paper Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
              {filteredLibrary.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="badge badge-purple" style={{ fontSize: 10.5 }}>{item.category}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>arXiv:{item.arxiv_id} • {item.year}</span>
                    </div>

                    <h4 style={{ margin: '0 0 3px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {item.title}
                    </h4>
                    <p style={{ margin: '0 0 6px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {item.authors}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {item.desc}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(item.benchmarks || []).map((b, bIdx) => (
                        <span key={bIdx} className="badge badge-neutral" style={{ fontSize: 9.5 }}>
                          {b}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSelectLibraryPaper(item)}
                      disabled={loading}
                      style={{ fontSize: 11.5, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <BookOpen size={12} />
                      <span>Launch & Read</span>
                    </button>
                  </div>
                </div>
              ))}

              {filteredLibrary.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                  No papers in library match your query.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
