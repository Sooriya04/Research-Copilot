import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Download,
  Folder,
  MessageSquare,
  BookOpen,
  FileText,
  Trash2,
  Send,
  X,
  Loader2,
  FolderOpen,
  Plus,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import MarkdownRenderer from '../components/common/MarkdownRenderer';

export default function LibraryView() {
  const navigate = useNavigate();
  const { setActiveReaderPaper } = useApp();
  const fileInputRef = useRef(null);
  const multiFileInputRef = useRef(null);

  // User's own library papers (empty by default)
  const [libraryPapers, setLibraryPapers] = useState(() => {
    try {
      const saved = localStorage.getItem('rc_user_library_papers_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // In-Library Search Filter
  const [searchFilter, setSearchFilter] = useState('');

  const filteredLibraryPapers = useMemo(() => {
    if (!searchFilter.trim()) return libraryPapers;
    const term = searchFilter.toLowerCase().trim();
    return libraryPapers.filter((p) => {
      const titleMatch = (p.title || '').toLowerCase().includes(term);
      const authorsMatch = (typeof p.authors === 'string' ? p.authors : (p.authors || []).join(' ')).toLowerCase().includes(term);
      const catMatch = (p.category || '').toLowerCase().includes(term);
      return titleMatch || authorsMatch || catMatch;
    });
  }, [libraryPapers, searchFilter]);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importQuery, setImportQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // AI Chat Drawer State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPaper, setChatPaper] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am your AI Research Assistant. Upload or import a paper to begin analyzing methodology, formulas, and results.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('rc_user_library_papers_v2', JSON.stringify(libraryPapers));
    } catch {}
  }, [libraryPapers]);

  // Action 1: Upload File
  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setImporting(true);
    setStatusMessage(`Uploading "${file.name}" & extracting metadata...`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/paper/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error((await res.text()) || 'Failed to upload PDF');
      }

      const data = await res.json();
      const paper = data.paper;

      const newPaperEntry = {
        id: paper.id || `uploaded-${Date.now()}`,
        title: paper.title || file.name.replace('.pdf', ''),
        authors: Array.isArray(paper.authors)
          ? paper.authors.map((a) => (typeof a === 'string' ? a : a.name)).join(', ')
          : (typeof paper.authors === 'string' ? paper.authors : 'Uploaded Author'),
        year: paper.year || new Date().getFullYear(),
        category: 'Uploaded PDF',
        desc: paper.abstract || 'Uploaded research document.',
        arxiv_id: paper.arxiv_id || '',
        url: paper.url || '',
        pdf_url: paper.pdf_url || '',
        markdown_content: paper.markdown || paper.markdown_content,
        file_size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        addedAt: new Date().toISOString().slice(0, 10),
      };

      setLibraryPapers((prev) => [newPaperEntry, ...prev.filter((p) => p.id !== newPaperEntry.id)]);
      setStatusMessage('');
    } catch (err) {
      alert(`Upload Error: ${err.message}`);
    } finally {
      setImporting(false);
      setStatusMessage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Action 2: Import via arXiv ID or URL
  const handleImportSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!importQuery.trim()) return;

    setImporting(true);
    setStatusMessage(`Resolving "${importQuery.trim()}" & importing paper...`);

    try {
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: importQuery.trim() }),
      });

      if (!res.ok) {
        throw new Error((await res.text()) || 'Import resolution failed');
      }

      const data = await res.json();
      const paper = data.paper;

      const newPaperEntry = {
        id: paper.id || `imported-${Date.now()}`,
        title: paper.title || importQuery.trim(),
        authors: Array.isArray(paper.authors)
          ? paper.authors.map((a) => (typeof a === 'string' ? a : a.name)).join(', ')
          : (typeof paper.authors === 'string' ? paper.authors : 'Author'),
        year: paper.year || 2024,
        category: paper.source || paper.primary_source || 'arXiv',
        desc: paper.abstract || 'Imported literature document.',
        arxiv_id: paper.arxiv_id || importQuery.trim(),
        url: paper.url || `https://arxiv.org/abs/${importQuery.trim()}`,
        pdf_url: paper.pdf_url || `https://arxiv.org/pdf/${importQuery.trim()}.pdf`,
        markdown_content: paper.markdown || paper.markdown_content,
        file_size: 'Online',
        addedAt: new Date().toISOString().slice(0, 10),
      };

      setLibraryPapers((prev) => [newPaperEntry, ...prev.filter((p) => p.id !== newPaperEntry.id)]);
      setShowImportModal(false);
      setImportQuery('');
    } catch (err) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
      setStatusMessage('');
    }
  };

  // Open Paper in Dedicated Library Reader
  const handleOpenPaper = (paper) => {
    try {
      localStorage.setItem('rc_active_library_paper', JSON.stringify(paper));
    } catch {}
    navigate('/library/reader');
  };

  // Start Chat on Paper
  const handleStartChat = (paper) => {
    setChatPaper(paper || null);
    setChatOpen(true);
    setChatMessages([
      {
        role: 'assistant',
        content: paper
          ? `I have loaded **${paper.title}** into our research conversation. You can ask about its architecture, mathematical formulations, benchmarks, or reproduction requirements.`
          : 'Hello! I am your AI Research Assistant. Upload or import a paper to begin analyzing methodology, formulas, and results.',
      },
    ]);
  };

  const handleCloseChat = () => {
    setChatOpen(false);
    setChatMessages([
      {
        role: 'assistant',
        content: 'Hello! I am your AI Research Assistant. Upload or import a paper to begin analyzing methodology, formulas, and results.',
      },
    ]);
    setChatPaper(null);
  };

  // Send Chat message
  const handleSendChat = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          paper_id: chatPaper?.id || '',
          paper_title: chatPaper?.title || '',
          paper_abstract: chatPaper?.desc || '',
        }),
      });

      if (!res.ok) throw new Error((await res.text()) || 'Failed to get response');
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleDeletePaper = (paperId, e) => {
    e.stopPropagation();
    setLibraryPapers((prev) => prev.filter((p) => p.id !== paperId));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-primary, #f8fafc)',
        color: 'var(--text-primary, #0f172a)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Hidden File Input — single PDF */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
      {/* Hidden File Input — multiple PDFs (Select files) */}
      <input
        ref={multiFileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          for (const file of files) {
            await handleFileUpload({ target: { files: [file] } });
          }
          if (multiFileInputRef.current) multiFileInputRef.current.value = '';
        }}
      />

      {/* Loading banner */}
      {importing && (
        <div
          style={{
            padding: '10px 18px',
            backgroundColor: '#eef2ff',
            borderBottom: '1px solid #c7d2fe',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#4338ca',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          <span>{statusMessage || 'Processing paper...'}</span>
        </div>
      )}

      {/* Main Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: libraryPapers.length === 0 ? 'center' : 'flex-start',
        }}
      >
        {libraryPapers.length === 0 ? (
          /* Minimal Center Empty State */
          <div
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: 380,
              margin: 'auto 0',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: 'var(--bg-subtle, #f1f5f9)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted, #64748b)',
                marginBottom: 12,
              }}
            >
              <Folder size={22} />
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #0f172a)', margin: '0 0 4px' }}>
              Your library is empty
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '0 0 16px' }}>
              Start chat or add files
            </p>

            {/* 4 Core Action Buttons: Upload, Import, Select files, Chat */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 16px',
                    borderRadius: 20,
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <Upload size={14} style={{ color: '#10b981' }} />
                  <span>Upload</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 16px',
                    borderRadius: 20,
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <Download size={14} style={{ color: '#8b5cf6' }} />
                  <span>Import</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => multiFileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 18px',
                    borderRadius: 20,
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <FolderOpen size={14} style={{ color: '#64748b' }} />
                  <span>Select files</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStartChat(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 18px',
                    borderRadius: 20,
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <MessageSquare size={14} style={{ color: '#4f46e5' }} />
                  <span>Chat</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* User Uploaded Papers List */
          <div style={{ width: '100%', maxWidth: 960 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                  Files in Library ({filteredLibraryPapers.length}{filteredLibraryPapers.length !== libraryPapers.length ? ` of ${libraryPapers.length}` : ''})
                </h3>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted, #64748b)' }} />
                  <input
                    type="text"
                    placeholder="Filter library files..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    style={{
                      padding: '6px 12px 6px 30px',
                      borderRadius: 6,
                      border: '1px solid var(--border-subtle, #cbd5e1)',
                      backgroundColor: 'var(--bg-card, #ffffff)',
                      color: 'var(--text-primary, #0f172a)',
                      fontSize: 12.5,
                      outline: 'none',
                      width: 210,
                    }}
                  />
                  {searchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 6,
                    backgroundColor: '#4f46e5',
                    color: '#ffffff',
                    fontSize: 12.5,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 6,
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Download size={13} style={{ color: '#8b5cf6' }} />
                  <span>Import</span>
                </button>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px 16px' }}>Name</th>
                    <th style={{ padding: '10px 16px' }}>Source</th>
                    <th style={{ padding: '10px 16px' }}>Date Added</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLibraryPapers.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted, #64748b)' }}>
                        No files matching "{searchFilter}" in library.
                      </td>
                    </tr>
                  ) : (
                    filteredLibraryPapers.map((paper) => (
                    <tr
                      key={paper.id}
                      onClick={() => handleOpenPaper(paper)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileText size={15} style={{ color: '#4f46e5' }} />
                          <span>{paper.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>
                          {paper.category || 'PDF'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{paper.addedAt}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPaper(paper);
                            }}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: 11.5, padding: '4px 10px' }}
                          >
                            Read
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartChat(paper);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 11.5, padding: '4px 10px' }}
                          >
                            Chat
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePaper(paper.id, e)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 24,
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Download size={18} style={{ color: '#8b5cf6' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Import Paper into Library
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px', lineHeight: 1.4 }}>
              Enter an arXiv identifier (e.g. <code>1706.03762</code>, <code>2312.00752</code>) or any paper URL/DOI.
            </p>

            <form onSubmit={handleImportSubmit}>
              <input
                type="text"
                value={importQuery}
                onChange={(e) => setImportQuery(e.target.value)}
                placeholder="e.g. 1706.03762 or https://arxiv.org/abs/2312.00752"
                autoFocus
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  fontSize: 13,
                  marginBottom: 16,
                  outline: 'none',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 6,
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    color: '#475569',
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || !importQuery.trim()}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    background: '#4f46e5',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Import Paper</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Chat Drawer */}
      {chatOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 440,
            maxWidth: '100%',
            backgroundColor: '#ffffff',
            borderLeft: '1px solid #e2e8f0',
            zIndex: 90,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc',
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                AI Research Assistant
              </h4>
              {chatPaper && (
                <span style={{ fontSize: 11.5, color: '#64748b', maxWidth: 260, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chatPaper.title}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleCloseChat}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              backgroundColor: '#ffffff',
            }}
          >
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  backgroundColor: msg.role === 'user' ? '#4f46e5' : '#f1f5f9',
                  color: msg.role === 'user' ? '#ffffff' : '#0f172a',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <MarkdownRenderer content={msg.content} />
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4f46e5', fontSize: 12.5, padding: '6px 0' }}>
                <Loader2 size={15} className="animate-spin" />
                <span>Analyzing paper context...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSendChat}
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              gap: 8,
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question about your research..."
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 6,
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              style={{
                padding: '0 14px',
                borderRadius: 6,
                backgroundColor: '#4f46e5',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
