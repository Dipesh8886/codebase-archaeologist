import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { api } from '../api/client.js';

/**
 * Renders the directory-clustered graph by default (never the full flat
 * file graph up front — that's what produces an unreadable hairball on
 * any repo bigger than a toy project). Clicking a cluster lazy-loads and
 * renders just that cluster's files via the /graph/expand/:dir endpoint.
 */
export default function DependencyGraph({ repoId }) {
  const svgRef = useRef(null);
  const [view, setView] = useState({ mode: 'clusters', dir: null });
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url =
      view.mode === 'clusters' ? `/repos/${repoId}/graph` : `/repos/${repoId}/graph/expand/${encodeURIComponent(view.dir)}`;

    api
      .get(url)
      .then((r) => setGraphData(view.mode === 'clusters' ? r.data.clusters : r.data.expanded))
      .finally(() => setLoading(false));
  }, [repoId, view]);

  useEffect(() => {
    if (!graphData || !svgRef.current) return;
    renderGraph(svgRef.current, graphData, view.mode, (nodeId) => {
      if (view.mode === 'clusters') setView({ mode: 'files', dir: nodeId });
    });
  }, [graphData, view.mode]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <p className="text-sm text-gray-400">
          {view.mode === 'clusters' ? 'Directory overview — click a cluster to expand' : `Files in ${view.dir}`}
        </p>
        {view.mode === 'files' && (
          <button
            onClick={() => setView({ mode: 'clusters', dir: null })}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            ← Back to overview
          </button>
        )}
      </div>

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            Loading graph…
          </div>
        )}
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
}

function renderGraph(svgEl, data, mode, onNodeClick) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 700;
  const height = svgEl.clientHeight || 500;
  svg.attr('viewBox', [0, 0, width, height]);

  const nodes = data.nodes.map((d) => ({ ...d }));
  const links = data.edges.map((d) => ({ ...d, source: d.from, target: d.to }));

  const simulation = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(90).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide().radius((d) => nodeRadius(d, mode) + 8));

  const g = svg.append('g');

  svg.call(
    d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => g.attr('transform', event.transform))
  );

  const link = g
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', '#374151')
    .attr('stroke-width', (d) => (mode === 'clusters' ? Math.min(1 + Math.log(d.weight || 1), 5) : 1));

  const node = g
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', mode === 'clusters' ? 'pointer' : 'default')
    .call(drag(simulation))
    .on('click', (_, d) => onNodeClick(d.id));

  node
    .append('circle')
    .attr('r', (d) => nodeRadius(d, mode))
    .attr('fill', (d) => (d.external ? '#374151' : mode === 'clusters' ? '#10b981' : '#6366f1'))
    .attr('opacity', (d) => (d.external ? 0.5 : 0.9));

  node
    .append('text')
    .text((d) => d.label)
    .attr('font-size', 10)
    .attr('fill', '#d1d5db')
    .attr('dx', (d) => nodeRadius(d, mode) + 4)
    .attr('dy', 4);

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

function nodeRadius(d, mode) {
  if (mode === 'clusters') return Math.min(8 + Math.sqrt(d.fileCount || 1) * 3, 30);
  return d.external ? 5 : 8;
}

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
}
