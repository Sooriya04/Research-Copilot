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
  if (!text) return '';
  const words = String(text).split(' ');
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
  return lines.slice(0, 3).join('\n');
}

const NODE_THEMES = {
  topic: { bg: '#e4e4e7', border: '#ffffff', text: '#09090b', shape: 'box', size: 30 },
  paper: { bg: '#27272a', border: '#71717a', text: '#f4f4f5', shape: 'box', size: 22 },
  method: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 18 },
  dataset: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 18 },
  metric: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 16 },
  claim: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 16 },
  limitation: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 16 },
  gap: { bg: '#3f3f46', border: '#a1a1aa', text: '#f4f4f5', shape: 'circle', size: 20 },
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
  extends: '#a1a1aa',
  compared_to: '#a1a1aa',
  relates_to: '#a1a1aa',
};

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
  } = useApp();
  const navigate = useNavigate();
  const [graphMode, setGraphMode] = useState('graph'); // 'graph' | 'matrix' | 'compare'
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [neighborhood, setNeighborhood] = useState(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [summaryData, setSummaryData] = useState(null);

  // Filter & Layout states
  const [graphScope, setGraphScope] = useState('core'); // 'core' (topic, papers, methods, datasets) | 'all'
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all');
  const [relationFilter, setRelationFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const containerRef = useRef(null);
  const networkRef = useRef(null);

  const fetchGraphData = async () => {
    setLoading(true);
    try {
      // 1. Fetch graph elements strictly scoped to active topic query
      const url = searchQuery
        ? `/api/v1/graph/elements?topic=${encodeURIComponent(searchQuery)}&scoped=true`
        : '/api/v1/graph/elements';
      const elemRes = await fetch(url);
      if (elemRes.ok) {
        const elemData = await elemRes.json();
        setRawNodes(elemData.nodes || []);
        setRawEdges(elemData.edges || []);
      }

      // 2. Fetch summary & coverage
      const sumRes = await fetch('/api/v1/graph/summary');
      if (sumRes.ok) {
        const summary = await sumRes.json();
        setSummaryData(summary);
      }
    } catch (err) {
      console.error('Failed to load graph elements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, [searchQuery]);

  const handleClearGraph = async () => {
    try {
      await fetch('/api/v1/graph/clear', { method: 'POST' });
      setRawNodes([]);
      setRawEdges([]);
      setSelectedEntity(null);
      setNeighborhood(null);
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

  // Build matrix rows dynamically from search results & graph summary
  const matrixRows = useMemo(() => {
    const rows = [];
    const seen = new Set();

    // 1. From active search results
    if (searchResults && searchResults.length > 0) {
      searchResults.forEach((p) => {
        const methods = p.methods && p.methods.length > 0 ? p.methods : [];
        const datasets = p.datasets && p.datasets.length > 0 ? p.datasets : [];
        if (methods.length === 0 || datasets.length === 0) return;

        methods.forEach((m) => {
          datasets.forEach((d) => {
            const key = `${m}->${d}`;
            if (!seen.has(key)) {
              seen.add(key);
              rows.push({
                method: m,
                dataset: d,
                status: 'Evaluated',
                rationale: `Evidence reported in '${p.title.slice(0, 45)}...' (${p.year || 2024})`,
                paperTitle: p.title,
                paperId: p.id || p.canonical_id,
              });
            }
          });
        });
      });
    }

    // 2. From graph summary coverage matrix
    if (summaryData && summaryData.coverage_matrix) {
      for (const [method, datasets] of Object.entries(summaryData.coverage_matrix)) {
        for (const [dataset, covered] of Object.entries(datasets)) {
          if (covered) {
            const key = `${method}->${dataset}`;
            if (!seen.has(key)) {
              seen.add(key);
              rows.push({
                method,
                dataset,
                status: 'Evaluated',
                rationale: `Empirical evaluation of ${method} on ${dataset} benchmark in Knowledge Graph.`,
              });
            }
          }
        }
      }
    }

    return rows;
  }, [searchResults, summaryData]);

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
    let nodesPool = [];
    let edgesPool = [];

    const topicId = searchQuery
      ? `topic-${searchQuery.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}`
      : (rawNodes.find(n => (n.node_type || '').toLowerCase() === 'topic')?.id || 'topic-main');

    nodesPool = [...rawNodes];
    edgesPool = [...rawEdges];

    // Ensure central topic node exists
    if (!nodesPool.some(n => n.id === topicId)) {
      const topicLabel = searchQuery || 'Research Topic';
      nodesPool.unshift({
        id: topicId,
        label: topicLabel,
        node_type: 'topic',
        title: `[TOPIC] ${topicLabel}`,
        data: { name: topicLabel, id: topicId, query: topicLabel },
      });
    }

    // Set of all paper node IDs in the pool
    const paperIds = new Set(
      nodesPool
        .filter(n => (n.node_type || '').toLowerCase() === 'paper')
        .map(n => n.id)
    );

    // Reify direct inter-paper edges (e.g. Paper A cites Paper B) into explicit relationship circles
    // matching the user's sketch: Paper A -> (Relationship Circle) -> Paper B
    const finalNodes = [];
    const finalEdges = [];
    const reifiedRelNodes = new Map();

    edgesPool.forEach(e => {
      // Direct inter-paper edge (e.g. cites, compared_to, extends)
      if (paperIds.has(e.source) && paperIds.has(e.target)) {
        const pairKey = [e.source, e.target].sort().join('--');
        const relNodeId = `rel-${pairKey}`;
        if (!reifiedRelNodes.has(relNodeId)) {
          const friendlyRel = FRIENDLY_RELATION_LABELS[(e.relation || '').toLowerCase()] || (e.label || 'Connected');
          const relNode = {
            id: relNodeId,
            label: friendlyRel,
            node_type: 'relationship',
            title: `Relationship: ${friendlyRel}`,
            data: { name: friendlyRel, source: e.source, target: e.target, relation: e.relation },
          };
          reifiedRelNodes.set(relNodeId, relNode);
        }
        // Link Paper A -> Rel Circle -> Paper B
        finalEdges.push({ source: e.source, target: relNodeId, relation: e.relation, label: '' });
        finalEdges.push({ source: relNodeId, target: e.target, relation: e.relation, label: '' });
      } else {
        finalEdges.push(e);
      }
    });

    // Count connections to papers for every non-topic, non-paper node
    const paperConnectionCount = new Map();
    finalEdges.forEach(e => {
      if (paperIds.has(e.source) && !paperIds.has(e.target)) {
        if (!paperConnectionCount.has(e.target)) paperConnectionCount.set(e.target, new Set());
        paperConnectionCount.get(e.target).add(e.source);
      }
      if (paperIds.has(e.target) && !paperIds.has(e.source)) {
        if (!paperConnectionCount.has(e.source)) paperConnectionCount.set(e.source, new Set());
        paperConnectionCount.get(e.source).add(e.target);
      }
    });

    // Add topic and paper nodes
    nodesPool.forEach(n => {
      const ntype = (n.node_type || 'paper').toLowerCase();
      if (ntype === 'topic' || ntype === 'paper') {
        finalNodes.push(n);
      } else {
        // Strict Rule from user:
        // "if there is no connection betweeen the paper don't make the connection node that circle"
        // Circle nodes MUST connect >= 2 distinct papers. Leaf/single-paper circles are dropped.
        const connectedPapers = paperConnectionCount.get(n.id);
        if (connectedPapers && connectedPapers.size >= 2) {
          finalNodes.push(n);
        }
      }
    });

    // Add the reified relationship circle nodes
    reifiedRelNodes.forEach(rn => {
      finalNodes.push(rn);
    });

    // Filter by Scope / Type / Search
    let filteredNodes = finalNodes;
    if (graphScope === 'core') {
      filteredNodes = filteredNodes.filter(n =>
        ['topic', 'paper', 'relationship', 'method', 'dataset', 'gap'].includes((n.node_type || 'paper').toLowerCase())
      );
    }

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

    const validNodeIds = new Set(filteredNodes.map(n => n.id));
    let filteredEdges = finalEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

    if (relationFilter !== 'all') {
      filteredEdges = filteredEdges.filter(e => (e.relation || '').toLowerCase() === relationFilter.toLowerCase());
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }, [rawNodes, rawEdges, graphScope, nodeTypeFilter, relationFilter, searchTerm, searchQuery]);


  const paperNodesCount = useMemo(() => {
    return (filteredData.nodes || []).filter(n => (n.node_type || '').toLowerCase() === 'paper').length;
  }, [filteredData]);

  // Render Vis Network with forceAtlas2 collision avoidance
  useEffect(() => {
    if (graphMode === 'graph' && containerRef.current && filteredData.nodes.length > 0) {
      renderVisGraph();
    }
  }, [graphMode, theme, filteredData]);

  const renderVisGraph = () => {
    if (!containerRef.current || filteredData.nodes.length === 0) return;

    const isDark = theme === 'dark';

    const nodes = filteredData.nodes.map(n => {
      const ntype = (n.node_type || 'paper').toLowerCase();
      const rawLabel = n.data?.name || n.data?.title || n.data?.text || n.label || n.id;
      
      let formattedLabel;
      let shape = 'box';
      let borderRadius = 4;
      let mass = 1;
      let bg, border, textColor, highlightBg, highlightBorder;

      if (ntype === 'topic') {
        formattedLabel = wrapLabel(rawLabel, 20);
        shape = 'box';
        borderRadius = 22; // Pill capsule matching sketch
        mass = 8; // Central anchor
        bg = isDark ? '#e4e4e7' : '#18181b';
        border = isDark ? '#ffffff' : '#000000';
        textColor = isDark ? '#09090b' : '#ffffff';
        highlightBg = isDark ? '#ffffff' : '#000000';
        highlightBorder = isDark ? '#a1a1aa' : '#52525b';
      } else if (ntype === 'paper') {
        const yearPart = n.data?.year ? `\n(${n.data.year})` : '';
        formattedLabel = wrapLabel(rawLabel, 22) + yearPart;
        shape = 'box';
        borderRadius = 3; // Crisp rectangle matching sketch
        mass = 2;
        bg = isDark ? '#27272a' : '#f8fafc';
        border = isDark ? '#71717a' : '#94a3b8';
        textColor = isDark ? '#f4f4f5' : '#0f172a';
        highlightBg = isDark ? '#3f3f46' : '#e2e8f0';
        highlightBorder = isDark ? '#d4d4d8' : '#334155';
      } else {
        // Inter-paper relationship, method, dataset: circular node matching sketch
        formattedLabel = wrapLabel(rawLabel, 14);
        shape = 'circle';
        borderRadius = 0;
        mass = 1;
        bg = isDark ? '#3f3f46' : '#e2e8f0';
        border = isDark ? '#a1a1aa' : '#64748b';
        textColor = isDark ? '#f4f4f5' : '#0f172a';
        highlightBg = isDark ? '#52525b' : '#cbd5e1';
        highlightBorder = isDark ? '#f4f4f5' : '#1e293b';
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
          bold: ntype === 'topic' ? { mod: 'bold' } : undefined,
        },
        margin: ntype === 'topic' ? { top: 12, right: 20, bottom: 12, left: 20 } : { top: 8, right: 12, bottom: 8, left: 12 },
        borderWidth: ntype === 'topic' ? 2.5 : 1.5,
        shadow: {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.25)',
          size: ntype === 'topic' ? 10 : 4,
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
      const isRelNodeEdge = (e.source && String(e.source).startsWith('rel-')) || (e.target && String(e.target).startsWith('rel-'));
      const friendlyLabel = isRelNodeEdge ? '' : (FRIENDLY_RELATION_LABELS[rel] || (e.label || rel.replace('_', ' ')));

      // Clean chalk line color matching sketch
      const edgeLineColor = isDark
        ? (isTopicEdge ? '#e4e4e7' : '#a1a1aa')
        : (isTopicEdge ? '#1e293b' : '#64748b');

      return {
        id: `${e.source}->${e.target}:${e.relation}`,
        from: e.source,
        to: e.target,
        label: friendlyLabel,
        color: {
          color: edgeLineColor,
          highlight: isDark ? '#ffffff' : '#000000',
          hover: isDark ? '#ffffff' : '#000000',
          opacity: isTopicEdge ? 0.9 : 0.7,
        },
        font: {
          color: isDark ? '#d4d4d8' : '#475569',
          size: 9.5,
          face: 'Plus Jakarta Sans, sans-serif',
          align: 'middle',
          background: isDark ? '#141416' : '#ffffff',
          strokeWidth: 0,
        },
        arrows: {
          to: { enabled: true, scaleFactor: isTopicEdge ? 0.7 : 0.55 },
        },
        smooth: { type: 'continuous', roundness: 0.15 },
        width: isTopicEdge ? 2.0 : 1.5,
      };
    });

    // forceAtlas2 with spacious node repulsion matching user drawing
    const options = {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -220,
          centralGravity: 0.008,
          springLength: 240,
          springConstant: 0.06,
          damping: 0.5,
          avoidOverlap: 1.0,
        },
        stabilization: {
          enabled: true,
          iterations: 300,
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

    network.on('click', async (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const foundNode = filteredData.nodes.find(n => n.id === nodeId) || rawNodes.find(n => n.id === nodeId);
        if (foundNode) {
          setSelectedEntity({
            id: foundNode.id,
            title: foundNode.data?.name || foundNode.data?.title || foundNode.data?.text || foundNode.label,
            type: (foundNode.node_type || 'ENTITY').toUpperCase(),
            raw: foundNode.data,
          });

          // Fetch neighborhood
          try {
            const neighRes = await fetch(`/api/v1/graph/node/${encodeURIComponent(nodeId)}/neighborhood`);
            if (neighRes.ok) {
              const neighData = await neighRes.json();
              setNeighborhood(neighData);
            } else {
              setNeighborhood(null);
            }
          } catch {
            setNeighborhood(null);
          }
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
    if (networkRef.current) {
      networkRef.current.focus(nodeId, {
        scale: 1.2,
        animation: { duration: 800, easingFunction: 'easeInOutQuad' },
      });
      networkRef.current.selectNodes([nodeId]);
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
              <span className="badge badge-blue" style={{ marginLeft: 8 }}>
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
            className={`btn btn-secondary btn-sm ${graphMode === 'matrix' ? 'btn-primary' : ''}`}
            onClick={() => setGraphMode('matrix')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Table2 size={13} />
            <span>Relationship Matrix ({matrixRows.length})</span>
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
            {/* Complexity Scope Selector */}
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: 2, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setGraphScope('core')}
                className={`btn btn-sm ${graphScope === 'core' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                title="Show Papers, Methods & Datasets (Clean Architecture)"
              >
                Core Architecture
              </button>
              <button
                onClick={() => setGraphScope('all')}
                className={`btn btn-sm ${graphScope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                title="Show Full Detail including Claims & Metrics"
              >
                Full Detail
              </button>
            </div>

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
                <option value="topic">Topic (Head Node)</option>
                <option value="paper">Papers (Subnodes)</option>
                <option value="method">Methods</option>
                <option value="dataset">Datasets</option>
                <option value="gap">Research Gaps</option>
                <option value="metric">Metrics</option>
                <option value="claim">Claims</option>
                <option value="limitation">Limitations</option>
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
                <option value="covers">COVERS (Topic → Paper)</option>
                <option value="uses_method">USES_METHOD</option>
                <option value="evaluates_on">EVALUATES_ON</option>
                <option value="cites">CITES</option>
                <option value="achieves">ACHIEVES</option>
                <option value="has_claim">HAS_CLAIM</option>
                <option value="limited_by">LIMITED_BY</option>
              </select>
            </label>

            <span className="badge badge-neutral" style={{ fontSize: 11.5 }}>
              {filteredData.nodes.length} Nodes • {filteredData.edges.length} Relations
            </span>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-box">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-blue)', marginBottom: 8 }} />
          <p>Loading Knowledge Graph entities & semantic relationships...</p>
        </div>
      )}

      {/* Friendly Plain-English Guide Banner */}
      {graphMode === 'graph' && !loading && (
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
                <span>No papers added yet. Go to <strong>Literature Search</strong> and click <strong>+ Add to Graph</strong> on papers to include them here.</span>
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
      {graphMode === 'graph' && !loading && (
        <div className="graph-workspace" id="graph-workspace-view">
          <div className="card graph-canvas-box" style={{ height: 620, position: 'relative' }}>
            {filteredData.nodes.length > 0 ? (
              <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <NetworkIcon size={44} style={{ marginBottom: 14, color: 'var(--accent-blue)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Knowledge Graph is Ready to Explore
                </h3>
                <p style={{ fontSize: 13, maxWidth: 440, textAlign: 'center', marginBottom: 20 }}>
                  Search any topic (e.g. "chain of thought") in Literature Search to auto-build nodes, or seed canonical literature.
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
                <div><span style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 2, background: theme === 'dark' ? '#27272a' : '#f8fafc', border: '1px solid #71717a', marginRight: 6, verticalAlign: 'middle' }}></span> Research Paper (Box)</div>
                <div><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: theme === 'dark' ? '#3f3f46' : '#e2e8f0', border: '1px solid #a1a1aa', marginRight: 6, verticalAlign: 'middle' }}></span> Relationship (Circle)</div>
                <div><span style={{ display: 'inline-block', width: 16, height: 2, background: theme === 'dark' ? '#d4d4d8' : '#475569', marginRight: 6, verticalAlign: 'middle' }}></span> Connection</div>
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
                  <span className={`badge ${selectedEntity.type === 'TOPIC' ? 'badge-blue' : selectedEntity.type === 'METHOD' ? 'badge-purple' : selectedEntity.type === 'DATASET' ? 'badge-amber' : 'badge-neutral'}`}>
                    {selectedEntity.type}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleFocusNode(selectedEntity.id)}
                    style={{ fontSize: 11, padding: '2px 6px' }}
                  >
                    Focus
                  </button>
                </div>

                <h4 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 6px', color: 'var(--text-primary)' }}>
                  {selectedEntity.title}
                </h4>

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

                {selectedEntity.raw?.abstract && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 12 }}>
                    {selectedEntity.raw.abstract.slice(0, 220)}...
                  </p>
                )}

                {selectedEntity.type === 'PAPER' && (
                  <div style={{ marginBottom: 14 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => openInReader(selectedEntity.raw)}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                    >
                      <FileText size={12} />
                      <span>Open in PDF Reader</span>
                    </button>
                  </div>
                )}

                {/* Neighborhood & Relationships Section */}
                {neighborhood && neighborhood.edges && neighborhood.edges.length > 0 && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <h5 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Layers size={13} />
                      Connected Relationships ({neighborhood.edges.length})
                    </h5>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {neighborhood.edges.map((edge, idx) => {
                        const targetNeighbor = neighborhood.neighbors?.find(
                          n => n.id === (edge.direction === 'outgoing' ? edge.target : edge.source)
                        );
                        const neighborLabel = targetNeighbor?.title || targetNeighbor?.name || targetNeighbor?.text || (edge.direction === 'outgoing' ? edge.target : edge.source);
                        const relColor = EDGE_COLORS[edge.relation] || '#64748b';

                        return (
                          <div
                            key={idx}
                            onClick={() => handleFocusNode(targetNeighbor?.id || (edge.direction === 'outgoing' ? edge.target : edge.source))}
                            style={{
                              padding: '6px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-subtle)',
                              fontSize: 11.5,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  color: relColor,
                                  textTransform: 'uppercase',
                                  display: 'block',
                                }}
                              >
                                {edge.direction === 'outgoing' ? '→ ' : '← '} {edge.relation.replace('_', ' ')}
                              </span>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                {String(neighborLabel).slice(0, 30)}
                              </span>
                            </div>
                            <ArrowRight size={11} style={{ color: 'var(--text-muted)' }} />
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

      {/* 2. Relationship Matrix Table */}
      {graphMode === 'matrix' && !loading && (
        <div className="card table-box" id="matrix-workspace-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 14 }}>Method × Benchmark Relationship Matrix</h3>
              <p className="panel-subtitle" style={{ fontSize: 12 }}>
                Cross-mapping extracted methods to evaluated benchmarks for <strong>{searchQuery || 'Current Knowledge Base'}</strong>.
              </p>
            </div>
            <span className="badge badge-blue">{matrixRows.length} Mappings Extracted</span>
          </div>

          {matrixRows.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Extracted Methodology</th>
                  <th>Evaluated Benchmark Dataset</th>
                  <th>Evidence Status</th>
                  <th>Scientific Link Rationale</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row, idx) => (
                  <tr key={idx}>
                    <td><strong>{row.method}</strong></td>
                    <td>{row.dataset}</td>
                    <td><span className="badge badge-emerald">{row.status}</span></td>
                    <td>{row.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No relationship matrix data extracted yet. Run a search in <strong>Literature Search</strong> (e.g. 'chain of thought').
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



