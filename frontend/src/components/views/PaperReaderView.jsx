import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/api.js';
import { Icons } from '../common/Icons.jsx';

export function PaperReaderView({ selectedPaper }) {
  const [extractedData, setExtractedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedPaper || !selectedPaper.pdf_url) return;

    const fetchExtraction = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await ApiService.extractPdf(selectedPaper.pdf_url);
        setExtractedData(res);
      } catch (err) {
        console.error('PDF extraction failed:', err);
        setError('Could not extract PDF text from backend microservice (port 8001).');
      } finally {
        setLoading(false);
      }
    };

    fetchExtraction();
  }, [selectedPaper]);

  if (!selectedPaper) {
    return (
      <div className="panel-card">
        <div className="empty-inspector">
          <Icons.PaperReader width={36} height={36} />
          <h4>No Paper Selected</h4>
          <p>Select any paper from Literature Search or Knowledge Graph to view full text extraction and inspection details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container reader-view">
      <div className="reader-workspace">
        {/* Paper Sidebar Details */}
        <div className="reader-sidebar">
          <div>
            <span className="badge-mono badge-arxiv mb-2">
              {(selectedPaper.source || selectedPaper.provider || 'PDF').toUpperCase()}
            </span>
            <h3 className="inspector-title mt-2">{selectedPaper.title}</h3>
          </div>

          <div className="inspector-meta-list">
            <div className="inspector-meta-item">
              <span>Authors:</span>
              <strong>
                {Array.isArray(selectedPaper.authors) ? selectedPaper.authors.join(', ') : (selectedPaper.authors || 'Unknown')}
              </strong>
            </div>
            {selectedPaper.year && (
              <div className="inspector-meta-item">
                <span>Year:</span>
                <strong>{selectedPaper.year}</strong>
              </div>
            )}
          </div>

          {selectedPaper.pdf_url && (
            <a
              href={selectedPaper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full text-center"
            >
              <span>Download Original PDF</span>
            </a>
          )}
        </div>

        {/* Paper Main Viewport */}
        <div className="reader-viewport">
          <h3 className="panel-title mb-4">Paper Abstract & Extracted Content</h3>

          {selectedPaper.abstract && (
            <div className="mb-6">
              <h4>Abstract</h4>
              <p className="inspector-abstract mt-2">{selectedPaper.abstract}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-muted">
              <Icons.Refresh width={16} height={16} className="animate-spin" />
              <span>Extracting PDF text via Go microservice...</span>
            </div>
          )}

          {error && <div className="text-red-400 text-sm">{error}</div>}

          {extractedData && (
            <div className="extracted-text-body">
              <h4>Extracted Full Text</h4>
              <pre className="mt-2 text-xs font-mono bg-surface-elevated p-4 rounded border border-subtle overflow-x-auto">
                {extractedData.text || JSON.stringify(extractedData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
