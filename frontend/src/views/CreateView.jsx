import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Globe,
  DownloadCloud,
  Library,
  BookOpen,
  Search,
  Sparkles,
  ArrowRight,
  Check,
  Loader2,
  FileText,
  ExternalLink,
  MessageSquare,
  Layers,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const CURATED_LIBRARY = [
  {
    id: '1706.03762',
    title: 'Attention Is All You Need',
    authors: 'Vaswani et al. (Google Brain / Research)',
    year: 2017,
    category: 'Transformers',
    desc: 'The foundational paper introducing the Transformer architecture, multi-head self-attention, and positional encodings.',
    benchmarks: ['WMT-14 En-De: 28.4 BLEU', 'WMT-14 En-Fr: 41.8 BLEU'],
    arxiv_id: '1706.03762',
  },
  {
    id: '2312.00752',
    title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces',
    authors: 'Albert Gu, Tri Dao (CMU & Together AI)',
    year: 2023,
    category: 'State Space',
    desc: 'Introduces selective state space models (SSMs) achieving 5x higher throughput and linear-time sequence scaling.',
    benchmarks: ['Pile Pretraining', 'Long Range Arena (LRA)'],
    arxiv_id: '2312.00752',
  },
  {
    id: '2501.12948',
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via RL',
    authors: 'DeepSeek-AI Research Team',
    year: 2025,
    category: 'Reasoning',
    desc: 'Pure reinforcement learning on base models unlocking long chain-of-thought, self-reflection, and mathematical problem solving.',
    benchmarks: ['AIME 2024: 79.8%', 'MATH-500: 97.3%', 'Codeforces: 2029 Elo'],
    arxiv_id: '2501.12948',
  },
  {
    id: '2112.10752',
    title: 'High-Resolution Image Synthesis with Latent Diffusion Models',
    authors: 'Rombach et al. (CompVis / Runway)',
    year: 2021,
    category: 'Diffusion',
    desc: 'Stable Diffusion foundation: applies continuous-time diffusion processes to autoencoder latent representations.',
    benchmarks: ['ImageNet 256x256 FID: 1.42', 'MS-COCO Text-to-Image'],
    arxiv_id: '2112.10752',
  },
  {
    id: '2001.08361',
    title: 'Scaling Laws for Neural Language Models',
    authors: 'Kaplan, McCandlish, Henighan, Brown et al. (OpenAI)',
    year: 2020,
    category: 'Scaling',
    desc: 'Empirical proof that cross-entropy loss scales smoothly as a power-law against parameter count, dataset size, and compute budgets.',
    benchmarks: ['Cross-Entropy Loss Scaling: 10M to 100B Params'],
    arxiv_id: '2001.08361',
  },
  {
    id: '2307.08691',
    title: 'FlashAttention-2: Faster Attention with Better Parallelism',
    authors: 'Tri Dao (Princeton University)',
    year: 2023,
    category: 'Efficiency',
    desc: 'IO-aware exact attention kernel reaching up to 73% theoretical peak FLOPs on NVIDIA H100/A100 GPUs.',
    benchmarks: ['2x Speedup over FlashAttention-1', 'Up to 64k Contexts'],
    arxiv_id: '2307.08691',
  },
  {
    id: '2106.09685',
    title: 'LoRA: Low-Rank Adaptation of Large Language Models',
    authors: 'Hu, Shen, Wallis, Allen-Zhu et al. (Microsoft)',
    year: 2021,
    category: 'Efficiency',
    desc: 'Freezes model backbone and decomposes weight update matrices into low-rank matrices ($W + BA$), reducing VRAM usage.',
    benchmarks: ['GPT-3 175B Fine-Tuning', 'GLUE Benchmark'],
    arxiv_id: '2106.09685',
  },
  {
    id: '2005.11401',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive Tasks',
    authors: 'Lewis, Perez, Piktus, Petroni et al. (FAIR / UCL)',
    year: 2020,
    category: 'RAG',
    desc: 'The original RAG paper unifying parametric neural memory with non-parametric dense vector retrieval.',
    benchmarks: ['Natural Questions', 'TriviaQA', 'FEVER Fact Verification'],
    arxiv_id: '2005.11401',
  },
  {
    id: '2310.01405',
    title: 'Towards Monosemanticity: Decomposing LLMs With Dictionary Learning',
    authors: 'Bricken, Templeton, Batson, Olah et al. (Anthropic)',
    year: 2023,
    category: 'Interpretability',
    desc: 'Uses Sparse Autoencoders (SAEs) to extract interpretable, monosemantic feature directions from LLM residual streams.',
    benchmarks: ['SAE Reconstruction Loss', 'Monosemantic Feature Interpretability'],
    arxiv_id: '2310.01405',
  },
];

const CATEGORIES = ['All', 'Transformers', 'Reasoning', 'Diffusion', 'State Space', 'Efficiency', 'RAG', 'Interpretability'];

export default function CreateView() {
  const navigate = useNavigate();
  const { createWorkspace, setActiveReaderPaper } = useApp();

  // 1. Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadWorkspaceName, setUploadWorkspaceName] = useState('');
  
  // 2. Import state (arXiv & URL)
  const [importType, setImportType] = useState('arxiv'); // 'arxiv' or 'url'
  const [arxivInput, setArxivInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  // 3. Library state
  const [libraryCategory, setLibraryCategory] = useState('All');
  const [librarySearch, setLibrarySearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);

  // Handle 1: Upload File
  const handleUpload = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile) {
      setError('Please select a PDF file.');
      return;
    }
    setLoading(true);
    setLoadingStep('Uploading PDF & extracting publication Markdown, figures, and KaTeX equations...');
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/v1/paper/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(errTxt || 'PDF parsing failed.');
      }

      const data = await res.json();
      const paper = data.paper;

      const wsName = uploadWorkspaceName.trim() || paper.title || selectedFile.name.replace('.pdf', '');
      await createWorkspace(wsName, `Uploaded PDF: ${paper.title}`);

      setActiveReaderPaper({
        ...paper,
        markdown_content: paper.markdown,
      });

      navigate('/pdf-inspector');
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle 2: Import from arXiv or URL
  const handleImport = async (e) => {
    if (e) e.preventDefault();
    const targetQuery = importType === 'arxiv' ? arxivInput.trim() : urlInput.trim();
    if (!targetQuery) {
      setError(importType === 'arxiv' ? 'Please enter an arXiv identifier.' : 'Please enter a paper or PDF URL.');
      return;
    }

    setLoading(true);
    setLoadingStep(`Resolving "${targetQuery}" & rendering Markdown document with figures...`);
    setError(null);

    try {
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: targetQuery }),
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(errTxt || 'Import resolution failed.');
      }

      const data = await res.json();
      const paper = data.paper;

      const wsName = paper.title || targetQuery;
      await createWorkspace(wsName, `Imported literature: ${paper.title}`);

      setActiveReaderPaper({
        ...paper,
        markdown_content: paper.markdown,
      });

      navigate('/pdf-inspector');
    } catch (err) {
      setError(`Import error: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle 3: Launch from Library Grid
  const handleLaunchLibraryPaper = async (item) => {
    setLoading(true);
    setLoadingStep(`Loading "${item.title}" into research workspace...`);
    setError(null);

    try {
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: item.arxiv_id }),
      });

      let paperData = null;
      if (res.ok) {
        const d = await res.json();
        paperData = d.paper;
      }

      await createWorkspace(item.title, `Research workspace for ${item.title}`);

      if (paperData) {
        setActiveReaderPaper({
          ...paperData,
          markdown_content: paperData.markdown || paperData.markdown_content,
        });
      } else {
        setActiveReaderPaper({
          id: item.id,
          title: item.title,
          authors: [item.authors],
          year: item.year,
          abstract: item.desc,
          pdf_url: `https://arxiv.org/pdf/${item.arxiv_id}.pdf`,
          source: 'Curated Library',
        });
      }

      navigate('/pdf-inspector');
    } catch (err) {
      setError(`Failed to load library paper: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const filteredLibrary = CURATED_LIBRARY.filter((p) => {
    const matchesCategory = libraryCategory === 'All' || p.category.toLowerCase() === libraryCategory.toLowerCase();
    const term = librarySearch.toLowerCase().trim();
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
    <section id="view-create" className="view-panel active">
      {/* Page Header */}
      <div className="panel-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Create & Ingest Research
          </h1>
          <p className="panel-subtitle" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Upload research PDFs, import papers via arXiv ID / URL, or instantiate from our curated foundation paper library.
          </p>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent-blue)', background: 'var(--bg-subtle)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{loadingStep || 'Processing paper ingestion...'}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 20, borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: 'var(--accent-rose)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Top 2 Ingestion Cards Row: 1. Upload File | 2. Import via arXiv & URL */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 32 }}>
        
        {/* 1. UPLOAD FILE CARD */}
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 'var(--radius-lg, 12px)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--accent-emerald, #10b981)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Upload size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Upload PDF File
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Convert local PDF into structured Markdown & figures
                </span>
              </div>
            </div>

            <form onSubmit={handleUpload}>
              <div
                style={{
                  border: '2px dashed var(--border-hover, #6366f1)',
                  borderRadius: 'var(--radius-md)',
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: selectedFile ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-subtle)',
                  marginBottom: 14,
                  cursor: 'pointer',
                }}
                onClick={() => document.getElementById('create-view-pdf-input')?.click()}
              >
                <input
                  id="create-view-pdf-input"
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

                <Upload size={24} style={{ color: 'var(--accent-emerald)', margin: '0 auto 8px', display: 'block' }} />

                {selectedFile ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--accent-emerald)', fontWeight: 600, fontSize: 13 }}>
                      <Check size={14} />
                      <span>{selectedFile.name}</span>
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to convert
                    </span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      Click to Browse or Drag & Drop PDF
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      Extracts sections, LaTeX equations, and embedded images
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <input
                  type="text"
                  value={uploadWorkspaceName}
                  onChange={(e) => setUploadWorkspaceName(e.target.value)}
                  placeholder="Workspace Name (Optional)..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: 12.5,
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !selectedFile}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13 }}
              >
                <span>Upload & Render Markdown</span>
                <ArrowRight size={14} />
              </button>
            </form>
          </div>
        </div>

        {/* 2. IMPORT VIA ARXIV & URL CARD */}
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: 'var(--radius-lg, 12px)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: 'rgba(168, 85, 247, 0.12)',
                  color: 'var(--accent-violet, #a855f7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Globe size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Import via arXiv or URL
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Resolve papers directly via identifier or web URL
                </span>
              </div>
            </div>

            {/* Toggle between arXiv and URL */}
            <div style={{ display: 'flex', background: 'var(--bg-subtle)', padding: 3, borderRadius: 'var(--radius-sm)', marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setImportType('arxiv')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  background: importType === 'arxiv' ? 'var(--bg-card)' : 'transparent',
                  color: importType === 'arxiv' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Import via arXiv ID
              </button>
              <button
                type="button"
                onClick={() => setImportType('url')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  background: importType === 'url' ? 'var(--bg-card)' : 'transparent',
                  color: importType === 'url' ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Import from URL / DOI
              </button>
            </div>

            <form onSubmit={handleImport}>
              {importType === 'arxiv' ? (
                <div style={{ marginBottom: 14 }}>
                  <input
                    type="text"
                    value={arxivInput}
                    onChange={(e) => setArxivInput(e.target.value)}
                    placeholder="e.g. 1706.03762, 2312.00752, 2501.12948"
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Try:</span>
                    <button type="button" onClick={() => setArxivInput('1706.03762')} className="btn btn-secondary btn-sm" style={{ fontSize: 10.5, padding: '2px 7px' }}>Attention (1706.03762)</button>
                    <button type="button" onClick={() => setArxivInput('2312.00752')} className="btn btn-secondary btn-sm" style={{ fontSize: 10.5, padding: '2px 7px' }}>Mamba (2312.00752)</button>
                    <button type="button" onClick={() => setArxivInput('2501.12948')} className="btn btn-secondary btn-sm" style={{ fontSize: 10.5, padding: '2px 7px' }}>DeepSeek-R1 (2501.12948)</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="e.g. https://arxiv.org/abs/2312.00752 or https://arxiv.org/pdf/..."
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
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Supports arXiv links, DOI URLs (10.1145/...), and direct PDF web links.
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || (importType === 'arxiv' ? !arxivInput.trim() : !urlInput.trim())}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13 }}
              >
                <span>Fetch & Render Markdown</span>
                <ArrowRight size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 3. RESEARCH PAPER LIBRARY AS A RICH GRID */}
      <div className="card" style={{ padding: '24px 28px', borderRadius: 'var(--radius-lg, 12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--accent-amber, #f59e0b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Library size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                Curated Foundation Paper Library
              </h2>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                Click any benchmark paper to instantly launch a workspace and read the rich Markdown document.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 12px',
              minWidth: 260,
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search library by paper, author..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 12.5,
                padding: '8px 0',
              }}
            />
          </div>
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setLibraryCategory(cat)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                background: libraryCategory === cat ? 'var(--accent-primary, #6366f1)' : 'var(--bg-subtle)',
                color: libraryCategory === cat ? '#ffffff' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: libraryCategory === cat ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Paper Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {filteredLibrary.map((paper) => (
            <div
              key={paper.id}
              className="card"
              style={{
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderRadius: 'var(--radius-md, 10px)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="badge badge-purple" style={{ fontSize: 10.5 }}>
                    {paper.category}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    arXiv:{paper.arxiv_id} • {paper.year}
                  </span>
                </div>

                <h4 style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                  {paper.title}
                </h4>

                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {paper.authors}
                </p>

                <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {paper.desc}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                  {(paper.benchmarks || []).map((bm, bIdx) => (
                    <span key={bIdx} className="badge badge-neutral" style={{ fontSize: 10 }}>
                      {bm}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleLaunchLibraryPaper(paper)}
                  disabled={loading}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}
                >
                  <BookOpen size={13} />
                  <span>Launch & Read</span>
                </button>
                <a
                  href={`https://arxiv.org/abs/${paper.arxiv_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}
                  title="View on arXiv"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
