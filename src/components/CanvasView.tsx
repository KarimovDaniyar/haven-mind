import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Hand, MousePointer2, Plus, Square, Maximize2 } from 'lucide-react';
import { useAppStore, CanvasCard, CanvasArrow, CanvasGroup } from '../store/appStore';

type CanvasTool = 'select' | 'pan' | 'card' | 'frame';

export default function CanvasView() {
  const { notes, activeNoteId, updateNote } = useAppStore();
  const note = notes.find((n) => n.id === activeNoteId);

  const [tool, setTool] = useState<CanvasTool>('select');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const cards = note?.canvasCards || [];
  const arrows = note?.canvasArrows || [];
  const groups = note?.canvasGroups || [];

  const updateCards = useCallback((newCards: CanvasCard[]) => {
    if (note) updateNote(note.id, { canvasCards: newCards });
  }, [note, updateNote]);

  const updateArrows = useCallback((newArrows: CanvasArrow[]) => {
    if (note) updateNote(note.id, { canvasArrows: newArrows });
  }, [note, updateNote]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingCard) return;
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 'f' || e.key === 'F') handleFitView();
      if (e.key === 'Delete' && selectedArrow) {
        updateArrows(arrows.filter((a) => a.id !== selectedArrow));
        setSelectedArrow(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingCard, selectedArrow, arrows]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.25, Math.min(2, z + delta)));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).dataset.canvas) return;

    if (tool === 'pan' || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    if (tool === 'card' || (tool === 'select' && e.detail === 2)) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset.x) / zoom;
      const y = (e.clientY - rect.top - offset.y) / zoom;
      const newCard: CanvasCard = {
        id: `cc-${Date.now()}`,
        x, y,
        content: 'New card\nDouble-click to edit',
      };
      updateCards([...cards, newCard]);
      setSelectedCard(newCard.id);
      setTool('select');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (dragging) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - offset.x) / zoom - dragStart.x;
      const y = (e.clientY - rect.top - offset.y) / zoom - dragStart.y;
      updateCards(cards.map((c) => c.id === dragging ? { ...c, x, y } : c));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDragging(null);
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

  const getCardCenter = (card: CanvasCard, side: string) => {
    const w = 240, h = 100;
    switch (side) {
      case 'top': return { x: card.x + w / 2, y: card.y };
      case 'bottom': return { x: card.x + w / 2, y: card.y + h };
      case 'left': return { x: card.x, y: card.y + h / 2 };
      case 'right': return { x: card.x + w, y: card.y + h / 2 };
      default: return { x: card.x + w / 2, y: card.y + h / 2 };
    }
  };

  if (!note) return null;

  return (
    <div className="flex-1 h-full relative overflow-hidden bg-background">
      {/* Canvas surface */}
      <div
        ref={canvasRef}
        data-canvas="true"
        className="w-full h-full relative"
        style={{
          cursor: tool === 'pan' || isPanning ? 'grab' : 'default',
          backgroundImage: `radial-gradient(circle, hsl(var(--dot-grid)) 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Groups */}
          {groups.map((group) => (
            <div
              key={group.id}
              className="absolute border-[1.5px] border-dashed rounded-lg"
              style={{
                left: group.x,
                top: group.y,
                width: group.width,
                height: group.height,
                borderColor: 'hsl(var(--node-default))',
                backgroundColor: 'rgba(139,111,71,0.04)',
              }}
            >
              <span className="absolute -top-5 left-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            </div>
          ))}

          {/* Arrows (SVG) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
            {arrows.map((arrow) => {
              const fromCard = cards.find((c) => c.id === arrow.fromCardId);
              const toCard = cards.find((c) => c.id === arrow.toCardId);
              if (!fromCard || !toCard) return null;

              const from = getCardCenter(fromCard, arrow.fromSide);
              const to = getCardCenter(toCard, arrow.toSide);
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const nx = -dy / len * 60;
              const ny = dx / len * 60;

              return (
                <g key={arrow.id}>
                  <path
                    d={`M ${from.x} ${from.y} Q ${mx + nx * 0.3} ${my + ny * 0.3} ${to.x} ${to.y}`}
                    fill="none"
                    stroke="hsl(var(--accent))"
                    strokeWidth={1.5}
                    opacity={selectedArrow === arrow.id ? 1 : 0.55}
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => setSelectedArrow(arrow.id)}
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })}
            <defs>
              <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 7 3.5, 0 7" fill="hsl(var(--accent))" />
              </marker>
            </defs>
          </svg>

          {/* Cards */}
          {cards.map((card) => {
            const isSelected = selectedCard === card.id;
            const isEditMode = editingCard === card.id;
            const lines = card.content.split('\n');
            const title = lines[0] || '';
            const body = lines.slice(1).join('\n');

            return (
              <motion.div
                key={card.id}
                className="absolute"
                style={{ left: card.x, top: card.y }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <div
                  className={`bg-card rounded-lg shadow-sm cursor-move ${
                    isSelected || isEditMode
                      ? 'border-[1.5px] border-accent'
                      : 'border border-border'
                  }`}
                  style={{ minWidth: 180, maxWidth: 340, padding: 16 }}
                  onMouseDown={(e) => {
                    if (isEditMode) return;
                    e.stopPropagation();
                    setSelectedCard(card.id);
                    setSelectedArrow(null);
                    const rect = canvasRef.current!.getBoundingClientRect();
                    setDragStart({
                      x: (e.clientX - rect.left - offset.x) / zoom - card.x,
                      y: (e.clientY - rect.top - offset.y) / zoom - card.y,
                    });
                    setDragging(card.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingCard(card.id);
                  }}
                >
                  {isEditMode ? (
                    <textarea
                      autoFocus
                      value={card.content}
                      onChange={(e) => updateCards(cards.map((c) =>
                        c.id === card.id ? { ...c, content: e.target.value } : c
                      ))}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingCard(null);
                      }}
                      onBlur={() => setEditingCard(null)}
                      className="w-full min-h-[60px] text-xs bg-transparent outline-none resize-none text-foreground"
                    />
                  ) : (
                    <>
                      <p className="font-display text-[13px] font-medium text-foreground">{title}</p>
                      {body && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-5">{body}</p>
                      )}
                    </>
                  )}

                  {card.linkedNoteId && (
                    <div className="absolute top-1 right-1 text-[10px] text-muted-foreground">⛓</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover text-popover-foreground rounded-full px-2 py-1.5 shadow-lg">
        {([
          { id: 'pan' as CanvasTool, icon: Hand, label: 'Pan' },
          { id: 'select' as CanvasTool, icon: MousePointer2, label: 'Select' },
          { id: 'card' as CanvasTool, icon: Plus, label: 'Card' },
          { id: 'frame' as CanvasTool, icon: Square, label: 'Frame' },
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
          title="Fit view"
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}
