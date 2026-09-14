import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Sparkles,
  Paperclip,
  Upload,
  BookOpen,
  FolderKanban,
  Trash2,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  ExternalLink,
  Cpu,
  Layers,
  FileText,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import MarkdownRenderer from '../components/common/MarkdownRenderer';

const QUICK_PROMPTS = [
  {
    title: 'Methodology Deep-Dive',
    prompt: 'Break down the core mathematical formulation, architectural innovations, and methodological steps introduced in this paper.',
  },
  {
    title: 'Empirical SOTA Benchmarks',
    prompt: 'Extract all quantitative evaluation metrics, dataset benchmarks, and baseline performance comparisons reported in the paper.',
  },
  {
    title: 'Research Gaps & Limitations',
    prompt: 'Identify the key limitations, unaddressed assumptions, failure modes, and open research directions highlighted by this work.',
  },
  {
    title: 'Formula Explanations',
    prompt: 'Explain the key mathematical equations and loss functions in this paper step-by-step with KaTeX formulas.',
  },
  {
    title: 'Reproduction Plan',
    prompt: 'Generate a step-by-step experiment reproduction plan: required compute budget, environment dependencies, hyperparameters, and datasets.',
  },
];

export default function ChatView() {
  const navigate = useNavigate();
  const {
    activeWorkspace,
    activeReaderPaper,
    setActiveReaderPaper,
    createWorkspace,
    openWorkspaceModal,
  } = useApp();

  const [messages, setMessages] = useState(() => {
    try {
      const wsId = activeWorkspace?.id || 'default';
      const saved = localStorage.getItem(`rc_chat_history_${wsId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'init-1',
        role: 'assistant',
        content: `### Welcome to Research Copilot AI Research Assistant
I am your autonomous AI Research Engineer. Ask me any research question, discuss mathematical architectures, or upload a paper:
- **Dissect complex mathematical architectures** and derivations ($$W_q, W_k, W_v$$ attention mechanisms).
- **Compare empirical results** across SOTA benchmark leaderboards.
- **Identify literature gaps** and formulate testable research hypotheses.
- **Generate reproducible experiment plans** and code implementations.

${
  activeReaderPaper
    ? `**Active Grounding Document**: *${activeReaderPaper.title}*\n\nAsk any question about this publication or select a prompt below.`
    : activeWorkspace
    ? `**Workspace Context**: *${activeWorkspace.title}*\n\nAsk a question or upload a PDF below to analyze.`
    : `Type a question or select a prompt below to get started.`
}`,
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Persist chat per active workspace
  useEffect(() => {
    if (activeWorkspace?.id) {
      localStorage.setItem(`rc_chat_history_${activeWorkspace.id}`, JSON.stringify(messages));
    }
  }, [messages, activeWorkspace?.id]);

  const handleSendMessage = async (textToSend = null) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);

    try {
      // Prepare payload with grounding context
      const chatPayload = {
        messages: newHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        workspace_topic: activeWorkspace?.title || null,
        paper_title: activeReaderPaper?.title || null,
        paper_abstract: activeReaderPaper?.abstract || null,
        paper_markdown: activeReaderPaper?.markdown_content || activeReaderPaper?.markdown || null,
        model: 'gemini-2.0-flash-lite',
      };

      const res = await fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload),
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          paper_referenced: data.paper_referenced,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        const errTxt = await res.text();
        const errorMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `An error occurred while generating the research analysis: ${errTxt}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err) {
      const errorMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Network error connecting to AI Research engine: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMessage = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear this research chat history?')) {
      setMessages([
        {
          id: 'init-fresh',
          role: 'assistant',
          content: `### Research Session Cleared\nReady for new queries grounded on **${activeWorkspace?.title || 'Scientific Literature'}**.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }

    setUploadingPdf(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (activeWorkspace?.title) {
      formData.append('topic', activeWorkspace.title);
    }

    try {
      const res = await fetch('/api/v1/paper/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const paper = data.paper;

        setActiveReaderPaper(paper);

        // Add upload confirmation message to chat
        const uploadConfirmation = {
          id: `system-${Date.now()}`,
          role: 'assistant',
          content: `### Document Ingested: "${paper.title}"
Successfully parsed **${paper.total_pages || 1} pages** and extracted **${(paper.figures || []).length} embedded figures/tables** into structured Markdown.

- **Authors**: ${paper.authors ? (Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors) : 'Extracted from PDF'}
- **Year**: ${paper.year || 2024}
- **Sections**: ${(paper.sections || []).map((s) => s.title).join(' • ') || 'Full Document'}

I am now grounded on this paper. Ask any methodological questions or review the full document in the **[Paper Reader](/pdf-inspector)**.`,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, uploadConfirmation]);
      } else {
        const errTxt = await res.text();
        setUploadError(`Failed to parse PDF: ${errTxt}`);
      }
    } catch (err) {
      setUploadError(`Upload network error: ${err.message}`);
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <section id="view-chat" className="view-panel active" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)' }}>
      {/* Header bar */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              color: 'var(--accent-primary)',
            }}
          >
            <MessageSquare size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                AI Research Engineering Assistant
              </h1>
              <span className="badge badge-emerald" style={{ fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                <span>Agentic RAG Grounded</span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>Workspace: <strong>{activeWorkspace?.title || 'Global'}</strong></span>
              {activeReaderPaper && (
                <>
                  <span>•</span>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                    Active Paper: {activeReaderPaper.title}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeReaderPaper && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/pdf-inspector')}
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <FileText size={13} />
              <span>Open in Reader</span>
            </button>
          )}

          <label
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
          >
            <Upload size={13} />
            <span>{uploadingPdf ? 'Parsing PDF...' : 'Attach PDF'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handlePdfUpload}
              disabled={uploadingPdf}
              style={{ display: 'none' }}
            />
          </label>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleClearChat}
            style={{ fontSize: 12, color: 'var(--text-muted)' }}
            title="Clear Chat History"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {uploadError && (
        <div style={{ padding: '8px 14px', marginBottom: 10, borderRadius: 6, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: 'var(--accent-rose)', fontSize: 12.5 }}>
          {uploadError}
        </div>
      )}

      {/* Main Chat Thread */}
      <div
        className="card"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          marginBottom: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          borderRadius: 'var(--radius-md)',
        }}
      >
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id || idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                }}
              >
                <span>{isUser ? 'You (Researcher)' : 'Research Copilot AI'}</span>
                <span>•</span>
                <span>{new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div
                className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-bot'}`}
                style={{
                  maxWidth: isUser ? '80%' : '100%',
                  padding: isUser ? '12px 16px' : '18px 22px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser ? 'var(--accent-primary, #6366f1)' : 'var(--bg-subtle, #1c1c20)',
                  color: isUser ? '#ffffff' : 'var(--text-primary)',
                  border: isUser ? 'none' : '1px solid var(--border-subtle)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                  position: 'relative',
                  lineHeight: 1.6,
                }}
              >
                {isUser ? (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{msg.content}</div>
                ) : (
                  <div>
                    <MarkdownRenderer content={msg.content} />
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.content, idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: 11.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {copiedIndex === idx ? <Check size={12} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={12} />}
                        <span>{copiedIndex === idx ? 'Copied' : 'Copy Answer'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 10, width: 'fit-content', border: '1px solid var(--border-subtle)' }}>
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Synthesizing scientific literature, citations, and mathematical formulas...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Research Prompts */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={12} style={{ color: 'var(--accent-primary)' }} />
          <span>Quick Prompts:</span>
        </span>
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleSendMessage(qp.prompt)}
            disabled={loading}
            style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap' }}
          >
            <span>{qp.title}</span>
          </button>
        ))}
      </div>

      {/* Input Box Bar */}
      <div
        className="card"
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach PDF file"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Paperclip size={17} />
        </button>

        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={
            activeReaderPaper
              ? `Ask anything about "${activeReaderPaper.title}" (Press Enter to send)...`
              : 'Ask a research question, enter methodology queries, or request benchmark comparisons...'
          }
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13.5,
            fontFamily: 'inherit',
            resize: 'none',
            padding: '6px 0',
          }}
        />

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleSendMessage()}
          disabled={loading || !input.trim()}
          style={{
            padding: '7px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          <span>Send</span>
          <Send size={13} />
        </button>
      </div>
    </section>
  );
}
