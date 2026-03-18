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
  fx: number | null;
  fy: number | null;
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

  // Drag state
  const dragNodeRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // Build graph data
  useEffect(() => {
    const nodeMap = new Map<string, GraphNode>();
    notes.forEach((note, i) => {
      const angle = (i / notes.length) * Math.PI * 2;
      const radius = 150;
      // Preserve existing positions if we have them
      const existing = nodesRef.current.find((n) => n.id === note.id);
      nodeMap.set(note.title.toLowerCase(), {
        id: note.id,
        title: note.title,
        type: note.type,
        linkCount: 0,
        x: existing?.x ?? 400 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: existing?.y ?? 300 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
        fx: null, fy: null,
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

  // Force simulation + render
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
    };
    resize();
    window.addEventListener('resize', resize);

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const z = zoomRef.current;
      const off = offsetRef.current;

      // Forces
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].fx !== null) continue; // skip fixed nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (nodes[i].fx === null) { nodes[i].vx -= fx; nodes[i].vy -= fy; }
          if (nodes[j].fx === null) { nodes[j].vx += fx; nodes[j].vy += fy; }
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
        if (src.fx === null) { src.vx += fx; src.vy += fy; }
        if (tgt.fx === null) { tgt.vx -= fx; tgt.vy -= fy; }
      });

      nodes.forEach((n) => {
        if (n.fx !== null) {
          n.x = n.fx;
          n.y = n.fy!;
          n.vx = 0;
          n.vy = 0;
          return;
        }
        n.vx += (w / (2 * z) - n.x + off.x / z) * 0.0005;
        n.vy += (h / (2 * z) - n.y + off.y / z) * 0.0005;
        n.vx *= 0.9;
        n.vy *= 0.9;
        n.x += n.vx;
        n.y += n.vy;
      });

      // Draw
      ctx.save();
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(off.x, off.y);
      ctx.scale(z, z);

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
        ctx.lineWidth = 1 / z;
        ctx.stroke();
      });

      // Nodes
      nodes.forEach((n) => {
        const size = (4 + Math.min(n.linkCount * 2, 10)) / z * z;
        const isHovered = hoveredNode === n.id;
        const isSelected = selectedNode === n.id;
        const isDragged = dragNodeRef.current === n.id;
        ctx.beginPath();

        if (n.type === 'canvas') {
          ctx.moveTo(n.x, n.y - size);
          ctx.lineTo(n.x + size, n.y);
          ctx.lineTo(n.x, n.y + size);
          ctx.lineTo(n.x - size, n.y);
          ctx.closePath();
        } else {
          ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
        }

        ctx.fillStyle = isSelected || isDragged ? '#1C1917' : isHovered ? '#8B6F47' : '#C4B09A';
        ctx.fill();

        if (isHovered || isSelected) {
          ctx.font = `${12 / z * z}px Inter`;
          ctx.fillStyle = '#1C1917';
          ctx.textAlign = 'center';
          ctx.fillText(n.title, n.x, n.y - size - 8);
        }
      });

      ctx.restore();
      ctx.restore();
      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [hoveredNode, selectedNode, notes]);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offsetRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - offsetRef.current.y) / zoomRef.current,
    };
  }, []);

  const findNodeAt = useCallback((cx: number, cy: number) => {
    return nodesRef.current.find((n) => {
      const size = 4 + Math.min(n.linkCount * 2, 10) + 5;
      return Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2) < size;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const node = findNodeAt(x, y);

    if (node) {
      // Start dragging node
      dragNodeRef.current = node.id;
      node.fx = node.x;
      node.fy = node.y;
      setSelectedNode(node.id);
    } else {
      // Start panning
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
    }
  }, [screenToCanvas, findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragNodeRef.current) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const node = nodesRef.current.find((n) => n.id === dragNodeRef.current);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }

    // Hover detection
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const hovered = findNodeAt(x, y);
    setHoveredNode(hovered?.id || null);
  }, [screenToCanvas, findNodeAt]);

  const handleMouseUp = useCallback(() => {
    if (dragNodeRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragNodeRef.current);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      dragNodeRef.current = null;
    }
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.3, Math.min(3, zoomRef.current + delta));
      const ratio = newZoom / zoomRef.current;

      setZoom(newZoom);
      setOffset((off) => ({
        x: mouseX - (mouseX - off.x) * ratio,
        y: mouseY - (mouseY - off.y) * ratio,
      }));
    }
  }, []);

  const getCursor = () => {
    if (dragNodeRef.current) return 'grabbing';
    if (hoveredNode) return 'grab';
    if (isPanningRef.current) return 'grabbing';
    return 'default';
  };

  const selectedNoteData = selectedNode ? notes.find((n) => n.id === selectedNode) : null;

  return (
    <div className="flex-1 h-full relative bg-background">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

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
              onClick={() => { setActiveNoteId(selectedNoteData.id); setActiveView('notes'); }}
              className="mt-3 text-xs text-accent font-medium hover:underline"
            >
              Open note →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))} className="w-8 h-8 bg-card border border-border rounded-md flex items-center justify-center hover:bg-surface-hover transition-spring-micro">
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
