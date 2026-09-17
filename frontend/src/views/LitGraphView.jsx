import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3';
import {
  Search,
  Loader2,
  X,
  ExternalLink,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  BookOpen,
  Users,
  Calendar,
  BarChart2,
  Network,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// ── Color scale: cool blue (old) → warm indigo/emerald (recent) ──────────────
function yearToColor(year, minYear, maxYear, isSeed = false) {
  if (isSeed) return '#f59e0b'; // gold seed
  if (!year) return '#6b7280';
  const t = Math.max(0, Math.min(1, (year - minYear) / Math.max(maxYear - minYear, 1)));
  // interpolate: slate-blue (#94a3b8) → indigo (#6366f1) → emerald (#10b981)
  const color = d3.interpolateRgbBasis(['#94a3b8', '#6366f1', '#10b981'])(t);
  return color;
}

// ── Node radius: log-scaled citation count ────────────────────────────────────
function citationRadius(count) {
  const MIN = 5;
  const MAX = 24;
  if (!count || count <= 0) return MIN;
  const r = Math.sqrt(Math.log10(Math.max(count, 1) + 1) * 80);
  return Math.max(MIN, Math.min(MAX, r));
}

// ── Search Autocomplete ───────────────────────────────────────────────────────
function SearchBar({ onSelectPaper }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/litgraph/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setOpen(true);
      }
    } catch {}
    setLoading(false);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 350);
  };

  const handleSelect = (paper) => {
    setQuery(paper.title);
    setResults([]);
    setOpen(false);
    onSelectPaper(paper);
  };

  const handleKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceRef.current);
      if (results.length > 0) {
        handleSelect(results[0]);
      } else if (query.trim().length >= 2) {
        setLoading(true);
        try {
          const res = await fetch(`/api/v1/litgraph/search?q=${encodeURIComponent(query.trim())}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
              handleSelect(data[0]);
            } else {
              setResults([]);
              setOpen(true);
            }
          }
        } catch {}
        setLoading(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search paper title, DOI, or topic (e.g. Agentic Memory)..."
            style={{
              width: '100%',
              padding: '9px 12px 9px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13.5,
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {loading && (
            <Loader2
              size={13}
              className="animate-spin"
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--accent-primary)',
              }}
            />
          )}
        </div>
      </div>

      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            marginTop: 4,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {results.map((p) => (
            <button
              key={p.paperId}
              onClick={() => handleSelect(p)}
              style={{
                width: '100%',
                padding: '10px 14px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {p.title}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {p.year && `${p.year} · `}
                {p.authors?.slice(0, 2).join(', ')}
                {p.citationCount ? ` · ${p.citationCount.toLocaleString()} citations` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Paper Details Panel ───────────────────────────────────────────────────────
function DetailsPanel({ node, onMakeSeed, onClose }) {
  if (!node) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 28,
          textAlign: 'center',
          color: 'var(--text-muted)',
          gap: 12,
        }}
      >
        <Network size={38} style={{ opacity: 0.25 }} />
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          Click any node in the graph to see paper details, authors, and abstract here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 18px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          {node.isSeed && (
            <span style={{
              display: 'inline-block', marginBottom: 6,
              background: '#f59e0b22', color: '#d97706',
              border: '1px solid #f59e0b55', borderRadius: 4,
              fontSize: 10.5, fontWeight: 700, padding: '2px 7px', letterSpacing: '0.04em',
            }}>
              ★ SEED PAPER
            </span>
          )}
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: 1.45 }}>
            {node.title}
          </h3>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onClose} style={{ flexShrink: 0 }}>
          <X size={13} />
        </button>
      </div>

      {/* Meta chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {node.year && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            <Calendar size={11} /> {node.year}
          </span>
        )}
        {node.citationCount != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            <BarChart2 size={11} /> {node.citationCount.toLocaleString()} citations
          </span>
        )}
        {node.authors?.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            <Users size={11} /> {node.authors.slice(0, 3).join(', ')}{node.authors.length > 3 ? ' et al.' : ''}
          </span>
        )}
      </div>

      {/* Abstract */}
      {node.abstract && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
            Abstract
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            {node.abstract}
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
        {node.url && (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', textDecoration: 'none' }}
          >
            <ExternalLink size={13} />
            <span>Open Paper</span>
          </a>
        )}
        {!node.isSeed && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onMakeSeed(node)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
          >
            <RefreshCw size={13} />
            <span>Build Graph from This Paper</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function YearLegend({ minYear, maxYear }) {
  const steps = 5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{minYear}</span>
      <div style={{ display: 'flex', gap: 1 }}>
        {Array.from({ length: steps }, (_, i) => {
          const t = i / (steps - 1);
          const year = Math.round(minYear + t * (maxYear - minYear));
          const color = yearToColor(year, minYear, maxYear);
          return (
            <div key={i} style={{ width: 18, height: 10, background: color, borderRadius: 2 }} />
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{maxYear}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#f59e0b', verticalAlign: 'middle', marginRight: 3 }} />
        Seed
      </span>
    </div>
  );
}

// ── Main LitGraph View ────────────────────────────────────────────────────────
export default function LitGraphView() {
  const fgRef = useRef(null);

  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  // Filters
  const [minYearFilter, setMinYearFilter] = useState(1990);
  const [maxNodes, setMaxNodes] = useState(45);
  const [seedTitle, setSeedTitle] = useState('');

  // Derived year bounds
  const [yearBounds, setYearBounds] = useState([1990, new Date().getFullYear()]);

  const loadGraph = useCallback(async (paperId, paperTitle = '') => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setSeedTitle(paperTitle);

    try {
      const res = await fetch(`/api/v1/litgraph/graph/${encodeURIComponent(paperId)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // Compute year bounds
      const years = data.nodes.map((n) => n.year).filter(Boolean);
      const mn = years.length ? Math.min(...years) : 1990;
      const mx = years.length ? Math.max(...years) : new Date().getFullYear();
      setYearBounds([mn, mx]);
      setMinYearFilter(mn);

      // Annotate node radii
      data.nodes = data.nodes.map((n) => ({
        ...n,
        radius: citationRadius(n.citationCount),
      }));

      setGraphData(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Filtered graph (year + node count)
  const filteredGraph = useMemo(() => {
    if (!graphData) return null;
    const [minY, maxY] = yearBounds;

    let nodes = graphData.nodes.filter(
      (n) => n.isSeed || !n.year || n.year >= minYearFilter
    );

    // Enforce maxNodes (always keep seed)
    if (nodes.length > maxNodes) {
      const seed = nodes.find((n) => n.isSeed);
      const rest = nodes
        .filter((n) => !n.isSeed)
        .sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0))
        .slice(0, maxNodes - 1);
      nodes = seed ? [seed, ...rest] : rest;
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = graphData.links.filter(
      (l) => nodeIds.has(l.source?.id || l.source) && nodeIds.has(l.target?.id || l.target)
    );

    // Color nodes
    const coloredNodes = nodes.map((n) => ({
      ...n,
      color: yearToColor(n.year, minY, maxY, n.isSeed),
    }));

    return { nodes: coloredNodes, links };
  }, [graphData, minYearFilter, maxNodes, yearBounds]);

  // Node click → highlight neighbourhood
  const handleNodeClick = useCallback(
    (node) => {
      if (!filteredGraph) return;
      setSelectedNode(node);
      setPanelOpen(true);

      const connectedNodes = new Set([node.id]);
      const connectedLinks = new Set();
      filteredGraph.links.forEach((l) => {
        const srcId = l.source?.id || l.source;
        const tgtId = l.target?.id || l.target;
        if (srcId === node.id || tgtId === node.id) {
          connectedNodes.add(srcId);
          connectedNodes.add(tgtId);
          connectedLinks.add(l);
        }
      });
      setHighlightNodes(connectedNodes);
      setHighlightLinks(connectedLinks);
    },
    [filteredGraph]
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  // Custom canvas node painter (Light Theme)
  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const r = node.radius || 8;
      const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
      const isHovered = hoverNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const alpha = isHighlighted ? 1 : 0.15;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Glow for seed or selected/hovered node
      if (node.isSeed) {
        ctx.shadowColor = 'rgba(245, 158, 11, 0.6)'; // Amber glow
        ctx.shadowBlur = 18;
      } else if (isSelected || isHovered) {
        ctx.shadowColor = 'rgba(99, 102, 241, 0.5)'; // Indigo glow
        ctx.shadowBlur = 14;
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 6;
      }

      // Circle fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color || '#94a3b8';
      ctx.fill();

      // Border outline (Darker for light theme)
      ctx.lineWidth = node.isSeed ? 3 : isSelected ? 2.5 : isHovered ? 2 : 1;
      ctx.strokeStyle = node.isSeed
        ? '#d97706' // Darker amber
        : isSelected
        ? '#1e293b' // Slate 800
        : isHovered
        ? '#4f46e5' // Indigo 600
        : 'rgba(0, 0, 0, 0.15)';
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Draw title labels
      const showLabel = node.isSeed || isSelected || isHovered || globalScale >= 1.6 || r >= 13;
      if (showLabel) {
        const rawTitle = node.title || node.id;
        const maxLen = globalScale > 2.5 ? 40 : 26;
        const label = rawTitle.length > maxLen ? rawTitle.slice(0, maxLen - 1) + '…' : rawTitle;

        const fontSize = Math.max(3, Math.min(4.5, 12 / globalScale));
        ctx.font = `600 ${fontSize}px Plus Jakarta Sans, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const labelY = node.y + r + 4 / globalScale;

        // Subtle pill background for label readability (Light theme)
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        const padding = 2 / globalScale;
        ctx.roundRect(
          node.x - textWidth / 2 - padding,
          labelY - padding / 2,
          textWidth + padding * 2,
          fontSize + padding * 1.5,
          2 / globalScale
        );
        ctx.fill();

        // Text fill (Dark text)
        ctx.fillStyle = node.isSeed ? '#b45309' : '#334155'; // Dark amber / Slate 700
        ctx.fillText(label, node.x, labelY);
      }

      ctx.restore();
    },
    [highlightNodes, selectedNode, hoverNode]
  );

  // Custom link painter (Light Theme)
  const paintLink = useCallback(
    (link, ctx) => {
      const src = link.source;
      const tgt = link.target;
      if (!src || !tgt || typeof src.x !== 'number' || typeof tgt.x !== 'number') return;

      const isHighlighted = highlightLinks.size === 0 || highlightLinks.has(link);
      ctx.save();
      ctx.globalAlpha = isHighlighted ? Math.min(0.85, Math.max(0.35, link.weight || 0.4)) : 0.05;
      
      // Darker lines for light theme background
      ctx.strokeStyle = isHighlighted ? (link.weight > 0.3 ? '#6366f1' : '#cbd5e1') : '#e2e8f0';
      ctx.lineWidth = isHighlighted ? Math.max(1.2, (link.weight || 0.3) * 3) : 0.6;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.restore();
    },
    [highlightLinks]
  );

  // Configure custom D3 physics forces on data update
  useEffect(() => {
    if (fgRef.current && filteredGraph) {
      fgRef.current.d3Force('charge', d3.forceManyBody().strength(-240));
      fgRef.current.d3Force(
        'link',
        d3.forceLink().id((d) => d.id).distance((d) => (1 - (d.weight || 0.2)) * 80 + 35).strength((d) => (d.weight || 0.3) * 0.75)
      );
      fgRef.current.d3Force('collide', d3.forceCollide().radius((d) => (d.radius || 8) + 8));
      fgRef.current.d3ReheatSimulation();
    }
  }, [filteredGraph]);

  if (!filteredGraph && !loading && !error) {
    return <LandingState onSelectPaper={(p) => loadGraph(p.paperId, p.title)} />;
  }

  return (
    <section
      className="view-panel active"
      style={{ padding: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* ── Top Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Network size={18} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>LitGraph</span>
          {seedTitle && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              — {seedTitle}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 280, maxWidth: 520 }}>
          <SearchBar onSelectPaper={(p) => loadGraph(p.paperId, p.title)} />
        </div>

        {graphData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {filteredGraph?.nodes.length} nodes · {filteredGraph?.links.length} edges
            </span>
            <YearLegend minYear={yearBounds[0]} maxYear={yearBounds[1]} />
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--accent-primary)', flexShrink: 0 }}>
            <Loader2 size={13} className="animate-spin" />
            <span>Building similarity graph…</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderBottom: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Graph Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f8fafc' }}>
          {filteredGraph && (
            <ForceGraph2D
              ref={fgRef}
              graphData={filteredGraph}
              nodeId="id"
              linkSource="source"
              linkTarget="target"
              backgroundColor="#f8fafc"
              nodeCanvasObject={paintNode}
              nodeCanvasObjectMode={() => 'replace'}
              linkCanvasObjectMode={() => 'before'}
              linkCanvasObject={paintLink}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              warmupTicks={60}
              cooldownTicks={100}
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              onNodeHover={setHoverNode}
              enableNodeDrag
              enablePanInteraction
              enableZoomInteraction
              nodePointerAreaPaint={(node, color, ctx) => {
                const r = node.radius || 8;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
                ctx.fill();
              }}
            />
          )}

          {/* Zoom controls */}
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <button className="btn btn-secondary btn-sm" onClick={() => fgRef.current?.zoom(1.4)} title="Zoom In">
              <ZoomIn size={14} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => fgRef.current?.zoom(0.7)} title="Zoom Out">
              <ZoomOut size={14} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => fgRef.current?.zoomToFit(500)} title="Fit View">
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Filter controls */}
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From {minYearFilter}</span>
              <input
                type="range"
                min={yearBounds[0]}
                max={yearBounds[1]}
                value={minYearFilter}
                onChange={(e) => setMinYearFilter(Number(e.target.value))}
                style={{ width: 100, accentColor: 'var(--accent-primary)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SlidersHorizontal size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Max {maxNodes} nodes</span>
              <input
                type="range"
                min={10}
                max={45}
                value={maxNodes}
                onChange={(e) => setMaxNodes(Number(e.target.value))}
                style={{ width: 80, accentColor: 'var(--accent-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Details sidebar toggle */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          style={{
            position: 'absolute',
            right: panelOpen ? 316 : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRight: panelOpen ? 'none' : '1px solid var(--border-subtle)',
            borderRadius: panelOpen ? '6px 0 0 6px' : '0 6px 6px 0',
            padding: '8px 4px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'right 0.2s',
          }}
        >
          {panelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Details Panel */}
        {panelOpen && (
          <div
            style={{
              width: 320,
              flexShrink: 0,
              borderLeft: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {selectedNode ? 'Paper Details' : 'Inspector'}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <DetailsPanel
                node={selectedNode}
                onMakeSeed={(node) => loadGraph(node.id, node.title)}
                onClose={() => { setSelectedNode(null); setHighlightNodes(new Set()); setHighlightLinks(new Set()); }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Landing page when no graph loaded ────────────────────────────────────────
function LandingState({ onSelectPaper }) {
  const EXAMPLES = [
    { paperId: 'W4407759090', title: 'A-Mem: Agentic Memory for LLM Agents' },
    { paperId: 'W4393065402', title: 'A survey on large language model based autonomous agents' },
    { paperId: '204e3073870fae3d05bcbc2f6a8e263d9b72e776', title: 'Attention Is All You Need' },
    { paperId: '5b5b20dc5e0e7e7b8cf08fc9db9c90c2461b1f69', title: 'GPT-4 Technical Report' },
  ];

  return (
    <section className="view-panel active" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
          <Network size={32} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>LitGraph</h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          Explore the bibliometric similarity graph of any research paper — powered by Semantic Scholar.
          Discover closely related work, trace citation clusters, and find your next read.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 520 }}>
        <SearchBar onSelectPaper={onSelectPaper} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 520 }}>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>Try an example:</p>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.paperId}
            className="btn btn-secondary btn-sm"
            onClick={() => onSelectPaper(ex)}
            style={{ fontSize: 12.5, justifyContent: 'flex-start', textAlign: 'left' }}
          >
            <BookOpen size={12} style={{ flexShrink: 0 }} />
            <span>{ex.title}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 520, width: '100%', marginTop: 8 }}>
        {[
          { icon: <Network size={16} />, label: 'Bibliometric Similarity', desc: 'Jaccard similarity over shared reference sets' },
          { icon: <BarChart2 size={16} />, label: 'Citation-Scaled Nodes', desc: 'Node size reflects citation impact' },
          { icon: <Calendar size={16} />, label: 'Temporal Color Map', desc: 'Cool blues → warm indigo/emerald by year' },
        ].map((f) => (
          <div key={f.label} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ color: 'var(--accent-primary)', marginBottom: 6 }}>{f.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
