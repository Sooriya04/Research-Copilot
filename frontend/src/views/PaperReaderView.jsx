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
  Minimize2,
  Copy,
  Check,
  Code2,
  AlertCircle,
  RefreshCw,
  Sun,
  Moon,
  Coffee,
  Info,
  X,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Document Controls
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(true);
  const [viewMode, setViewMode] = useState('continuous'); // 'continuous' | 'single'
  const [inDocSearch, setInDocSearch] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState(null);

  // Comfort & Reading UX
  const [readingTheme, setReadingTheme] = useState(() => {
    try {
      return localStorage.getItem('rc_reader_theme') || 'clean';
    } catch {
      return 'clean';
    }
  }); // 'clean' | 'sepia' | 'dark'
  const [isZenMode, setIsZenMode] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [jumpPageOpen, setJumpPageOpen] = useState(false);
  const [jumpPageValue, setJumpPageValue] = useState('');

  // Progressive WebAssembly conversion states
  const [convertedPages, setConvertedPages] = useState([]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({ percent: 0, status: '' });
  const [conversionError, setConversionError] = useState(null);

  // In-Doc Search matching
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [searchCurrentMatchIdx, setSearchCurrentMatchIdx] = useState(0);

  const canvasRef = useRef(null);
  const searchInputRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(860);

  // Save theme selection
  const handleSelectTheme = (theme) => {
    setReadingTheme(theme);
    try {
      localStorage.setItem('rc_reader_theme', theme);
    } catch {}
  };

  // Measure container for Fit Width calculation
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

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInputActive = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

      if (e.key === 'Escape') {
        if (isZenMode) setIsZenMode(false);
        if (showMetadataModal) setShowMetadataModal(false);
        if (moreMenuOpen) setMoreMenuOpen(false);
        if (showSearchInput && !isInputActive) setShowSearchInput(false);
        if (jumpPageOpen) setJumpPageOpen(false);
        return;
      }

      if (isInputActive) return;

      // Zen mode toggle: F
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsZenMode((v) => !v);
        return;
      }

      // Search hotkey: / or Cmd+F
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'f')) {
        e.preventDefault();
        setShowSearchInput(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }

      // Page flip
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'h') {
        e.preventDefault();
        handleJumpToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'l') {
        e.preventDefault();
        handleJumpToPage(currentPage + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZenMode, showMetadataModal, moreMenuOpen, showSearchInput, jumpPageOpen, currentPage, totalPages]);

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
        } catch (e) {}
      }
    }
  };

  const handleExportHtml = () => {
    if (convertedPages.length === 0 || exportingHtml) return;
    setExportingHtml(true);
    try {
      downloadStandaloneHtmlFile(convertedPages, downloadFilename.replace(/\.pdf$/i, '.html'));
    } catch (err) {
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

  // Resolve PDF URL from OA lookup when no direct link
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

  // Progressive WebAssembly Conversion Engine
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

  const handleJumpPageSubmit = (e) => {
    e.preventDefault();
    const parsed = parseInt(jumpPageValue, 10);
    if (!isNaN(parsed)) {
      handleJumpToPage(parsed);
    }
    setJumpPageOpen(false);
    setJumpPageValue('');
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
    ? Math.min(2.2, Math.max(0.6, (containerWidth - 64) / basePageWidth))
    : zoom / 100;

  const pagesToDisplay =
    viewMode === 'continuous'
      ? convertedPages
      : convertedPages.filter((p) => p.pageNumber === currentPage);

  // ─── No paper: Clean Reading Desk Empty State ─────────────────────────────
  if (!currentDoc) {
    return (
      <div className="reader-workspace-root">
        <div className="reader-center-panel">
          {/* Minimal Top Bar */}
          <header className="reader-unified-header">
            <div className="reader-header-left">
              <button
                type="button"
                className="reader-topbar-btn"
                onClick={() => navigate(-1)}
                title="Back to Previous Page"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <div className="reader-pill-divider" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                Research Paper Reader
              </span>
            </div>
            <div className="reader-header-right">
              <button
                type="button"
                className={`reader-topbar-btn ${sidebarOpen ? 'active' : ''}`}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <Sparkles size={13} />
                <span>AI Assistant</span>
              </button>
            </div>
          </header>

          {/* Reading Desk */}
          <div className="reader-canvas" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="reader-empty-sheet" style={{ maxWidth: 660, padding: '36px 32px' }}>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: 'rgba(99, 102, 241, 0.08)',
                    color: 'var(--accent-violet, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                  }}
                >
                  <BookOpen size={24} />
                </div>
                <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
                  Comfortable Research Reading Desk
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  High-fidelity WebAssembly document engine. Instant reloads, citation grounding, and eye-care reading themes.
                </p>
              </div>

              {/* Input Form */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                  placeholder="arXiv ID (e.g. 2503.04615, 1706.03762), DOI, or paper title..."
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    borderRadius: 8,
                    fontSize: 13,
                    background: 'var(--bg-subtle, #f8fafc)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className="reader-topbar-btn primary"
                  onClick={() => handleExtract()}
                  disabled={loading}
                  style={{ padding: '0 16px', height: 40, borderRadius: 8 }}
                >
                  <Sparkles size={14} />
                  <span>{loading ? 'Loading...' : 'Read Paper'}</span>
                </button>
                <label
                  className="reader-topbar-btn"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 40,
                    padding: '0 14px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    background: 'var(--bg-card, #ffffff)',
                    borderRadius: 8,
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
                  <span>Resolving publication and open-access stream...</span>
                </div>
              )}

              {errorMessage && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontSize: 12.5, marginBottom: 16 }}>
                  {errorMessage}
                </div>
              )}

              {/* Sample Papers */}
              <div style={{ marginTop: 24 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>
                  Curated Open-Access Papers
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                  {SAMPLE_PAPERS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleLoadSample(sample)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border-subtle, #e2e8f0)',
                        background: 'var(--bg-card, #ffffff)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 8,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-violet, #6366f1)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-subtle, #e2e8f0)';
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>
                          {sample.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {sample.authors.join(', ')} • {sample.year}
                        </div>
                      </div>
                      <span className="reader-arxiv-badge" style={{ alignSelf: 'flex-start' }}>
                        arXiv:{sample.arxiv_id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {sidebarOpen && (
          <PaperReaderSidebar
            paper={null}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>
    );
  }

  // ─── Paper Loaded: Comfortable High-Fidelity Reader ───────────────────────
  return (
    <div className={`reader-workspace-root ${isZenMode ? 'zen-mode' : ''}`}>
      <div className="reader-center-panel">
        {/* ── 1. Unified Sleek Reader Header (Single 50px bar) ── */}
        {!isZenMode && (
          <header className="reader-unified-header">
            {/* Left: Back & Paper Info */}
            <div className="reader-header-left">
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

              <div className="reader-pill-divider" />

              <div className="reader-header-title-box">
                <h1
                  className="reader-header-paper-title"
                  onClick={() => setShowMetadataModal(true)}
                  title="Click to view full paper abstract & citation details"
                >
                  {currentDoc.title || 'Untitled Document'}
                </h1>
                <div className="reader-header-subline">
                  <span>{authorsText}</span>
                  {badgeUrl ? (
                    <a
                      href={badgeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reader-arxiv-badge"
                      style={{ padding: '1px 6px', fontSize: 10 }}
                      title={`Open source publication (${badgeLabel})`}
                    >
                      <FileText size={10} />
                      <span>{badgeLabel}</span>
                    </a>
                  ) : (
                    <span className="reader-arxiv-badge" style={{ padding: '1px 6px', fontSize: 10 }}>
                      <FileText size={10} />
                      <span>{badgeLabel}</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="reader-pill-btn"
                style={{ width: 24, height: 24, padding: 0 }}
                onClick={() => setShowMetadataModal(true)}
                title="Paper Metadata & Abstract"
              >
                <Info size={13} />
              </button>
            </div>

            {/* Center: Integrated Navigation Pill Toolbar */}
            <div className="reader-header-center">
              <div className="reader-pill-toolbar">
                {/* Previous Page */}
                <button
                  type="button"
                  className="reader-pill-btn"
                  onClick={() => handleJumpToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  title="Previous Page (ArrowLeft)"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Page Indicator (Clickable for quick jump) */}
                {jumpPageOpen ? (
                  <form onSubmit={handleJumpPageSubmit} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <input
                      type="number"
                      autoFocus
                      min={1}
                      max={totalPages}
                      value={jumpPageValue}
                      onChange={(e) => setJumpPageValue(e.target.value)}
                      onBlur={() => setJumpPageOpen(false)}
                      style={{
                        width: 44,
                        height: 22,
                        padding: '0 4px',
                        fontSize: 11,
                        textAlign: 'center',
                        border: '1px solid var(--accent-violet, #6366f1)',
                        borderRadius: 4,
                        outline: 'none',
                        background: 'var(--bg-card, #ffffff)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="reader-pill-btn"
                    onClick={() => {
                      setJumpPageValue(String(currentPage));
                      setJumpPageOpen(true);
                    }}
                    title="Click to jump directly to page"
                    style={{ fontSize: 11.5 }}
                  >
                    <span>{currentPage} / {totalPages || 1}</span>
                  </button>
                )}

                {/* Next Page */}
                <button
                  type="button"
                  className="reader-pill-btn"
                  onClick={() => handleJumpToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  title="Next Page (ArrowRight)"
                >
                  <ChevronRight size={14} />
                </button>

                <div className="reader-pill-divider" />

                {/* View Mode: Continuous Scroll vs Single Page */}
                <button
                  type="button"
                  className={`reader-pill-btn ${viewMode === 'continuous' ? 'active' : ''}`}
                  onClick={() => setViewMode('continuous')}
                  title="Continuous Scroll Mode"
                >
                  <FileText size={12} />
                  <span>Scroll</span>
                </button>
                <button
                  type="button"
                  className={`reader-pill-btn ${viewMode === 'single' ? 'active' : ''}`}
                  onClick={() => setViewMode('single')}
                  title="Single Page Mode"
                >
                  <BookOpen size={12} />
                  <span>Page</span>
                </button>

                <div className="reader-pill-divider" />

                {/* Zoom Controls */}
                <button
                  type="button"
                  className="reader-pill-btn"
                  onClick={() => {
                    setZoom((z) => Math.max(50, z - 10));
                    setFitWidth(false);
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>

                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-code, monospace)',
                    minWidth: 36,
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {fitWidth ? 'Fit' : `${zoom}%`}
                </span>

                <button
                  type="button"
                  className="reader-pill-btn"
                  onClick={() => {
                    setZoom((z) => Math.min(220, z + 10));
                    setFitWidth(false);
                  }}
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>

                {/* Fit Width Toggle */}
                <button
                  type="button"
                  className={`reader-pill-btn ${fitWidth ? 'active' : ''}`}
                  onClick={() => setFitWidth((w) => !w)}
                  title="Fit document width to reading container"
                >
                  <Maximize2 size={12} />
                  <span>Fit</span>
                </button>
              </div>
            </div>

            {/* Right: Search, Theme, Zen, More, AI Toggle */}
            <div className="reader-header-right">
              {/* Expandable In-Paper Search */}
              {showSearchInput ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--bg-subtle, #f4f4f5)',
                    border: '1px solid var(--border-subtle, #e4e4e7)',
                    borderRadius: 16,
                    padding: '2px 8px',
                    height: 28,
                  }}
                >
                  <Search size={12} style={{ color: 'var(--text-muted)' }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={inDocSearch}
                    onChange={(e) => {
                      setInDocSearch(e.target.value);
                      setSearchCurrentMatchIdx(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Find in text..."
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: 11.5,
                      outline: 'none',
                      width: 110,
                      color: 'var(--text-primary)',
                    }}
                  />
                  {searchLower && (
                    <span className="toolbar-search-badge" style={{ fontSize: 10, padding: '1px 5px' }}>
                      {searchMatchCount}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setInDocSearch('');
                      setShowSearchInput(false);
                    }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="reader-pill-btn"
                  onClick={() => {
                    setShowSearchInput(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  title="Find inside paper text (press /)"
                >
                  <Search size={13} />
                  <span>Find</span>
                </button>
              )}

              {/* Eye Care & Reading Themes */}
              <div className="reader-theme-selector" title="Eye Comfort Reading Themes">
                <button
                  type="button"
                  className={`reader-theme-btn ${readingTheme === 'clean' ? 'active' : ''}`}
                  onClick={() => handleSelectTheme('clean')}
                  title="Default Clean Paper"
                >
                  <Sun size={12} />
                </button>
                <button
                  type="button"
                  className={`reader-theme-btn ${readingTheme === 'sepia' ? 'active' : ''}`}
                  onClick={() => handleSelectTheme('sepia')}
                  title="Eye-Care Warm Sepia"
                >
                  <Coffee size={12} />
                </button>
                <button
                  type="button"
                  className={`reader-theme-btn ${readingTheme === 'dark' ? 'active' : ''}`}
                  onClick={() => handleSelectTheme('dark')}
                  title="Night Contrast Slate"
                >
                  <Moon size={12} />
                </button>
              </div>

              {/* Zen / Focus Mode Toggle */}
              <button
                type="button"
                className={`reader-topbar-btn ${isZenMode ? 'active' : ''}`}
                onClick={() => setIsZenMode((v) => !v)}
                title="Zen Focus Mode (press F)"
              >
                <Maximize2 size={13} />
                <span>Focus</span>
              </button>

              {/* Actions Dropdown */}
              <div className="reader-dropdown-container" style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="reader-topbar-btn"
                  onClick={() => setMoreMenuOpen((v) => !v)}
                  title="Document Actions"
                >
                  <MoreHorizontal size={14} />
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
                        download={downloadFilename}
                        className="reader-dropdown-item"
                        style={{ textDecoration: 'none' }}
                        onClick={() => setMoreMenuOpen(false)}
                      >
                        <Download size={13} />
                        <span>Download PDF File</span>
                      </a>
                    )}

                    {convertedPages.length > 0 && (
                      <button
                        type="button"
                        className="reader-dropdown-item"
                        onClick={handleExportHtml}
                        disabled={exportingHtml}
                        title="Download standalone HTML document"
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
                      title="Purge cache and re-convert with WebAssembly"
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

              {/* AI Copilot Toggle */}
              <button
                type="button"
                className={`reader-topbar-btn ${sidebarOpen ? 'active' : ''}`}
                onClick={() => setSidebarOpen((v) => !v)}
                title={sidebarOpen ? 'Hide Assistant' : 'Open Assistant'}
                style={{
                  background: sidebarOpen ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                  color: sidebarOpen ? 'var(--accent-violet, #6366f1)' : 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                <Sparkles size={13} />
                <span>Assistant</span>
              </button>
            </div>
          </header>
        )}

        {/* ── 2. Floating Zen HUD (when in Focus Mode) ── */}
        {isZenMode && (
          <div className="reader-zen-floating-hud">
            <button
              type="button"
              className="reader-zen-btn"
              onClick={() => handleJumpToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>
            <span>Page {currentPage} / {totalPages || 1}</span>
            <button
              type="button"
              className="reader-zen-btn"
              onClick={() => handleJumpToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>

            <span style={{ opacity: 0.4 }}>|</span>

            <button
              type="button"
              className="reader-zen-btn"
              onClick={() => setFitWidth((w) => !w)}
            >
              {fitWidth ? '100%' : 'Fit'}
            </button>

            <span style={{ opacity: 0.4 }}>|</span>

            <button
              type="button"
              className="reader-zen-btn"
              onClick={() => setIsZenMode(false)}
              title="Exit Focus Mode (Esc)"
              style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '3px 10px' }}
            >
              <Minimize2 size={12} />
              <span>Exit Focus (Esc)</span>
            </button>
          </div>
        )}

        {/* ── 3. Comfortable Reading Canvas with Eye-Care Themes ── */}
        <div className={`reader-canvas theme-${readingTheme}`} ref={canvasRef}>
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

          {/* Floating Subtle Progress Pill (Zero layout shift) */}
          {isConverting && (
            <div className="reader-floating-progress-pill">
              <Loader2 size={13} className="animate-spin" />
              <span>
                {conversionProgress.status ||
                  `Converting page ${convertedPages.length} of ${totalPages} (${conversionProgress.percent}%)`}
              </span>
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

          {/* Initial Loading Screen */}
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

          {/* WebAssembly Rendered HTML Pages */}
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
                      margin: '0 auto 28px',
                      borderRadius: 4,
                      overflow: 'hidden',
                      display: 'block',
                      transition: 'box-shadow 0.2s ease',
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
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Right Assistant Panel ── */}
      {sidebarOpen && !isZenMode && (
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

      {/* ── 5. Paper Metadata & Abstract Modal ── */}
      {showMetadataModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowMetadataModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card, #ffffff)',
              borderRadius: 12,
              border: '1px solid var(--border-subtle, #e2e8f0)',
              maxWidth: 600,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              position: 'relative',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <span className="reader-arxiv-badge" style={{ fontSize: 11 }}>
                {badgeLabel}
              </span>
              <button
                type="button"
                onClick={() => setShowMetadataModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.35 }}>
              {currentDoc.title}
            </h3>

            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
              {authorsText} {currentDoc.year ? `• ${currentDoc.year}` : ''}
            </div>

            {currentDoc.abstract && (
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                  Abstract
                </span>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {currentDoc.abstract}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: 14 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyBibtex}
              >
                {copiedBibtex ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                <span>{copiedBibtex ? 'BibTeX Copied' : 'Copy BibTeX'}</span>
              </button>
              {badgeUrl && (
                <a
                  href={badgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={12} />
                  <span>Open Publication</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
