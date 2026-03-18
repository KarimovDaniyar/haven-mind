import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, MousePointer2, Plus, Square, Circle, Pencil, Maximize2 } from 'lucide-react';
import { useAppStore, CanvasCard, CanvasArrow, CanvasGroup, InkStroke } from '../store/appStore';

type CanvasTool = 'select' | 'pan' | 'card' | 'frame' | 'circle' | 'ink';

// Point-in-polygon (ray casting)
function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export default function CanvasView() {
  const { notes, activeNoteId, updateNote } = useAppStore();
  const note = notes.find((n) => n.id === activeNoteId);

  const [tool, setTool] = useState<CanvasTool>('select');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Selection
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Dragging cards
  const [dragState, setDragState] = useState<{ startX: number; startY: number; offsets: Record<string, { dx: number; dy: number }> } | null>(null);

  // Panning
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Arrow drawing
  const [drawingArrow, setDrawingArrow] = useState<{ fromCardId: string; fromSide: string; currentX: number; currentY: number } | null>(null);

  // Arrow label editing
  const [editingArrowLabel, setEditingArrowLabel] = useState<string | null>(null);

  // Frame drawing
  const [drawingFrame, setDrawingFrame] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Frame dragging
  const [draggingFrame, setDraggingFrame] = useState<{ frameId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Lasso select
  const [lassoRect, setLassoRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Circle select (freehand lasso)
  const [circlePoints, setCirclePoints] = useState<{ x: number; y: number }[]>([]);
  const [fadingCircle, setFadingCircle] = useState<{ x: number; y: number }[] | null>(null);

  // Ink
  const [currentInkPoints, setCurrentInkPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [inkColor, setInkColor] = useState('#1C1917');
  const [isErasing, setIsErasing] = useState(false);
  const [inkUndoStack, setInkUndoStack] = useState<InkStroke[]>([]);

  const cards = note?.canvasCards || [];
  const arrows = note?.canvasArrows || [];
  const groups = note?.canvasGroups || [];
  const inkStrokes = note?.inkStrokes || [];

  const updateCards = useCallback((newCards: CanvasCard[]) => {
    if (note) updateNote(note.id, { canvasCards: newCards });
  }, [note, updateNote]);

  const updateArrows = useCallback((newArrows: CanvasArrow[]) => {
    if (note) updateNote(note.id, { canvasArrows: newArrows });
  }, [note, updateNote]);

  const updateGroups = useCallback((newGroups: CanvasGroup[]) => {
    if (note) updateNote(note.id, { canvasGroups: newGroups });
  }, [note, updateNote]);

  const updateInkStrokes = useCallback((newStrokes: InkStroke[]) => {
    if (note) updateNote(note.id, { inkStrokes: newStrokes });
  }, [note, updateNote]);

  // Convert screen coords to canvas coords
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / zoom,
      y: (clientY - rect.top - offset.y) / zoom,
    };
  }, [offset, zoom]);

  const getCardCenter = (card: CanvasCard, side: string) => {
    const w = card.width || 240, h = 100;
    switch (side) {
      case 'top': return { x: card.x + w / 2, y: card.y };
      case 'bottom': return { x: card.x + w / 2, y: card.y + h };
      case 'left': return { x: card.x, y: card.y + h / 2 };
      case 'right': return { x: card.x + w, y: card.y + h / 2 };
      default: return { x: card.x + w / 2, y: card.y + h / 2 };
    }
  };

  const getCardRect = (card: CanvasCard) => {
    const w = card.width || 240, h = 100;
    return { x: card.x, y: card.y, w, h, cx: card.x + w / 2, cy: card.y + h / 2 };
  };

  // Cards inside a frame
  const getCardsInFrame = useCallback((frame: CanvasGroup) => {
    return cards.filter((card) => {
      const r = getCardRect(card);
      const overlapX = Math.max(0, Math.min(r.x + r.w, frame.x + frame.width) - Math.max(r.x, frame.x));
      const overlapY = Math.max(0, Math.min(r.y + r.h, frame.y + frame.height) - Math.max(r.y, frame.y));
      const overlap = overlapX * overlapY;
      return overlap > r.w * r.h * 0.5;
    });
  }, [cards]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingCard || editingArrowLabel) return;

      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 'c' || e.key === 'C') setTool('circle');
      if (e.key === 'i' || e.key === 'I') setTool('ink');
      if (e.key === 'r' || e.key === 'R') setTool('frame');
      if (e.key === 'f' || e.key === 'F') handleFitView();

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedArrow) {
        updateArrows(arrows.filter((a) => a.id !== selectedArrow));
        setSelectedArrow(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFrame) {
        updateGroups(groups.filter((g) => g.id !== selectedFrame));
        setSelectedFrame(null);
      }
      if (e.key === 'Escape') {
        setSelectedCards(new Set());
        setSelectedArrow(null);
        setSelectedFrame(null);
      }

      // Ctrl+Z for ink undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && tool === 'ink') {
        e.preventDefault();
        if (inkStrokes.length > 0) {
          const last = inkStrokes[inkStrokes.length - 1];
          setInkUndoStack((s) => [...s, last]);
          updateInkStrokes(inkStrokes.slice(0, -1));
        }
      }

      // Ctrl+0: fit
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); handleFitView(); }
      // Ctrl++/-: zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom((z) => Math.min(2, z + 0.1));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(0.25, z - 0.1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingCard, editingArrowLabel, selectedArrow, selectedFrame, arrows, groups, tool, inkStrokes]);

  // Alt key for eraser in ink mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.altKey && tool === 'ink') setIsErasing(true); };
    const up = (e: KeyboardEvent) => { if (!e.altKey) setIsErasing(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [tool]);

  // Wheel zoom (cursor-centered)
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const newZoom = Math.max(0.25, Math.min(2, zoom + delta));
      const ratio = newZoom / zoom;
      setZoom(newZoom);
      setOffset({
        x: mouseX - (mouseX - offset.x) * ratio,
        y: mouseY - (mouseY - offset.y) * ratio,
      });
    }
  };

  // ---- MOUSE HANDLERS ----
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Ignore if clicking on a card, handle, or UI element
    if (target.closest('[data-card]') || target.closest('[data-handle]') || target.closest('[data-toolbar]') || target.closest('[data-frame-label]')) return;

    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (tool === 'pan' || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      return;
    }

    if (tool === 'card') {
      const newCard: CanvasCard = { id: `cc-${Date.now()}`, x, y, content: 'New card\nDouble-click to edit' };
      updateCards([...cards, newCard]);
      setSelectedCards(new Set([newCard.id]));
      setTool('select');
      return;
    }

    if (tool === 'frame') {
      setDrawingFrame({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    if (tool === 'circle') {
      setCirclePoints([{ x, y }]);
      return;
    }

    if (tool === 'ink') {
      if (isErasing) {
        // Erase strokes near cursor
        const eraseRadius = 20 / zoom;
        const remaining = inkStrokes.filter((stroke) => {
          return !stroke.points.some((p) => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < eraseRadius);
        });
        if (remaining.length !== inkStrokes.length) updateInkStrokes(remaining);
      } else {
        setCurrentInkPoints([{ x, y }]);
      }
      return;
    }

    if (tool === 'select') {
      // Double-click creates card
      if (e.detail === 2) {
        const newCard: CanvasCard = { id: `cc-${Date.now()}`, x, y, content: 'New card\nDouble-click to edit' };
        updateCards([...cards, newCard]);
        setSelectedCards(new Set([newCard.id]));
        return;
      }
      // Start lasso
      setLassoRect({ startX: x, startY: y, currentX: x, currentY: y });
      setSelectedCards(new Set());
      setSelectedArrow(null);
      setSelectedFrame(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }

    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (dragState) {
      const dx = x - dragState.startX;
      const dy = y - dragState.startY;
      updateCards(cards.map((c) => {
        const off = dragState.offsets[c.id];
        if (!off) return c;
        return { ...c, x: off.dx + dx, y: off.dy + dy };
      }));
      return;
    }

    if (drawingArrow) {
      setDrawingArrow({ ...drawingArrow, currentX: x, currentY: y });
      return;
    }

    if (drawingFrame) {
      setDrawingFrame({ ...drawingFrame, currentX: x, currentY: y });
      return;
    }

    if (draggingFrame) {
      const dx = x - draggingFrame.startX;
      const dy = y - draggingFrame.startY;
      const frame = groups.find((g) => g.id === draggingFrame.frameId);
      if (frame) {
        const newX = draggingFrame.origX + dx;
        const newY = draggingFrame.origY + dy;
        const frameDx = newX - frame.x;
        const frameDy = newY - frame.y;
        // Move contained cards
        const contained = getCardsInFrame(frame);
        updateCards(cards.map((c) => {
          if (contained.find((cc) => cc.id === c.id)) {
            return { ...c, x: c.x + frameDx, y: c.y + frameDy };
          }
          return c;
        }));
        updateGroups(groups.map((g) => g.id === frame.id ? { ...g, x: newX, y: newY } : g));
      }
      return;
    }

    if (lassoRect) {
      setLassoRect({ ...lassoRect, currentX: x, currentY: y });
      return;
    }

    if (circlePoints.length > 0) {
      setCirclePoints((pts) => [...pts, { x, y }]);
      return;
    }

    if (currentInkPoints) {
      if (isErasing) {
        const eraseRadius = 20 / zoom;
        const remaining = inkStrokes.filter((stroke) => {
          return !stroke.points.some((p) => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < eraseRadius);
        });
        if (remaining.length !== inkStrokes.length) updateInkStrokes(remaining);
      } else {
        setCurrentInkPoints((pts) => pts ? [...pts, { x, y }] : null);
      }
      return;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (isPanning) { setIsPanning(false); return; }
    if (dragState) { setDragState(null); return; }

    if (drawingArrow) {
      // Check if dropping on a handle
      // Find card under mouse
      const targetCard = cards.find((c) => {
        const r = getCardRect(c);
        return x >= r.x - 10 && x <= r.x + r.w + 10 && y >= r.y - 10 && y <= r.y + r.h + 10 && c.id !== drawingArrow.fromCardId;
      });
      if (targetCard) {
        // Determine closest side
        const r = getCardRect(targetCard);
        const sides = [
          { side: 'top', dist: Math.abs(y - r.y) },
          { side: 'bottom', dist: Math.abs(y - (r.y + r.h)) },
          { side: 'left', dist: Math.abs(x - r.x) },
          { side: 'right', dist: Math.abs(x - (r.x + r.w)) },
        ];
        sides.sort((a, b) => a.dist - b.dist);
        const toSide = sides[0].side as CanvasArrow['toSide'];

        const newArrow: CanvasArrow = {
          id: `ca-${Date.now()}`,
          fromCardId: drawingArrow.fromCardId,
          toCardId: targetCard.id,
          fromSide: drawingArrow.fromSide as CanvasArrow['fromSide'],
          toSide,
        };
        updateArrows([...arrows, newArrow]);
      }
      setDrawingArrow(null);
      return;
    }

    if (drawingFrame) {
      const fx = Math.min(drawingFrame.startX, drawingFrame.currentX);
      const fy = Math.min(drawingFrame.startY, drawingFrame.currentY);
      const fw = Math.abs(drawingFrame.currentX - drawingFrame.startX);
      const fh = Math.abs(drawingFrame.currentY - drawingFrame.startY);
      if (fw > 20 && fh > 20) {
        const newGroup: CanvasGroup = { id: `cg-${Date.now()}`, x: fx, y: fy, width: fw, height: fh, label: 'Group' };
        updateGroups([...groups, newGroup]);
        setSelectedFrame(newGroup.id);
      }
      setDrawingFrame(null);
      setTool('select');
      return;
    }

    if (draggingFrame) { setDraggingFrame(null); return; }

    if (lassoRect) {
      const lx = Math.min(lassoRect.startX, lassoRect.currentX);
      const ly = Math.min(lassoRect.startY, lassoRect.currentY);
      const lw = Math.abs(lassoRect.currentX - lassoRect.startX);
      const lh = Math.abs(lassoRect.currentY - lassoRect.startY);
      if (lw > 5 || lh > 5) {
        const selected = cards.filter((c) => {
          const r = getCardRect(c);
          return r.cx >= lx && r.cx <= lx + lw && r.cy >= ly && r.cy <= ly + lh;
        });
        setSelectedCards(new Set(selected.map((c) => c.id)));
      }
      setLassoRect(null);
      return;
    }

    if (circlePoints.length > 2) {
      // Close the path and select contained cards
      const polygon = [...circlePoints, circlePoints[0]];
      const selected = cards.filter((c) => {
        const r = getCardRect(c);
        return pointInPolygon({ x: r.cx, y: r.cy }, polygon);
      });
      setSelectedCards(new Set(selected.map((c) => c.id)));
      setFadingCircle(circlePoints);
      setCirclePoints([]);
      setTimeout(() => setFadingCircle(null), 400);
      setTool('select');
      return;
    }
    setCirclePoints([]);

    if (currentInkPoints && currentInkPoints.length > 1 && !isErasing) {
      const newStroke: InkStroke = { id: `ink-${Date.now()}`, points: currentInkPoints, color: inkColor };
      updateInkStrokes([...inkStrokes, newStroke]);
      setCurrentInkPoints(null);
      return;
    }
    setCurrentInkPoints(null);
  };

  // Card drag start
  const startCardDrag = (cardId: string, cx: number, cy: number) => {
    const sel = selectedCards.has(cardId) ? selectedCards : new Set([cardId]);
    setSelectedCards(sel);
    const offsets: Record<string, { dx: number; dy: number }> = {};
    sel.forEach((id) => {
      const c = cards.find((cc) => cc.id === id);
      if (c) offsets[id] = { dx: c.x, dy: c.y };
    });
    setDragState({ startX: cx, startY: cy, offsets });
  };

  // Arrow handle mouse down
  const startArrowDraw = (cardId: string, side: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const pos = getCardCenter(card, side);
    setDrawingArrow({ fromCardId: cardId, fromSide: side, currentX: pos.x, currentY: pos.y });
  };

  const handleFitView = () => {
    if (cards.length === 0) { setOffset({ x: 0, y: 0 }); setZoom(1); return; }
    const xs = cards.map((c) => c.x);
    const ys = cards.map((c) => c.y);
    const minX = Math.min(...xs) - 100;
    const minY = Math.min(...ys) - 100;
    const maxX = Math.max(...xs) + 400;
    const maxY = Math.max(...ys) + 300;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = rect.width / (maxX - minX);
    const scaleY = rect.height / (maxY - minY);
    const newZoom = Math.max(0.25, Math.min(2, Math.min(scaleX, scaleY) * 0.9));
    setZoom(newZoom);
    setOffset({
      x: (rect.width - (maxX - minX) * newZoom) / 2 - minX * newZoom,
      y: (rect.height - (maxY - minY) * newZoom) / 2 - minY * newZoom,
    });
  };

  // Bezier for arrow
  const getArrowPath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len * 80;
    const ny = dx / len * 80;
    return `M ${from.x} ${from.y} Q ${mx + nx * 0.3} ${my + ny * 0.3} ${to.x} ${to.y}`;
  };

  const inkColors = ['#1C1917', '#8B6F47', '#C4B09A', '#6B8F71', '#8B7BA8'];

  const getCursor = () => {
    if (tool === 'pan' || isPanning) return 'grab';
    if (tool === 'ink' && isErasing) return 'cell';
    if (tool === 'ink') return 'crosshair';
    if (tool === 'circle') return 'crosshair';
    if (tool === 'frame') return 'crosshair';
    if (tool === 'card') return 'copy';
    return 'default';
  };

  if (!note) return null;

  const handles: ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'right', 'bottom', 'left'];

  return (
    <div className="flex-1 h-full relative overflow-hidden bg-background">
      <div
        ref={canvasRef}
        data-canvas="true"
        className="w-full h-full relative"
        style={{
          cursor: getCursor(),
          backgroundImage: `radial-gradient(circle, hsl(var(--dot-grid)) 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsPanning(false); setDragState(null); setDrawingArrow(null); setCirclePoints([]); setCurrentInkPoints(null); }}
      >
        <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Groups/Frames */}
          {groups.map((group) => (
            <div
              key={group.id}
              className={`absolute border-[1.5px] border-dashed rounded-lg ${selectedFrame === group.id ? 'border-accent' : ''}`}
              style={{
                left: group.x, top: group.y, width: group.width, height: group.height,
                borderColor: selectedFrame === group.id ? undefined : 'hsl(var(--node-default))',
                backgroundColor: 'rgba(139,111,71,0.04)',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedFrame(group.id);
                const { x, y } = screenToCanvas(e.clientX, e.clientY);
                setDraggingFrame({ frameId: group.id, startX: x, startY: y, origX: group.x, origY: group.y });
              }}
            >
              <span
                data-frame-label
                className="absolute -top-5 left-2 text-[11px] uppercase tracking-wider text-muted-foreground cursor-text"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  updateGroups(groups.map((g) => g.id === group.id ? { ...g, label: e.currentTarget.textContent || 'Group' } : g));
                }}
              >
                {group.label}
              </span>
            </div>
          ))}

          {/* Frame drawing preview */}
          {drawingFrame && (
            <div
              className="absolute border-[1.5px] border-dashed rounded-lg pointer-events-none"
              style={{
                left: Math.min(drawingFrame.startX, drawingFrame.currentX),
                top: Math.min(drawingFrame.startY, drawingFrame.currentY),
                width: Math.abs(drawingFrame.currentX - drawingFrame.startX),
                height: Math.abs(drawingFrame.currentY - drawingFrame.startY),
                borderColor: 'hsl(var(--node-default))',
                backgroundColor: 'rgba(139,111,71,0.04)',
              }}
            />
          )}

          {/* Arrows SVG */}
          <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
            <defs>
              <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 7 3.5, 0 7" fill="hsl(var(--accent))" />
              </marker>
            </defs>

            {arrows.map((arrow) => {
              const fromCard = cards.find((c) => c.id === arrow.fromCardId);
              const toCard = cards.find((c) => c.id === arrow.toCardId);
              if (!fromCard || !toCard) return null;
              const from = getCardCenter(fromCard, arrow.fromSide);
              const to = getCardCenter(toCard, arrow.toSide);
              const d = getArrowPath(from, to);
              const isSelected = selectedArrow === arrow.id;

              return (
                <g key={arrow.id}>
                  {/* Click target (wider) */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                    onClick={() => setSelectedArrow(arrow.id)}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingArrowLabel(arrow.id); }}
                  />
                  <path d={d} fill="none" stroke="hsl(var(--accent))"
                    strokeWidth={isSelected ? 2 : 1.5}
                    opacity={isSelected ? 1 : 0.6}
                    markerEnd="url(#arrowhead)"
                  />
                  {/* Label */}
                  {(arrow.label || editingArrowLabel === arrow.id) && (() => {
                    const mx = (from.x + to.x) / 2;
                    const my = (from.y + to.y) / 2;
                    return (
                      <foreignObject x={mx - 40} y={my - 12} width={80} height={24} className="pointer-events-auto">
                        {editingArrowLabel === arrow.id ? (
                          <input
                            autoFocus
                            defaultValue={arrow.label || ''}
                            className="w-full text-[11px] text-center bg-background px-2 py-0.5 rounded border border-border outline-none"
                            onBlur={(e) => {
                              updateArrows(arrows.map((a) => a.id === arrow.id ? { ...a, label: e.target.value } : a));
                              setEditingArrowLabel(null);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
                          />
                        ) : (
                          <span className="block text-[11px] text-center text-muted-foreground bg-background px-2 py-0.5 rounded">{arrow.label}</span>
                        )}
                      </foreignObject>
                    );
                  })()}
                </g>
              );
            })}

            {/* Drawing arrow preview */}
            {drawingArrow && (() => {
              const fromCard = cards.find((c) => c.id === drawingArrow.fromCardId);
              if (!fromCard) return null;
              const from = getCardCenter(fromCard, drawingArrow.fromSide);
              const d = getArrowPath(from, { x: drawingArrow.currentX, y: drawingArrow.currentY });
              return <path d={d} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} opacity={0.4} strokeDasharray="4 4" />;
            })()}

            {/* Lasso rect */}
            {lassoRect && (
              <rect
                x={Math.min(lassoRect.startX, lassoRect.currentX)}
                y={Math.min(lassoRect.startY, lassoRect.currentY)}
                width={Math.abs(lassoRect.currentX - lassoRect.startX)}
                height={Math.abs(lassoRect.currentY - lassoRect.startY)}
                fill="rgba(139,111,71,0.08)"
                stroke="hsl(var(--accent))"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}

            {/* Circle select path */}
            {circlePoints.length > 1 && (
              <path
                d={pointsToSvgPath(circlePoints) + ' Z'}
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                opacity={0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Fading circle */}
            {fadingCircle && (
              <path
                d={pointsToSvgPath(fadingCircle) + ' Z'}
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0, transition: 'opacity 400ms ease-out' }}
              />
            )}
          </svg>

          {/* Ink layer */}
          <svg className="absolute inset-0" style={{ overflow: 'visible', width: '100%', height: '100%', pointerEvents: tool === 'ink' ? 'auto' : 'none' }}>
            {inkStrokes.map((stroke) => (
              <path
                key={stroke.id}
                d={pointsToSvgPath(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={2}
                opacity={0.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentInkPoints && currentInkPoints.length > 1 && (
              <path
                d={pointsToSvgPath(currentInkPoints)}
                fill="none"
                stroke={inkColor}
                strokeWidth={2}
                opacity={0.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>

          {/* Cards */}
          {cards.map((card) => {
            const isSelected = selectedCards.has(card.id);
            const isEditMode = editingCard === card.id;
            const lines = card.content.split('\n');
            const title = lines[0] || '';
            const body = lines.slice(1).join('\n');
            const isHovered = hoveredCard === card.id;

            return (
              <motion.div
                key={card.id}
                data-card
                className="absolute"
                style={{ left: card.x, top: card.y }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onMouseEnter={() => setHoveredCard(card.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div
                  className={`bg-card rounded-lg shadow-sm cursor-move relative ${
                    isSelected || isEditMode ? 'border-[1.5px] border-accent' : 'border border-border'
                  }`}
                  style={{ minWidth: 180, maxWidth: 340, padding: 16 }}
                  onMouseDown={(e) => {
                    if (isEditMode) return;
                    e.stopPropagation();
                    const { x, y } = screenToCanvas(e.clientX, e.clientY);
                    startCardDrag(card.id, x, y);
                  }}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingCard(card.id); }}
                >
                  {isEditMode ? (
                    <textarea
                      autoFocus
                      value={card.content}
                      onChange={(e) => updateCards(cards.map((c) => c.id === card.id ? { ...c, content: e.target.value } : c))}
                      onKeyDown={(e) => { if (e.key === 'Escape') setEditingCard(null); }}
                      onBlur={() => setEditingCard(null)}
                      className="w-full min-h-[60px] text-xs bg-transparent outline-none resize-none text-foreground"
                    />
                  ) : (
                    <>
                      <p className="font-display text-[13px] font-medium text-foreground">{title}</p>
                      {body && <p className="text-xs text-muted-foreground mt-1 line-clamp-5">{body}</p>}
                    </>
                  )}

                  {card.linkedNoteId && (
                    <div className="absolute top-1 right-1 text-[10px] text-muted-foreground">⛓</div>
                  )}
                </div>

                {/* Connection handles (visible on hover) */}
                {isHovered && !isEditMode && !drawingArrow && (
                  <>
                    {handles.map((side) => {
                      const w = card.width || 240, h = 100;
                      let hx = 0, hy = 0;
                      if (side === 'top') { hx = w / 2; hy = 0; }
                      if (side === 'bottom') { hx = w / 2; hy = h; }
                      if (side === 'left') { hx = 0; hy = h / 2; }
                      if (side === 'right') { hx = w; hy = h / 2; }

                      return (
                        <div
                          key={side}
                          data-handle
                          className="absolute w-2 h-2 rounded-full bg-background border-[1.5px] border-accent cursor-crosshair z-10"
                          style={{ left: hx - 4, top: hy - 4 }}
                          onMouseDown={(e) => startArrowDraw(card.id, side, e)}
                        />
                      );
                    })}
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Zoom indicator */}
      <button
        onClick={() => { setZoom(1); }}
        className="absolute bottom-14 right-4 text-[11px] text-muted-foreground hover:text-accent transition-spring-micro cursor-pointer"
      >
        {Math.round(zoom * 100)}%
      </button>

      {/* Toolbar */}
      <div data-toolbar className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover text-popover-foreground rounded-full px-2 py-1.5 shadow-lg">
        {([
          { id: 'pan' as CanvasTool, icon: Hand, label: 'Pan (H)' },
          { id: 'select' as CanvasTool, icon: MousePointer2, label: 'Select (V)' },
          { id: 'card' as CanvasTool, icon: Plus, label: 'Card' },
          { id: 'frame' as CanvasTool, icon: Square, label: 'Frame (R)' },
          { id: 'circle' as CanvasTool, icon: Circle, label: 'Circle Select (C)' },
          { id: 'ink' as CanvasTool, icon: Pencil, label: 'Ink (I)' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-spring-micro text-sm ${
              tool === t.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/20'
            }`}
            title={t.label}
          >
            <t.icon size={15} />
          </button>
        ))}
        <div className="w-px h-5 bg-popover-foreground/20 mx-0.5" />
        <button
          onClick={handleFitView}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent/20 transition-spring-micro"
          title="Fit view (F)"
        >
          <Maximize2 size={15} />
        </button>

        {/* Ink color picker */}
        {tool === 'ink' && (
          <>
            <div className="w-px h-5 bg-popover-foreground/20 mx-0.5" />
            <div className="flex items-center gap-1">
              {inkColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setInkColor(color)}
                  className={`w-4 h-4 rounded-full transition-spring-micro ${inkColor === color ? 'ring-2 ring-popover-foreground/40 ring-offset-1 ring-offset-popover' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              onClick={() => updateInkStrokes([])}
              className="text-[11px] text-popover-foreground/50 hover:text-accent ml-1 transition-spring-micro"
            >
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
