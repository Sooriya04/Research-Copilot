/* ==========================================================================
   KnowledgeGraphView Component
   Vis-Network Relational Graph Visualization & Stable Node Inspector
   ========================================================================== */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Icons } from '../common/Icons.jsx';

export function KnowledgeGraphView({ graphData, papers, onSelectPaper }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeFilter, setNodeFilter] = useState('all');
  const [isPhysicsEnabled, setIsPhysicsEnabled] = useState(true);

  // Normalize and merge backend graph data with retrieved active papers
  const processedGraph = useMemo(() => {
    const rawNodesMap = new Map();
    const rawEdgesList = [];

    // 1. Process backend graphData if present
    if (graphData && Array.isArray(graphData.nodes)) {
      graphData.nodes.forEach(n => {
        let normalizedGroup = (n.group || n.type || 'paper').toLowerCase();
        if (normalizedGroup === 'article') normalizedGroup = 'paper';
        if (normalizedGroup === 'topic') normalizedGroup = 'task';

        rawNodesMap.set(n.id, {
          id: n.id,
          label: n.name || n.title || n.label || n.id,
          title: n.name || n.title || n.label || n.id,
          abstract: n.summary || n.abstract || '',
          group: normalizedGroup,
          type: normalizedGroup,
          year: n.year || '',
          source: n.source || (n.tags && n.tags[0]) || ''
        });
      });
    }

    if (graphData && Array.isArray(graphData.edges)) {
      graphData.edges.forEach(e => {
        rawEdgesList.push({
          from: e.from || e.source,
          to: e.to || e.target,
          label: e.label || e.relation || e.type || ''
        });
      });
    }

    // 2. Synthesize graph nodes & edges dynamically from retrieved papers
    if (Array.isArray(papers) && papers.length > 0) {
      papers.forEach(p => {
        const paperId = p.id || p.title;
        if (!rawNodesMap.has(paperId)) {
          rawNodesMap.set(paperId, {
            id: paperId,
            label: p.title,
            title: p.title,
            abstract: p.abstract || '',
            group: 'paper',
            type: 'paper',
            year: p.year || '',
            source: p.source || p.provider || 'paper',
            pdf_url: p.pdf_url,
            authors: p.authors
          });
        }

        // Add author nodes and written_by edges
        if (Array.isArray(p.authors)) {
          p.authors.slice(0, 3).forEach(author => {
            const authorId = `author_${author.replace(/\s+/g, '_')}`;
            if (!rawNodesMap.has(authorId)) {
              rawNodesMap.set(authorId, {
                id: authorId,
                label: author,
                title: author,
                group: 'author',
                type: 'author'
              });
            }
            rawEdgesList.push({
              from: authorId,
              to: paperId,
              label: 'written_by'
            });
          });
        }

        // Add source/provider node
        if (p.source || p.provider) {
          const sourceName = (p.source || p.provider).toLowerCase();
          const sourceId = `source_${sourceName}`;
          if (!rawNodesMap.has(sourceId)) {
            rawNodesMap.set(sourceId, {
              id: sourceId,
              label: sourceName.toUpperCase(),
              title: sourceName.toUpperCase(),
              group: 'framework',
              type: 'framework'
            });
          }
          rawEdgesList.push({
            from: paperId,
            to: sourceId,
            label: 'published_in'
          });
        }
      });
    }

    return {
      nodes: Array.from(rawNodesMap.values()),
      edges: rawEdgesList
    };
  }, [graphData, papers]);

  useEffect(() => {
    if (!containerRef.current || !processedGraph) return;

    const vis = window.vis;
    if (!vis) {
      console.warn('vis-network library not loaded in window scope.');
      return;
    }

    let rawNodes = processedGraph.nodes || [];
    let rawEdges = processedGraph.edges || [];

    if (nodeFilter !== 'all') {
      rawNodes = rawNodes.filter(n => (n.group || n.type || '').toLowerCase() === nodeFilter.toLowerCase());
    }

    const nodeGroupColors = {
      paper: { background: '#3b82f6', border: '#2563eb' },
      author: { background: '#8b5cf6', border: '#7c3aed' },
      task: { background: '#f59e0b', border: '#d97706' },
      framework: { background: '#10b981', border: '#059669' }
    };

    const nodes = new vis.DataSet(
      rawNodes.map(n => {
        const group = (n.group || n.type || 'paper').toLowerCase();
        const colors = nodeGroupColors[group] || nodeGroupColors.paper;
        return {
          id: n.id,
          label: n.label.length > 30 ? n.label.slice(0, 30) + '...' : n.label,
          title: n.title,
          group: group,
          shape: 'dot',
          size: group === 'paper' ? 16 : group === 'author' ? 12 : 10,
          color: {
            background: colors.background,
            border: colors.border,
            highlight: { background: colors.background, border: '#ffffff' }
          },
          font: { face: 'Inter', size: 11, color: '#f8fafc' }
        };
      })
    );

    const edges = new vis.DataSet(
      rawEdges.map(e => ({
        from: e.from,
        to: e.to,
        label: e.label || '',
        font: { face: 'JetBrains Mono', size: 9, color: '#94a3b8' },
        color: { color: '#334155', highlight: '#3b82f6' }
      }))
    );

    const data = { nodes, edges };
    const options = {
      nodes: {
        borderWidth: 1.5,
        shadow: true
      },
      edges: {
        width: 1,
        smooth: { type: 'continuous' }
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -35,
          centralGravity: 0.015,
          springLength: 90,
          springConstant: 0.08,
          damping: 0.4
        },
        maxVelocity: 40,
        minVelocity: 0.5,
        stabilization: {
          enabled: true,
          iterations: 180,
          updateInterval: 25,
          fit: true
        }
      },
      interaction: { hover: true, tooltipDelay: 200, zoomView: true }
    };

    const network = new vis.Network(containerRef.current, data, options);
    networkRef.current = network;

    network.on('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
      setIsPhysicsEnabled(false);
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    });

    network.on('selectNode', (params) => {
      const nodeId = params.nodes[0];
      const found = rawNodes.find(n => n.id === nodeId);
      setSelectedNode(found || { id: nodeId, label: nodeId });
    });

    network.on('deselectNode', () => {
      setSelectedNode(null);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (networkRef.current) {
        networkRef.current.redraw();
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [processedGraph, nodeFilter]);

  const handleZoomIn = () => {
    if (!networkRef.current) return;
    const scale = networkRef.current.getScale();
    networkRef.current.moveTo({ scale: scale * 1.25, animation: true });
  };

  const handleZoomOut = () => {
    if (!networkRef.current) return;
    const scale = networkRef.current.getScale();
    networkRef.current.moveTo({ scale: scale * 0.8, animation: true });
  };

  const handleResetFit = () => {
    if (!networkRef.current) return;
    networkRef.current.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  };

  const handleTogglePhysics = () => {
    if (!networkRef.current) return;
    const nextState = !isPhysicsEnabled;
    networkRef.current.setOptions({ physics: { enabled: nextState } });
    setIsPhysicsEnabled(nextState);
  };

  return (
    <div className="view-container graph-view">
      <div className="graph-layout">
        {/* Main Graph Canvas Panel */}
        <div className="panel-card graph-canvas-card">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <h3>Knowledge Graph Explorer</h3>
              <span className="badge-mono badge-s2">
                {processedGraph.nodes.length} NODES / {processedGraph.edges.length} EDGES
              </span>
            </div>

            {/* Canvas Toolbar & Filters */}
            <div className="graph-toolbar">
              <div className="flex items-center gap-1 mr-2">
                {['all', 'paper', 'author', 'task', 'framework'].map(f => (
                  <button
                    key={f}
                    className={`btn-filter-sm ${nodeFilter === f ? 'active' : ''}`}
                    onClick={() => setNodeFilter(f)}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>

              <button className="btn-icon" onClick={handleZoomIn} title="Zoom In">
                <Icons.ZoomIn width={14} height={14} />
              </button>
              <button className="btn-icon" onClick={handleZoomOut} title="Zoom Out">
                <Icons.ZoomOut width={14} height={14} />
              </button>
              <button className="btn-icon" onClick={handleResetFit} title="Fit to View">
                <Icons.Reset width={14} height={14} />
              </button>
              <button
                className={`btn-filter-sm ${isPhysicsEnabled ? 'active' : ''}`}
                onClick={handleTogglePhysics}
                title="Toggle Physics Engine"
              >
                {isPhysicsEnabled ? 'PHYSICS ON' : 'PHYSICS FROZEN'}
              </button>
            </div>
          </div>

          <div ref={containerRef} className="vis-network-container"></div>
        </div>

        {/* Node Inspector Sidebar */}
        <div className="panel-card graph-inspector-card">
          <div className="panel-header">
            <h3>Node Inspector</h3>
            <Icons.KnowledgeGraph width={14} height={14} />
          </div>

          {selectedNode ? (
            <div className="inspector-content">
              <span className="badge-mono badge-openalex">{(selectedNode.group || selectedNode.type || 'NODE').toUpperCase()}</span>
              <h4 className="inspector-title">{selectedNode.label || selectedNode.title || selectedNode.id}</h4>

              {selectedNode.abstract && (
                <p className="inspector-abstract">{selectedNode.abstract}</p>
              )}

              <div className="inspector-meta-list">
                {selectedNode.year && (
                  <div className="inspector-meta-item">
                    <span>Year:</span> <strong>{selectedNode.year}</strong>
                  </div>
                )}
                {selectedNode.source && (
                  <div className="inspector-meta-item">
                    <span>Source:</span> <strong>{selectedNode.source}</strong>
                  </div>
                )}
              </div>

              {(selectedNode.group === 'paper' || selectedNode.type === 'paper') && (
                <button
                  className="btn-primary w-full mt-4"
                  onClick={() => onSelectPaper(selectedNode)}
                >
                  <Icons.PaperReader width={14} height={14} />
                  <span>Inspect Full Paper</span>
                </button>
              )}
            </div>
          ) : (
            <div className="empty-inspector">
              <Icons.KnowledgeGraph width={28} height={28} />
              <p>Select any node in the Knowledge Graph to inspect relations, citations, and metadata.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
