import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, MousePointer2, Plus, Square, Pencil, Maximize2 } from 'lucide-react';
import { useAppStore, CanvasCard, CanvasArrow, CanvasGroup, InkStroke } from '../store/appStore';
import { renderMarkdown } from '../utils/markdown';

type CanvasTool = 'select' | 'pan' | 'card' | 'frame' | 'ink';

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
  const { notes, activeNoteId, updateNote, setActiveNoteId, setActiveView } = useAppStore();
  const note = notes.find((n) => n.id === activeNoteId);

  const [tool, setTool] = useState<CanvasTool>('select');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Frame resizing
  const [resizingFrame, setResizingFrame] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Lasso select
  const [lassoRect, setLassoRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Ink
  const [currentInkPoints, setCurrentInkPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [inkColor, setInkColor] = useState('hsl(var(--foreground))');
  const [isErasing, setIsErasing] = useState(false);
  const [inkUndoStack, setInkUndoStack] = useState<InkStroke[]>([]);

  const inkColors = ['hsl(var(--foreground))', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];

  const cards = note?.canvasCards || [];
  const arrows = note?.canvasArrows || [];
  const groups = note?.canvasGroups || [];
  const inkStrokes = note?.inkStrokes || [];

  const cardEditorRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize card editor
  useEffect(() => {
    if (editingCard && cardEditorRef.current) {
      const textarea = cardEditorRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editingCard, cards]); // Watch cards state to catch updates

  const handleLinkClick = useCallback((title: string) => {
    const target = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (target) {
      setActiveNoteId(target.id);
      setActiveView('notes');
    }
  }, [notes, setActiveNoteId, setActiveView]);

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
    const w = card.width || 240;
    // Heuristic: estimate height based on content length + padding
    const h = Math.max(100, (card.content.split('\n').length * 18) + 40);
    switch (side) {
      case 'top': return { x: card.x + w / 2, y: card.y };
      case 'bottom': return { x: card.x + w / 2, y: card.y + h };
      case 'left': return { x: card.x, y: card.y + h / 2 };
      case 'right': return { x: card.x + w, y: card.y + h / 2 };
      default: return { x: card.x + w / 2, y: card.y + h / 2 };
    }
  };

  const getCardRect = (card: CanvasCard) => {
    const w = card.width || 240;
    const h = 200; // Increased default height for better hit detection
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
      const isInputActive = document.activeElement?.tagName === 'INPUT' || 
                           document.activeElement?.tagName === 'TEXTAREA' || 
                           (document.activeElement as HTMLElement)?.isContentEditable;
      if (editingCard || editingArrowLabel || isInputActive) return;

      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCards.size > 0) {
        updateCards(cards.filter((c) => !selectedCards.has(c.id)));
        setSelectedCards(new Set());
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

  const startArrowDraw = (cardId: string, side: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const pos = getCardCenter(card, side);
    setDrawingArrow({ fromCardId: cardId, fromSide: side, currentX: pos.x, currentY: pos.y });
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

    if (tool === 'ink') {
      if (isErasing) {
        // Erase strokes near cursor
        const eraseRadius = 24 / zoom;
        const remaining = inkStrokes.filter((stroke) => {
          return !stroke.points.some((p) => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < eraseRadius);
        });
        if (remaining.length !== inkStrokes.length) updateInkStrokes(remaining);
      } else {
        // Start ink
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

    if (resizingFrame) {
      const dx = x - resizingFrame.startX;
      const dy = y - resizingFrame.startY;
      updateGroups(groups.map((g) => g.id === resizingFrame.id 
        ? { ...g, width: Math.max(100, resizingFrame.startW + dx), height: Math.max(100, resizingFrame.startH + dy) } 
        : g));
      return;
    }

    if (lassoRect) {
      setLassoRect({ ...lassoRect, currentX: x, currentY: y });
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
    if (resizingFrame) { setResizingFrame(null); return; }

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

  const getCursor = () => {
    if (tool === 'pan' || isPanning) return 'grab';
    if (tool === 'ink' && isErasing) return 'cell';
    if (tool === 'ink') return 'crosshair';
    if (tool === 'frame') return 'crosshair';
    if (tool === 'card') return 'copy';
    return 'default';
  };

  if (!note) return null;

  const handles: ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'right', 'bottom', 'left'];

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full overflow-hidden relative bg-background/50 cursor-crosshair touch-none z-[1]"
    >
      <div
        ref={canvasRef}
        data-canvas="true"
        className="w-full h-full relative select-none"
        onDragStart={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          // If clicking background, SVG strokes, or handles, prevent default to stop browser native drag
          const target = e.target as Element;
          if (
            (target as HTMLElement).dataset?.canvas ||
            target.closest?.('[data-handle]') ||
            target.tagName?.toLowerCase() === 'svg' ||
            target.tagName?.toLowerCase() === 'path'
          ) {
            e.preventDefault();
          }
          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const noteId = e.dataTransfer.getData('noteId') || e.dataTransfer.getData('text/plain');
          if (!noteId) return;

          const sidebarNote = notes.find((n) => n.id === noteId);
          if (!sidebarNote) return;

          const { x, y } = screenToCanvas(e.clientX, e.clientY);
          
          const newCard: CanvasCard = {
            id: `card-${Date.now()}`,
            linkedNoteId: sidebarNote.id,
            content: sidebarNote.content,
            x,
            y,
            width: 240,
          };

          updateCards([...cards, newCard]);
        }}
        onMouseLeave={() => { setIsPanning(false); setDragState(null); setDrawingArrow(null); setCurrentInkPoints(null); }}
        style={{
          cursor: getCursor(),
          backgroundImage: `radial-gradient(circle, hsl(var(--dot-grid)) 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
      >
        <div className="absolute inset-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
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

              {/* Resize handle */}
              {selectedFrame === group.id && (
                <div
                  className="absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize flex items-center justify-center opacity-40 hover:opacity-100"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const { x, y } = screenToCanvas(e.clientX, e.clientY);
                    setResizingFrame({ id: group.id, startX: x, startY: y, startW: group.width, startH: group.height });
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M7 1L1 7M7 4L4 7M7 7H7.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
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
          </svg>

          {/* Ink layer */}
          <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
            {inkStrokes.map((stroke) => (
              <path
                key={stroke.id}
                d={pointsToSvgPath(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={3}
                opacity={0.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentInkPoints && currentInkPoints.length > 1 && (
              <path
                d={pointsToSvgPath(currentInkPoints)}
                fill="none"
                stroke={inkColor}
                strokeWidth={3}
                opacity={0.8}
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
                dragTransition={{ power: 0, timeConstant: 200 }}
                className="absolute z-20"
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
                      ref={cardEditorRef}
                      autoFocus
                      value={card.content}
                      onChange={(e) => updateCards(cards.map((c) => c.id === card.id ? { ...c, content: e.target.value } : c))}
                      onBlur={() => setEditingCard(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingCard(null);
                      }}
                      className="w-full text-xs text-foreground bg-transparent outline-none resize-none font-sans overflow-hidden min-h-[60px]"
                      placeholder="Write something..."
                    />
                  ) : (
                    <>
                      <p className="font-display text-[13px] font-medium text-foreground">{title}</p>
                      <div className="text-[12px] leading-relaxed text-muted-foreground mt-1 line-clamp-6 overflow-hidden pointer-events-none">
                        {renderMarkdown(body, handleLinkClick)}
                      </div>
                    </>
                  )}

                  {card.linkedNoteId && (
                    <div className="absolute top-1 right-1 text-[10px] text-muted-foreground">⛓</div>
                  )}
                </div>

                {/* Connection handles (visible on hover or when drawing) */}
                {(isHovered || (drawingArrow && drawingArrow.fromCardId !== card.id)) && !isEditMode && (
                  <>
                    {handles.map((side) => {
                      let style = {};
                      if (side === 'top') style = { top: -4, left: '50%', marginLeft: -4 };
                      if (side === 'bottom') style = { bottom: -4, left: '50%', marginLeft: -4 };
                      if (side === 'left') style = { left: -4, top: '50%', marginTop: -4 };
                      if (side === 'right') style = { right: -4, top: '50%', marginTop: -4 };

                      return (
                        <div
                          key={side}
                          data-handle
                          className={`absolute w-3 h-3 flex items-center justify-center z-10 ${
                            drawingArrow ? 'cursor-alias' : 'cursor-crosshair'
                          }`}
                          style={style}
                          onDragStart={(e) => e.preventDefault()}
                          onMouseDown={(e) => !drawingArrow && startArrowDraw(card.id, side, e)}
                          onMouseUp={(e) => {
                            if (drawingArrow && drawingArrow.fromCardId !== card.id) {
                              e.stopPropagation();
                              const newArrow: CanvasArrow = {
                                id: `ca-${Date.now()}`,
                                fromCardId: drawingArrow.fromCardId,
                                toCardId: card.id,
                                fromSide: drawingArrow.fromSide as any,
                                toSide: side,
                              };
                              updateArrows([...arrows, newArrow]);
                              setDrawingArrow(null);
                            }
                          }}
                        >
                          <div className="w-2 h-2 rounded-full bg-background border-[1.5px] border-accent" />
                        </div>
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
                  className={`w-4 h-4 rounded-full transition-spring-micro ${inkColor === color ? 'ring-2 ring-popover-foreground/40 ring-offset-1 ring-offset-popover' : ''} ${color.startsWith('hsl') ? 'bg-foreground' : ''}`}
                  style={color.startsWith('#') ? { backgroundColor: color } : {}}
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
