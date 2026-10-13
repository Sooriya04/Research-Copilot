import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network';
import {
  Network as NetworkIcon,
  Table2,
  Columns3,
  RotateCw,
  Maximize2,
  Trash2,
  Info,
  X,
  Loader2,
  Plus,
  Check,
  Search,
  Filter,
  Sparkles,
  FileText,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  Lightbulb,
  Zap,
  CheckCircle2,
  MessageSquare,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  ChevronUp,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MathRenderer from '../components/common/MathRenderer';

function wrapLabel(text, maxChars = 22) {
  if (!text) return 'Paper';
  let clean = String(text).trim();

  // If it's a raw Semantic Scholar or internal hash ID
  if (/^s2:[a-f0-9]{20,}/i.test(clean) || /^[a-f0-9]{32,}$/i.test(clean)) {
    const hash = clean.replace(/^s2:/i, '');
    return `Cited Paper\n[${hash.slice(0, 8)}...]`;
  }

  // Strip verbose raw ID prefixes
  clean = clean.replace(/^(doi:|arxiv:|s2:)/i, '');

  // If it's a gap, method, or dataset slug with hyphens, replace hyphens with spaces for clean text
  if (/^(gap-|method-|dataset-)/i.test(clean)) {
    clean = clean.replace(/^(gap-|method-|dataset-)/i, '').replace(/[-_]+/g, ' ');
  }

  // Truncate monolithic tokens without spaces (e.g. long hashes)
  if (clean.length > 32 && !clean.includes(' ')) {
    clean = clean.slice(0, 14) + '...' + clean.slice(-8);
  }

  const words = clean.split(/\s+/);
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxChars) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3).join('\n') || clean.slice(0, 24);
}

function computeSpaciousSeedPositions(rawNodes, rawEdges) {
  const positions = {};
  if (!rawNodes || rawNodes.length === 0) return positions;

  // 1. Identify Topic node(s)
  const topicNodes = rawNodes.filter(n => (n.node_type || '').toLowerCase() === 'topic');
  topicNodes.forEach((t, idx) => {
    positions[t.id] = { x: Math.round((idx - (topicNodes.length - 1) / 2) * 220), y: 0 };
  });

  // 2. Identify Paper nodes (including candidate proposals)
  const paperNodes = rawNodes.filter(n => {
    const ntype = (n.node_type || '').toLowerCase();
    return ntype === 'paper' || n.id.startsWith('cand-') || n.data?.category === 'Proposed Novelty';
  });

  const N = paperNodes.length;
  // Compact, well-spaced radial orbit so nodes remain comfortably large and readable on screen
  const paperRadius = Math.max(240, N * 42);

  paperNodes.forEach((paper, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, N) - Math.PI / 2;
    positions[paper.id] = {
      x: Math.round(paperRadius * Math.cos(angle)),
      y: Math.round(paperRadius * Math.sin(angle)),
      angle,
    };
  });

  // 3. Map entities (methods, datasets, gaps) to their connected paper(s)
  const paperEntities = {};
  (rawEdges || []).forEach(e => {
    const sPaper = paperNodes.some(p => p.id === e.source);
    const tPaper = paperNodes.some(p => p.id === e.target);
    if (sPaper && !tPaper) {
      if (!paperEntities[e.source]) paperEntities[e.source] = [];
      paperEntities[e.source].push(e.target);
    } else if (tPaper && !sPaper) {
      if (!paperEntities[e.target]) paperEntities[e.target] = [];
      paperEntities[e.target].push(e.source);
    }
  });

  const placedEntities = new Set();
  const entityRadius = paperRadius + 115;

  paperNodes.forEach(paper => {
    const attached = (paperEntities[paper.id] || []).filter(eId => !placedEntities.has(eId));
    const pPos = positions[paper.id];
    const baseAngle = pPos ? pPos.angle : 0;
    const count = attached.length;

    // Spread attached entities along an outward arc centered on paper's angle
    const totalArc = Math.min(1.2, count * 0.24);
    attached.forEach((eId, j) => {
      const offset = count === 1 ? 0 : (j - (count - 1) / 2) * (totalArc / Math.max(1, count - 1));
      const entAngle = baseAngle + offset;
      const r = entityRadius + ((j % 2 === 0) ? 0 : 35); // Slight radial stagger
      positions[eId] = {
        x: Math.round(r * Math.cos(entAngle)),
        y: Math.round(r * Math.sin(entAngle)),
      };
      placedEntities.add(eId);
    });
  });

  // 4. Any remaining nodes placed along outer perimeter
  const remaining = rawNodes.filter(n => !positions[n.id]);
  remaining.forEach((rem, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(1, remaining.length);
    const r = entityRadius + 45;
    positions[rem.id] = {
      x: Math.round(r * Math.cos(angle)),
      y: Math.round(r * Math.sin(angle)),
    };
  });

  return positions;
}

const NODE_THEMES = {
  topic: { bg: '#e4e4e7', border: '#ffffff', text: '#09090b', shape: 'box', size: 30 },
  paper: { bg: '#27272a', border: '#71717a', text: '#f4f4f5', shape: 'box', size: 22 },
  method: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 18 },
  dataset: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 18 },
  metric: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 16 },
  claim: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 16 },
  limitation: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 16 },
  gap: { bg: '#881337', border: '#f43f5e', text: '#ffe4e6', shape: 'diamond', size: 22 },
};

const FRIENDLY_RELATION_LABELS = {
  covers: 'Explores',
  investigates: 'Explores',
  has_paper: 'Includes',
  uses_method: 'Uses Method',
  evaluates_on: 'Tested On',
  achieves: 'Achieves',
  cites: 'References',
  has_claim: 'Claims',
  limited_by: 'Limited By',
  addresses: 'Solves',
  extends: 'Extends',
  compared_to: 'Compared With',
  improves_upon: 'Improves Upon',
  contradicts: 'Contradicts',
  has_gap: 'Identified Gap',
  relates_to: 'Connected To',
};

const EDGE_COLORS = {
  covers: '#6366f1', // Rich Indigo
  investigates: '#8b5cf6', // Violet
  has_paper: '#6366f1',
  uses_method: '#10b981', // Emerald Teal
  evaluates_on: '#f59e0b', // Warm Amber
  achieves: '#10b981',
  cites: '#94a3b8', // Subtle Slate
  has_claim: '#38bdf8',
  limited_by: '#f43f5e',
  addresses: '#06b6d4',
  extends: '#6366f1', // Indigo
  compared_to: '#f97316', // Orange
  improves_upon: '#10b981', // Emerald
  contradicts: '#ef4444', // Red
  has_gap: '#f43f5e', // Rose
  relates_to: '#64748b',
};

function getNodeDescription(entity) {
  if (!entity) return '';
  const type = (entity.type || '').toUpperCase();
  const title = entity.title || '';
  const raw = entity.raw || {};

  if (raw.description && String(raw.description).trim()) return String(raw.description).trim();
  if (raw.abstract && String(raw.abstract).trim()) return String(raw.abstract).trim();
  if (entity.id?.startsWith('cand-') || raw.category === 'Proposed Novelty') {
    return raw.hypothesis ? `Testable Hypothesis: ${raw.hypothesis}` : (raw.formulation || 'Proposed novel research contribution grounded in graph topology.');
  }

  const lower = title.toLowerCase();
  if (type === 'METHOD') {
    if (lower.includes('language model') || lower === 'llm' || lower.includes('llms')) {
      return 'Core statistical and neural framework that models token distributions, predicting subsequent or masked tokens across massive textual corpora.';
    }
    if (lower.includes('lora') || lower.includes('low-rank')) {
      return 'Parameter-efficient fine-tuning (PEFT) technique that freezes pre-trained model weights and injects trainable rank decomposition matrices into attention layers.';
    }
    if (lower.includes('flashattention') || lower.includes('flash attention')) {
      return 'Exact, memory-efficient attention algorithm that leverages GPU SRAM tiling to eliminate memory bottlenecks and speed up sequence processing.';
    }
    if (lower.includes('transformer')) {
      return 'Neural network architecture relying entirely on self-attention mechanisms to model global dependencies in parallel without recurrence.';
    }
    if (lower.includes('attention') || lower.includes('self-attention')) {
      return 'Mechanism computing dynamic similarity weights across all token pairs in a sequence to capture long-range contextual dependencies.';
    }
    if (lower.includes('sparse autoencoder') || lower.includes('sae') || lower.includes('autoencoder')) {
      return 'Unsupervised interpretability method that decomposes dense neural activations into sparse, human-interpretable feature representations.';
    }
    if (lower.includes('direct preference optimization') || lower.includes('dpo')) {
      return 'Reinforcement learning alignment method that optimizes language model policies directly on pairwise preference data without fitting an auxiliary reward model.';
    }
    if (lower.includes('quantization') || lower.includes('qlora') || lower.includes('fp8') || lower.includes('int4')) {
      return 'Compression and acceleration technique reducing model weight precision to conserve GPU memory while maintaining empirical fidelity.';
    }
    if (lower.includes('kv cache') || lower.includes('cache')) {
      return 'Inference optimization mechanism caching computed key and value vectors across autoregressive decoding steps to prevent redundant computation.';
    }
    if (lower.includes('steering') || lower.includes('activation addition')) {
      return 'Representation engineering technique intervening on model residual activations to guide behavior, tone, or safety without fine-tuning weights.';
    }
    return `Algorithmic method or neural technique categorized under '${raw.category || 'ML Architecture'}', utilized across connected research papers for modeling and optimization.`;
  }

  if (type === 'DATASET') {
    if (lower.includes('glue') || lower.includes('superglue')) {
      return 'Multi-task benchmark for evaluating natural language understanding across diverse classification, inference, and semantic tasks.';
    }
    if (lower.includes('mmlu')) {
      return 'Massive Multitask Language Understanding benchmark measuring broad world knowledge and problem-solving across 57 academic subjects.';
    }
    if (lower.includes('gsm8k')) {
      return 'Dataset of high-quality grade school math word problems designed to evaluate multi-step mathematical reasoning capabilities.';
    }
    if (lower.includes('wmt')) {
      return 'Standardized machine translation benchmark collection featuring parallel sentence pairs across diverse language directions.';
    }
    if (lower.includes('axbench') || lower.includes('steering')) {
      return 'Standardized steering and representation engineering benchmark evaluating model alignment and behavioral control.';
    }
    return `Standardized benchmark dataset and evaluation suite in domain '${raw.domain || 'General AI'}', used for empirical validation and ablation comparisons.`;
  }

  if (type === 'GAP') {
    return raw.description || `Combinatorial research opportunity identified between method '${raw.method_id || 'technique'}' and dataset/task '${raw.dataset_id || 'benchmark'}'.`;
  }

  if (type === 'TOPIC') {
    return 'Primary workspace research topic anchoring exploration and synthesizing connected literature.';
  }

  if (type === 'CLAIM') {
    return 'Specific empirical or architectural assertion verified across experimental trials in the source paper.';
  }

  if (type === 'LIMITATION') {
    return 'Reported computational, sample-efficiency, or generalization constraint identified by the authors.';
  }

  return raw.text || raw.title || 'Scientific research entity mapped in the active knowledge graph.';
}

function getDetailedConnectionExplanation(sourceType, targetType, relation, direction, currentTitle, neighborTitle) {
  const rel = (relation || '').toLowerCase();
  const isOut = direction === 'outgoing';
  const cType = (sourceType || '').toUpperCase();

  // uses_method
  if (rel === 'uses_method') {
    if (cType === 'PAPER') {
      return isOut
        ? `Adopts "${neighborTitle}" as its core methodology or algorithmic architecture.`
        : `Utilized as a foundational technique by "${neighborTitle}".`;
    } else {
      // Current is METHOD
      return isOut
        ? `Applied by "${neighborTitle}" for experimental execution.`
        : `Implemented and relied upon by "${neighborTitle}" as part of its core architecture.`;
    }
  }

  // evaluates_on
  if (rel === 'evaluates_on') {
    if (cType === 'PAPER') {
      return isOut
        ? `Evaluates empirical performance and benchmark metrics on "${neighborTitle}".`
        : `Benchmark dataset evaluating performance reported in "${neighborTitle}".`;
    } else {
      // Current is DATASET
      return isOut
        ? `Target benchmark evaluating results in "${neighborTitle}".`
        : `Evaluated by "${neighborTitle}" to measure model quality and generalization.`;
    }
  }

  // extends
  if (rel === 'extends') {
    return isOut
      ? `Directly builds upon and extends the foundational concepts or architecture of "${neighborTitle}".`
      : `Extended and adopted as a foundational baseline by "${neighborTitle}".`;
  }

  // compared_to
  if (rel === 'compared_to') {
    return isOut
      ? `Empirically compared against "${neighborTitle}" as a competitive baseline.`
      : `Evaluated alongside "${neighborTitle}" across common benchmark datasets.`;
  }

  // improves_upon
  if (rel === 'improves_upon') {
    return isOut
      ? `Demonstrates superior empirical accuracy, throughput, or parameter efficiency over "${neighborTitle}".`
      : `Outperformed in specific empirical metrics or computational efficiency by "${neighborTitle}".`;
  }

  // contradicts
  if (rel === 'contradicts') {
    return isOut
      ? `Presents contrasting findings, challenging conclusions or scalability claims reported in "${neighborTitle}".`
      : `Findings or claims challenged by contrasting results in "${neighborTitle}".`;
  }

  // cites
  if (rel === 'cites') {
    return isOut
      ? `Cites and references "${neighborTitle}" in its related work literature.`
      : `Cited and referenced by "${neighborTitle}".`;
  }

  // has_gap
  if (rel === 'has_gap') {
    return isOut
      ? `Associated with unexplored combinatorial research gap "${neighborTitle}".`
      : `Research gap derived from methodologies or benchmarks analyzed in "${neighborTitle}".`;
  }

  // covers / investigates
  if (rel === 'covers' || rel === 'investigates') {
    return isOut
      ? `Explores research paper "${neighborTitle}" within this topic scope.`
      : `Investigated under the overarching research topic "${neighborTitle}".`;
  }

  return isOut
    ? `Directly connected via ${(relation || 'link').replace(/_/g, ' ')} to "${neighborTitle}".`
    : `Connected via ${(relation || 'link').replace(/_/g, ' ')} from "${neighborTitle}".`;
}

export default function KnowledgeGraphView() {
  const {
    theme,
    comparisonPapers,
    addComparisonPaper,
    removeComparisonPaper,
    clearComparisonPapers,
    setActiveReaderPaper,
    searchQuery,
    searchResults,
    activeWorkspace,
    addedToGraphPaperIds,
    setAddedToGraphPaperIds,
  } = useApp();
  const navigate = useNavigate();
  const [graphMode, setGraphMode] = useState('graph'); // 'graph' | 'matrix' | 'compare'
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [neighborhood, setNeighborhood] = useState(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Search within Knowledge Graph state
  const [graphSearchInput, setGraphSearchInput] = useState(() => searchQuery || activeWorkspace?.title || '');
  const [graphSearchResults, setGraphSearchResults] = useState([]);
  const [graphSearchLoading, setGraphSearchLoading] = useState(false);
  const [paperIngestingMap, setPaperIngestingMap] = useState({});

  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [summaryData, setSummaryData] = useState(null);

  // AI Graph Synthesis states (with SQLite cache)
  const [synthesisProvider, setSynthesisProvider] = useState('ollama'); // 'ollama' | 'gemini' | 'groq' | 'deepseek' | 'nvidia' | 'openrouter'
  const [buildingGraph, setBuildingGraph] = useState(false);
  const [buildStatusMessage, setBuildStatusMessage] = useState('');
  const [synthesisInfo, setSynthesisInfo] = useState(null);

  // Graph-Grounded Novelty Engine states
  const [inspectorTab, setInspectorTab] = useState('inspector'); // 'inspector' | 'novelty'
  const [generatingNovelty, setGeneratingNovelty] = useState(false);
  const [noveltyList, setNoveltyList] = useState([]);
  const [injectingNoveltyId, setInjectingNoveltyId] = useState(null);
  const [noveltySuccessMsg, setNoveltySuccessMsg] = useState(null);

  // Filter & Layout states
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all');
  const [relationFilter, setRelationFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPhysicsFrozen, setIsPhysicsFrozen] = useState(false);
  const [layoutMode, setLayoutMode] = useState('organic'); // 'organic' | 'hierarchical'
  const [showCitations, setShowCitations] = useState(false); // Hide dense citation hairball by default
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false); // Collapsed by default when papers already added

  const containerRef = useRef(null);
  const networkRef = useRef(null);

  // Trigger smooth vis-network redraw and auto-fit when panels toggle
  useEffect(() => {
    if (networkRef.current) {
      const handleResize = () => {
        networkRef.current.redraw();
        networkRef.current.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      };
      const t1 = setTimeout(handleResize, 60);
      const t2 = setTimeout(handleResize, 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isInspectorOpen, isSearchOpen]);

  const handleZoomIn = () => {
    if (networkRef.current) {
      networkRef.current.moveTo({
        scale: networkRef.current.getScale() * 1.3,
        animation: { duration: 250, easingFunction: 'easeInOutQuad' },
      });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      networkRef.current.moveTo({
        scale: networkRef.current.getScale() * 0.75,
        animation: { duration: 250, easingFunction: 'easeInOutQuad' },
      });
    }
  };

  const handleToggleFreeze = () => {
    if (!networkRef.current) return;
    const nextState = !isPhysicsFrozen;
    networkRef.current.setOptions({ physics: { enabled: !nextState } });
    setIsPhysicsFrozen(nextState);
  };

  const fetchGraphData = async () => {
    setLoading(true);
    const activeTopic = (searchQuery || activeWorkspace?.title || '').trim();
    const wsId = (activeWorkspace?.id || '').trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      // 1. Check if SQLite cache already has a pre-built synthesis for this workspace/papers
      // If it exists in SQLite, render it immediately! If it's the first time, wait for user to click Build Graph.
      let stagedPaperIds = [...(addedToGraphPaperIds || [])];
      if (stagedPaperIds.length === 0 && activeWorkspace?.papers && activeWorkspace.papers.length > 0) {
        stagedPaperIds = activeWorkspace.papers.map(p => p.id || p.arxiv_id).filter(Boolean);
      }

      // Collect available metadata for staged papers
      const fullPapers = stagedPaperIds.map(pid => {
        const found =
          (searchResults || []).find(p => p.id === pid || p.arxiv_id === pid) ||
          (graphSearchResults || []).find(p => p.id === pid || p.arxiv_id === pid) ||
          (activeWorkspace?.papers || []).find(p => p.id === pid || p.arxiv_id === pid) ||
          (comparisonPapers || []).find(p => p.id === pid || p.arxiv_id === pid);
        if (found) {
          return {
            id: found.id || pid,
            title: found.title,
            abstract: found.abstract || '',
            arxiv_id: found.arxiv_id,
            doi: found.doi,
            year: found.year,
            authors: (found.authors || []).map(a => typeof a === 'string' ? a : a.name || String(a)),
            topics: found.topics || [],
          };
        }
        return { id: pid, title: pid };
      });

      if (wsId || stagedPaperIds.length > 0) {
        try {
          const cacheCheckRes = await fetch('/api/v1/graph/build-workspace-graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: wsId || null,
              topic: activeTopic || 'General Literature',
              paper_ids: stagedPaperIds,
              papers: fullPapers,
              force_refresh: false,
              cached_only: true,
            }),
            signal: controller.signal,
          });

          if (cacheCheckRes.ok) {
            const cacheData = await cacheCheckRes.json();
            if (cacheData.cached && cacheData.nodes && cacheData.nodes.length > 0) {
              // Pre-built graph exists in SQLite! Render it immediately!
              setRawNodes(cacheData.nodes);
              setRawEdges(cacheData.edges || []);
              setSynthesisInfo({
                cached: true,
                llm_called: false,
                engine: cacheData.engine || synthesisProvider,
                model: cacheData.model || '',
                cross_paper_relations_count: cacheData.cross_paper_relations_count || 0,
                gaps_count: cacheData.gaps_count || 0,
                synthesis_summary: cacheData.synthesis_summary || '',
                papers_count: cacheData.papers_count || 0,
              });

              if (cacheData.paper_ids && cacheData.paper_ids.length > 0 && (!addedToGraphPaperIds || addedToGraphPaperIds.length === 0)) {
                setAddedToGraphPaperIds(cacheData.paper_ids);
              }

              // Check SQLite novelty cache status in background
              try {
                const novStatusUrl = `/api/v1/graph/novelty-cache-status?workspace_id=${encodeURIComponent(wsId)}${
                  (cacheData.paper_ids || stagedPaperIds).map(id => `&paper_ids=${encodeURIComponent(id)}`).join('')
                }`;
                const novStatusRes = await fetch(novStatusUrl, { signal: controller.signal });
                if (novStatusRes.ok) {
                  const novStatus = await novStatusRes.json();
                  if (novStatus.cached && novStatus.novelties_count > 0) {
                    const novGenRes = await fetch('/api/v1/graph/generate-novelty', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        workspace_id: wsId,
                        topic: activeTopic,
                        paper_ids: cacheData.paper_ids || stagedPaperIds,
                        force_refresh: false,
                      }),
                      signal: controller.signal,
                    });
                    if (novGenRes.ok) {
                      const novGenData = await novGenRes.json();
                      setNoveltyList(novGenData.novelties || []);
                    }
                  }
                }
              } catch (nErr) {
                console.debug('Novelty cache status notice:', nErr);
              }

              // Fetch summary
              try {
                const sumRes = await fetch('/api/v1/graph/summary', { signal: controller.signal });
                if (sumRes.ok) {
                  setSummaryData(await sumRes.json());
                }
              } catch {}

              return;
            }
          }
        } catch (cErr) {
          console.debug('SQLite cache pre-render notice:', cErr);
        }
      }

      // If papers are staged but not yet synthesized in SQLite (first time),
      // DO NOT auto-generate: show staged papers prompt so researcher clicks Build AI Graph
      if (stagedPaperIds.length > 0) {
        setRawNodes([]);
        setRawEdges([]);
        setSynthesisInfo(null);
        return;
      }

      // 2. Unscoped / topic fallback when no papers are staged
      const params = new URLSearchParams();
      if (activeTopic) params.set('topic', activeTopic);
      if (wsId) params.set('workspace_id', wsId);
      if (activeTopic || wsId) params.set('scoped', 'true');

      const url = params.toString()
        ? `/api/v1/graph/elements?${params.toString()}`
        : '/api/v1/graph/elements';
      const elemRes = await fetch(url, { signal: controller.signal });
      let loadedNodes = [];
      let loadedEdges = [];

      if (elemRes.ok) {
        const elemData = await elemRes.json();
        loadedNodes = elemData.nodes || [];
        loadedEdges = elemData.edges || [];
      }

      const backendPaperNodes = loadedNodes.filter(n => (n.node_type || '').toLowerCase() === 'paper');

      if (backendPaperNodes.length === 0) {
        loadedNodes = [];
        loadedEdges = [];
      }

      setRawNodes(loadedNodes);
      setRawEdges(loadedEdges);

      // Check summary
      try {
        const sumRes = await fetch('/api/v1/graph/summary', { signal: controller.signal });
        if (sumRes.ok) {
          setSummaryData(await sumRes.json());
        }
      } catch (sumErr) {
        console.warn('Failed to load summary:', sumErr);
      }
    } catch (err) {
      console.error('Failed to load graph elements:', err);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleBuildWorkspaceGraph = async (forceRefresh = false) => {
    if (!addedToGraphPaperIds || addedToGraphPaperIds.length === 0) return;
    setBuildingGraph(true);
    const providerLabel = synthesisProvider === 'ollama' ? 'Local LLM (Ollama phi4-mini)' : synthesisProvider.toUpperCase();
    setBuildStatusMessage('Checking SQLite cache...');

    const activeTopic = (searchQuery || activeWorkspace?.title || graphSearchInput || 'General Literature').trim();
    const wsId = (activeWorkspace?.id || '').trim();

    try {
      if (!forceRefresh) {
        setBuildStatusMessage('Checking SQLite cache for pre-built graph...');
      } else {
        setBuildStatusMessage(`Synthesizing relationships with ${providerLabel}...`);
      }

      // Collect full paper metadata from search results, active workspace, or comparison papers
      const fullPapers = (addedToGraphPaperIds || []).map(pid => {
        const found =
          (searchResults || []).find(p => p.id === pid || p.arxiv_id === pid) ||
          (graphSearchResults || []).find(p => p.id === pid || p.arxiv_id === pid) ||
          (activeWorkspace?.papers || []).find(p => p.id === pid || p.arxiv_id === pid) ||
          (comparisonPapers || []).find(p => p.id === pid || p.arxiv_id === pid);
        if (found) {
          return {
            id: found.id || pid,
            title: found.title,
            abstract: found.abstract || '',
            arxiv_id: found.arxiv_id,
            doi: found.doi,
            year: found.year,
            authors: (found.authors || []).map(a => typeof a === 'string' ? a : a.name || String(a)),
            topics: found.topics || [],
          };
        }
        return { id: pid, title: pid };
      });

      const res = await fetch('/api/v1/graph/build-workspace-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId || null,
          topic: activeTopic,
          paper_ids: addedToGraphPaperIds,
          papers: fullPapers,
          force_refresh: forceRefresh,
          provider: synthesisProvider,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRawNodes(data.nodes || []);
        setRawEdges(data.edges || []);
        setSynthesisInfo({
          cached: data.cached,
          llm_called: data.llm_called,
          engine: data.engine || synthesisProvider,
          model: data.model || (synthesisProvider === 'ollama' ? 'phi4-mini' : ''),
          cross_paper_relations_count: data.cross_paper_relations_count || 0,
          gaps_count: data.gaps_count || 0,
          synthesis_summary: data.synthesis_summary || '',
          papers_count: data.papers_count || 0,
        });

        // Refresh coverage summary
        try {
          const sumRes = await fetch('/api/v1/graph/summary');
          if (sumRes.ok) {
            const sumData = await sumRes.json();
            setSummaryData(sumData);
          }
        } catch {}
      } else {
        console.error('Failed to build workspace graph:', await res.text());
      }
    } catch (err) {
      console.error('Error during graph synthesis:', err);
    } finally {
      setBuildingGraph(false);
      setBuildStatusMessage('');
    }
  };

  const handleGenerateNovelty = async (forceRefresh = false) => {
    setGeneratingNovelty(true);
    setInspectorTab('novelty');
    setNoveltySuccessMsg(null);
    const activeTopic = (searchQuery || activeWorkspace?.title || graphSearchInput || 'Literature Synthesis').trim();
    const wsId = (activeWorkspace?.id || '').trim();

    try {
      const res = await fetch('/api/v1/graph/generate-novelty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId || null,
          topic: activeTopic,
          paper_ids: addedToGraphPaperIds,
          force_refresh: forceRefresh,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNoveltyList(data.novelties || []);
      } else {
        console.error('Failed to generate novelty:', await res.text());
      }
    } catch (err) {
      console.error('Error during novelty synthesis:', err);
    } finally {
      setGeneratingNovelty(false);
    }
  };

  const handleAddNoveltyToGraph = async (novelty) => {
    const wsId = (activeWorkspace?.id || '').trim();
    setInjectingNoveltyId(novelty.id);
    setNoveltySuccessMsg(null);
    try {
      const res = await fetch('/api/v1/graph/add-novelty-to-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId || null,
          novelty: novelty,
        }),
      });
      if (res.ok) {
        setNoveltySuccessMsg(`Candidate node "${novelty.title}" added to Knowledge Graph!`);
        await fetchGraphData();
      }
    } catch (err) {
      console.error('Failed to add novelty to graph:', err);
    } finally {
      setInjectingNoveltyId(null);
    }
  };

  // Seed addedToGraphPaperIds from activeWorkspace.papers if staged list is empty
  useEffect(() => {
    if ((!addedToGraphPaperIds || addedToGraphPaperIds.length === 0) && activeWorkspace?.papers && activeWorkspace.papers.length > 0) {
      const pids = activeWorkspace.papers.map(p => p.id || p.arxiv_id).filter(Boolean);
      if (pids.length > 0) {
        setAddedToGraphPaperIds(pids);
      }
    }
  }, [activeWorkspace?.id, activeWorkspace?.papers?.length]);

  useEffect(() => {
    setSelectedEntity(null);
    setNeighborhood(null);
    fetchGraphData();
  }, [searchQuery, activeWorkspace?.id, activeWorkspace?.title, addedToGraphPaperIds?.length, activeWorkspace?.papers?.length]);

  const handleSearchPapers = async (customQuery) => {
    const term = (customQuery !== undefined ? customQuery : graphSearchInput).trim();
    if (!term) return;
    setGraphSearchLoading(true);
    try {
      const res = await fetch(`/api/v1/search/unified?q=${encodeURIComponent(term)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        const papers = data.results || (Array.isArray(data) ? data : []);
        setGraphSearchResults(papers);
      }
    } catch (err) {
      console.error('Failed to search papers for knowledge graph:', err);
    } finally {
      setGraphSearchLoading(false);
    }
  };

  const handleTogglePaperInGraph = async (paper) => {
    const pId = paper.id || paper.arxiv_id || paper.canonical_id || `paper-${paper.title?.slice(0, 15)}`;
    const currentTopic = (searchQuery || activeWorkspace?.title || graphSearchInput || 'General Literature').trim();
    const isAdded = addedToGraphPaperIds.includes(pId);

    setPaperIngestingMap(prev => ({ ...prev, [pId]: 'loading' }));

    if (isAdded) {
      try {
        await fetch('/api/v1/graph/remove-paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper_id: pId }),
        });
        setAddedToGraphPaperIds(prev => prev.filter(id => id !== pId));
        setPaperIngestingMap(prev => {
          const next = { ...prev };
          delete next[pId];
          return next;
        });
        await fetchGraphData();
      } catch {
        setPaperIngestingMap(prev => ({ ...prev, [pId]: 'error' }));
      }
    } else {
      try {
        const res = await fetch('/api/v1/graph/ingest-paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: currentTopic,
            workspace_id: activeWorkspace?.id || null,
            paper_data: {
              id: pId,
              title: paper.title,
              year: paper.year,
              authors: (paper.authors || []).map(a => typeof a === 'string' ? a : a.name || String(a)),
              abstract: paper.abstract || '',
              topics: paper.topics || [],
              arxiv_id: paper.arxiv_id || (pId.startsWith('arxiv:') ? pId.replace('arxiv:', '') : null),
              doi: paper.doi || null,
              openalex_id: paper.openalex_id || null,
              url: paper.url || null,
              primary_source: paper.primary_source || 'unknown',
              citation_count: paper.citation_count || 0,
              referenced_works: paper.referenced_works || paper.cited_papers || [],
              cited_papers: paper.referenced_works || paper.cited_papers || [],
              methods: paper.methods || [],
              datasets: paper.datasets || [],
              benchmarks: paper.benchmarks || [],
            }
          }),
        });

        if (res.ok) {
          setPaperIngestingMap(prev => ({ ...prev, [pId]: 'done' }));
          setAddedToGraphPaperIds(prev => (prev.includes(pId) ? prev : [...prev, pId]));
          await fetchGraphData();
        } else {
          setPaperIngestingMap(prev => ({ ...prev, [pId]: 'error' }));
        }
      } catch {
        setPaperIngestingMap(prev => ({ ...prev, [pId]: 'error' }));
      }
    }
  };

  const handleClearGraph = async () => {
    try {
      await fetch('/api/v1/graph/clear', { method: 'POST' });
      setRawNodes([]);
      setRawEdges([]);
      setSelectedEntity(null);
      setNeighborhood(null);
      setAddedToGraphPaperIds([]);
      setSynthesisInfo(null);
    } catch (err) {
      console.error('Failed to clear graph:', err);
    }
  };

  const handleSeedGraph = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/v1/graph/seed-sample', { method: 'POST' });
      if (res.ok) {
        await fetchGraphData();
      }
    } catch (err) {
      console.error('Failed to seed graph:', err);
    } finally {
      setSeeding(false);
    }
  };



  // Active papers to display in Multi-Paper Comparison Matrix
  const activeComparisonPapers = useMemo(() => {
    if (comparisonPapers.length > 0) {
      return comparisonPapers;
    }
    if (searchResults && searchResults.length > 0) {
      return searchResults.slice(0, 4);
    }
    return [];
  }, [comparisonPapers, searchResults]);

  // Filter nodes and edges strictly following the user's sketch (Screenshot from 2026-09-12 19-18-20.png):
  // 1. Center Head node: Topic Name (pill capsule)
  // 2. Subnodes: Papers (rectangles) connected to Topic Name
  // 3. Circles: Connection nodes that sit strictly BETWEEN 2 or more papers!
  //    If there is no connection between papers, no circle node is created!
  const filteredData = useMemo(() => {
    const activeTopicStr = (searchQuery || activeWorkspace?.title || '').trim();

    // 1. Identify existing topic node in rawNodes or construct a clean ID
    const existingTopicNode = rawNodes.find(n => (n.node_type || '').toLowerCase() === 'topic');
    const topicId = existingTopicNode?.id || (
      activeTopicStr
        ? `topic-${activeTopicStr.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}`
        : 'topic-main'
    );
    const topicLabel = existingTopicNode?.label || existingTopicNode?.data?.name || activeTopicStr || 'Research Topic';

    // 2. Separate papers from other entities and deduplicate by canonical keys (DOI, arXiv, OpenAlex, Title)
    const rawPaperNodes = rawNodes.filter(n => (n.node_type || '').toLowerCase() === 'paper');

    const getCanonicalPaperKey = (node) => {
      if (!node) return '';
      const d = node.data || {};
      const rawDoi = d.doi || node.doi || (String(node.id || '').startsWith('10.') || String(node.id || '').startsWith('doi:') ? node.id : '');
      if (rawDoi) {
        const m = String(rawDoi).toLowerCase().match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/);
        if (m) return `doi:${m[0].replace(/[.;,]$/, '')}`;
      }
      const rawArxiv = d.arxiv_id || node.arxiv_id || node.id || '';
      const mArxiv = String(rawArxiv).match(/(\d{4}\.\d{4,5})/);
      if (mArxiv) return `arxiv:${mArxiv[1]}`;

      const rawOa = d.openalex_id || node.openalex_id || node.id || '';
      const mOa = String(rawOa).toLowerCase().match(/w\d+/);
      if (mOa && !mOa[0].startsWith('ws-')) return `oa:${mOa[0]}`;

      const title = d.title || d.name || node.label || node.title || '';
      const normTitle = String(title).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normTitle.length >= 15) return `title:${normTitle}`;

      return node.id;
    };

    const paperNodeMap = new Map();
    const paperAliasMap = new Map();

    rawPaperNodes.forEach(p => {
      const key = getCanonicalPaperKey(p);
      if (!paperNodeMap.has(key)) {
        paperNodeMap.set(key, p);
        paperAliasMap.set(p.id, p.id);
      } else {
        const existing = paperNodeMap.get(key);
        paperAliasMap.set(p.id, existing.id);
        // Merge attributes if existing node lacks year/doi/authors/abstract
        if (!existing.data) existing.data = {};
        if (p.data) {
          if (!existing.data.year && p.data.year) existing.data.year = p.data.year;
          if (!existing.data.doi && p.data.doi) existing.data.doi = p.data.doi;
          if (!existing.data.abstract && p.data.abstract) existing.data.abstract = p.data.abstract;
          if (!existing.data.authors && p.data.authors) existing.data.authors = p.data.authors;
        }
      }
    });

    const paperNodes = Array.from(paperNodeMap.values());
    const paperIds = new Set(paperNodes.map(n => n.id));

    // If no papers have been added yet, return empty
    if (paperIds.size === 0) {
      return { nodes: [], edges: [] };
    }

    // 3. Central topic head node
    const topicNode = {
      id: topicId,
      label: topicLabel,
      node_type: 'topic',
      title: `[TOPIC] ${topicLabel}`,
      data: existingTopicNode?.data || { name: topicLabel, id: topicId, query: topicLabel },
    };

    // 4. Edges pool: remap any old/stale topic references and duplicate paper aliases
    const topicNodeIds = new Set(
      rawNodes.filter(n => (n.node_type || '').toLowerCase() === 'topic').map(n => n.id)
    );
    topicNodeIds.add(topicId);

    const remappedEdges = [];
    const existingEdgeKeys = new Set();

    rawEdges.forEach(e => {
      let s = paperAliasMap.get(e.source) || e.source;
      let t = paperAliasMap.get(e.target) || e.target;
      if (topicNodeIds.has(s)) s = topicId;
      if (topicNodeIds.has(t)) t = topicId;
      if (s === t) return; // Prevent self-loops
      const key = `${s}->${t}:${(e.relation || '').toLowerCase()}`;
      if (!existingEdgeKeys.has(key)) {
        existingEdgeKeys.add(key);
        remappedEdges.push({ ...e, source: s, target: t });
      }
    });

    // 5. CRITICAL: Guarantee every single paper connects to the central topic head node!
    paperIds.forEach(pId => {
      const hasTopicEdge = remappedEdges.some(
        e => (e.source === topicId && e.target === pId) || (e.source === pId && e.target === topicId)
      );
      if (!hasTopicEdge) {
        remappedEdges.push({
          source: topicId,
          target: pId,
          relation: 'covers',
          label: 'Explores',
        });
      }
    });

    // 6. Prune leaf entity circles (methods, datasets, metrics) that only connect to 1 paper
    // When paperIds.size >= 2, only keep intermediate entities connecting to >= 2 papers (or gap nodes)
    const paperConnectionCount = new Map();
    remappedEdges.forEach(e => {
      if (paperIds.has(e.source) && !paperIds.has(e.target) && e.target !== topicId) {
        if (!paperConnectionCount.has(e.target)) paperConnectionCount.set(e.target, new Set());
        paperConnectionCount.get(e.target).add(e.source);
      }
      if (paperIds.has(e.target) && !paperIds.has(e.source) && e.source !== topicId) {
        if (!paperConnectionCount.has(e.source)) paperConnectionCount.set(e.source, new Set());
        paperConnectionCount.get(e.source).add(e.target);
      }
    });

    // 6. Retain connected entity nodes (methods, datasets, gaps, candidates)
    // Shared entities (connecting >= 2 papers) and research gaps are always prioritized.
    // Distinct paper-specific entities are also kept (up to 4 per paper) so each paper has its methods & benchmarks visible!
    const sharedEntities = [];
    const paperSpecificEntities = [];

    rawNodes.forEach(n => {
      const ntype = (n.node_type || '').toLowerCase();
      if (ntype === 'topic' || ntype === 'paper') return;
      if (['method', 'dataset', 'gap', 'metric'].includes(ntype)) {
        const connectedPapers = paperConnectionCount.get(n.id);
        const count = connectedPapers ? connectedPapers.size : 0;
        const isCandidate = n.id.startsWith('cand-') || n.data?.category === 'Proposed Novelty';
        if (ntype === 'gap' || isCandidate) {
          sharedEntities.push(n);
        } else if (count >= 2) {
          sharedEntities.push(n);
        } else if (count >= 1) {
          paperSpecificEntities.push(n);
        }
      }
    });

    const bridgeNodes = [...sharedEntities];
    const bridgeNodeIds = new Set(bridgeNodes.map(n => n.id));

    // Distribute up to 4 methods and datasets per paper for clean satellite presentation
    const perPaperEntityCounts = new Map();
    paperSpecificEntities.forEach(n => {
      const connectedPapers = paperConnectionCount.get(n.id) || new Set();
      for (const pId of connectedPapers) {
        const currentCount = perPaperEntityCounts.get(pId) || 0;
        if (currentCount < 4 && !bridgeNodeIds.has(n.id)) {
          perPaperEntityCounts.set(pId, currentCount + 1);
          bridgeNodes.push(n);
          bridgeNodeIds.add(n.id);
        }
      }
    });

    // 7. Assemble final nodes: Topic + Papers + Bridge Nodes
    const finalNodes = [topicNode, ...paperNodes, ...bridgeNodes];
    const validNodeIds = new Set(finalNodes.map(n => n.id));

    // 8. Filter edges strictly between valid nodes
    let finalEdges = remappedEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

    // If showCitations is false, remove 'cites' edges to prevent the unreadable criss-crossing hairball
    if (!showCitations) {
      finalEdges = finalEdges.filter(e => (e.relation || '').toLowerCase() !== 'cites');
    }

    // 9. Apply user UI filters (nodeTypeFilter, relationFilter, searchTerm)
    let filteredNodes = finalNodes;
    if (nodeTypeFilter !== 'all') {
      filteredNodes = filteredNodes.filter(n => (n.node_type || 'paper').toLowerCase() === nodeTypeFilter.toLowerCase());
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredNodes = filteredNodes.filter(n =>
        (n.label || '').toLowerCase().includes(term) ||
        (n.title || '').toLowerCase().includes(term) ||
        (n.id || '').toLowerCase().includes(term)
      );
    }

    const currentValidIds = new Set(filteredNodes.map(n => n.id));
    let displayEdges = finalEdges.filter(e => currentValidIds.has(e.source) && currentValidIds.has(e.target));

    if (relationFilter !== 'all') {
      displayEdges = displayEdges.filter(e => (e.relation || '').toLowerCase() === relationFilter.toLowerCase());
    }

    return {
      nodes: filteredNodes,
      edges: displayEdges,
    };
  }, [rawNodes, rawEdges, nodeTypeFilter, relationFilter, searchTerm, searchQuery, activeWorkspace?.title, showCitations]);

  const paperNodesCount = useMemo(() => {
    return (filteredData.nodes || []).filter(n => (n.node_type || '').toLowerCase() === 'paper').length;
  }, [filteredData]);

  // Render Vis Network with forceAtlas2 collision avoidance
  useEffect(() => {
    let timer;
    if (graphMode === 'graph' && filteredData.nodes.length > 0) {
      // Delay briefly to ensure containerRef is accurately measured in the DOM
      timer = setTimeout(() => {
        renderVisGraph();
      }, 50);
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (networkRef.current) {
        try {
          networkRef.current.destroy();
        } catch (e) {}
        networkRef.current = null;
      }
    };
  }, [graphMode, theme, filteredData, loading, layoutMode]);

  const renderVisGraph = () => {
    if (!containerRef.current || filteredData.nodes.length === 0) return;

    if (networkRef.current) {
      try {
        networkRef.current.destroy();
      } catch (e) {}
      networkRef.current = null;
    }

    const isDark = theme === 'dark';
    const isHierarchical = layoutMode === 'hierarchical';

    // Compute spacious seed positions so nodes start well-spaced in a radial layout
    const seedPositions = computeSpaciousSeedPositions(filteredData.nodes, filteredData.edges);

    const nodes = filteredData.nodes.map(n => {
      const ntype = (n.node_type || 'paper').toLowerCase();
      const rawLabel = n.data?.title || n.data?.name || n.data?.text || n.label || n.id || 'Paper';
      const isCandidate = n.id.startsWith('cand-') || n.data?.category === 'Proposed Novelty';

      let formattedLabel;
      let shape = 'box';
      let borderRadius = 6;
      let mass = 1;
      let bg, border, textColor, highlightBg, highlightBorder;
      let level = 3;

      if (ntype === 'topic') {
        formattedLabel = wrapLabel(rawLabel, 20);
        shape = 'box';
        borderRadius = 20; // Pill capsule matching sketch
        mass = 8; // Central anchor
        level = 1;
        bg = isDark ? '#312e81' : '#1e1b4b'; // Deep rich indigo
        border = isDark ? '#818cf8' : '#3730a3';
        textColor = '#ffffff'; // Pure white bold text
        highlightBg = isDark ? '#4338ca' : '#312e81';
        highlightBorder = '#a5b4fc';
      } else if (isCandidate) {
        formattedLabel = `PROPOSED:\n${wrapLabel(rawLabel, 18)}`;
        shape = 'box';
        borderRadius = 8;
        mass = 3;
        level = 2;
        bg = isDark ? '#064e3b' : '#ecfdf5';
        border = isDark ? '#059669' : '#86efac';
        textColor = isDark ? '#ecfdf5' : '#065f46';
        highlightBg = isDark ? '#047857' : '#d1fae5';
        highlightBorder = '#10b981';
      } else if (ntype === 'paper') {
        const yearPart = n.data?.year ? `\n(${n.data.year})` : '';
        formattedLabel = wrapLabel(rawLabel, 20) + yearPart;
        shape = 'box';
        borderRadius = 6; // Crisp publication card
        mass = 3;
        level = 2;
        bg = isDark ? '#1c1917' : '#ffffff';
        border = isDark ? '#44403c' : '#cbd5e1';
        textColor = isDark ? '#fafaf9' : '#0f172a';
        highlightBg = isDark ? '#292524' : '#f8fafc';
        highlightBorder = isDark ? '#818cf8' : '#4f46e5';
      } else if (ntype === 'method') {
        formattedLabel = wrapLabel(rawLabel, 16);
        shape = 'box';
        borderRadius = 14;
        mass = 1.2;
        level = 3;
        bg = isDark ? '#064e3b' : '#f0fdf4';
        border = isDark ? '#059669' : '#86efac';
        textColor = isDark ? '#a7f3d0' : '#166534';
        highlightBg = isDark ? '#047857' : '#dcfce7';
        highlightBorder = '#10b981';
      } else if (ntype === 'dataset') {
        formattedLabel = wrapLabel(rawLabel, 16);
        shape = 'box';
        borderRadius = 14;
        mass = 1.2;
        level = 3;
        bg = isDark ? '#451a03' : '#fefce8';
        border = isDark ? '#d97706' : '#fde047';
        textColor = isDark ? '#fde68a' : '#854d0e';
        highlightBg = isDark ? '#78350f' : '#fef9c3';
        highlightBorder = '#f59e0b';
      } else if (ntype === 'gap') {
        formattedLabel = `GAP:\n${wrapLabel(rawLabel, 18)}`;
        shape = 'box';
        borderRadius = 8;
        mass = 2;
        level = 4;
        bg = isDark ? '#4c0519' : '#fff1f2';
        border = isDark ? '#e11d48' : '#fecdd3';
        textColor = isDark ? '#fecdd3' : '#9f1239';
        highlightBg = isDark ? '#881337' : '#ffe4e6';
        highlightBorder = '#e11d48';
      } else {
        formattedLabel = wrapLabel(rawLabel, 16);
        shape = 'box';
        borderRadius = 10;
        mass = 1;
        level = 3;
        bg = isDark ? '#1e293b' : '#f1f5f9';
        border = isDark ? '#475569' : '#cbd5e1';
        textColor = isDark ? '#e2e8f0' : '#1e293b';
        highlightBg = isDark ? '#334155' : '#e2e8f0';
        highlightBorder = isDark ? '#94a3b8' : '#475569';
      }

      const seed = seedPositions[n.id];

      return {
        id: n.id,
        label: formattedLabel,
        title: `${ntype.toUpperCase()}: ${rawLabel}`,
        shape,
        borderRadius,
        mass,
        level,
        x: seed ? seed.x : undefined,
        y: seed ? seed.y : undefined,
        color: {
          background: bg,
          border: border,
          highlight: { background: highlightBg, border: highlightBorder },
          hover: { background: highlightBg, border: highlightBorder },
        },
        font: {
          color: textColor,
          size: ntype === 'topic' ? 12.5 : ntype === 'paper' ? 11 : 10,
          face: 'Plus Jakarta Sans, -apple-system, sans-serif',
          bold: {
            color: textColor,
            size: ntype === 'topic' ? 12.5 : 11,
            face: 'Plus Jakarta Sans, -apple-system, sans-serif',
            mod: 'bold',
          },
        },
        widthConstraint: ntype === 'topic'
          ? { minimum: 140, maximum: 200 }
          : (ntype === 'paper' || isCandidate)
          ? { minimum: 150, maximum: 200 }
          : (ntype === 'method' || ntype === 'dataset')
          ? { minimum: 70, maximum: 140 }
          : { minimum: 100, maximum: 150 },
        margin: ntype === 'topic'
          ? { top: 8, right: 16, bottom: 8, left: 16 }
          : (ntype === 'paper' || isCandidate)
          ? { top: 8, right: 12, bottom: 8, left: 12 }
          : { top: 5, right: 9, bottom: 5, left: 9 },
        borderWidth: ntype === 'topic' ? 2 : 1.5,
        shadow: {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.05)',
          size: ntype === 'topic' ? 6 : 3,
          x: 0,
          y: 2,
        },
        data: n.data,
        nodeType: ntype,
      };
    });

    const edges = filteredData.edges.map(e => {
      const rel = (e.relation || 'relates_to').toLowerCase();
      const isTopicEdge = rel === 'covers' || rel === 'investigates' || rel === 'has_paper';
      const isCite = rel === 'cites';
      const isCrossPaper = rel === 'cross_paper' || rel === 'builds_upon' || rel === 'compares_with';
      // Suppress spammy 'References' text label to avoid criss-crossing clutter
      const friendlyLabel = isCite ? '' : (FRIENDLY_RELATION_LABELS[rel] || (e.label || rel.replace(/_/g, ' ')));
      const edgeLineColor = EDGE_COLORS[rel] || (isDark
        ? (isTopicEdge ? '#818cf8' : '#a1a1aa')
        : (isTopicEdge ? '#4f46e5' : '#64748b'));

      // Determine spring length and spring strength by relation type
      let edgeLength = 220;
      let edgeSpringConstant = 0.025;

      if (isTopicEdge) {
        edgeLength = 240; // Expand papers comfortably out from central topic
        edgeSpringConstant = 0.04;
      } else if (isCite || isCrossPaper) {
        edgeLength = 270; // Keep papers well-spaced
        edgeSpringConstant = 0.01;
      } else if (rel === 'uses_method' || rel === 'uses_dataset' || rel === 'evaluates_on' || rel === 'proposes_method') {
        edgeLength = 120; // Neat outward branches
        edgeSpringConstant = 0.045;
      }

      return {
        id: `${e.source}->${e.target}:${e.relation}`,
        from: e.source,
        to: e.target,
        label: friendlyLabel,
        length: edgeLength,
        springConstant: edgeSpringConstant,
        dashes: isCite ? [4, 6] : false,
        color: {
          color: edgeLineColor,
          highlight: isDark ? '#ffffff' : '#000000',
          hover: isDark ? '#ffffff' : '#000000',
          opacity: isCite ? 0.35 : (isTopicEdge ? 0.95 : 0.85),
        },
        font: friendlyLabel ? {
          color: isDark ? '#d4d4d8' : '#334155',
          size: 9,
          face: 'Plus Jakarta Sans, sans-serif',
          align: 'middle',
          background: isDark ? '#141416' : '#ffffff',
          strokeWidth: 0,
        } : undefined,
        arrows: {
          to: { enabled: true, scaleFactor: isCite ? 0.45 : (isTopicEdge ? 0.75 : 0.65) },
        },
        smooth: { type: 'continuous', roundness: 0.15 },
        width: isCite ? 1.0 : (isTopicEdge ? 2.2 : 1.8),
      };
    });

    // Graph physics & layout options - spacious non-overlapping layout
    const options = {
      physics: {
        enabled: !isPhysicsFrozen && !isHierarchical,
        solver: 'barnesHut',
        barnesHut: {
          gravitationalConstant: -10000, // Strong repulsion preventing card collision
          centralGravity: 0.05,          // Natural centering
          springLength: 200,
          springConstant: 0.025,
          damping: 0.7,
          avoidOverlap: 1.0,             // Vis.js strictly enforces bounding box clearance
        },
        maxVelocity: 25,
        minVelocity: 0.5,
        stabilization: {
          enabled: true,
          iterations: isHierarchical ? 100 : 350,
          updateInterval: 25,
          fit: true,
        },
      },
      layout: isHierarchical
        ? {
            hierarchical: {
              enabled: true,
              direction: 'UD',
              sortMethod: 'directed',
              levelSeparation: 190,
              nodeSpacing: 240,
              treeSpacing: 280,
              blockShifting: true,
              edgeMinimization: true,
              parentCentralization: true,
            },
          }
        : {
            hierarchical: { enabled: false },
            improvedLayout: false, // Don't let vis-network override our pre-calculated radial seed positions
          },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        selectable: true,
        selectConnectedEdges: true,
        navigationButtons: false,
      },
    };

    const network = new Network(containerRef.current, { nodes, edges }, options);
    networkRef.current = network;

    // Auto-fit and FREEZE physics upon stabilization to prevent unwanted continuous motion
    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
      setIsPhysicsFrozen(true);
      network.fit({
        nodes: filteredData.nodes.map(n => n.id),
        animation: { duration: 350, easingFunction: 'easeInOutQuad' },
      });
    });

    network.on('stabilized', () => {
      network.setOptions({ physics: { enabled: false } });
      setIsPhysicsFrozen(true);
    });

    network.on('dragEnd', () => {
      // Keep physics frozen when dragging ends so nodes don't endlessly drift or wobble
      network.setOptions({ physics: { enabled: false } });
      setIsPhysicsFrozen(true);
    });

    const handleSelectNode = async (foundNode) => {
      const nodeId = foundNode.id;
      const ntype = (foundNode.node_type || 'ENTITY').toUpperCase();

      // 1. Compute local connections from filteredEdges & filteredNodes
      const outgoing = (filteredData.edges || [])
        .filter(e => e.source === nodeId)
        .map(e => {
          const targetNode = filteredData.nodes.find(n => n.id === e.target) || rawNodes.find(n => n.id === e.target);
          return {
            direction: 'outgoing',
            relation: e.relation || 'connected_to',
            target: e.target,
            neighbor: targetNode,
          };
        });

      const incoming = (filteredData.edges || [])
        .filter(e => e.target === nodeId)
        .map(e => {
          const sourceNode = filteredData.nodes.find(n => n.id === e.source) || rawNodes.find(n => n.id === e.source);
          return {
            direction: 'incoming',
            relation: e.relation || 'connected_to',
            source: e.source,
            neighbor: sourceNode,
          };
        });

      const localEdges = [...outgoing, ...incoming];
      const localNeighbors = localEdges.map(le => le.neighbor).filter(Boolean);

      setSelectedEntity({
        id: foundNode.id,
        title: foundNode.data?.name || foundNode.data?.title || foundNode.data?.text || foundNode.label,
        type: ntype,
        raw: foundNode.data,
        source: foundNode.data?.source,
        target: foundNode.data?.target,
        relation: foundNode.data?.relation || foundNode.label,
      });

      setNeighborhood({
        node: foundNode,
        edges: localEdges,
        neighbors: localNeighbors,
        total_neighbors: localEdges.length,
      });

      // 2. If it's a persistent backend node, fetch additional metadata in background
      if (!nodeId.startsWith('rel-') && !nodeId.startsWith('topic-')) {
        try {
          const neighRes = await fetch(`/api/v1/graph/node/${encodeURIComponent(nodeId)}/neighborhood`);
          if (neighRes.ok) {
            const neighData = await neighRes.json();
            if (neighData && neighData.edges && neighData.edges.length > 0) {
              setNeighborhood(prev => ({
                ...prev,
                ...neighData,
                edges: neighData.edges.length > 0 ? neighData.edges : prev.edges,
              }));
            }
          }
        } catch {
          // Graceful local neighborhood fallback
        }
      }
    };

    network.on('click', async (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const foundNode = filteredData.nodes.find(n => n.id === nodeId) || rawNodes.find(n => n.id === nodeId);
        if (foundNode) {
          setIsInspectorOpen(true);
          setInspectorTab('inspector');
          handleSelectNode(foundNode);
        }
      } else if (params.edges.length > 0) {
        setIsInspectorOpen(true);
        setInspectorTab('inspector');
        const edgeId = params.edges[0];
        const foundEdge = filteredData.edges.find(e => `${e.source}->${e.target}:${e.relation}` === edgeId) ||
          filteredData.edges.find(e => e.source === edgeId || e.target === edgeId);
        if (foundEdge) {
          const srcNode = filteredData.nodes.find(n => n.id === foundEdge.source);
          const tgtNode = filteredData.nodes.find(n => n.id === foundEdge.target);
          const relLabel = FRIENDLY_RELATION_LABELS[(foundEdge.relation || '').toLowerCase()] || foundEdge.relation;

          setSelectedEntity({
            id: edgeId,
            title: `Relationship: ${relLabel}`,
            type: 'RELATIONSHIP',
            raw: { relation: foundEdge.relation, source: foundEdge.source, target: foundEdge.target },
            source: foundEdge.source,
            target: foundEdge.target,
            relation: relLabel,
          });

          setNeighborhood({
            node: { id: edgeId, label: relLabel },
            edges: [
              { direction: 'incoming', relation: foundEdge.relation, source: foundEdge.source, neighbor: srcNode },
              { direction: 'outgoing', relation: foundEdge.relation, target: foundEdge.target, neighbor: tgtNode },
            ],
            neighbors: [srcNode, tgtNode].filter(Boolean),
            total_neighbors: 2,
          });
        }
      }
    });
  };

  const handleResetFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    }
  };

  const handleFocusNode = (nodeId) => {
    if (networkRef.current && nodeId) {
      networkRef.current.focus(nodeId, {
        scale: 1.2,
        animation: { duration: 800, easingFunction: 'easeInOutQuad' },
      });
      networkRef.current.selectNodes([nodeId]);
      const found = filteredData.nodes.find(n => n.id === nodeId) || rawNodes.find(n => n.id === nodeId);
      if (found) {
        // Automatically select the node in inspector as well
        const ntype = (found.node_type || 'ENTITY').toUpperCase();
        const outgoing = (filteredData.edges || [])
          .filter(e => e.source === nodeId)
          .map(e => ({
            direction: 'outgoing',
            relation: e.relation || 'connected_to',
            target: e.target,
            neighbor: filteredData.nodes.find(n => n.id === e.target) || rawNodes.find(n => n.id === e.target),
          }));
        const incoming = (filteredData.edges || [])
          .filter(e => e.target === nodeId)
          .map(e => ({
            direction: 'incoming',
            relation: e.relation || 'connected_to',
            source: e.source,
            neighbor: filteredData.nodes.find(n => n.id === e.source) || rawNodes.find(n => n.id === e.source),
          }));
        const localEdges = [...outgoing, ...incoming];
        setSelectedEntity({
          id: found.id,
          title: found.data?.name || found.data?.title || found.data?.text || found.label,
          type: ntype,
          raw: found.data,
          source: found.data?.source,
          target: found.data?.target,
          relation: found.data?.relation || found.label,
        });
        setNeighborhood({
          node: found,
          edges: localEdges,
          neighbors: localEdges.map(le => le.neighbor).filter(Boolean),
          total_neighbors: localEdges.length,
        });
      }
    }
  };

  const openInReader = (paperData) => {
    if (paperData) {
      setActiveReaderPaper({
        id: paperData.id,
        title: paperData.title,
        authors: paperData.authors,
        year: paperData.year,
        pdf_url: paperData.pdf_url || `https://arxiv.org/pdf/${paperData.id}.pdf`,
      });
      navigate('/pdf-inspector');
    }
  };

  return (
    <section id="view-knowledge-graph" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Research Knowledge Graph</h1>
          <p className="panel-subtitle">
            Interactive multi-hop semantic relationship graph linking papers, methods, benchmark datasets, and claims.
            {searchQuery && (
              <span className="badge badge-blue" style={{ marginLeft: 8, whiteSpace: 'nowrap', display: 'inline-block' }}>
                Topic: {searchQuery}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-secondary btn-sm ${graphMode === 'graph' ? 'btn-primary' : ''}`}
            onClick={() => setGraphMode('graph')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <NetworkIcon size={13} />
            <span>Graph Canvas</span>
          </button>
          <button
            className={`btn btn-secondary btn-sm ${graphMode === 'compare' ? 'btn-primary' : ''}`}
            onClick={() => setGraphMode('compare')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Columns3 size={13} />
            <span>Multi-Paper Comparison ({activeComparisonPapers.length})</span>
          </button>
          {graphMode === 'graph' && (
            <>
              <select
                value={synthesisProvider}
                onChange={(e) => setSynthesisProvider(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                title="AI Engine for Knowledge Graph synthesis"
              >
                <option value="ollama">Local LLM (Ollama phi4-mini)</option>
                <option value="gemini">Gemini (Flash-Lite)</option>
                <option value="groq">Groq</option>
                <option value="deepseek">DeepSeek</option>
                <option value="nvidia">NVIDIA NIM</option>
                <option value="openrouter">OpenRouter</option>
              </select>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleBuildWorkspaceGraph(false)}
                disabled={buildingGraph || addedToGraphPaperIds.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--accent-primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
                title="Synthesize cross-paper connections (EXTENDS, COMPARED_TO, shared methods, benchmarks, gaps) with selected AI Engine & SQLite cache"
              >
                {buildingGraph ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>{buildStatusMessage || 'Synthesizing...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>Build AI Graph ({addedToGraphPaperIds.length})</span>
                  </>
                )}
              </button>

              {synthesisInfo && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleBuildWorkspaceGraph(true)}
                  disabled={buildingGraph || addedToGraphPaperIds.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  title="Force re-synthesis with selected AI Engine (bypasses SQLite cache)"
                >
                  <RotateCw size={12} className={buildingGraph ? 'animate-spin' : ''} />
                  <span>Re-synthesize</span>
                </button>
              )}

              <button
                className="btn btn-sm"
                onClick={() => handleGenerateNovelty(false)}
                disabled={generatingNovelty || addedToGraphPaperIds.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 600,
                  border: 'none',
                  boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)',
                  cursor: addedToGraphPaperIds.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: addedToGraphPaperIds.length === 0 ? 0.6 : 1,
                }}
                title="Synthesize 4-quadrant scientific novelty proposals from graph topology with Gemini & SQLite cache"
              >
                {generatingNovelty ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Lightbulb size={13} />
                    <span>Novelty Ideas {noveltyList.length > 0 ? `(${noveltyList.length})` : ''}</span>
                  </>
                )}
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={fetchGraphData}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title="Reload Knowledge Graph"
              >
                <RotateCw size={13} />
                <span>Reload</span>
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleResetFit}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title="Reset Zoom and Fit to Screen"
              >
                <Maximize2 size={13} />
                <span>Fit</span>
              </button>
              <button
                className={`btn btn-sm ${isSearchOpen ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title={isSearchOpen ? "Collapse paper search" : "Search & add more papers to graph"}
              >
                {isSearchOpen ? <ChevronUp size={13} /> : <Plus size={13} />}
                <span>{isSearchOpen ? 'Collapse Search' : 'Add Papers'}</span>
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleClearGraph}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title="Clear Knowledge Graph Canvas"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Literature to Add to Knowledge Graph */}
      {graphMode === 'graph' && (addedToGraphPaperIds.length === 0 || isSearchOpen) && (
        <div
          className="card"
          style={{
            padding: '12px 16px',
            marginBottom: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={15} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Search Papers & Add to Knowledge Graph
              </span>
              <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                {addedToGraphPaperIds.length} Added
              </span>
            </div>
            {graphSearchResults.length > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setGraphSearchResults([])}
                style={{ fontSize: 11.5, padding: '2px 8px' }}
              >
                Clear Results
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchPapers();
            }}
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={graphSearchInput}
                onChange={(e) => setGraphSearchInput(e.target.value)}
                placeholder="Search literature by topic, keyword, or paper title to add to graph (e.g. FlashAttention, LoRA, KV Cache)..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={graphSearchLoading || !graphSearchInput.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90, justifyContent: 'center' }}
            >
              {graphSearchLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              <span>Search</span>
            </button>
          </form>

          {/* Search Results Paper Cards Tray */}
          {graphSearchResults.length > 0 && (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 280,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {graphSearchResults.map((paper, idx) => {
                const pId = paper.id || paper.arxiv_id || paper.canonical_id || `paper-${idx}`;
                const isAdded = addedToGraphPaperIds.includes(pId);
                const status = paperIngestingMap[pId];

                return (
                  <div
                    key={pId || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      border: isAdded ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {paper.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {paper.year && <span>{paper.year}</span>}
                        {paper.authors && paper.authors.length > 0 && (
                          <span>&bull; {paper.authors.slice(0, 2).map(a => typeof a === 'string' ? a : a.name || String(a)).join(', ')}</span>
                        )}
                        {paper.citation_count !== undefined && paper.citation_count !== null && (
                          <span>&bull; {paper.citation_count.toLocaleString()} citations</span>
                        )}
                        <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 5px' }}>
                          {paper.primary_source || (pId.startsWith('arxiv') ? 'arXiv' : 'literature')}
                        </span>
                      </div>
                    </div>

                    <button
                      className={`btn btn-sm ${isAdded ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => handleTogglePaperInGraph(paper)}
                      disabled={status === 'loading'}
                      style={{
                        minWidth: 120,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        flexShrink: 0,
                        fontSize: 12,
                      }}
                    >
                      {status === 'loading' ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>{isAdded ? 'Removing...' : 'Ingesting...'}</span>
                        </>
                      ) : isAdded ? (
                        <>
                          <Check size={12} style={{ color: 'var(--accent-primary)' }} />
                          <span>In Graph</span>
                          <span style={{ fontSize: 10, opacity: 0.7 }}>(Remove)</span>
                        </>
                      ) : (
                        <>
                          <Plus size={13} />
                          <span>Add to Graph</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Synthesis Status Banner */}
      {graphMode === 'graph' && synthesisInfo && (
        <div
          className="card"
          style={{
            padding: '10px 16px',
            marginBottom: 12,
            background: synthesisInfo.cached ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.08)',
            border: `1px solid ${synthesisInfo.cached ? 'rgba(16, 185, 129, 0.35)' : 'rgba(99, 102, 241, 0.35)'}`,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {synthesisInfo.cached ? <Zap size={16} style={{ color: 'var(--success)' }} /> : <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>
                  {synthesisInfo.cached
                    ? `Retrieved from SQLite Cache (0 API Cost • ${synthesisInfo.engine === 'ollama' ? 'Local Ollama' : (synthesisInfo.engine ? synthesisInfo.engine.toUpperCase() : 'Cache')})`
                    : `Synthesized with ${synthesisInfo.engine === 'ollama' ? 'Local LLM (Ollama phi4-mini)' : (synthesisInfo.engine ? synthesisInfo.engine.toUpperCase() : 'AI Engine')} & Cached in SQLite`}
                </span>
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                  {synthesisInfo.cached ? 'Zero API Cost' : (synthesisInfo.engine === 'ollama' ? 'Local & Private' : 'Batch Synthesized')}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>
                {synthesisInfo.synthesis_summary ||
                  `${synthesisInfo.cross_paper_relations_count || 0} cross-paper relations and ${synthesisInfo.gaps_count || 0} research gaps mapped across ${synthesisInfo.papers_count || addedToGraphPaperIds.length} papers.`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              {synthesisInfo.cross_paper_relations_count || 0} Cross-Paper Relations
            </span>
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              {synthesisInfo.gaps_count || 0} Research Gaps
            </span>
          </div>
        </div>
      )}

      {/* Filter & Control Bar */}
      {graphMode === 'graph' && (
        <div className="search-bar-box" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter nodes by name..."
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                width: '100%',
              }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Filter size={12} />
              Type:
              <select
                value={nodeTypeFilter}
                onChange={(e) => setNodeTypeFilter(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: 12,
                }}
              >
                <option value="all">All Entity Types</option>
                <option value="topic">Topic</option>
                <option value="paper">Papers</option>
                <option value="method">Methods</option>
                <option value="dataset">Datasets</option>
                <option value="gap">Research Gaps</option>
              </select>
            </label>

            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Relation:
              <select
                value={relationFilter}
                onChange={(e) => setRelationFilter(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: 12,
                }}
              >
                <option value="all">All Relationships</option>
                <option value="covers">Topic Focus (COVERS)</option>
                <option value="uses_method">Uses Method</option>
                <option value="evaluates_on">Evaluates On</option>
                <option value="cites">Cites</option>
                <option value="solves">Solves</option>
              </select>
            </label>

            {/* Prominent AI Engine Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '2px 6px' }}>
              <Sparkles size={12} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>AI Engine:</span>
              <select
                value={synthesisProvider}
                onChange={(e) => setSynthesisProvider(e.target.value)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  outline: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
                title="Select AI Engine for Knowledge Graph synthesis"
              >
                <option value="ollama">Local LLM (Ollama phi4-mini)</option>
                <option value="gemini">Gemini (Flash-Lite)</option>
                <option value="groq">Groq</option>
                <option value="deepseek">DeepSeek</option>
                <option value="nvidia">NVIDIA NIM</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>

            {/* Build AI Graph button right in the canvas toolbar */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleBuildWorkspaceGraph(false)}
              disabled={buildingGraph || addedToGraphPaperIds.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--accent-primary)',
              }}
              title="Synthesize cross-paper connections with selected AI Engine & SQLite cache"
            >
              {buildingGraph ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>{buildingGraph ? 'Synthesizing...' : `Build AI Graph (${addedToGraphPaperIds.length})`}</span>
            </button>

            {/* Layout Mode Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '2px 4px' }}>
              <button
                type="button"
                onClick={() => setLayoutMode('organic')}
                style={{
                  background: layoutMode === 'organic' ? 'var(--accent-primary)' : 'transparent',
                  color: layoutMode === 'organic' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 3,
                  fontSize: 11.5,
                  padding: '3px 7px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Organic force-directed cluster layout"
              >
                Organic
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('hierarchical')}
                style={{
                  background: layoutMode === 'hierarchical' ? 'var(--accent-primary)' : 'transparent',
                  color: layoutMode === 'hierarchical' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 3,
                  fontSize: 11.5,
                  padding: '3px 7px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Hierarchical structured tree: Topic -> Papers -> Methods & Datasets"
              >
                Tree Hierarchy
              </button>
            </div>

            {/* Citations Toggle */}
            <button
              type="button"
              className={`btn btn-sm ${showCitations ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowCitations(!showCitations)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11.5 }}
              title={showCitations ? "Hide paper citation lines to clean up view" : "Show paper citation lines"}
            >
              <span>Citations</span>
              <span className="badge" style={{ fontSize: 9.5, padding: '1px 4px', background: showCitations ? 'rgba(255,255,255,0.2)' : 'var(--bg-tertiary)' }}>
                {showCitations ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Freeze Motion Toggle Button */}
            <button
              type="button"
              className={`btn btn-sm ${isPhysicsFrozen ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleToggleFreeze}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 12 }}
              title={isPhysicsFrozen ? "Physics is frozen (nodes stay static). Click to unfreeze motion." : "Physics is active. Click to freeze motion."}
            >
              {isPhysicsFrozen ? <Lock size={12} /> : <Unlock size={12} />}
              <span>{isPhysicsFrozen ? 'Frozen' : 'Live Motion'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleZoomIn}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
              title="Zoom In"
            >
              <ZoomIn size={12} />
              <span>In</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleZoomOut}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
              title="Zoom Out"
            >
              <ZoomOut size={12} />
              <span>Out</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleResetFit}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
              title="Reset Zoom and Fit to Screen"
            >
              <Maximize2 size={12} />
              <span>Fit</span>
            </button>

            {/* Toggle Inspector Panel */}
            <button
              type="button"
              className={`btn btn-sm ${isInspectorOpen ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 12 }}
              title={isInspectorOpen ? "Hide Inspector to expand canvas full width" : "Show Inspector"}
            >
              {isInspectorOpen ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
              <span>{isInspectorOpen ? 'Inspector' : 'Show Inspector'}</span>
            </button>

            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              {filteredData.nodes.length} Nodes • {filteredData.edges.length} Edges
            </span>
          </div>
        </div>
      )}

      {/* Friendly Plain-English Guide Banner */}
      {graphMode === 'graph' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '10px 14px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 12,
          fontSize: 12.5,
          color: 'var(--text-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={15} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <span>
              <strong>Active Topic:</strong> {searchQuery ? <em>"{searchQuery}"</em> : 'Literature Graph'} &bull;{' '}
              {paperNodesCount === 0 ? (
                <span>No papers added yet. Go to <strong>Literature Search</strong> and click <strong>Add to Graph</strong> on papers to include them here.</span>
              ) : (
                <span><strong>{paperNodesCount}</strong> {paperNodesCount === 1 ? 'paper' : 'papers'} added &bull; Showing connections to methods and datasets.</span>
              )}
            </span>
          </div>

          {searchQuery && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(`/search?q=${encodeURIComponent(searchQuery)}`)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Search size={12} />
              <span>Back to Literature Search</span>
            </button>
          )}
        </div>
      )}

      {/* 1. Graph Canvas View */}
      {graphMode === 'graph' && (
        <div
          className="graph-workspace"
          id="graph-workspace-view"
          style={{
            height: 'calc(100vh - 165px)',
            minHeight: 740,
            display: 'grid',
            gridTemplateColumns: isInspectorOpen ? '1fr 340px' : '1fr',
            gap: 14,
          }}
        >
            <div className="card graph-canvas-box" style={{ height: '100%', position: 'relative' }}>
              {loading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(2px)',
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'inherit',
                  }}
                >
                  <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-blue)', marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: '#f8fafc', fontWeight: 500, margin: 0 }}>
                    Loading Knowledge Graph entities & semantic relationships...
                  </p>
                </div>
              )}
              {filteredData.nodes.length > 0 ? (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(15, 23, 42, 0.8)',
                      backdropFilter: 'blur(8px)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleToggleFreeze}
                      style={{
                        background: isPhysicsFrozen ? 'rgba(255, 255, 255, 0.1)' : 'var(--accent-primary)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 11.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                      title={isPhysicsFrozen ? "Physics is frozen. Click to unfreeze motion." : "Physics is active. Click to freeze motion."}
                    >
                      {isPhysicsFrozen ? <Lock size={11} /> : <Unlock size={11} />}
                      <span>{isPhysicsFrozen ? 'Motion Frozen' : 'Live Motion'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleZoomIn}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 11.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                      title="Zoom In"
                    >
                      <ZoomIn size={11} />
                      <span>In</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleZoomOut}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 11.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                      title="Zoom Out"
                    >
                      <ZoomOut size={11} />
                      <span>Out</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetFit}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 11.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                      title="Fit to Screen"
                    >
                      <Maximize2 size={11} />
                      <span>Fit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                      style={{
                        background: isInspectorOpen ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        fontSize: 11.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                      title={isInspectorOpen ? "Hide Inspector Panel" : "Show Inspector Panel"}
                    >
                      {isInspectorOpen ? <PanelRightClose size={11} /> : <PanelRightOpen size={11} />}
                      <span>{isInspectorOpen ? 'Inspector' : 'Show Inspector'}</span>
                    </button>
                  </div>
                <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
              </>
            ) : addedToGraphPaperIds && addedToGraphPaperIds.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Sparkles size={28} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {addedToGraphPaperIds.length} Papers Added to Workspace Graph
                </h3>
                <p style={{ fontSize: 13, maxWidth: 500, textAlign: 'center', marginBottom: 20, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Click <strong>Build AI Knowledge Graph</strong> to synthesize cross-paper relationships (EXTENDS, COMPARED_TO, IMPROVES_UPON, shared methods, benchmarks, research gaps) with <strong>Local LLM (Ollama phi4-mini)</strong> or your configured AI engine, and save into SQLite for instant subsequent retrieval.
                </p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleBuildWorkspaceGraph(false)}
                    disabled={buildingGraph}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13 }}
                  >
                    {buildingGraph ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    <span>{buildingGraph ? (buildStatusMessage || 'Synthesizing...') : `Build AI Knowledge Graph (${addedToGraphPaperIds.length})`}</span>
                  </button>
                  <button className="btn btn-secondary" onClick={handleSeedGraph} disabled={seeding}>
                    {seeding ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                    <span style={{ marginLeft: 6 }}>Seed Sample Graph</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <NetworkIcon size={44} style={{ marginBottom: 14, color: 'var(--accent-blue)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Knowledge Graph is Ready
                </h3>
                <p style={{ fontSize: 13, maxWidth: 460, textAlign: 'center', marginBottom: 20 }}>
                  Search literature using the bar above or in <strong>Literature Search</strong> and click <strong>+ Add to Graph</strong> on papers to build your citation graph.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={handleSeedGraph} disabled={seeding}>
                    {seeding ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span style={{ marginLeft: 6 }}>Seed Canonical Research Graph</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => navigate('/search')}>
                    <Plus size={14} style={{ marginRight: 6 }} />
                    Search Literature
                  </button>
                </div>
              </div>
            )}

            {filteredData.nodes.length > 0 && (
              <div className="graph-legend-strip">
                <div><span style={{ display: 'inline-block', width: 16, height: 10, borderRadius: 10, background: '#4f46e5', marginRight: 6, verticalAlign: 'middle' }}></span> Topic</div>
                <div><span style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 3, background: theme === 'dark' ? '#27272a' : '#ffffff', border: '1px solid #71717a', marginRight: 6, verticalAlign: 'middle' }}></span> Paper Card</div>
                <div><span style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 8, background: '#10b981', marginRight: 6, verticalAlign: 'middle' }}></span> Method</div>
                <div><span style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 8, background: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }}></span> Dataset</div>
                <div><span style={{ display: 'inline-block', width: 12, height: 10, borderRadius: 3, background: '#f43f5e', marginRight: 6, verticalAlign: 'middle' }}></span> Gap</div>
                <div><span style={{ display: 'inline-block', width: 16, height: 2, background: '#10b981', marginRight: 6, verticalAlign: 'middle' }}></span> Method Link</div>
                <div><span style={{ display: 'inline-block', width: 16, height: 2, background: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }}></span> Dataset Link</div>
                <div><span style={{ display: 'inline-block', width: 16, height: 2, background: '#6366f1', marginRight: 6, verticalAlign: 'middle' }}></span> Cross-Paper</div>
              </div>
            )}
          </div>

          {/* Entity & Relationship Inspector Panel */}
          {isInspectorOpen && (
            <div className="card" id="graph-inspector-panel" style={{ height: '100%', overflowY: 'auto' }}>
              {/* Top Inspector Tab Switcher */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: 12, paddingBottom: 8, gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setInspectorTab('inspector')}
                  className={`btn btn-sm ${inspectorTab === 'inspector' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <NetworkIcon size={12} />
                  <span>Node Inspector</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('novelty')}
                  className={`btn btn-sm ${inspectorTab === 'novelty' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    ...(inspectorTab === 'novelty' ? { background: '#059669', borderColor: '#059669', color: '#fff' } : {})
                  }}
                >
                  <Lightbulb size={12} />
                  <span>Novelty Ideas {noveltyList.length > 0 ? `(${noveltyList.length})` : ''}</span>
                </button>
                {inspectorTab === 'novelty' && noveltyList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleGenerateNovelty(true)}
                    disabled={generatingNovelty}
                    className="btn btn-secondary btn-sm"
                    style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Re-synthesize novelties (bypasses SQLite cache)"
                  >
                    <RotateCw size={11} className={generatingNovelty ? 'animate-spin' : ''} />
                    <span>Re-run</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsInspectorOpen(false)}
                  style={{
                    marginLeft: inspectorTab === 'novelty' && noveltyList.length > 0 ? 4 : 'auto',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 4px',
                    borderRadius: 3,
                  }}
                  title="Hide Inspector (Expand Canvas full width)"
                >
                  <X size={14} />
                </button>
              </div>

            {inspectorTab === 'inspector' && (
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 4 }}>Entity & Relationship Inspector</h3>
                <p className="panel-subtitle" style={{ fontSize: 12 }}>
                  Click any node on the canvas to inspect its semantic connections.
                </p>

            {selectedEntity ? (
              <div id="inspector-details-content" style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${selectedEntity.raw?.category === 'Proposed Novelty' || selectedEntity.id?.startsWith('cand-') ? 'badge-emerald' : selectedEntity.type === 'TOPIC' ? 'badge-blue' : selectedEntity.type === 'METHOD' ? 'badge-purple' : selectedEntity.type === 'DATASET' ? 'badge-amber' : selectedEntity.type === 'RELATIONSHIP' ? 'badge-emerald' : 'badge-neutral'}`}>
                    {selectedEntity.raw?.category === 'Proposed Novelty' || selectedEntity.id?.startsWith('cand-') ? 'PROPOSED NOVELTY' : selectedEntity.type}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleFocusNode(selectedEntity.id)}
                    style={{ fontSize: 11, padding: '2px 6px' }}
                  >
                    Focus Node
                  </button>
                </div>

                <h4 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 6px', color: 'var(--text-primary)' }}>
                  {selectedEntity.title}
                </h4>

                {(selectedEntity.id?.startsWith('cand-') || selectedEntity.raw?.category === 'Proposed Novelty') && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', border: '1px solid #10b981', marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 4 }}>
                        Mechanism: {selectedEntity.raw?.mechanism || 'Orthogonal Recombination'}
                      </div>
                      <div style={{ fontSize: 11.5, fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: 6 }}>
                        "{selectedEntity.raw?.hypothesis || selectedEntity.raw?.description}"
                      </div>
                      {selectedEntity.raw?.formulation && (
                        <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--bg-card)', borderRadius: 4, fontFamily: 'monospace', fontSize: 10.5, color: 'var(--text-secondary)' }}>
                          {selectedEntity.raw.formulation}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* RELATIONSHIP NODE SPECIFIC CARD */}
                {selectedEntity.type === 'RELATIONSHIP' && (
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Inter-Paper Semantic Link
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                        {selectedEntity.relation || selectedEntity.title}
                      </div>

                      {selectedEntity.source && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Source Entity:</span>
                          <div
                            onClick={() => handleFocusNode(selectedEntity.source)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderRadius: 4,
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-subtle)',
                              marginTop: 3,
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {filteredData.nodes.find(n => n.id === selectedEntity.source)?.label || selectedEntity.source}
                            </span>
                            <ArrowRight size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginLeft: 4 }} />
                          </div>
                        </div>
                      )}

                      {selectedEntity.target && (
                        <div>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Target Entity:</span>
                          <div
                            onClick={() => handleFocusNode(selectedEntity.target)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderRadius: 4,
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-subtle)',
                              marginTop: 3,
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {filteredData.nodes.find(n => n.id === selectedEntity.target)?.label || selectedEntity.target}
                            </span>
                            <ArrowRight size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginLeft: 4 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedEntity.type === 'TOPIC' && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                      Primary research topic head node anchoring literature subnodes and methodological interconnections.
                    </p>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate('/search')}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                    >
                      <Search size={12} />
                      <span>Search More Papers for this Topic</span>
                    </button>
                  </div>
                )}

                {/* Node Description & Summary Card */}
                {selectedEntity.type !== 'RELATIONSHIP' && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Info size={12} style={{ color: 'var(--accent-primary)' }} />
                      <span>About This {selectedEntity.type}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
                      {getNodeDescription(selectedEntity)}
                    </p>

                    {/* Metadata tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {selectedEntity.raw?.year && (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                          Year: {selectedEntity.raw.year}
                        </span>
                      )}
                      {selectedEntity.raw?.authors && selectedEntity.raw.authors.length > 0 && (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                          {selectedEntity.raw.authors.length} Authors
                        </span>
                      )}
                      {selectedEntity.raw?.citation_count !== undefined && selectedEntity.raw?.citation_count !== null && (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                          {selectedEntity.raw.citation_count.toLocaleString()} Citations
                        </span>
                      )}
                      {selectedEntity.raw?.category && (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                          Category: {selectedEntity.raw.category}
                        </span>
                      )}
                      {selectedEntity.raw?.domain && (
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                          Domain: {selectedEntity.raw.domain}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {selectedEntity.type === 'PAPER' && (
                  <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => openInReader(selectedEntity.raw)}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                    >
                      <FileText size={12} />
                      <span>Open in PDF Reader</span>
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        const pid = selectedEntity.id;
                        try {
                          await fetch('/api/v1/graph/remove-paper', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paper_id: pid }),
                          });
                          setAddedToGraphPaperIds(prev => prev.filter(id => id !== pid));
                          setSelectedEntity(null);
                          setNeighborhood(null);
                          await fetchGraphData();
                        } catch (err) {
                          console.error('Failed to remove paper from graph:', err);
                        }
                      }}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}
                    >
                      <Trash2 size={12} />
                      <span>Remove from Graph</span>
                    </button>
                  </div>
                )}

                {/* Neighborhood & Relationships Section */}
                {neighborhood && neighborhood.edges && neighborhood.edges.length > 0 && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <h5 style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Layers size={13} style={{ color: 'var(--accent-primary)' }} />
                      <span>Connected Relationships ({neighborhood.edges.length})</span>
                    </h5>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                      How this node connects to other literature and entities in the graph:
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {neighborhood.edges.map((edge, idx) => {
                        const neighborId = edge.direction === 'outgoing' ? edge.target : edge.source;
                        const targetNeighbor = neighborhood.neighbors?.find(n => n?.id === neighborId) ||
                          filteredData.nodes.find(n => n.id === neighborId) ||
                          rawNodes.find(n => n.id === neighborId);

                        const neighborLabel = targetNeighbor?.title || targetNeighbor?.name || targetNeighbor?.data?.title || targetNeighbor?.data?.name || targetNeighbor?.label || neighborId;
                        const neighborType = targetNeighbor?.node_type || targetNeighbor?.type || 'entity';
                        const relColor = EDGE_COLORS[edge.relation] || 'var(--accent-primary)';
                        const friendlyRel = FRIENDLY_RELATION_LABELS[(edge.relation || '').toLowerCase()] || (edge.relation || 'connected').replace(/_/g, ' ');

                        const connectionExplanation = getDetailedConnectionExplanation(
                          selectedEntity.type,
                          neighborType,
                          edge.relation,
                          edge.direction,
                          selectedEntity.title,
                          neighborLabel
                        );

                        return (
                          <div
                            key={idx}
                            onClick={() => handleFocusNode(neighborId)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-subtle)',
                              fontSize: 11.5,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              transition: 'border-color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--accent-primary)';
                              e.currentTarget.style.background = 'var(--bg-card)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border-subtle)';
                              e.currentTarget.style.background = 'var(--bg-secondary)';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  color: relColor,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>{edge.direction === 'outgoing' ? '→' : '←'}</span>
                                <span>{friendlyRel}</span>
                              </span>
                              <span style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                {edge.direction === 'outgoing' ? 'outgoing' : 'incoming'}
                              </span>
                            </div>

                            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {neighborLabel}
                            </div>

                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: 1, borderTop: '1px dashed var(--border-subtle)', paddingTop: 4 }}>
                              {connectionExplanation}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <Info size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                Click any node on the graph to inspect incoming and outgoing scientific relationships.
              </div>
            )}
              </div>
            )}

            {/* Novelty Ideas Deck */}
            {inspectorTab === 'novelty' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lightbulb size={15} style={{ color: '#10b981' }} />
                    <span>Scientific Novelty Deck</span>
                  </h3>
                  <p className="panel-subtitle" style={{ fontSize: 12 }}>
                    4-quadrant research proposals synthesized from graph topology & cross-paper citations.
                  </p>
                </div>

                {noveltySuccessMsg && (
                  <div
                    style={{
                      padding: '8px 12px',
                      background: theme === 'dark' ? '#064e3b' : '#ecfdf5',
                      border: '1px solid #10b981',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12,
                      color: theme === 'dark' ? '#ecfdf5' : '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{noveltySuccessMsg}</span>
                    <button
                      onClick={() => setNoveltySuccessMsg(null)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {generatingNovelty ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#10b981' }} />
                    <h4 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                      Synthesizing Research Novelty...
                    </h4>
                    <p style={{ fontSize: 11.5, maxWidth: 320, margin: '0 auto', lineHeight: 1.4 }}>
                      Evaluating cross-paper edges, contradictory claims, methodological limitations, and untested gap intersections via Gemini Flash-Lite.
                    </p>
                  </div>
                ) : noveltyList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                    <Lightbulb size={32} style={{ margin: '0 auto 10px', color: 'var(--text-muted)', opacity: 0.5 }} />
                    <h4 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                      No Novelties Synthesized Yet
                    </h4>
                    <p style={{ fontSize: 11.5, maxWidth: 300, margin: '0 auto 14px', lineHeight: 1.4 }}>
                      Generate publication-grade hypothesis proposals grounded directly in the literature topology of this workspace.
                    </p>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleGenerateNovelty(false)}
                      disabled={generatingNovelty || addedToGraphPaperIds.length === 0}
                      style={{
                        margin: '0 auto',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        fontWeight: 600,
                        border: 'none',
                        padding: '6px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: addedToGraphPaperIds.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: addedToGraphPaperIds.length === 0 ? 0.6 : 1,
                      }}
                    >
                      <Sparkles size={13} />
                      <span>Synthesize Novelty ({addedToGraphPaperIds.length} papers)</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {noveltyList.map((nov, idx) => {
                      const isCandidateInGraph = rawNodes.some(
                        rn => rn.id === nov.id || rn.id === `cand-${nov.id}` || rn.data?.name === nov.title || rn.label === nov.title
                      );
                      const mech = (nov.mechanism || '').toLowerCase();
                      let badgeBg = 'var(--bg-secondary)';
                      let badgeColor = 'var(--accent-primary)';
                      let badgeLabel = 'Proposal';

                      if (mech.includes('recombination') || mech.includes('orthogonal')) {
                        badgeBg = theme === 'dark' ? '#064e3b' : '#ecfdf5';
                        badgeColor = theme === 'dark' ? '#34d399' : '#059669';
                        badgeLabel = 'Recombination';
                      } else if (mech.includes('contradict') || mech.includes('tension')) {
                        badgeBg = theme === 'dark' ? '#451a03' : '#fffbeb';
                        badgeColor = theme === 'dark' ? '#fbbf24' : '#b45309';
                        badgeLabel = 'Tension Resolution';
                      } else if (mech.includes('limitation') || mech.includes('inversion')) {
                        badgeBg = theme === 'dark' ? '#172554' : '#eff6ff';
                        badgeColor = theme === 'dark' ? '#60a5fa' : '#1d4ed8';
                        badgeLabel = 'Limitation Inversion';
                      } else if (mech.includes('gap') || mech.includes('realization')) {
                        badgeBg = theme === 'dark' ? '#500724' : '#fdf2f8';
                        badgeColor = theme === 'dark' ? '#f472b6' : '#be185d';
                        badgeLabel = 'Gap Realization';
                      }

                      return (
                        <div
                          key={nov.id || idx}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            transition: 'border-color 0.15s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 10,
                                background: badgeBg,
                                color: badgeColor,
                                textTransform: 'uppercase',
                                letterSpacing: '0.3px',
                              }}
                            >
                              {badgeLabel}
                            </span>
                            {nov.feasibility && (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                {nov.feasibility} Feasibility
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                            {nov.title}
                          </div>

                          <div
                            style={{
                              fontSize: 11.5,
                              fontStyle: 'italic',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.4,
                              borderLeft: '2px solid var(--accent-primary)',
                              paddingLeft: 8,
                            }}
                          >
                            "{nov.testable_hypothesis}"
                          </div>

                          {nov.mathematical_formulation && (
                            <div
                              style={{
                                padding: '6px 8px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 4,
                                overflowX: 'auto',
                              }}
                            >
                              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 2 }}>
                                Formulation
                              </div>
                              <MathRenderer equation={nov.mathematical_formulation} block style={{ margin: 0, padding: 0 }} />
                            </div>
                          )}

                          {nov.foundation_papers && nov.foundation_papers.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Grounding:</span>
                              {nov.foundation_papers.map((fp, i) => (
                                <span
                                  key={i}
                                  className="badge badge-neutral"
                                  style={{ fontSize: 9.5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {fp}
                                </span>
                              ))}
                            </div>
                          )}

                          {nov.target_datasets && nov.target_datasets.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Target Datasets:</span>
                              {nov.target_datasets.map((td, i) => (
                                <span key={i} className="badge badge-amber" style={{ fontSize: 9.5 }}>
                                  {td}
                                </span>
                              ))}
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
                            {isCandidateInGraph ? (
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled
                                style={{ flex: 1, fontSize: 11, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, color: '#10b981' }}
                              >
                                <CheckCircle2 size={12} />
                                <span>In Canvas</span>
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleAddNoveltyToGraph(nov)}
                                disabled={injectingNoveltyId === nov.id}
                                style={{ flex: 1, fontSize: 11, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, background: '#059669', borderColor: '#059669', color: '#fff' }}
                              >
                                {injectingNoveltyId === nov.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Plus size={12} />
                                )}
                                <span>Add to Canvas</span>
                              </button>
                            )}

                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                navigate('/chat', {
                                  state: {
                                    initialPrompt: `Let's discuss and formalize this research novelty proposal:\n\n**${nov.title}**\n\n- **Mechanism**: ${nov.mechanism}\n- **Testable Hypothesis**: ${nov.testable_hypothesis}\n- **Mathematical Formulation**: ${nov.mathematical_formulation || 'N/A'}\n- **Target Benchmarks**: ${(nov.target_datasets || []).join(', ') || 'N/A'}\n- **Baselines to Beat**: ${(nov.baseline_methods || []).join(', ') || 'N/A'}\n\nPlease help me formulate a detailed experiment execution plan and benchmark evaluation suite.`
                                  }
                                });
                              }}
                              style={{ flex: 1, fontSize: 11, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5 }}
                            >
                              <MessageSquare size={12} />
                              <span>Discuss in Chat</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      )}




      {/* 3. Multi-Paper Comparison Matrix */}
      {graphMode === 'compare' && !loading && (
        <div className="card table-box" id="compare-workspace-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Side-by-Side Multi-Paper Comparison Matrix</h3>
              <p className="panel-subtitle" style={{ fontSize: 12 }}>
                Comparing research papers across source platform, publication year, authors, and technical topics for <strong>{searchQuery || 'Active Literature'}</strong>.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-blue">
                {activeComparisonPapers.length} Papers Compared
              </span>
              {comparisonPapers.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={clearComparisonPapers}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <X size={13} />
                  <span>Reset Custom Selection</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Paper Selector from search results */}
          {searchResults && searchResults.length > 0 && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>Toggle Search Papers:</span>
              {searchResults.slice(0, 6).map((p, idx) => {
                const pId = p.id || p.canonical_id || `p-${idx}`;
                const isSelected = activeComparisonPapers.some(cp => (cp.id || cp.canonical_id) === pId);
                return (
                  <button
                    key={pId}
                    onClick={() => isSelected ? removeComparisonPaper(pId) : addComparisonPaper(p)}
                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    {isSelected ? 'Selected: ' : '+ Add: '} {p.title.slice(0, 20)}...
                  </button>
                );
              })}
            </div>
          )}

          {activeComparisonPapers.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 750 }}>
                <thead>
                  <tr>
                    <th style={{ width: 180 }}>Comparison Dimension</th>
                    {activeComparisonPapers.map((paper, idx) => (
                      <th key={paper.id || idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span title={paper.title}>{paper.title.slice(0, 32)}...</span>
                          <button
                            onClick={() => removeComparisonPaper(paper.id || paper.canonical_id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            title="Remove from comparison"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Source Platform</strong></td>
                    {activeComparisonPapers.map((p, i) => (
                      <td key={i}>
                        <span className="badge badge-violet" style={{ textTransform: 'uppercase' }}>
                          {p.primary_source || p.source || 'Open Access'}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td><strong>Publication Year</strong></td>
                    {activeComparisonPapers.map((p, i) => <td key={i}>{p.year || 'N/A'}</td>)}
                  </tr>
                  <tr>
                    <td><strong>Authors</strong></td>
                    {activeComparisonPapers.map((p, i) => (
                      <td key={i}>{(p.authors || []).map(a => (typeof a === 'string' ? a : a.name)).slice(0, 2).join(', ')}</td>
                    ))}
                  </tr>
                  <tr>
                    <td><strong>Key Topics / Methods</strong></td>
                    {activeComparisonPapers.map((p, i) => (
                      <td key={i}>{p.topics ? p.topics.join(', ') : 'Extracted from canonical literature'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td><strong>Abstract Summary</strong></td>
                    {activeComparisonPapers.map((p, i) => (
                      <td key={i} style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {p.abstract ? p.abstract.slice(0, 160) + '...' : 'No abstract preview provided.'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No papers found for comparison. Run a search in <strong>Literature Search</strong>.
            </div>
          )}
        </div>
      )}
    </section>
  );
}



