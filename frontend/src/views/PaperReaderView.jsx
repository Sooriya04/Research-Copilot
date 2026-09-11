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

export default function PaperReaderView() {
  const { activeReaderPaper } = useApp();

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedBib, setCopiedBib] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (activeReaderPaper) {
      const pId = activeReaderPaper.id || activeReaderPaper.arxiv_id || activeReaderPaper.canonical_id || '';
      const cleanId = pId.replace('arxiv:', '').replace('arXiv:', '');
      const authorsStr = (activeReaderPaper.authors || []).map(a => (typeof a === 'string' ? a : a.name)).join(', ');
      const pdfLink = activeReaderPaper.pdf_url || (cleanId ? `https://arxiv.org/pdf/${cleanId}` : null);

      setCurrentDoc({
        id: pId || 'Document',
        source: (activeReaderPaper.primary_source || 'ARXIV').toUpperCase(),
        title: activeReaderPaper.title || 'Research Document',
        authors: authorsStr || 'Authors listed in source publication',
        sourceUrl: activeReaderPaper.url || (cleanId ? `https://arxiv.org/abs/${cleanId}` : null),
        pdfUrl: pdfLink,
        abstract: activeReaderPaper.abstract || 'No abstract preview available.',
        methodology: 'Structured methodology extracted from canonical paper ingestion.',
        concepts: activeReaderPaper.topics && activeReaderPaper.topics.length > 0 ? activeReaderPaper.topics : ['MACHINE-LEARNING', 'METHODOLOGY', 'EVALUATION'],
        bibtex: `@article{paper_${cleanId.replace(/[^a-zA-Z0-9]/g, '') || 'ref'},
  title={${activeReaderPaper.title || 'Untitled'}},
  author={${authorsStr || 'Author and others'}},
  journal={Research Copilot Intelligence Base},
  year={${activeReaderPaper.year || 2024}}
}`,
      });
      setInputVal(cleanId);
    }
  }, [activeReaderPaper]);

  const handleExtract = async () => {
    const query = inputVal.trim();
    if (!query) return;

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
        const cleanId = cp.arxiv_id || cp.canonical_id || query;
        const pdfLink = cp.pdf_url || `https://arxiv.org/pdf/${cleanId.replace('arxiv:', '')}`;

        setCurrentDoc({
          id: cp.canonical_id || cleanId,
          source: (cp.sources && cp.sources.length > 0 ? cp.sources[0].source_name : 'ARXIV').toUpperCase(),
          title: cp.title || query,
          authors: authorsStr || 'Author details in publication',
          sourceUrl: cp.sources && cp.sources.length > 0 ? cp.sources[0].url : `https://arxiv.org/abs/${cleanId}`,
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} id="reader-grid-container">
            {/* Left Column: AI Methodology Breakdown & BibTeX */}
            <div id="pdf-sections-content">
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
                height: 560,
                background: 'var(--bg-subtle)',
              }}
            >
              {currentDoc.pdfUrl ? (
                <iframe
                  title="PDF Preview Frame"
                  src={currentDoc.pdfUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                ></iframe>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  PDF preview not directly accessible for this source. Use "Source URL" above.
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
