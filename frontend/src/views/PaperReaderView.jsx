import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Upload,
  Loader2,
  BookOpen,
  ExternalLink,
  Download,
  FileText,
  ArrowLeft,
  MessageSquare,
  Search,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  Code2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PaperReaderSidebar from '../components/reader/PaperReaderSidebar';
import { EvidenceHighlightBanner } from '../components/reader/EvidenceDrawer';
import {
  convertPdfToHtmlPages,
  downloadStandaloneHtmlFile,
  createFallbackPdfBuffer,
} from '../utils/pdfWasmConverter';
import {
  loadCachedPaperPages,
  cacheConvertedPaperPages,
  clearPaperPagesCache,
} from '../utils/paperPageCache';

function extractArxivId(idStr) {
  if (!idStr) return null;
  const s = String(idStr).trim();
  const urlMatch = s.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})(?:\.pdf)?/i);
  if (urlMatch) return urlMatch[1];
  const prefixMatch = s.match(/^arxiv:\s*([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})$/i);
  if (prefixMatch) return prefixMatch[1];
  const exactMatch = s.match(/^([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)$/i);
  if (exactMatch) return exactMatch[1];
  const oldExact = s.match(/^([a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7})$/i);
  if (oldExact) return oldExact[1];
  return null;
}

function buildProxyPdfUrl(directUrl) {
  if (!directUrl) return null;
  const t = String(directUrl).trim();
  if (t.startsWith('blob:') || t.startsWith('data:')) return t;
  if (t.startsWith('/api/v1/')) return t;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return `/api/v1/pdf/proxy?url=${encodeURIComponent(t)}`;
  }
  return null;
}

function resolvePaperPdf(paper) {
  if (!paper) return null;
  if (paper.pdf_url) {
    const u = String(paper.pdf_url).trim();
    if (u.startsWith('blob:') || u.startsWith('data:')) return u;
    if (u.startsWith('/api/v1/')) return u;
    if (u.includes('arxiv.org/')) {
      const aid = extractArxivId(u);
      if (aid) return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
    }
    if (u.startsWith('http://') || u.startsWith('https://')) {
      return buildProxyPdfUrl(u);
    }
  }
  if (paper.arxiv_id) {
    const aid = extractArxivId(paper.arxiv_id);
    if (aid) return buildProxyPdfUrl(`https://arxiv.org/pdf/${aid}.pdf`);
  }
  const fromId = extractArxivId(paper.id);
  if (fromId) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromId}.pdf`);
  const fromCanonical = extractArxivId(paper.canonical_id);
  if (fromCanonical) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromCanonical}.pdf`);
  const fromUrl = extractArxivId(paper.url);
  if (fromUrl) return buildProxyPdfUrl(`https://arxiv.org/pdf/${fromUrl}.pdf`);
  if (paper.doi) {
    return `/api/v1/pdf/preprint?identifier=${encodeURIComponent(paper.doi)}`;
  }
  if (paper.id && !paper.id.startsWith('raw:')) {
    return `/api/v1/pdf/preprint?identifier=${encodeURIComponent(paper.id)}`;
  }
  return null;
}

function isEvidenceItem(item, pageNum, activeHighlight) {
  if (!activeHighlight) return false;
  if (activeHighlight.page && Number(activeHighlight.page) !== pageNum) return false;
  const quote = (activeHighlight.quote || activeHighlight.text || '').trim().toLowerCase();
  if (!quote) return false;
  const s = (item.str || '').trim().toLowerCase();
  if (s.length < 3) return false;
  if (quote.includes(s)) return true;
  const words = s.split(/\s+/).filter((w) => w.length >= 5);
  if (words.length > 0 && words.some((w) => quote.includes(w))) return true;
  return false;
}

const SAMPLE_PAPERS = [
  {
    title: 'HalluCounter: Towards Holistic Hallucination Evaluation',
    arxiv_id: '2503.04615',
    authors: ['Sooriya et al.'],
    year: '2025',
    abstract: 'HalluCounter provides fine-grained, holistic evaluation and detection for hallucinations in large language models.',
  },
  {
    title: 'Attention Is All You Need',
    arxiv_id: '1706.03762',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
    year: '2017',
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, based solely on attention mechanisms.',
  },
  {
    title: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via RL',
    arxiv_id: '2501.12948',
    authors: ['DeepSeek-AI'],
    year: '2025',
    abstract: 'We present DeepSeek-R1, which demonstrates that reasoning capabilities can be incentivized directly through large-scale reinforcement learning.',
  },
  {
    title: 'LoRA: Low-Rank Adaptation of Large Language Models',
    arxiv_id: '2106.09685',
    authors: ['Edward J. Hu', 'Yelong Shen', 'Phillip Wallis', 'Zeyuan Allen-Zhu'],
    year: '2021',
    abstract: 'An efficient adaptation strategy that freezes pretrained model weights and injects trainable rank decomposition matrices.',
  },
];

export default function PaperReaderView() {
  const navigate = useNavigate();
  const { activeReaderPaper, setActiveReaderPaper } = useApp();

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvingPdf, setResolvingPdf] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Document Toolbar Controls
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(false);
  const [viewMode, setViewMode] = useState('continuous'); // 'continuous' | 'single'
  const [inDocSearch, setInDocSearch] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState(null);

  // Progressive WebAssembly conversion states
  const [convertedPages, setConvertedPages] = useState([]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({ percent: 0, status: '' });
  const [conversionError, setConversionError] = useState(null);

  // In-Doc Search matching
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [searchCurrentMatchIdx, setSearchCurrentMatchIdx] = useState(0);

  const canvasRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(860);

  // Measure container for crisp Fit Width calculation
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const handleHighlightEvidence = async (evidence) => {
    if (!evidence) return;
    setActiveHighlight(evidence);
    const targetPage = Number(evidence.page) || 1;
    setCurrentPage(targetPage);
    if (viewMode === 'continuous') {
      setTimeout(() => {
        const el = document.getElementById(`wasm-pdf-page-${targetPage}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }

    // If highlight_rects are missing but excerpt exists, query deterministic verifier
    if ((!evidence.highlight_rects || evidence.highlight_rects.length === 0) && (evidence.quote || evidence.text)) {
      const pId = currentDoc?.arxiv_id || currentDoc?.id;
      if (pId) {
        try {
          const res = await fetch('/api/v1/evidence/verify-excerpt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paper_id: pId,
              page: targetPage,
              excerpt: evidence.quote || evidence.text,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.highlight_rects && data.highlight_rects.length > 0) {
              setActiveHighlight((prev) =>
                prev ? { ...prev, highlight_rects: data.highlight_rects, page: data.verified_page || prev.page } : prev
              );
            }
          }
        } catch (e) {
          // Fallback to text span highlighting
        }
      }
    }
  };


  const handleExportHtml = () => {
    if (convertedPages.length === 0 || exportingHtml) return;
    setExportingHtml(true);
    try {
      downloadStandaloneHtmlFile(convertedPages, downloadFilename.replace(/\.pdf$/i, '.html'));
    } catch (err) {
      console.error('HTML export failed:', err);
      alert('HTML export failed: ' + err.message);
    } finally {
      setExportingHtml(false);
      setMoreMenuOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (moreMenuOpen && !e.target.closest('.reader-dropdown-container')) {
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [moreMenuOpen]);

  // Resolve PDF url from OA lookup when no direct link
  const fetchOaCandidate = (lookupQuery) => {
    if (!lookupQuery) return;
    setResolvingPdf(true);
    fetch(`/api/v1/paper/${encodeURIComponent(lookupQuery)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.paper?.pdf_url) {
          const proxied = resolvePaperPdf(data.paper);
          if (proxied) {
            setCurrentDoc((prev) => (prev ? { ...prev, ...data.paper, pdfUrl: proxied } : data.paper));
            return;
          }
        }
        if (data?.candidates?.length > 0) {
          const best = data.candidates.find((c) => c.format === 'pdf') || data.candidates[0];
          if (best?.url) {
            const proxied = resolvePaperPdf({ ...data.paper, pdf_url: best.url });
            if (proxied) {
              setCurrentDoc((prev) => (prev ? { ...prev, pdfUrl: proxied } : null));
              return;
            }
          }
        }
        // Fallback publication preprint buffer endpoint
        const fallbackUrl = `/api/v1/pdf/preprint?identifier=${encodeURIComponent(lookupQuery)}`;
        setCurrentDoc((prev) => (prev ? { ...prev, pdfUrl: fallbackUrl } : null));
      })
      .catch(() => {
        const fallbackUrl = `/api/v1/pdf/preprint?identifier=${encodeURIComponent(lookupQuery)}`;
        setCurrentDoc((prev) => (prev ? { ...prev, pdfUrl: fallbackUrl } : null));
      })
      .finally(() => {
        setResolvingPdf(false);
      });
  };

  useEffect(() => {
    // If activeReaderPaper exists in context, load it
    if (activeReaderPaper) {
      const pId =
        activeReaderPaper.id ||
        activeReaderPaper.arxiv_id ||
        activeReaderPaper.canonical_id ||
        '';
      const cleanArxiv =
        extractArxivId(pId) ||
        extractArxivId(activeReaderPaper.arxiv_id) ||
        extractArxivId(activeReaderPaper.url);
      const pdfLink = resolvePaperPdf(activeReaderPaper);

      setCurrentDoc({ ...activeReaderPaper, pdfUrl: pdfLink });
      setInputVal(cleanArxiv || activeReaderPaper.title || pId);

      if (!pdfLink) {
        setResolvingPdf(true);
        fetchOaCandidate(cleanArxiv || activeReaderPaper.doi || pId || activeReaderPaper.title);
      } else {
        setResolvingPdf(false);
      }
      return;
    }

    // Check localStorage fallback for library paper
    try {
      const saved = localStorage.getItem('rc_active_library_paper');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.title || parsed?.id || parsed?.arxiv_id) {
          const pdfLink = resolvePaperPdf(parsed);
          setCurrentDoc({ ...parsed, pdfUrl: pdfLink });
          if (!pdfLink) {
            fetchOaCandidate(parsed.arxiv_id || parsed.doi || parsed.id || parsed.title);
          }
        }
      }
    } catch {}

    // Ensure paper RAG chunks & embeddings are indexed in SQLite
    const activeDoc = activeReaderPaper || (localStorage.getItem('rc_active_library_paper') ? JSON.parse(localStorage.getItem('rc_active_library_paper')) : null);
    const paperId = activeDoc?.id || activeDoc?.arxiv_id;
    if (paperId) {
      fetch(`/api/v1/papers/${encodeURIComponent(paperId)}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeDoc.title || 'Research Paper',
          abstract: activeDoc.abstract || '',
          pages: activeDoc.sections?.map((s, idx) => ({
            page_number: idx + 1,
            text: `${s.title}\n\n${s.content}`,
          })) || null,
          doi: activeDoc.doi || null,
          arxiv_id: activeDoc.arxiv_id || null,
          authors: Array.isArray(activeDoc.authors) ? activeDoc.authors : [],
        }),
      }).catch(() => {});
    }
  }, [activeReaderPaper]);

  // ─── Progressive WebAssembly Conversion Engine ───────────────────────────
  useEffect(() => {
    if (!currentDoc) {
      setConvertedPages([]);
      setIsConverting(false);
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const runWasmConversion = async () => {
      setIsConverting(true);
      setConversionError(null);
      setConversionProgress({ percent: 5, status: 'Initializing WebAssembly runtime...' });
      setConvertedPages([]);

      // 0. Check Dual-Layer Cache (IndexedDB & Redis Backend)
      try {
        const cached = await loadCachedPaperPages(currentDoc, abortController.signal);
        if (cached?.data?.pages?.length > 0) {
          if (!isMounted) return;
          setConvertedPages(cached.data.pages);
          setTotalPages(cached.data.numPages || cached.data.pages.length);
          setIsConverting(false);
          return;
        }
      } catch (cacheErr) {
        if (abortController.signal.aborted) return;
      }

      // 1. Resolve source
      let source = currentDoc.pdfUrl || resolvePaperPdf(currentDoc);
      if (!source) {
        if (currentDoc.doi) {
          source = `/api/v1/pdf/preprint?identifier=${encodeURIComponent(currentDoc.doi)}`;
        } else if (currentDoc.id && !currentDoc.id.startsWith('raw:')) {
          source = `/api/v1/pdf/preprint?identifier=${encodeURIComponent(currentDoc.id)}`;
        } else {
          source = currentDoc;
        }
      }

      const accumulatedPages = [];
      try {
        const convResult = await convertPdfToHtmlPages(
          source,
          {
            scale: 1.8,
            maxPages: 40,
            signal: abortController.signal,
            paperFallback: currentDoc,
            onPageRendered: (pageData, pageNum, totalDocPages) => {
              if (!isMounted) return;
              if (!accumulatedPages.some((p) => p.pageNumber === pageData.pageNumber)) {
                accumulatedPages.push(pageData);
              }
              setConvertedPages((prev) => {
                if (prev.some((p) => p.pageNumber === pageData.pageNumber)) return prev;
                const next = [...prev, pageData].sort((a, b) => a.pageNumber - b.pageNumber);
                return next;
              });
              setTotalPages(totalDocPages);
            },
          },
          (percent, statusMsg) => {
            if (!isMounted) return;
            setConversionProgress({ percent, status: statusMsg });
          }
        );

        if (isMounted) {
          const finalPages = (convResult?.pages?.length > 0 ? convResult.pages : accumulatedPages).slice();
          finalPages.sort((a, b) => a.pageNumber - b.pageNumber);
          if (finalPages.length > 0) {
            cacheConvertedPaperPages(currentDoc, finalPages, convResult?.numPages || finalPages.length, currentDoc.title);
          }
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.warn('WASM conversion with primary source encountered issue, falling back to preprint buffer:', err);
        accumulatedPages.length = 0;
        setConvertedPages([]);
        try {
          const fallbackBytes = createFallbackPdfBuffer(currentDoc);
          const fallbackResult = await convertPdfToHtmlPages(
            fallbackBytes,
            {
              scale: 1.8,
              maxPages: 40,
              onPageRendered: (pageData, pageNum, totalDocPages) => {
                if (!isMounted) return;
                if (!accumulatedPages.some((p) => p.pageNumber === pageData.pageNumber)) {
                  accumulatedPages.push(pageData);
                }
                setConvertedPages((prev) => {
                  if (prev.some((p) => p.pageNumber === pageData.pageNumber)) return prev;
                  return [...prev, pageData].sort((a, b) => a.pageNumber - b.pageNumber);
                });
                setTotalPages(totalDocPages);
              },
            },
            (percent, statusMsg) => {
              if (!isMounted) return;
              setConversionProgress({ percent, status: statusMsg });
            }
          );

          if (isMounted) {
            const finalPages = (fallbackResult?.pages?.length > 0 ? fallbackResult.pages : accumulatedPages).slice();
            finalPages.sort((a, b) => a.pageNumber - b.pageNumber);
            if (finalPages.length > 0) {
              cacheConvertedPaperPages(currentDoc, finalPages, fallbackResult?.numPages || finalPages.length, currentDoc.title);
            }
          }
        } catch (fallbackErr) {
          if (!isMounted) return;
          setConversionError(`Document conversion failed: ${fallbackErr.message}`);
        }
      } finally {
        if (isMounted) {
          setIsConverting(false);
        }
      }
    };

    runWasmConversion();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [currentDoc?.pdfUrl, currentDoc?.id, currentDoc?.doi, currentDoc?.arxiv_id, currentDoc?.title]);

  // Track active page during continuous scroll
  useEffect(() => {
    if (viewMode !== 'continuous' || convertedPages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestEntry = null;
        let maxRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            bestEntry = entry;
          }
        }
        if (bestEntry) {
          const pageNum = Number(bestEntry.target.getAttribute('data-page-number'));
          if (pageNum && !isNaN(pageNum)) {
            setCurrentPage(pageNum);
          }
        }
      },
      {
        root: null,
        rootMargin: '-10% 0px -40% 0px',
        threshold: [0.1, 0.3, 0.5, 0.7],
      }
    );

    const pageEls = document.querySelectorAll('.wasm-pdf-page');
    pageEls.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [viewMode, convertedPages.length]);

  const handleJumpToPage = (newPage) => {
    const target = Math.max(1, Math.min(totalPages, newPage));
    setCurrentPage(target);
    if (viewMode === 'continuous') {
      const el = document.getElementById(`wasm-pdf-page-${target}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Real-time search highlighting counter
  const searchLower = inDocSearch.trim().toLowerCase();

  useEffect(() => {
    if (!searchLower) {
      setSearchMatchCount(0);
      return;
    }
    let count = 0;
    for (const page of convertedPages) {
      for (const item of page.textItems || []) {
        if (item.str && item.str.toLowerCase().includes(searchLower)) {
          count++;
        }
      }
    }
    setSearchMatchCount(count);
  }, [searchLower, convertedPages]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const matchElements = document.querySelectorAll('.wasm-pdf-text-span.pdf-highlight-search');
      if (matchElements.length > 0) {
        const nextIdx = (searchCurrentMatchIdx + 1) % matchElements.length;
        setSearchCurrentMatchIdx(nextIdx);
        matchElements[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleExtract = async (overrideQuery) => {
    const query = (overrideQuery || inputVal).trim();
    if (!query || loading) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/paper/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: query }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveReaderPaper(data.paper);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.detail || 'Failed to import paper.');
      }
    } catch (err) {
      setErrorMessage(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/paper/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const paper = await res.json();
        paper.pdf_url = URL.createObjectURL(file);
        paper.markdown_content = paper.markdown;
        setActiveReaderPaper(paper);
      } else {
        setErrorMessage(`Upload error: ${await res.text()}`);
      }
    } catch (err) {
      setErrorMessage(`Upload error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = (sample) => {
    setInputVal(sample.arxiv_id);
    setActiveReaderPaper(sample);
  };

  const formatAuthors = (authors) => {
    if (!authors) return 'Academic Authors';
    if (typeof authors === 'string') return authors;
    if (Array.isArray(authors)) {
      const list = authors
        .map((a) => {
          if (!a) return '';
          if (typeof a === 'string') return a.trim();
          if (typeof a === 'object') return (a.name || a.author || a.display_name || '').trim();
          return String(a).trim();
        })
        .filter(Boolean);
      return list.length > 0 ? list.join(', ') : 'Academic Authors';
    }
    return String(authors);
  };

  const handleCopyBibtex = () => {
    if (!currentDoc) return;
    const authorList = Array.isArray(currentDoc.authors)
      ? currentDoc.authors
          .map((a) => (typeof a === 'object' && a ? a.name || a.author || a.display_name || '' : String(a)))
          .filter(Boolean)
      : [typeof currentDoc.authors === 'string' ? currentDoc.authors : 'Unknown'];
    const firstAuthor = (authorList[0] || 'author').split(' ').pop().toLowerCase();
    const year = currentDoc.year || '2025';
    const bib = `@article{${firstAuthor}${year},
  title={${currentDoc.title || 'Untitled'}},
  author={${authorList.join(' and ')}},
  journal={arXiv preprint arXiv:${cleanArxiv || ''}},
  year={${year}}
}`;
    navigator.clipboard.writeText(bib);
    setCopiedBibtex(true);
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  const handleCopyLink = () => {
    if (!currentDoc) return;
    const link = currentDoc.url || (currentDoc.arxiv_id ? `https://arxiv.org/abs/${currentDoc.arxiv_id}` : window.location.href);
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Metadata labels
  const cleanArxiv =
    currentDoc &&
    (extractArxivId(currentDoc.arxiv_id) ||
      extractArxivId(currentDoc.id) ||
      extractArxivId(currentDoc.url));
  const doi = currentDoc?.doi;
  const badgeLabel = cleanArxiv ? `arXiv: ${cleanArxiv}` : doi ? `DOI: ${doi}` : 'Preprint';
  const badgeUrl = cleanArxiv
    ? `https://arxiv.org/abs/${cleanArxiv}`
    : doi
    ? `https://doi.org/${doi}`
    : currentDoc?.url;

  const authorsText = formatAuthors(currentDoc?.authors);

  const downloadFilename = currentDoc?.title
    ? `${currentDoc.title.slice(0, 36).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    : 'research_paper.pdf';

  // Scale calculation
  const firstPage = convertedPages[0];
  const basePageWidth = firstPage?.width || 612;
  const displayScale = fitWidth
    ? Math.min(2.2, Math.max(0.6, (containerWidth - 48) / basePageWidth))
    : zoom / 100;

  const pagesToDisplay =
    viewMode === 'continuous'
      ? convertedPages
      : convertedPages.filter((p) => p.pageNumber === currentPage);

  // ─── No paper: show clean reading desk empty state ─────────────────────────
  if (!currentDoc) {
    return (
      <div className="reader-workspace-root">
        <div className="reader-center-panel">
          {/* Top Bar Placeholder */}
          <div className="reader-topbar">
            <div className="reader-topbar-left">
              <button
                type="button"
                className="reader-topbar-btn"
                onClick={() => navigate(-1)}
                title="Back"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <div className="reader-meta-divider" />
              <h1 className="reader-paper-title" style={{ color: 'var(--text-muted)' }}>
                Paper Reader Workspace
              </h1>
            </div>
            <div className="reader-topbar-right">
              <button
                type="button"
                className={`reader-topbar-btn ${sidebarOpen ? 'active' : ''}`}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <MessageSquare size={13} />
                <span>AI Copilot</span>
              </button>
            </div>
          </div>

          {/* Reading Canvas with Minimal Desk Card */}
          <div className="reader-canvas" style={{ alignItems: 'center' }}>
            <div className="reader-empty-sheet">
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'rgba(99, 102, 241, 0.08)',
                    color: 'var(--accent-violet, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <FileText size={22} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                  Research Paper Reader
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Render any publication directly as HTML pages using WebAssembly — enter an arXiv ID, DOI, URL, or upload a PDF.
                </p>
              </div>

              {/* Input Row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                  placeholder="arXiv ID (e.g. 2503.04615, 1706.03762), DOI (e.g. 10.1561/1500000061)..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 8,
                    fontSize: 13,
                    background: 'var(--bg-subtle, #f4f4f5)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="reader-topbar-btn primary"
                  onClick={() => handleExtract()}
                  disabled={loading}
                  style={{ padding: '0 14px', height: 38 }}
                >
                  <Sparkles size={14} />
                  <span>{loading ? 'Loading…' : 'Read Paper'}</span>
                </button>
                <label
                  className="reader-topbar-btn"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 38,
                    padding: '0 12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    background: 'var(--bg-card, #ffffff)',
                  }}
                >
                  <Upload size={14} />
                  <span>Upload PDF</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--accent-violet, #6366f1)', marginBottom: 16 }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Resolving publication and open-access stream…</span>
                </div>
              )}

              {errorMessage && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontSize: 12.5, marginBottom: 16 }}>
                  {errorMessage}
                </div>
              )}

              {/* Quick Sample Papers */}
              <div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 10 }}>
                  Quick Start Sample Papers
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SAMPLE_PAPERS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleLoadSample(sample)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border-subtle, #e2e8f0)',
                        background: 'var(--bg-card, #ffffff)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-violet, #6366f1)';
                        e.currentTarget.style.background = 'var(--bg-subtle, #f8fafc)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-subtle, #e2e8f0)';
                        e.currentTarget.style.background = 'var(--bg-card, #ffffff)';
                      }}
                    >
                      <div style={{ minWidth: 0, paddingRight: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {sample.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {sample.authors.join(', ')} • {sample.year}
                        </div>
                      </div>
                      <span className="reader-arxiv-badge">
                        arXiv:{sample.arxiv_id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Assistant Panel */}
        {sidebarOpen && (
          <PaperReaderSidebar
            paper={null}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>
    );
  }

  // ─── Paper Loaded: Full WebAssembly PDF-to-HTML Reader ─────────────────────
  return (
    <div className="reader-workspace-root">
      <div className="reader-center-panel">
        {/* ── 1. Clean Top Bar ── */}
        <div className="reader-topbar">
          <div className="reader-topbar-left">
            <button
              type="button"
              className="reader-topbar-btn"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  setCurrentDoc(null);
                }
              }}
              title="Back"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>

            <div className="reader-meta-divider" />

            {/* Paper Title & Authors */}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <h1 className="reader-paper-title" title={currentDoc.title || 'Untitled Document'}>
                {currentDoc.title || 'Untitled Document'}
              </h1>
              <span className="reader-paper-authors" title={authorsText}>
                {authorsText}
              </span>
            </div>

            {/* arXiv / DOI Badge */}
            {badgeUrl ? (
              <a
                href={badgeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="reader-arxiv-badge"
                title={`Open publication link (${badgeLabel})`}
              >
                <FileText size={11} />
                <span>{badgeLabel}</span>
              </a>
            ) : (
              <span className="reader-arxiv-badge">
                <FileText size={11} />
                <span>{badgeLabel}</span>
              </span>
            )}
          </div>

          <div className="reader-topbar-right">
            {/* Quick search to switch papers */}
            <div className="reader-quick-search" title="Load another paper by arXiv ID, DOI, or title">
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                placeholder="arXiv / DOI..."
              />
            </div>

            {/* Download Button */}
            {currentDoc.pdfUrl && (
              <a
                href={currentDoc.pdfUrl}
                download={downloadFilename}
                className="reader-topbar-btn"
                title="Download PDF"
              >
                <Download size={13} />
                <span>Download</span>
              </a>
            )}

            {/* More Actions Dropdown */}
            <div className="reader-dropdown-container" style={{ position: 'relative' }}>
              <button
                type="button"
                className="reader-topbar-btn"
                onClick={() => setMoreMenuOpen((v) => !v)}
                title="More actions"
              >
                <MoreHorizontal size={14} />
                <span>More</span>
              </button>

              {moreMenuOpen && (
                <div className="reader-dropdown-menu">
                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={handleCopyBibtex}
                  >
                    {copiedBibtex ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                    <span>{copiedBibtex ? 'BibTeX Copied' : 'Copy BibTeX Citation'}</span>
                  </button>

                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={handleCopyLink}
                  >
                    {copiedLink ? <Check size={13} style={{ color: '#10b981' }} /> : <ExternalLink size={13} />}
                    <span>{copiedLink ? 'Link Copied' : 'Copy Paper Link'}</span>
                  </button>

                  {currentDoc.pdfUrl && (
                    <a
                      href={currentDoc.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reader-dropdown-item"
                      style={{ textDecoration: 'none' }}
                      onClick={() => setMoreMenuOpen(false)}
                    >
                      <ExternalLink size={13} />
                      <span>Open PDF in Tab</span>
                    </a>
                  )}

                  {convertedPages.length > 0 && (
                    <button
                      type="button"
                      className="reader-dropdown-item"
                      onClick={handleExportHtml}
                      disabled={exportingHtml}
                      title="Download complete standalone HTML file powered by WebAssembly"
                    >
                      {exportingHtml ? (
                        <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-violet, #6366f1)' }} />
                      ) : (
                        <Code2 size={13} style={{ color: 'var(--accent-violet, #6366f1)' }} />
                      )}
                      <span>{exportingHtml ? 'Preparing HTML...' : 'Export Standalone HTML'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={async () => {
                      setMoreMenuOpen(false);
                      await clearPaperPagesCache(currentDoc);
                      setConvertedPages([]);
                      setCurrentDoc((prev) => (prev ? { ...prev } : null));
                    }}
                    title="Purge Redis and local cache and force full WebAssembly re-conversion"
                  >
                    <RefreshCw size={13} />
                    <span>Re-convert (Bypass Cache)</span>
                  </button>

                  <button
                    type="button"
                    className="reader-dropdown-item"
                    onClick={() => {
                      setCurrentDoc(null);
                      setConvertedPages([]);
                      setMoreMenuOpen(false);
                    }}
                  >
                    <BookOpen size={13} />
                    <span>Open Another Paper</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. Compact Document Toolbar ── */}
        <div className="reader-doc-toolbar">
          {/* Left: Page Navigation & Reading Mode */}
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleJumpToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            <span className="toolbar-page-indicator">
              Page {currentPage} / {totalPages || 1}
            </span>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleJumpToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>

            <div className="toolbar-divider" />

            {/* Reading Mode Switcher (Continuous vs Single Page) */}
            <div className="reader-mode-toggle" title="Switch reading mode">
              <button
                type="button"
                className={`reader-mode-toggle-btn ${viewMode === 'continuous' ? 'active' : ''}`}
                onClick={() => setViewMode('continuous')}
                title="Continuous Scroll Mode"
              >
                <FileText size={12} />
                <span>Scroll</span>
              </button>
              <button
                type="button"
                className={`reader-mode-toggle-btn ${viewMode === 'single' ? 'active' : ''}`}
                onClick={() => setViewMode('single')}
                title="Page-by-page Mode"
              >
                <BookOpen size={12} />
                <span>Page</span>
              </button>
            </div>

            <div className="toolbar-divider" />

            {/* Zoom Controls */}
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => {
                setZoom((z) => Math.max(50, z - 10));
                setFitWidth(false);
              }}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>

            <span className="toolbar-zoom-label">
              {fitWidth ? 'Auto' : `${zoom}%`}
            </span>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => {
                setZoom((z) => Math.min(200, z + 10));
                setFitWidth(false);
              }}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>

            {/* Fit Width */}
            <button
              type="button"
              className={`toolbar-btn ${fitWidth ? 'active' : ''}`}
              onClick={() => setFitWidth((w) => !w)}
              title="Fit to container width"
            >
              <Maximize2 size={13} />
              <span>Fit Width</span>
            </button>
          </div>

          {/* Right: In-Paper Search & AI Copilot Toggle */}
          <div className="toolbar-group">
            {/* Search within paper */}
            <div className="toolbar-search-input" title="Find inside paper text (press Enter for next)">
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={inDocSearch}
                onChange={(e) => {
                  setInDocSearch(e.target.value);
                  setSearchCurrentMatchIdx(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Find in paper..."
              />
              {searchLower && (
                <span className="toolbar-search-badge">
                  {searchMatchCount} match{searchMatchCount === 1 ? '' : 'es'}
                </span>
              )}
            </div>

            <div className="toolbar-divider" />

            {/* AI Copilot Drawer Toggle */}
            <button
              type="button"
              className={`toolbar-btn ${sidebarOpen ? 'active' : ''}`}
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? 'Hide AI Assistant' : 'Open AI Assistant'}
            >
              <Sparkles size={13} />
              <span>AI Copilot</span>
            </button>
          </div>
        </div>

        {/* ── 3. Subtle Gray Reading Canvas with Clean White Document Surface ── */}
        <div className="reader-canvas" ref={canvasRef}>
          {activeHighlight && (
            <EvidenceHighlightBanner
              highlight={activeHighlight}
              onBackToAnswer={() => {
                setSidebarOpen(true);
                const el = document.querySelector('.reader-assistant-panel');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              onDismiss={() => setActiveHighlight(null)}
            />
          )}

          {/* Progressive WASM Conversion Banner */}
          {isConverting && (
            <div className="reader-conversion-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={13} className="animate-spin" />
                <span>
                  {conversionProgress.status ||
                    `Converting Page ${convertedPages.length} of ${totalPages} via WebAssembly (${conversionProgress.percent}%)`}
                </span>
              </div>
              <div className="reader-conversion-progress-track">
                <div
                  className="reader-conversion-progress-bar"
                  style={{ width: `${Math.max(5, conversionProgress.percent)}%` }}
                />
              </div>
            </div>
          )}

          {conversionError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 18px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
                maxWidth: 860,
                width: '100%',
              }}
            >
              <AlertCircle size={16} />
              <span style={{ flex: 1 }}>{conversionError}</span>
              <button
                type="button"
                className="reader-topbar-btn"
                onClick={async () => {
                  await clearPaperPagesCache(currentDoc);
                  setConvertedPages([]);
                  setCurrentDoc((prev) => (prev ? { ...prev } : null));
                }}
              >
                <RefreshCw size={12} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Loading state before first page is converted */}
          {convertedPages.length === 0 && (isConverting || resolvingPdf) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 480,
                padding: 32,
                textAlign: 'center',
              }}
            >
              <Loader2
                size={34}
                className="animate-spin"
                style={{ color: 'var(--accent-violet, #6366f1)', marginBottom: 16 }}
              />
              <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                WebAssembly Document Engine
              </h4>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
                {resolvingPdf
                  ? 'Locating open-access publication stream and resolving preprint...'
                  : 'Converting PDF into high-fidelity HTML pages via WebAssembly runtime...'}
              </p>
            </div>
          )}

          {/* ── WebAssembly Rendered HTML Pages Container ── */}
          {convertedPages.length > 0 && (
            <div
              className="wasm-pdf-document"
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: 'transparent',
              }}
            >
              {pagesToDisplay.map((page) => {
                const displayWidth = Math.round(page.width * displayScale);
                const displayHeight = Math.round(page.height * displayScale);

                return (
                  <div
                    key={`wasm-page-${page.pageNumber}`}
                    id={`wasm-pdf-page-${page.pageNumber}`}
                    className="wasm-pdf-page"
                    data-page-number={page.pageNumber}
                    style={{
                      width: `${displayWidth}px`,
                      height: `${displayHeight}px`,
                      position: 'relative',
                      margin: '0 auto 20px',
                      background: '#ffffff',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
                      borderRadius: 2,
                      overflow: 'hidden',
                      display: 'block',
                    }}
                  >
                    {/* Background Visual Layer */}
                    {page.bgDataUrl ? (
                      <img
                        src={page.bgDataUrl}
                        className="wasm-pdf-bg-layer"
                        alt={`Page ${page.pageNumber}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none',
                          zIndex: 1,
                          display: 'block',
                          userSelect: 'none',
                        }}
                      />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, background: '#ffffff', zIndex: 1 }} />
                    )}

                    {/* Selectable, Searchable DOM Text Layer */}
                    <div
                      className="wasm-pdf-text-layer"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 2,
                        pointerEvents: 'auto',
                        lineHeight: 1,
                      }}
                    >
                      {page.textItems?.map((item, idx) => {
                        const isSearchMatch =
                          searchLower && item.str && item.str.toLowerCase().includes(searchLower);
                        const isEvidenceMatch = isEvidenceItem(item, page.pageNumber, activeHighlight);

                        let highlightClass = '';
                        if (isSearchMatch) highlightClass = 'pdf-highlight-search';
                        else if (isEvidenceMatch) highlightClass = 'pdf-highlight-evidence';

                        return (
                          <span
                            key={idx}
                            className={`wasm-pdf-text-span ${highlightClass}`}
                            style={{
                              position: 'absolute',
                              left: `${(item.left * displayScale).toFixed(2)}px`,
                              top: `${(item.top * displayScale).toFixed(2)}px`,
                              fontSize: `${(item.fontSize * displayScale).toFixed(2)}px`,
                              fontFamily: item.fontFamily || 'sans-serif',
                              height: `${((item.height || item.fontSize) * displayScale).toFixed(2)}px`,
                              lineHeight: 1,
                              whiteSpace: 'pre',
                              cursor: 'text',
                              transform: item.transformCss,
                              transformOrigin: 'left top',
                            }}
                            title={isEvidenceMatch ? 'Cited AI Copilot Evidence' : undefined}
                          >
                            {item.str}
                          </span>
                        );
                      })}
                    </div>

                    {/* Deterministic Coordinate Highlight Bounding Boxes */}
                    {activeHighlight &&
                      Number(activeHighlight.page) === page.pageNumber &&
                      activeHighlight.highlight_rects &&
                      activeHighlight.highlight_rects.map((rect, rIdx) => (
                        <div
                          key={`coord-rect-${rIdx}`}
                          className="pdf-coordinate-highlight-box"
                          style={{
                            position: 'absolute',
                            left: `${(rect.x * displayWidth).toFixed(1)}px`,
                            top: `${(rect.y * displayHeight).toFixed(1)}px`,
                            width: `${(rect.width * displayWidth).toFixed(1)}px`,
                            height: `${(rect.height * displayHeight).toFixed(1)}px`,
                            background: 'rgba(250, 204, 21, 0.32)',
                            borderBottom: '2.5px solid #eab308',
                            boxShadow: '0 0 8px rgba(234, 179, 8, 0.4)',
                            borderRadius: '2px',
                            pointerEvents: 'none',
                            zIndex: 4,
                          }}
                        />
                      ))}
                  </div>
                );
              })}


              {/* In-progress indicator at bottom when converting remaining pages */}
              {isConverting && convertedPages.length < totalPages && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 20px',
                    fontSize: 12.5,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  <span>Converting page {convertedPages.length + 1} of {totalPages}...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Right AI Assistant Panel ── */}
      {sidebarOpen && (
        <PaperReaderSidebar
          paper={currentDoc}
          onClose={() => setSidebarOpen(false)}
          onJumpToPage={(p) => handleJumpToPage(p)}
          onClearContext={() => {
            setCurrentDoc(null);
            setConvertedPages([]);
            setActiveHighlight(null);
          }}
          onHighlightEvidence={handleHighlightEvidence}
        />
      )}
    </div>
  );
}
