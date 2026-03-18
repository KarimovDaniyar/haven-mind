import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';

interface GraphNode {
  id: string;
  title: string;
  type: 'text' | 'canvas';
  linkCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  return matches ? matches.map((m) => m.slice(2, -2)) : [];
}

export default function GraphView() {
  const { notes, setActiveNoteId, setActiveView } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  // Build graph data
  useEffect(() => {
    const nodeMap = new Map<string, GraphNode>();
    notes.forEach((note, i) => {
      const angle = (i / notes.length) * Math.PI * 2;
      const radius = 150;
      nodeMap.set(note.title.toLowerCase(), {
        id: note.id,
        title: note.title,
        type: note.type,
        linkCount: 0,
        x: 400 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: 300 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
      });
    });

    const edges: GraphEdge[] = [];
    notes.forEach((note) => {
      const links = extractWikiLinks(note.content);
      links.forEach((linkTitle) => {
        const target = nodeMap.get(linkTitle.toLowerCase());
        if (target) {
          edges.push({ source: note.id, target: target.id });
          target.linkCount++;
        }
      });
    });

    nodesRef.current = Array.from(nodeMap.values());
    edgesRef.current = edges;
  }, [notes]);

  // Force simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(2, 2);
    };
    resize();

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas.width / 2;
      const h = canvas.height / 2;

      // Forces
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx; nodes[i].vy -= fy;
          nodes[j].vx += fx; nodes[j].vy += fy;
        }
      }

      edges.forEach((e) => {
        const src = nodes.find((n) => n.id === e.source);
        const tgt = nodes.find((n) => n.id === e.target);
        if (!src || !tgt) return;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 120) * 0.005;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        src.vx += fx; src.vy += fy;
        tgt.vx -= fx; tgt.vy -= fy;
      });

      // Center gravity
      nodes.forEach((n) => {
        n.vx += (w / 2 - n.x) * 0.001;
        n.vy += (h / 2 - n.y) * 0.001;
        n.vx *= 0.9; n.vy *= 0.9;
        n.x += n.vx; n.y += n.vy;
      });

      // Draw
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);

      // Edges
      edges.forEach((e) => {
        const src = nodes.find((n) => n.id === e.source);
        const tgt = nodes.find((n) => n.id === e.target);
        if (!src || !tgt) return;
        const isHighlighted = hoveredNode === src.id || hoveredNode === tgt.id;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = isHighlighted ? '#8B6F47' : '#D4CFC9';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Nodes
      nodes.forEach((n) => {
        const size = 4 + Math.min(n.linkCount * 2, 10);
        const isHovered = hoveredNode === n.id;
        const isSelected = selectedNode === n.id;
        ctx.beginPath();

        if (n.type === 'canvas') {
          // Diamond
          ctx.moveTo(n.x, n.y - size);
          ctx.lineTo(n.x + size, n.y);
          ctx.lineTo(n.x, n.y + size);
          ctx.lineTo(n.x - size, n.y);
          ctx.closePath();
        } else {
          ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
        }

        ctx.fillStyle = isSelected ? '#1C1917' : isHovered ? '#8B6F47' : '#C4B09A';
        ctx.fill();

        if (isHovered || isSelected) {
          ctx.font = '12px Inter';
          ctx.fillStyle = '#1C1917';
          ctx.textAlign = 'center';
          ctx.fillText(n.title, n.x, n.y - size - 8);
        }
      });

      ctx.restore();
      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [zoom, offset, hoveredNode, selectedNode, notes]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    const clicked = nodesRef.current.find((n) => {
      const size = 4 + Math.min(n.linkCount * 2, 10);
      return Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < size + 5;
    });

    setSelectedNode(clicked?.id || null);
  }, [zoom, offset]);

  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    const hovered = nodesRef.current.find((n) => {
      const size = 4 + Math.min(n.linkCount * 2, 10);
      return Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < size + 5;
    });

    setHoveredNode(hovered?.id || null);
  }, [zoom, offset]);

  const selectedNoteData = selectedNode ? notes.find((n) => n.id === selectedNode) : null;

  return (
    <div className="flex-1 h-full relative bg-background">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
      />

      {/* Selected node panel */}
      <AnimatePresence>
        {selectedNoteData && (
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute top-4 right-4 w-[240px] bg-card border border-border rounded-lg p-4 shadow-sm"
          >
            <h3 className="font-display text-sm font-medium text-foreground">{selectedNoteData.title}</h3>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
              {selectedNoteData.content.replace(/[#*_\[\]>`]/g, '').slice(0, 120)}
            </p>
            <button
              onClick={() => {
                setActiveNoteId(selectedNoteData.id);
                setActiveView('notes');
              }}
              className="mt-3 text-xs text-accent font-medium hover:underline"
            >
              Open note →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.2))} className="w-8 h-8 bg-card border border-border rounded-md flex items-center justify-center hover:bg-surface-hover transition-spring-micro">
          <ZoomIn size={14} />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} className="w-8 h-8 bg-card border border-border rounded-md flex items-center justify-center hover:bg-surface-hover transition-spring-micro">
          <ZoomOut size={14} />
        </button>
        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="w-8 h-8 bg-card border border-border rounded-md flex items-center justify-center hover:bg-surface-hover transition-spring-micro">
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
