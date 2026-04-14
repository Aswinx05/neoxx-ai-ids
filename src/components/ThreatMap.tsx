import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Packet {
  id: number;
  src: string;
  dst: string;
  proto: number;
  size: number;
  timestamp: string;
  isAttack?: boolean;
}

interface ThreatMapProps {
  packets: Packet[];
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  type: 'host' | 'attacker';
  isAttack?: boolean;
  lastSeen: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  id: string;
  isAttack?: boolean;
}

export default function ThreatMap({ packets }: ThreatMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = 400;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    const nodes: Node[] = [{ id: 'NEOXX.AI Host', type: 'host', lastSeen: Date.now() }];
    const links: Link[] = [];

    // Process packets into nodes and links
    packets.forEach(p => {
      const existingNode = nodes.find(n => n.id === p.src);
      const isAttack = p.isAttack || (p.size > 1500); // Deterministic fallback

      if (!existingNode) {
        nodes.push({ id: p.src, type: 'attacker', isAttack, lastSeen: Date.now() });
      } else {
        existingNode.lastSeen = Date.now();
        existingNode.isAttack = isAttack || existingNode.isAttack;
      }

      const linkId = `${p.src}-host`;
      if (!links.find(l => l.id === linkId)) {
        links.push({ source: p.src, target: 'NEOXX.AI Host', id: linkId, isAttack });
      }
    });

    // Keep only recent nodes (last 10 seconds)
    const now = Date.now();
    const filteredNodes = nodes.filter(n => n.type === 'host' || (now - n.lastSeen < 10000));
    const filteredLinks = links.filter(l => 
      filteredNodes.find(n => n.id === (l.source as any)) && 
      filteredNodes.find(n => n.id === (l.target as any))
    );

    const simulation = d3.forceSimulation<Node>(filteredNodes)
      .force('link', d3.forceLink<Node, Link>(filteredLinks).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g')
      .selectAll('line')
      .data(filteredLinks)
      .join('line')
      .attr('stroke', d => d.isAttack ? '#ef4444' : '#6366f1')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => d.isAttack ? 3 : 1)
      .attr('class', d => d.isAttack ? 'animate-pulse' : '');

    const node = svg.append('g')
      .selectAll('g')
      .data(filteredNodes)
      .join('g');

    node.append('circle')
      .attr('r', d => d.type === 'host' ? 12 : 6)
      .attr('fill', d => d.type === 'host' ? '#4f46e5' : (d.isAttack ? '#ef4444' : '#94a3b8'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    node.append('text')
      .text(d => d.type === 'host' ? 'NEOXX.AI' : d.id)
      .attr('x', 15)
      .attr('y', 5)
      .attr('fill', '#64748b')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold');

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [packets]);

  return (
    <div ref={containerRef} className="w-full bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
      <svg ref={svgRef} className="w-full h-[400px]" />
    </div>
  );
}
