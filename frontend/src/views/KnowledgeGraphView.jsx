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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function wrapLabel(text, maxChars = 20) {
  if (!text) return 'Paper';
  let clean = String(text).trim();

  // If it's a raw Semantic Scholar or internal hash ID
  if (/^s2:[a-f0-9]{20,}/i.test(clean) || /^[a-f0-9]{32,}$/i.test(clean)) {
    const hash = clean.replace(/^s2:/i, '');
    return `Cited Paper\n[${hash.slice(0, 8)}…]`;
  }

  // Strip verbose raw ID prefixes
  clean = clean.replace(/^(doi:|arxiv:|s2:)/i, '');

  // Truncate monolithic tokens without spaces (e.g. hash or DOI URL)
  if (clean.length > 24 && !clean.includes(' ')) {
    clean = clean.slice(0, 10) + '…' + clean.slice(-6);
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
  return lines.slice(0, 3).join('\n') || clean.slice(0, 20);
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
  covers: '#e4e4e7',
  investigates: '#e4e4e7',
  has_paper: '#e4e4e7',
  uses_method: '#a1a1aa',
  evaluates_on: '#a1a1aa',
  achieves: '#a1a1aa',
  cites: '#e4e4e7',
  has_claim: '#a1a1aa',
  limited_by: '#a1a1aa',
  addresses: '#a1a1aa',
  extends: '#818cf8',
  compared_to: '#fbbf24',
  improves_upon: '#34d399',
  contradicts: '#f87171',
  has_gap: '#f43f5e',
  relates_to: '#a1a1aa',
};

function getNodeDescription(entity) {
  if (!entity) return '';
  const type = (entity.type || '').toUpperCase();
  const title = entity.title || '';
  const raw = entity.raw || {};

  if (raw.description && String(raw.description).trim()) return String(raw.description).trim();
  if (raw.abstract && String(raw.abstract).trim()) return String(raw.abstract).trim();

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
  const [buildingGraph, setBuildingGraph] = useState(false);
  const [buildStatusMessage, setBuildStatusMessage] = useState('');
  const [synthesisInfo, setSynthesisInfo] = useState(null);

  // Filter & Layout states
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all');
  const [relationFilter, setRelationFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const containerRef = useRef(null);
  const networkRef = useRef(null);

  const fetchGraphData = async () => {
    setLoading(true);
    const activeTopic = (searchQuery || activeWorkspace?.title || '').trim();
    const wsId = (activeWorkspace?.id || '').trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
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

      // Only show papers explicitly added to graph or workspace (no synthetic regex fallback)
      if (backendPaperNodes.length === 0) {
        loadedNodes = [];
        loadedEdges = [];
      }

      setRawNodes(loadedNodes);
      setRawEdges(loadedEdges);

      // Check SQLite synthesis cache status for workspace
      if (wsId) {
        try {
          const cacheUrl = `/api/v1/graph/workspace-cache-status?workspace_id=${encodeURIComponent(wsId)}${
            (addedToGraphPaperIds || []).map(id => `&paper_ids=${encodeURIComponent(id)}`).join('')
          }`;
          const cacheRes = await fetch(cacheUrl, { signal: controller.signal });
          if (cacheRes.ok) {
            const cacheStatus = await cacheRes.json();
            if (cacheStatus.cached) {
              setSynthesisInfo({
                cached: true,
                llm_called: false,
                cross_paper_relations_count: cacheStatus.cross_paper_relations_count || 0,
                gaps_count: cacheStatus.gaps_count || 0,
                synthesis_summary: cacheStatus.synthesis_summary || '',
              });
            }
          }
        } catch (cErr) {
          console.debug('Cache status notice:', cErr);
        }
      }

      // 2. Fetch summary & coverage
      try {
        const sumRes = await fetch('/api/v1/graph/summary', { signal: controller.signal });
        if (sumRes.ok) {
          const summary = await sumRes.json();
          setSummaryData(summary);
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
    setBuildStatusMessage('Checking SQLite cache...');

    const activeTopic = (searchQuery || activeWorkspace?.title || graphSearchInput || 'General Literature').trim();
    const wsId = (activeWorkspace?.id || '').trim();

    try {
      if (!forceRefresh) {
        setBuildStatusMessage('Checking SQLite cache for pre-built graph...');
      } else {
        setBuildStatusMessage('Synthesizing relationships with Gemini Flash-Lite...');
      }

      const res = await fetch('/api/v1/graph/build-workspace-graph', {
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
        setRawNodes(data.nodes || []);
        setRawEdges(data.edges || []);
        setSynthesisInfo({
          cached: data.cached,
          llm_called: data.llm_called,
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

  useEffect(() => {
    setSelectedEntity(null);
    setNeighborhood(null);
    fetchGraphData();
  }, [searchQuery, activeWorkspace?.id, activeWorkspace?.title, addedToGraphPaperIds?.length]);

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

    // 2. Separate papers from other entities
    const paperNodes = rawNodes.filter(n => (n.node_type || '').toLowerCase() === 'paper');
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

    // 4. Edges pool: remap any old/stale topic references to the unified topicId
    const topicNodeIds = new Set(
      rawNodes.filter(n => (n.node_type || '').toLowerCase() === 'topic').map(n => n.id)
    );
    topicNodeIds.add(topicId);

    const remappedEdges = [];
    const existingEdgeKeys = new Set();

    rawEdges.forEach(e => {
      let s = e.source;
      let t = e.target;
      if (topicNodeIds.has(s)) s = topicId;
      if (topicNodeIds.has(t)) t = topicId;
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

    const bridgeNodes = [];
    rawNodes.forEach(n => {
      const ntype = (n.node_type || '').toLowerCase();
      if (ntype === 'topic' || ntype === 'paper') return;
      if (['method', 'dataset', 'gap', 'metric'].includes(ntype)) {
        const connectedPapers = paperConnectionCount.get(n.id);
        const count = connectedPapers ? connectedPapers.size : 0;
        if (ntype === 'gap') {
          bridgeNodes.push(n);
        } else if (paperIds.size >= 2) {
          if (count >= 2) {
            bridgeNodes.push(n);
          }
        } else if (count >= 1 && bridgeNodes.length < 4) {
          bridgeNodes.push(n);
        }
      }
    });

    // 7. Assemble final nodes: Topic + Papers + Bridge Nodes
    const finalNodes = [topicNode, ...paperNodes, ...bridgeNodes];
    const validNodeIds = new Set(finalNodes.map(n => n.id));

    // 8. Filter edges strictly between valid nodes
    const finalEdges = remappedEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

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
  }, [rawNodes, rawEdges, nodeTypeFilter, relationFilter, searchTerm, searchQuery, activeWorkspace?.title]);

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
  }, [graphMode, theme, filteredData, loading]);

  const renderVisGraph = () => {
    if (!containerRef.current || filteredData.nodes.length === 0) return;

    if (networkRef.current) {
      try {
        networkRef.current.destroy();
      } catch (e) {}
      networkRef.current = null;
    }

    const isDark = theme === 'dark';

    const nodes = filteredData.nodes.map(n => {
      const ntype = (n.node_type || 'paper').toLowerCase();
      const rawLabel = n.data?.title || n.data?.name || n.data?.text || n.label || n.id || 'Paper';

      let formattedLabel;
      let shape = 'box';
      let borderRadius = 4;
      let mass = 1;
      let bg, border, textColor, highlightBg, highlightBorder;

      if (ntype === 'topic') {
        formattedLabel = wrapLabel(rawLabel, 20);
        shape = 'box';
        borderRadius = 22; // Pill capsule matching sketch
        mass = 6; // Central anchor
        bg = isDark ? '#312e81' : '#1e1b4b'; // Deep rich indigo
        border = isDark ? '#818cf8' : '#3730a3';
        textColor = '#ffffff'; // Pure white bold text in both themes
        highlightBg = isDark ? '#4338ca' : '#312e81';
        highlightBorder = '#a5b4fc';
      } else if (ntype === 'paper') {
        const yearPart = n.data?.year ? `\n(${n.data.year})` : '';
        formattedLabel = wrapLabel(rawLabel, 22) + yearPart;
        shape = 'box';
        borderRadius = 6; // Crisp card-like rectangle
        mass = 2;
        bg = isDark ? '#27272a' : '#ffffff';
        border = isDark ? '#52525b' : '#94a3b8';
        textColor = isDark ? '#f4f4f5' : '#0f172a';
        highlightBg = isDark ? '#3f3f46' : '#f8fafc';
        highlightBorder = isDark ? '#818cf8' : '#4f46e5';
      } else {
        // Method, dataset, gap: circular / diamond bridge node
        formattedLabel = wrapLabel(rawLabel, 14);
        shape = ntype === 'gap' ? 'diamond' : 'circle';
        borderRadius = 0;
        mass = 1;
        if (ntype === 'gap') {
          bg = isDark ? '#881337' : '#ffe4e6';
          border = isDark ? '#f43f5e' : '#e11d48';
          textColor = isDark ? '#ffe4e6' : '#9f1239';
          highlightBg = isDark ? '#9f1239' : '#fecdd3';
          highlightBorder = isDark ? '#fda4af' : '#be123c';
        } else {
          bg = isDark ? '#1e293b' : '#f1f5f9';
          border = isDark ? '#64748b' : '#94a3b8';
          textColor = isDark ? '#e2e8f0' : '#1e293b';
          highlightBg = isDark ? '#334155' : '#e2e8f0';
          highlightBorder = isDark ? '#94a3b8' : '#475569';
        }
      }

      return {
        id: n.id,
        label: formattedLabel,
        title: `${ntype.toUpperCase()}: ${rawLabel}`,
        shape,
        borderRadius,
        mass,
        color: {
          background: bg,
          border: border,
          highlight: { background: highlightBg, border: highlightBorder },
          hover: { background: highlightBg, border: highlightBorder },
        },
        font: {
          color: textColor,
          size: ntype === 'topic' ? 13 : ntype === 'paper' ? 11.5 : 10,
          face: 'Plus Jakarta Sans, -apple-system, sans-serif',
          bold: {
            color: textColor,
            size: ntype === 'topic' ? 13 : 11.5,
            face: 'Plus Jakarta Sans, -apple-system, sans-serif',
            mod: 'bold',
          },
        },
        widthConstraint: ntype === 'topic'
          ? { minimum: 150, maximum: 240 }
          : ntype === 'paper'
          ? { minimum: 150, maximum: 220 }
          : { maximum: 90 },
        margin: ntype === 'topic'
          ? { top: 12, right: 20, bottom: 12, left: 20 }
          : ntype === 'paper'
          ? { top: 12, right: 14, bottom: 12, left: 14 }
          : 8,
        borderWidth: ntype === 'topic' ? 2.5 : 1.5,
        shadow: {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.1)',
          size: ntype === 'topic' ? 8 : 4,
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
      const friendlyLabel = FRIENDLY_RELATION_LABELS[rel] || (e.label || rel.replace(/_/g, ' '));
      const edgeLineColor = EDGE_COLORS[rel] || (isDark
        ? (isTopicEdge ? '#818cf8' : '#a1a1aa')
        : (isTopicEdge ? '#4f46e5' : '#64748b'));

      return {
        id: `${e.source}->${e.target}:${e.relation}`,
        from: e.source,
        to: e.target,
        label: friendlyLabel,
        color: {
          color: edgeLineColor,
          highlight: isDark ? '#ffffff' : '#000000',
          hover: isDark ? '#ffffff' : '#000000',
          opacity: isTopicEdge ? 0.9 : 0.75,
        },
        font: {
          color: isDark ? '#d4d4d8' : '#334155',
          size: 9.5,
          face: 'Plus Jakarta Sans, sans-serif',
          align: 'middle',
          background: isDark ? '#141416' : '#ffffff',
          strokeWidth: 0,
        },
        arrows: {
          to: { enabled: true, scaleFactor: isTopicEdge ? 0.7 : 0.6 },
        },
        smooth: { type: 'continuous', roundness: 0.15 },
        width: isTopicEdge ? 2.0 : 1.6,
      };
    });

    // forceAtlas2 with balanced, stable physics
    const options = {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -90,
          centralGravity: 0.02,
          springLength: 140,
          springConstant: 0.05,
          damping: 0.6,
          avoidOverlap: 0.9,
        },
        stabilization: {
          enabled: true,
          iterations: 200,
          updateInterval: 25,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        selectable: true,
        selectConnectedEdges: true,
        navigationButtons: false,
      },
      layout: {
        improvedLayout: true,
      },
    };

    const network = new Network(containerRef.current, { nodes, edges }, options);
    networkRef.current = network;

    // Auto-fit smoothly on stabilization so all nodes are cleanly framed
    network.once('stabilizationIterationsDone', () => {
      network.fit({
        nodes: filteredData.nodes.map(n => n.id),
        animation: { duration: 400, easingFunction: 'easeInOutQuad' },
      });
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
          handleSelectNode(foundNode);
        }
      } else if (params.edges.length > 0) {
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
                title="Synthesize cross-paper connections (EXTENDS, COMPARED_TO, gaps) with Gemini Flash-Lite & SQLite cache"
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
                  title="Force re-synthesis with Gemini (bypasses SQLite cache)"
                >
                  <RotateCw size={12} className={buildingGraph ? 'animate-spin' : ''} />
                  <span>Re-synthesize</span>
                </button>
              )}

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
      {graphMode === 'graph' && (
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
            <span style={{ fontSize: 18 }}>{synthesisInfo.cached ? '⚡' : '✨'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>
                  {synthesisInfo.cached
                    ? 'Retrieved from SQLite Cache (0 Gemini tokens consumed)'
                    : 'Synthesized with Gemini Flash-Lite & Cached in SQLite'}
                </span>
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                  {synthesisInfo.cached ? 'Zero API Cost' : 'Batch Synthesized'}
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
      {graphMode === 'graph' && rawNodes.length > 0 && (
        <div className="search-bar-box" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter nodes by name or keyword..."
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

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

            <span className="badge badge-neutral" style={{ fontSize: 11.5 }}>
              {filteredData.nodes.length} Nodes • {filteredData.edges.length} Relations
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
        <div className="graph-workspace" id="graph-workspace-view">
          <div className="card graph-canvas-box" style={{ height: 620, position: 'relative' }}>
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
              <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
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
                  Click <strong>Build AI Knowledge Graph</strong> to synthesize cross-paper relationships (EXTENDS, COMPARED_TO, IMPROVES_UPON, shared architectures, research gaps) with Gemini Flash-Lite and save into SQLite for instant subsequent retrieval.
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
                <div><span style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 10, background: theme === 'dark' ? '#e4e4e7' : '#18181b', border: '1px solid #71717a', marginRight: 6, verticalAlign: 'middle' }}></span> Topic (Center)</div>
                <div><span style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 2, background: theme === 'dark' ? '#27272a' : '#ffffff', border: '1px solid #71717a', marginRight: 6, verticalAlign: 'middle' }}></span> Research Paper (Box)</div>
                <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: theme === 'dark' ? '#3f3f46' : '#e2e8f0', border: '1px solid #a1a1aa', marginRight: 6, verticalAlign: 'middle' }}></span> Method / Dataset (Circle)</div>
                <div><span style={{ display: 'inline-block', width: 16, height: 2, background: theme === 'dark' ? '#d4d4d8' : '#475569', marginRight: 6, verticalAlign: 'middle' }}></span> Directed Relation</div>
              </div>
            )}
          </div>

          {/* Entity & Relationship Inspector Panel */}
          <div className="card" id="graph-inspector-panel" style={{ height: 620, overflowY: 'auto' }}>
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>Entity & Relationship Inspector</h3>
            <p className="panel-subtitle" style={{ fontSize: 12 }}>
              Click any node on the canvas to inspect its semantic connections.
            </p>

            {selectedEntity ? (
              <div id="inspector-details-content" style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${selectedEntity.type === 'TOPIC' ? 'badge-blue' : selectedEntity.type === 'METHOD' ? 'badge-purple' : selectedEntity.type === 'DATASET' ? 'badge-amber' : selectedEntity.type === 'RELATIONSHIP' ? 'badge-emerald' : 'badge-neutral'}`}>
                    {selectedEntity.type}
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
                              💡 {connectionExplanation}
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



