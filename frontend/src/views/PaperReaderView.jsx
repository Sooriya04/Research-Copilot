import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Upload,
  ExternalLink,
  FileText,
  Quote,
  Check,
  Loader2,
  Info,
  BookOpen,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

function extractArxivId(idStr) {
  if (!idStr) return null;
  const s = String(idStr).trim();
  // 1. Explicit arXiv URL
  const urlMatch = s.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})(?:\.pdf)?/i);
  if (urlMatch) return urlMatch[1];
  // 2. Explicit prefix arxiv:
  const prefixMatch = s.match(/^arxiv:\s*([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})$/i);
  if (prefixMatch) return prefixMatch[1];
  // 3. Exact standalone arXiv ID
  const exactMatch = s.match(/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/i);
  if (exactMatch) return exactMatch[1];
  const oldExactMatch = s.match(/^([a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})$/i);
  if (oldExactMatch) return oldExactMatch[1];
  return null;
}

function buildProxyPdfUrl(directUrl) {
  if (!directUrl) return null;
  const trimmed = String(directUrl).trim();
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `/api/v1/pdf/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return null;
}

function resolvePaperPdf(paper) {
  if (!paper) return null;
  // 1. If paper has a valid direct pdf_url, use it!
  if (paper.pdf_url && (paper.pdf_url.startsWith('http://') || paper.pdf_url.startsWith('https://'))) {
    if (paper.pdf_url.includes('arxiv.org/')) {
      const aid = extractArxivId(paper.pdf_url);
      if (aid) {
        return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
      }
    }
    return buildProxyPdfUrl(paper.pdf_url);
  }
  // 2. If paper has an explicit arxiv_id
  if (paper.arxiv_id) {
    const aid = extractArxivId(paper.arxiv_id);
    if (aid) {
      return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
    }
  }
  // 3. If paper.id or paper.canonical_id or paper.url is an arXiv URL or ID
  const fromId = extractArxivId(paper.id);
  if (fromId) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromId}.pdf`);
  const fromCanonical = extractArxivId(paper.canonical_id);
  if (fromCanonical) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromCanonical}.pdf`);
  const fromUrl = extractArxivId(paper.url);
  if (fromUrl) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromUrl}.pdf`);

  return null;
}

export default function PaperReaderView() {
  const { activeReaderPaper } = useApp();

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvingPdf, setResolvingPdf] = useState(false);
  const [copiedBib, setCopiedBib] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchOaCandidate = (lookupQuery) => {
    if (!lookupQuery) return;
    setResolvingPdf(true);
    fetch(`/api/v1/paper/${encodeURIComponent(lookupQuery)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.paper && data.paper.pdf_url) {
          const proxied = buildProxyPdfUrl(data.paper.pdf_url);
          if (proxied) {
            setCurrentDoc(prev => prev ? { ...prev, pdfUrl: proxied } : null);
            return;
          }
        }
        if (data && data.candidates && data.candidates.length > 0) {
          const bestCandidate = data.candidates.find(c => c.format === 'pdf') || data.candidates[0];
          if (bestCandidate && bestCandidate.url) {
            const proxied = buildProxyPdfUrl(bestCandidate.url);
            if (proxied) {
              setCurrentDoc(prev => prev ? { ...prev, pdfUrl: proxied } : null);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setResolvingPdf(false);
      });
  };

  useEffect(() => {
    if (activeReaderPaper) {
      const pId = activeReaderPaper.id || activeReaderPaper.arxiv_id || activeReaderPaper.canonical_id || '';
      const cleanArxiv = extractArxivId(pId) || extractArxivId(activeReaderPaper.arxiv_id) || extractArxivId(activeReaderPaper.url);
      const authorsStr = (activeReaderPaper.authors || []).map(a => (typeof a === 'string' ? a : a.name)).join(', ');
      const pdfLink = resolvePaperPdf(activeReaderPaper);
      const sourceUrl = activeReaderPaper.url || (cleanArxiv ? `https://arxiv.org/abs/${cleanArxiv}` : (activeReaderPaper.doi ? `https://doi.org/${activeReaderPaper.doi}` : null));

      setCurrentDoc({
        id: pId || 'Document',
        doi: activeReaderPaper.doi || null,
        source: (activeReaderPaper.primary_source || (cleanArxiv ? 'ARXIV' : 'RESEARCH')).toUpperCase(),
        title: activeReaderPaper.title || 'Research Document',
        authors: authorsStr || 'Authors listed in source publication',
        sourceUrl: sourceUrl,
        pdfUrl: pdfLink,
        abstract: activeReaderPaper.abstract || 'No abstract preview available.',
        methodology: 'Structured methodology extracted from canonical paper ingestion.',
        concepts: activeReaderPaper.topics && activeReaderPaper.topics.length > 0 ? activeReaderPaper.topics.slice(0, 5) : ['MACHINE-LEARNING', 'METHODOLOGY'],
        bibtex: `@article{paper_${(cleanArxiv || pId).replace(/[^a-zA-Z0-9]/g, '') || 'ref'},
  title={${activeReaderPaper.title || 'Untitled'}},
  author={${authorsStr || 'Author and others'}},
  journal={Research Copilot Intelligence Base},
  year={${activeReaderPaper.year || 2024}}
}`,
      });
      setInputVal(cleanArxiv || activeReaderPaper.title || pId);

      // If no direct PDF URL was found, attempt legal OA resolver across scientific mirrors
      if (!pdfLink) {
        const lookup = cleanArxiv || activeReaderPaper.doi || pId || activeReaderPaper.title;
        fetchOaCandidate(lookup);
      } else {
        setResolvingPdf(false);
      }
    }
  }, [activeReaderPaper]);

  const handleExtract = async () => {
    const query = inputVal.trim();
    if (!query) return;

    // Check if user entered a direct PDF URL
    if (query.endsWith('.pdf') || query.includes('/pdf/')) {
      const proxied = buildProxyPdfUrl(query);
      const filename = query.split('/').pop().replace('.pdf', '') || 'Research Document';
      setCurrentDoc({
        id: 'Direct PDF Stream',
        source: 'PDF STREAM',
        title: decodeURIComponent(filename),
        authors: 'Direct Document Resource',
        sourceUrl: query,
        pdfUrl: proxied,
        abstract: 'Directly loaded PDF stream into Reader.',
        methodology: 'Interactive document view.',
        concepts: ['RESEARCH-DOCUMENT', 'DIRECT-STREAM'],
        bibtex: `@misc{doc_${Date.now()},
  title={${filename}},
  url={${query}}
}`,
      });
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/paper/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: query, include_pdf: true }),
      });

      if (res.ok) {
        const data = await res.json();
        const cp = data.canonical_paper;
        const authorsStr = (cp.authors || []).map(a => (typeof a === 'string' ? a : a.name)).join(', ');
        const cleanArxiv = extractArxivId(cp.arxiv_id) || extractArxivId(cp.canonical_id) || extractArxivId(query);
        const cleanId = cleanArxiv || cp.canonical_id || query;
        
        let pdfLink = null;
        if (cp.pdf_url && (cp.pdf_url.startsWith('http://') || cp.pdf_url.startsWith('https://'))) {
          pdfLink = buildProxyPdfUrl(cp.pdf_url);
        } else if (cleanArxiv) {
          pdfLink = buildProxyPdfUrl(`https://arxiv.org/pdf/${cleanArxiv}.pdf`);
        }

        setCurrentDoc({
          id: cp.canonical_id || cleanId,
          doi: cp.doi || null,
          source: (cp.sources && cp.sources.length > 0 ? cp.sources[0].source_name : (cleanArxiv ? 'ARXIV' : 'RESEARCH')).toUpperCase(),
          title: cp.title || query,
          authors: authorsStr || 'Author details in publication',
          sourceUrl: cp.sources && cp.sources.length > 0 ? cp.sources[0].url : (cleanArxiv ? `https://arxiv.org/abs/${cleanArxiv}` : null),
          pdfUrl: pdfLink,
          abstract: cp.abstract || 'Extracted document content.',
          methodology: cp.summary ? cp.summary.methodology : 'Empirical methodology extracted from canonical paper.',
          concepts: cp.benchmarks && cp.benchmarks.length > 0 ? cp.benchmarks.map(b => b.task) : ['NEURAL-NETWORKS', 'BENCHMARKS'],
          bibtex: `@article{ref_${cleanId.replace(/[^a-zA-Z0-9]/g, '')},
  title={${cp.title}},
  author={${authorsStr || 'Author'}},
  year={${cp.year || 2024}}
}`,
        });
      } else {
        const errTxt = await res.text();
        setErrorMessage(`Extraction failed: ${errTxt}`);
      }
    } catch (err) {
      setErrorMessage(`Network error during extraction: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyBibTeX = () => {
    if (!currentDoc) return;
    navigator.clipboard.writeText(currentDoc.bibtex);
    setCopiedBib(true);
    setTimeout(() => setCopiedBib(false), 2000);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      setCurrentDoc({
        id: 'Local Upload',
        source: 'PDF UPLOAD',
        title: file.name.replace('.pdf', ''),
        authors: 'Local User Upload',
        sourceUrl: null,
        pdfUrl: fileUrl,
        abstract: 'Uploaded local research PDF document for in-browser inspection.',
        methodology: 'Local file view.',
        concepts: ['LOCAL-PDF', 'INSPECTION'],
        bibtex: `@misc{upload_${Date.now()},
  title={${file.name.replace('.pdf', '')}},
  note={Local Uploaded Research Document}
}`,
      });
    }
  };

  return (
    <section id="view-pdf-inspector" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Interactive Paper Reader & PDF Analyzer</h1>
          <p className="panel-subtitle">
            Extract structured methodology breakdowns, LaTeX equations, BibTeX citations, and embedded PDF view for any paper.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            id="pdf-url-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
            placeholder="Enter arXiv ID (e.g. 2312.00752), arXiv URL, DOI, or paper title..."
            style={{
              flex: 1,
              minWidth: 260,
              padding: '8px 12px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            className="btn btn-primary"
            id="btn-extract-pdf"
            onClick={handleExtract}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} />
            <span>{loading ? 'Extracting...' : 'Extract Document'}</span>
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={14} />
            <span>+ Upload PDF</span>
            <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>

        {loading && (
          <div style={{ display: 'flex', marginTop: 10, fontSize: 12, color: 'var(--accent-blue)', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} className="animate-spin" />
            <span>Extracting scientific document metadata via Paper Intelligence Engine...</span>
          </div>
        )}

        {errorMessage && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--accent-rose)' }}>
            {errorMessage}
          </div>
        )}
      </div>

      {currentDoc ? (
        <div className="card doc-viewer-card" id="paper-reader-card">
          <div
            style={{
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: 14,
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="badge badge-violet">{currentDoc.source}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentDoc.id}</span>
              </div>
              <h2 style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {currentDoc.title}
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Authors: {currentDoc.authors}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {currentDoc.sourceUrl && (
                <a
                  href={currentDoc.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink size={13} />
                  <span>Source URL</span>
                </a>
              )}
              {currentDoc.pdfUrl && (
                <a
                  href={currentDoc.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <FileText size={13} />
                  <span>View PDF</span>
                </a>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={copyBibTeX}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {copiedBib ? <Check size={13} /> : <Quote size={13} />}
                <span>{copiedBib ? 'Copied' : 'Copy BibTeX'}</span>
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)',
              gap: 24,
              alignItems: 'start',
            }}
            id="reader-grid-container"
          >
            {/* Left Column: AI Methodology Breakdown & BibTeX */}
            <div id="pdf-sections-content" style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="doc-section">
                <h3>Abstract</h3>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {currentDoc.abstract}
                </p>
              </div>

              <div className="doc-section">
                <h3>Key Methodology & Research Focus</h3>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {currentDoc.methodology}
                </p>
              </div>

              <div className="doc-section">
                <h3>Key Technical Concepts</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {currentDoc.concepts.map((c, i) => (
                    <span key={i} className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div className="doc-section">
                <h3>Academic Citation Code (BibTeX)</h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
                  <Info size={13} style={{ color: 'var(--accent-blue)', display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  <strong>Note:</strong> BibTeX is standard citation code used when writing academic research papers.
                </p>
                <pre
                  style={{
                    background: 'var(--bg-subtle)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11,
                    fontFamily: 'var(--font-code)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxWidth: '100%',
                    color: 'var(--text-primary)',
                  }}
                >
                  {currentDoc.bibtex}
                </pre>
              </div>
            </div>

            {/* Right Column: Embedded PDF Viewer */}
            <div
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                height: 720,
                background: 'var(--bg-subtle)',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
            >
              {resolvingPdf ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 28, textAlign: 'center' }}>
                  <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: 14 }} />
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    Locating Open-Access PDF Stream
                  </h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5 }}>
                    Connecting to scientific repositories (arXiv, Semantic Scholar, OpenAlex) to retrieve legal full-text PDF...
                  </p>
                </div>
              ) : currentDoc.pdfUrl ? (
                <>
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-card)',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <FileText size={14} style={{ color: 'var(--accent-primary)' }} />
                      <span style={{ fontWeight: 600 }}>PDF Document Viewer</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <a
                        href={currentDoc.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <ExternalLink size={12} />
                        <span>Open In Tab</span>
                      </a>
                    </div>
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <object
                      data={currentDoc.pdfUrl}
                      type="application/pdf"
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                    >
                      <iframe
                        title="PDF Preview Frame"
                        src={currentDoc.pdfUrl}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      >
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <p style={{ marginBottom: 12 }}>Unable to display inline PDF in your browser plugin.</p>
                          <a
                            href={currentDoc.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary btn-sm"
                          >
                            Open PDF Directly
                          </a>
                        </div>
                      </iframe>
                    </object>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center' }}>
                  <FileText size={44} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    Direct PDF Stream Unavailable
                  </h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5, marginBottom: 16 }}>
                    This publication does not expose a direct open PDF stream or is protected behind publisher access. You can locate open access mirrors, open the publisher landing page, or upload a local PDF copy.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => fetchOaCandidate(currentDoc.doi || currentDoc.id || currentDoc.title)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Sparkles size={13} />
                      <span>Locate Open Access PDF</span>
                    </button>
                    {currentDoc.sourceUrl && (
                      <a
                        href={currentDoc.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={13} />
                        <span>Open Source Page</span>
                      </a>
                    )}
                    {currentDoc.doi && (
                      <a
                        href={`https://doi.org/${currentDoc.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={13} />
                        <span>Open via DOI</span>
                      </a>
                    )}
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Upload size={13} />
                      <span>+ Upload PDF</span>
                      <input type="file" accept="application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          <BookOpen size={40} style={{ margin: '0 auto 12px', display: 'block', color: 'var(--border-hover)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No Paper Document Loaded
          </h3>
          <p style={{ fontSize: 13 }}>
            Enter an arXiv identifier (e.g. <span style={{ fontFamily: 'var(--font-code)' }}>2312.00752</span>), DOI, or upload a local PDF to extract sections and render PDF reader.
          </p>
        </div>
      )}
    </section>
  );
}
