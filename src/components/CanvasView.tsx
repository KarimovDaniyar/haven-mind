import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, MousePointer2, Plus, Square, Pencil, Maximize2, ZoomIn, ZoomOut, Circle, Type, Triangle } from 'lucide-react';
import { useAppStore, CanvasCard, CanvasArrow, CanvasGroup, InkStroke, MagnetGroup, CanvasShape, CanvasFreeText, CanvasShapeType } from '../store/appStore';
import { renderMarkdown } from '../utils/markdown';
import { shapeEdgePoint, shapeBounds, pointInShapePad, defaultShapeBorderColor } from '../utils/canvasAnnotations';

// ── Template data ──────────────────────────────────────────────────────────────
const BUILT_IN_TEMPLATES = [
  { name: 'Meeting Notes', content: '## Meeting Notes\n**Date:**\n**Attendees:**\n**Agenda:**\n**Action items:**' },
  { name: 'Research', content: '## Research\n**Question:**\n**Sources:**\n**Key findings:**\n**Conclusions:**' },
  { name: 'Daily Log', content: '## Daily Log\n**Morning intention:**\n**Tasks:**\n**Reflections:**' },
  { name: 'Blank', content: '' },
];

const slashCommands = [
  { label: 'H1', desc: 'Large heading', insert: '# ', type: 'line' },
  { label: 'H2', desc: 'Medium heading', insert: '## ', type: 'line' },
  { label: 'Bold', desc: 'Bold text', insert: '****', cursor: -2, type: 'inline' },
  { label: 'Italic', desc: 'Italic text', insert: '**', cursor: -1, type: 'inline' },
  { label: 'Bullet', desc: 'Bullet list', insert: '- ', type: 'line' },
  { label: 'Quote', desc: 'Block quote', insert: '> ', type: 'line' },
  { label: 'Code', desc: 'Inline code', insert: '``', cursor: -1, type: 'inline' },
  { label: 'Divider', desc: 'Horizontal rule', insert: '---', type: 'line' },
  { label: 'Wiki link', desc: 'Link to note', insert: '[[]]', cursor: -2, type: 'inline' },
];

type CardSlashCommand = { label: string; desc: string; insert: string; type: string; cursor?: number };

function getCustomTemplates(): { name: string; content: string }[] {
  try { return JSON.parse(localStorage.getItem('cardTemplates') || '[]'); } catch { return []; }
}

function saveCustomTemplate(name: string, content: string) {
  const templates = getCustomTemplates();
  templates.push({ name, content });
  localStorage.setItem('cardTemplates', JSON.stringify(templates));
}

// ── Shortcut matcher ────────────────────────────────────────────────────────────
function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  if (!binding) return false;
  const parts = binding.split('+');
  const key = parts[parts.length - 1];
  const needsCtrl = parts.some((p) => p.toLowerCase() === 'ctrl');
  const needsShift = parts.some((p) => p.toLowerCase() === 'shift');
  const needsAlt = parts.some((p) => p.toLowerCase() === 'alt');
  const keyMatch =
    e.key.toLowerCase() === key.toLowerCase() ||
    (key === 'Space' && e.key === ' ');
  return (
    keyMatch &&
    (e.ctrlKey || e.metaKey) === needsCtrl &&
    e.shiftKey === needsShift &&
    e.altKey === needsAlt
  );
}

// ── Frame color helpers ─────────────────────────────────────────────────────────
const FRAME_COLORS = ['#FFD166', '#FF6B6B', '#4ECDC4', '#95E1D3', '#A8DADC', '#C77DFF', '#F4A261', '#B7E4C7'];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Union all magnet groups that share any card with the snap (avoids broken merge when filter() shifts indices). */
function mergeMagnetGroupsAfterSnap(
  current: MagnetGroup[],
  snapTargetId: string,
  draggedIds: string[]
): MagnetGroup[] {
  const bag = new Set<string>([snapTargetId, ...draggedIds]);
  let growing = true;
  while (growing) {
    growing = false;
    for (const mg of current) {
      if (mg.cardIds.some((id) => bag.has(id))) {
        for (const id of mg.cardIds) {
          if (!bag.has(id)) {
            bag.add(id);
            growing = true;
          }
        }
      }
    }
  }
  const remaining = current.filter((mg) => !mg.cardIds.some((id) => bag.has(id)));
  if (bag.size > 1) {
    remaining.push({ id: `mg-${Date.now()}`, cardIds: [...bag] });
  }
  return remaining;
}

/** Any card magnet-linked to a seed id (so moving a frame does not split groups). */
function expandCardIdsWithMagnetNeighbors(seedIds: Set<string>, magnetGroups: MagnetGroup[]): Set<string> {
  const bag = new Set(seedIds);
  let growing = true;
  while (growing) {
    growing = false;
    for (const mg of magnetGroups) {
      if (mg.cardIds.some((id) => bag.has(id))) {
        for (const id of mg.cardIds) {
          if (!bag.has(id)) {
            bag.add(id);
            growing = true;
          }
        }
      }
    }
  }
  return bag;
}

type CanvasTool = 'select' | 'pan' | 'card' | 'frame' | 'shape' | 'text' | 'ink';

type ArrowDragSource = { kind: 'card'; id: string } | { kind: 'shape'; id: string };

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

function shapeStrokeWidthPx(s: CanvasShape): number {
  if (s.borderWidth === 1) return 1;
  if (s.borderWidth === 2) return 2;
  if (s.borderWidth === 3) return 3;
  return 1.5;
}

const FREE_TEXT_COLORS = {
  dark: 'hsl(var(--foreground))',
  muted: 'hsl(var(--muted-foreground))',
  accent: 'hsl(var(--accent))',
  white: '#ffffff',
  black: '#000000',
} as const;

const NEW_CARD_PLACEHOLDER = 'New card\nDouble-click to edit';

/** Scroll area inside card (matches Tailwind max-h below). Shell adds 16px padding top/bottom. */
const CARD_NOTE_BODY_MAX_PX = 480;
const CARD_SHELL_VERTICAL_PAD = 32;
const CARD_OUTER_MAX_H = CARD_NOTE_BODY_MAX_PX + CARD_SHELL_VERTICAL_PAD;
const DEFAULT_CARD_WIDTH = 320;

function splitCardTextToNote(fullText: string): { title: string; content: string } {
  const lines = fullText.split('\n');
  return {
    title: (lines[0] || '').trim() || 'Untitled',
    content: lines.slice(1).join('\n'),
  };
}

export default function CanvasView() {
  const { notes, workspaceNoteId, updateNote, setActiveNoteId, setActiveView, shortcutsConfig } = useAppStore();
  const note = notes.find((n) => n.id === workspaceNoteId);

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
  const [dragState, setDragState] = useState<{ startX: number; startY: number; offsets: Record<string, { dx: number; dy: number }>; primaryCardId?: string } | null>(null);

  // Panning
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Arrow drawing
  const [drawingArrow, setDrawingArrow] = useState<{
    from: ArrowDragSource;
    fromSide: string;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Arrow label editing
  const [editingArrowLabel, setEditingArrowLabel] = useState<string | null>(null);

  // Frame drawing
  const [drawingFrame, setDrawingFrame] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Frame dragging
  const [draggingFrame, setDraggingFrame] = useState<{ frameId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Frame resizing
  const [resizingFrame, setResizingFrame] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Card resize (width only — height follows content)
  const [resizingCard, setResizingCard] = useState<{ id: string; startX: number; startW: number } | null>(null);

  // Lasso select
  const [lassoRect, setLassoRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Ink
  const [currentInkPoints, setCurrentInkPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [inkColor, setInkColor] = useState('hsl(var(--foreground))');
  const [isErasing, setIsErasing] = useState(false);
  const [inkUndoStack, setInkUndoStack] = useState<InkStroke[]>([]);

  // Card stacking / magnet groups
  const [snapTarget, setSnapTarget] = useState<string | null>(null);

  // Card template picker
  const [cardTemplateOpen, setCardTemplateOpen] = useState<string | null>(null); // cardId
  const [cardTemplateFilter, setCardTemplateFilter] = useState('');

  // Card slash commands (same as sidebar NoteEditor)
  const [cardSlashOpen, setCardSlashOpen] = useState(false);
  const [cardSlashFilter, setCardSlashFilter] = useState('');
  const [cardSlashIndex, setCardSlashIndex] = useState(0);
  const [cardSlashPosition, setCardSlashPosition] = useState({ top: 0, left: 0 });

  // Card context menu (right-click)
  const [cardContextMenu, setCardContextMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);

  // Frame customization popover
  const [frameCustomize, setFrameCustomize] = useState<{ frameId: string; x: number; y: number } | null>(null);

  // Shapes + free text (layer below cards)
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedFreeTextId, setSelectedFreeTextId] = useState<string | null>(null);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const [drawingShapeBox, setDrawingShapeBox] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const [shapeToolType, setShapeToolType] = useState<CanvasShapeType>('rect');
  const [textToolStyle, setTextToolStyle] = useState<{
    fontSize: number; bold: boolean; italic: boolean; color: string;
  }>({ fontSize: 16, bold: false, italic: false, color: 'hsl(var(--foreground))' });
  const [draggingShape, setDraggingShape] = useState<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [resizingShape, setResizingShape] = useState<{
    id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number;
  } | null>(null);
  const [editingShapeTextId, setEditingShapeTextId] = useState<string | null>(null);
  const [shapeCustomize, setShapeCustomize] = useState<{ shapeId: string; x: number; y: number } | null>(null);
  const [editingFreeTextId, setEditingFreeTextId] = useState<string | null>(null);
  const [resizingFreeText, setResizingFreeText] = useState<{
    id: string; startX: number; startW: number;
  } | null>(null);
  const [draggingFreeText, setDraggingFreeText] = useState<{
    id: string; startX: number; startY: number; ox: number; oy: number;
  } | null>(null);
  const freeTextEditRef = useRef<HTMLTextAreaElement>(null);
  const shapeTextEditRef = useRef<HTMLTextAreaElement>(null);

  const inkColors = ['hsl(var(--foreground))', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];

  const cards = note?.canvasCards || [];
  const arrows = note?.canvasArrows || [];
  const groups = note?.canvasGroups || [];
  const shapes = note?.canvasShapes || [];
  const freeTexts = note?.canvasFreeTexts || [];
  const inkStrokes = note?.inkStrokes || [];
  const magnetGroups = note?.magnetGroups || [];

  const getEffectiveCardContent = (card: CanvasCard) => {
    if (!card.linkedNoteId) return card.content || '';
    const ln = notes.find((n) => n.id === card.linkedNoteId && n.type === 'text');
    if (!ln) return card.content || '';
    if (ln.content && ln.content.trim()) return `${ln.title || 'Untitled'}\n${ln.content}`;
    return ln.title || 'Untitled';
  };

  const cardEditorRef = useRef<HTMLTextAreaElement>(null);
  const cardInnerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [cardSizeById, setCardSizeById] = useState<Record<string, { w: number; h: number }>>({});

  // Measured card box — skip during card drag / resize (avoids ResizeObserver thrash)
  useLayoutEffect(() => {
    if (dragState || resizingCard) return undefined;
    const updateSizes = () => {
      setCardSizeById((prev) => {
        const next: Record<string, { w: number; h: number }> = {};
        for (const c of cards) {
          const el = cardInnerRefs.current.get(c.id);
          if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
            next[c.id] = { w: el.offsetWidth, h: el.offsetHeight };
          } else if (prev[c.id]) {
            next[c.id] = prev[c.id];
          }
        }
        let changed = Object.keys(prev).length !== Object.keys(next).length;
        if (!changed) {
          for (const id of Object.keys(next)) {
            if (!prev[id] || prev[id].w !== next[id].w || prev[id].h !== next[id].h) { changed = true; break; }
          }
        }
        return changed ? next : prev;
      });
    };
    updateSizes();
    const observers: ResizeObserver[] = [];
    for (const c of cards) {
      const el = cardInnerRefs.current.get(c.id);
      if (!el) continue;
      const ro = new ResizeObserver(() => updateSizes());
      ro.observe(el);
      observers.push(ro);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [cards, editingCard, dragState, resizingCard, notes]);

  // Auto-resize card editor
  useEffect(() => {
    if (editingCard && cardEditorRef.current) {
      const textarea = cardEditorRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editingCard, cards]); // Watch cards state to catch updates

  useEffect(() => {
    if (!editingCard) {
      setCardSlashOpen(false);
      setCardSlashFilter('');
      setCardSlashIndex(0);
    }
  }, [editingCard]);

  const filteredCardSlashCommands = useMemo(() => {
    if (!cardSlashFilter) return [...slashCommands];
    return slashCommands.filter((c) =>
      c.label.toLowerCase().includes(cardSlashFilter.toLowerCase()) ||
      c.desc.toLowerCase().includes(cardSlashFilter.toLowerCase())
    );
  }, [cardSlashFilter]);

  const computeCardSlashPosition = useCallback(() => {
    const textarea = cardEditorRef.current;
    if (!textarea) return;
    const selStart = textarea.selectionStart;
    const val = textarea.value;
    const textBefore = val.slice(0, selStart);
    const lineNum = textBefore.split('\n').length - 1;
    const lineHeight = 17;
    const scrollTop = textarea.scrollTop;
    setCardSlashPosition({ top: (lineNum + 1) * lineHeight - scrollTop + 8, left: 0 });
  }, []);

  const executeCardSlashCommand = useCallback((cmd: CardSlashCommand) => {
    const textarea = cardEditorRef.current;
    if (!textarea || !editingCard) return;
    const st = useAppStore.getState();
    const wsId = st.workspaceNoteId;
    if (!wsId) return;
    const list = st.notes.find((n) => n.id === wsId)?.canvasCards || [];
    const targetCard = list.find((c) => c.id === editingCard);
    if (!targetCard) return;
    const selStart = textarea.selectionStart;
    const text = textarea.value;
    const textBefore = text.slice(0, selStart);
    const lines = textBefore.split('\n');
    const currentLine = lines[lines.length - 1];
    if (!currentLine.startsWith('/')) return;
    const lineStart = textBefore.length - currentLine.length;
    const before = text.slice(0, lineStart);
    const after = text.slice(selStart);
    const newText = before + cmd.insert + after;
    if (targetCard.linkedNoteId) {
      const { title: nt, content: nc } = splitCardTextToNote(newText);
      st.updateNote(targetCard.linkedNoteId, { title: nt, content: nc });
    } else {
      st.updateNote(wsId, {
        canvasCards: list.map((c) => (c.id === editingCard ? { ...c, content: newText } : c)),
      });
    }
    setCardSlashOpen(false);
    setCardSlashFilter('');
    setTimeout(() => {
      const t = cardEditorRef.current;
      if (t) {
        const pos = lineStart + cmd.insert.length + (cmd.cursor || 0);
        t.selectionStart = pos;
        t.selectionEnd = pos;
        t.focus();
      }
    }, 10);
  }, [editingCard]);

  const handleLinkClick = useCallback((title: string) => {
    const target = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (target) {
      setActiveNoteId(target.id);
      setActiveView('notes');
    }
  }, [notes, setActiveNoteId, setActiveView]);

  // Close context menus on outside click
  useEffect(() => {
    if (!cardContextMenu && !frameCustomize && !shapeCustomize) return;
    const close = () => {
      setCardContextMenu(null);
      setFrameCustomize(null);
      setShapeCustomize(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [cardContextMenu, frameCustomize, shapeCustomize]);

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

  const updateMagnetGroups = useCallback((newGroups: MagnetGroup[]) => {
    if (note) updateNote(note.id, { magnetGroups: newGroups });
  }, [note, updateNote]);

  const updateShapes = useCallback((next: CanvasShape[]) => {
    if (note) updateNote(note.id, { canvasShapes: next });
  }, [note, updateNote]);

  const updateFreeTexts = useCallback((next: CanvasFreeText[]) => {
    if (note) updateNote(note.id, { canvasFreeTexts: next });
  }, [note, updateNote]);

  const commitShapeWithType = useCallback((x: number, y: number, w: number, h: number, shapeType: CanvasShapeType) => {
    const id = `sh-${Date.now()}`;
    const border = defaultShapeBorderColor();
    const nw: CanvasShape = {
      id,
      shapeType,
      x,
      y,
      width: Math.max(8, w),
      height: Math.max(8, h),
      borderColor: border,
      borderStyle: 'solid',
      text: '',
    };
    updateShapes([...shapes, nw]);
    setSelectedShapeId(id);
    setTool('select');
  }, [shapes, updateShapes]);

  // Convert screen coords to canvas coords
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / zoom,
      y: (clientY - rect.top - offset.y) / zoom,
    };
  }, [offset, zoom]);

  const getCardBoundsEstimate = (card: CanvasCard, contentStr?: string) => {
    const w = Math.min(520, Math.max(180, card.width || DEFAULT_CARD_WIDTH));
    const raw = (contentStr ?? card.content) || '';
    const lines = raw.split('\n');
    const body = lines.slice(1).join('\n') || '';
    const chPerLine = Math.max(22, Math.floor(w / 7));
    const titleLines = Math.max(1, Math.ceil(((lines[0] || '').length || 1) / chPerLine));
    const bodyByNewlines = body ? body.split('\n').filter(Boolean).length : 0;
    const bodyChars = body.length || (lines.length === 1 ? (lines[0] || '').length : 0);
    const bodyByWrap = Math.ceil(bodyChars / chPerLine);
    const bodyLines = Math.max(1, Math.max(bodyByNewlines, bodyByWrap || 1));
    const rawH = 32 + titleLines * 22 + 4 + bodyLines * 20 + 4;
    const h = Math.max(104, Math.min(rawH, CARD_OUTER_MAX_H));
    return { w, h };
  };

  const getCardBounds = (card: CanvasCard) => {
    const m = cardSizeById[card.id];
    if (m && m.w > 0 && m.h > 0) return m;
    return getCardBoundsEstimate(card, getEffectiveCardContent(card));
  };

  // Handle dots are w-3 h-3 (~12px), offset top/left/right/bottom: -4px — anchor at dot center
  const getCardCenter = (card: CanvasCard, side: string) => {
    const { w, h } = getCardBounds(card);
    switch (side) {
      case 'top': return { x: card.x + w / 2, y: card.y + 2 };
      case 'bottom': return { x: card.x + w / 2, y: card.y + h - 2 };
      case 'left': return { x: card.x + 2, y: card.y + h / 2 };
      case 'right': return { x: card.x + w - 2, y: card.y + h / 2 };
      default: return { x: card.x + w / 2, y: card.y + h / 2 };
    }
  };

  const getCardRect = (card: CanvasCard) => {
    const { w, h } = getCardBounds(card);
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
  }, [cards, cardSizeById]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInputActive = document.activeElement?.tagName === 'INPUT' || 
                           document.activeElement?.tagName === 'TEXTAREA' || 
                           (document.activeElement as HTMLElement)?.isContentEditable;
      if (editingCard || editingArrowLabel || editingFreeTextId || editingShapeTextId) return;
      if (isInputActive) return;

      if (e.key === 'Escape' && (resizingCard || resizingFrame)) {
        if (resizingCard) setResizingCard(null);
        if (resizingFrame) setResizingFrame(null);
        return;
      }
      if (resizingCard || resizingFrame) return;

      if (matchesBinding(e, shortcutsConfig.selectTool)) setTool('select');
      if (matchesBinding(e, shortcutsConfig.panTool)) setTool('pan');
      if (matchesBinding(e, shortcutsConfig.inkTool)) setTool('ink');
      if (matchesBinding(e, shortcutsConfig.frameTool)) setTool('frame');
      if (matchesBinding(e, shortcutsConfig.shapeTool)) setTool('shape');
      if (matchesBinding(e, shortcutsConfig.textTool)) setTool('text');
      if (matchesBinding(e, shortcutsConfig.fitCanvas)) handleFitView();

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedArrow) {
        updateArrows(arrows.filter((a) => a.id !== selectedArrow));
        setSelectedArrow(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFrame) {
        updateGroups(groups.filter((g) => g.id !== selectedFrame));
        setSelectedFrame(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        updateShapes(shapes.filter((s) => s.id !== selectedShapeId));
        updateArrows(arrows.filter((a) => a.fromShapeId !== selectedShapeId && a.toShapeId !== selectedShapeId));
        setSelectedShapeId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFreeTextId) {
        updateFreeTexts(freeTexts.filter((t) => t.id !== selectedFreeTextId));
        setSelectedFreeTextId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCards.size > 0) {
        updateCards(cards.filter((c) => !selectedCards.has(c.id)));
        setSelectedCards(new Set());
      }
      if (e.key === 'Escape') {
        setSelectedCards(new Set());
        setSelectedArrow(null);
        setSelectedFrame(null);
        setSelectedShapeId(null);
        setSelectedFreeTextId(null);
      }

      // Undo for ink
      if (matchesBinding(e, shortcutsConfig.undo) && tool === 'ink') {
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
    }, [
      editingCard,
      editingArrowLabel,
      editingFreeTextId,
      editingShapeTextId,
      selectedArrow,
      selectedFrame,
      selectedShapeId,
      selectedFreeTextId,
      arrows,
      groups,
      shapes,
      freeTexts,
      tool,
      inkStrokes,
      shortcutsConfig,
      resizingCard,
      resizingFrame,
      updateArrows,
      updateGroups,
      updateCards,
      updateShapes,
      updateFreeTexts,
    ]);

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

  const startArrowDrawFromCard = (cardId: string, side: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const pos = getCardCenter(card, side);
    setDrawingArrow({ from: { kind: 'card', id: cardId }, fromSide: side, currentX: pos.x, currentY: pos.y });
  };

  const startArrowDrawFromShape = (shapeId: string, side: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const sh = shapes.find((s) => s.id === shapeId);
    if (!sh) return;
    const pos = shapeEdgePoint(sh, side as 'top' | 'right' | 'bottom' | 'left');
    setDrawingArrow({ from: { kind: 'shape', id: shapeId }, fromSide: side, currentX: pos.x, currentY: pos.y });
  };

  const arrowSourceMatches = (src: ArrowDragSource, kind: 'card' | 'shape', id: string) =>
    src.kind === kind && src.id === id;

  // ---- MOUSE HANDLERS ----
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Ignore if clicking on a card, handle, or UI element
    if (
      target.closest('[data-card]') ||
      target.closest('[data-handle]') ||
      target.closest('[data-toolbar]') ||
      target.closest('[data-frame-label]') ||
      target.closest('[data-canvas-shape]') ||
      target.closest('[data-free-text]') ||
      target.closest('[data-shape-resize]') ||
      target.closest('[data-free-text-toolbar]')
    ) return;

    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (tool === 'pan' || e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      return;
    }

    if (tool === 'card') {
      const newCard: CanvasCard = { id: `cc-${Date.now()}`, x, y, content: NEW_CARD_PLACEHOLDER, width: DEFAULT_CARD_WIDTH };
      updateCards([...cards, newCard]);
      setSelectedCards(new Set([newCard.id]));
      setTool('select');
      return;
    }

    if (tool === 'frame') {
      setDrawingFrame({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    if (tool === 'shape') {
      setDrawingShapeBox({ startX: x, startY: y, curX: x, curY: y });
      return;
    }

    if (tool === 'text') {
      const id = `ft-${Date.now()}`;
      const nw: CanvasFreeText = {
        id,
        x,
        y,
        width: 40,
        content: '',
        fontSize: textToolStyle.fontSize,
        bold: textToolStyle.bold,
        italic: textToolStyle.italic,
        color: textToolStyle.color,
        align: 'left',
      };
      updateFreeTexts([...freeTexts, nw]);
      setSelectedFreeTextId(id);
      setSelectedShapeId(null);
      setSelectedCards(new Set());
      setEditingFreeTextId(id);
      setTool('select');
      setTimeout(() => freeTextEditRef.current?.focus(), 0);
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
        const newCard: CanvasCard = { id: `cc-${Date.now()}`, x, y, content: NEW_CARD_PLACEHOLDER, width: DEFAULT_CARD_WIDTH };
        updateCards([...cards, newCard]);
        setSelectedCards(new Set([newCard.id]));
        return;
      }
      // Start lasso
      setLassoRect({ startX: x, startY: y, currentX: x, currentY: y });
      setSelectedCards(new Set());
      setSelectedArrow(null);
      setSelectedFrame(null);
      setSelectedShapeId(null);
      setSelectedFreeTextId(null);
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
      const draggingIds = new Set(Object.keys(dragState.offsets));
      const newCards = cards.map((c) => {
        const off = dragState.offsets[c.id];
        if (!off) return c;
        return { ...c, x: off.dx + dx, y: off.dy + dy };
      });
      updateCards(newCards);

      // Snap target detection: find closest non-dragged card within 30px (canvas units)
      const SNAP_THRESHOLD = 30;
      let nearest: string | null = null;
      let nearestDist = SNAP_THRESHOLD;
      const primaryId = dragState.primaryCardId || [...draggingIds][0];
      const dc = newCards.find((c) => c.id === primaryId);
      if (dc) {
        const db = getCardBounds(dc);
        const dw = db.w;
        const dh = db.h;
        newCards.filter((c) => !draggingIds.has(c.id)).forEach((tc) => {
          const tb = getCardBounds(tc);
          const tw = tb.w;
          const th = tb.h;
          // min edge-to-edge distance between dc and tc
          const overlapX = Math.min(dc.x + dw, tc.x + tw) - Math.max(dc.x, tc.x);
          const overlapY = Math.min(dc.y + dh, tc.y + th) - Math.max(dc.y, tc.y);
          const gapX = overlapX > 0 ? 0 : Math.max(dc.x, tc.x) - Math.min(dc.x + dw, tc.x + tw);
          const gapY = overlapY > 0 ? 0 : Math.max(dc.y, tc.y) - Math.min(dc.y + dh, tc.y + th);
          const dist = Math.sqrt(gapX * gapX + gapY * gapY);
          if (dist < nearestDist) { nearestDist = dist; nearest = tc.id; }
        });
      }
      setSnapTarget(nearest);
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
        const contained = getCardsInFrame(frame);
        const seed = new Set(contained.map((cc) => cc.id));
        const moveIds = expandCardIdsWithMagnetNeighbors(seed, magnetGroups);
        updateCards(cards.map((c) => {
          if (moveIds.has(c.id)) {
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

    if (resizingCard) {
      const dx = x - resizingCard.startX;
      const newW = Math.min(520, Math.max(180, resizingCard.startW + dx));
      updateCards(cards.map((c) => c.id === resizingCard.id ? { ...c, width: newW } : c));
      return;
    }

    if (drawingShapeBox) {
      setDrawingShapeBox({ ...drawingShapeBox, curX: x, curY: y });
      return;
    }

    if (draggingShape) {
      const dx = x - draggingShape.startX;
      const dy = y - draggingShape.startY;
      updateShapes(shapes.map((s) =>
        s.id === draggingShape.id ? { ...s, x: draggingShape.ox + dx, y: draggingShape.oy + dy } : s
      ));
      return;
    }

    if (resizingShape) {
      const { id, corner, ox, oy, ow, oh, startX, startY } = resizingShape;
      const dx = x - startX;
      const dy = y - startY;
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (corner === 'se') { nw = Math.max(8, ow + dx); nh = Math.max(8, oh + dy); }
      if (corner === 'sw') {
        nw = Math.max(8, ow - dx); nh = Math.max(8, oh + dy);
        nx = ox + (ow - nw);
      }
      if (corner === 'ne') {
        nw = Math.max(8, ow + dx); nh = Math.max(8, oh - dy);
        ny = oy + (oh - nh);
      }
      if (corner === 'nw') {
        nw = Math.max(8, ow - dx); nh = Math.max(8, oh - dy);
        nx = ox + (ow - nw);
        ny = oy + (oh - nh);
      }
      updateShapes(shapes.map((s) => (s.id === id ? { ...s, x: nx, y: ny, width: nw, height: nh } : s)));
      return;
    }

    if (draggingFreeText) {
      const dx = x - draggingFreeText.startX;
      const dy = y - draggingFreeText.startY;
      updateFreeTexts(freeTexts.map((t) =>
        t.id === draggingFreeText.id ? { ...t, x: draggingFreeText.ox + dx, y: draggingFreeText.oy + dy } : t
      ));
      return;
    }

    if (resizingFreeText) {
      const dx = x - resizingFreeText.startX;
      const newW = Math.max(40, Math.min(600, resizingFreeText.startW + dx));
      updateFreeTexts(freeTexts.map((t) => t.id === resizingFreeText.id ? { ...t, width: newW } : t));
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
    if (dragState) {
      const draggingIds = new Set(Object.keys(dragState.offsets));
      if (snapTarget) {
        // Snap primary card to nearest edge of target, then offset all others relatively
        const primaryId = dragState.primaryCardId || [...draggingIds][0];
        const dc = cards.find((c) => c.id === primaryId);
        const tc = cards.find((c) => c.id === snapTarget);
        if (dc && tc) {
          const db = getCardBounds(dc);
          const tb = getCardBounds(tc);
          const dw = db.w;
          const dh = db.h;
          const tw = tb.w;
          const th = tb.h;
          // Determine which edges are closest
          const gaps = {
            right: tc.x - (dc.x + dw),   // dc right → tc left
            left: dc.x - (tc.x + tw),      // dc left ← tc right
            bottom: tc.y - (dc.y + dh),    // dc bottom → tc top
            top: dc.y - (tc.y + th),       // dc top ← tc bottom
          };
          const sorted = (Object.entries(gaps) as [string, number][]).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
          const [closestSide] = sorted[0];
          let snapX = dc.x, snapY = dc.y;
          if (closestSide === 'right') { snapX = tc.x - dw; snapY = tc.y; }
          else if (closestSide === 'left') { snapX = tc.x + tw; snapY = tc.y; }
          else if (closestSide === 'bottom') { snapY = tc.y - dh; snapX = tc.x; }
          else { snapY = tc.y + th; snapX = tc.x; }

          const ddx = snapX - dc.x;
          const ddy = snapY - dc.y;
          updateCards(cards.map((c) => {
            if (!draggingIds.has(c.id)) return c;
            return { ...c, x: c.x + ddx, y: c.y + ddy };
          }));

          const allDragging = [...draggingIds];
          updateMagnetGroups(mergeMagnetGroupsAfterSnap(magnetGroups, snapTarget, allDragging));
        }
        setSnapTarget(null);
      } else {
        setSnapTarget(null);
      }
      setDragState(null);
      return;
    }

    if (drawingArrow) {
      const pickSideForRect = (rx: number, ry: number, rw: number, rh: number): CanvasArrow['toSide'] => {
        const sides = [
          { side: 'top' as const, dist: Math.abs(y - ry) },
          { side: 'bottom' as const, dist: Math.abs(y - (ry + rh)) },
          { side: 'left' as const, dist: Math.abs(x - rx) },
          { side: 'right' as const, dist: Math.abs(x - (rx + rw)) },
        ];
        sides.sort((a, b) => a.dist - b.dist);
        return sides[0].side;
      };

      const targetCard = cards.find((c) => {
        if (drawingArrow.from.kind === 'card' && drawingArrow.from.id === c.id) return false;
        const r = getCardRect(c);
        return x >= r.x - 10 && x <= r.x + r.w + 10 && y >= r.y - 10 && y <= r.y + r.h + 10;
      });
      const targetShape = !targetCard
        ? shapes.find((s) => {
            if (drawingArrow.from.kind === 'shape' && drawingArrow.from.id === s.id) return false;
            return pointInShapePad(s, x, y, 12);
          })
        : undefined;

      if (targetCard) {
        const r = getCardRect(targetCard);
        const toSide = pickSideForRect(r.x, r.y, r.w, r.h);
        const newArrow: CanvasArrow = {
          id: `ca-${Date.now()}`,
          fromCardId: drawingArrow.from.kind === 'card' ? drawingArrow.from.id : undefined,
          fromShapeId: drawingArrow.from.kind === 'shape' ? drawingArrow.from.id : undefined,
          toCardId: targetCard.id,
          fromSide: drawingArrow.fromSide as CanvasArrow['fromSide'],
          toSide,
        };
        updateArrows([...arrows, newArrow]);
      } else if (targetShape) {
        const r = shapeBounds(targetShape);
        const toSide = pickSideForRect(r.x, r.y, r.w, r.h);
        const newArrow: CanvasArrow = {
          id: `ca-${Date.now()}`,
          fromCardId: drawingArrow.from.kind === 'card' ? drawingArrow.from.id : undefined,
          fromShapeId: drawingArrow.from.kind === 'shape' ? drawingArrow.from.id : undefined,
          toShapeId: targetShape.id,
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
    if (resizingCard) { setResizingCard(null); return; }

    if (drawingShapeBox) {
      const fx = Math.min(drawingShapeBox.startX, drawingShapeBox.curX);
      const fy = Math.min(drawingShapeBox.startY, drawingShapeBox.curY);
      const fw = Math.abs(drawingShapeBox.curX - drawingShapeBox.startX);
      const fh = Math.abs(drawingShapeBox.curY - drawingShapeBox.startY);
      if (fw > 4 && fh > 4) {
        commitShapeWithType(fx, fy, fw, fh, shapeToolType);
      }
      setDrawingShapeBox(null);
      return;
    }

    if (draggingShape) { setDraggingShape(null); return; }
    if (resizingShape) { setResizingShape(null); return; }
    if (draggingFreeText) { setDraggingFreeText(null); return; }
    if (resizingFreeText) { setResizingFreeText(null); return; }

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

  // Card drag start — expands selection to include magnet-group siblings
  const startCardDrag = (cardId: string, cx: number, cy: number) => {
    const base = selectedCards.has(cardId) ? selectedCards : new Set([cardId]);
    // Expand to include all cards in any magnet group that touches the base set
    const expanded = new Set(base);
    let changed = true;
    while (changed) {
      changed = false;
      magnetGroups.forEach((mg) => {
        if (mg.cardIds.some((id) => expanded.has(id))) {
          mg.cardIds.forEach((id) => {
            if (!expanded.has(id)) { expanded.add(id); changed = true; }
          });
        }
      });
    }
    setSelectedCards(expanded);
    const offsets: Record<string, { dx: number; dy: number }> = {};
    expanded.forEach((id) => {
      const c = cards.find((cc) => cc.id === id);
      if (c) offsets[id] = { dx: c.x, dy: c.y };
    });
    setDragState({ startX: cx, startY: cy, offsets, primaryCardId: cardId });
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
    if (draggingFreeText) return 'grabbing';
    if (resizingCard || resizingFrame || resizingShape || resizingFreeText) return 'nwse-resize';
    if (tool === 'pan' || isPanning) return 'grab';
    if (tool === 'ink' && isErasing) return 'cell';
    if (tool === 'ink') return 'crosshair';
    if (tool === 'frame') return 'crosshair';
    if (tool === 'shape') return 'crosshair';
    if (tool === 'text') return 'text';
    if (tool === 'card') return 'copy';
    return 'default';
  };

  if (!note) return null;

  const handles: ('top' | 'right' | 'bottom' | 'left')[] = ['top', 'right', 'bottom', 'left'];

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 min-h-0 h-full overflow-hidden relative bg-background/50 cursor-crosshair touch-none z-[1]"
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
            target.closest?.('[data-card-resize]') ||
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
            content: '',
            x,
            y,
            width: DEFAULT_CARD_WIDTH,
          };

          updateCards([...cards, newCard]);
        }}
        onMouseLeave={() => {
          setIsPanning(false);
          setDragState(null);
          setDrawingArrow(null);
          setCurrentInkPoints(null);
          setResizingCard(null);
          setDrawingShapeBox(null);
          setDraggingShape(null);
          setResizingShape(null);
          setDraggingFreeText(null);
          setResizingFreeText(null);
        }}
        style={{
          cursor: getCursor(),
          backgroundImage: `radial-gradient(circle, hsl(var(--dot-grid)) 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
      >
        <div className="absolute inset-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Groups/Frames */}
          {groups.map((group) => {
            const bStyle = group.borderStyle || 'dashed';
            const frameColor = group.color;
            const borderColor = frameColor || (selectedFrame === group.id ? undefined : 'hsl(var(--node-default))');
            const bgColor = frameColor ? hexToRgba(frameColor, 0.15) : 'rgba(139,111,71,0.04)';
            return (
            <div
              key={group.id}
              className={`absolute rounded-lg ${selectedFrame === group.id ? 'border-[1.5px]' : 'border-[1.5px]'}`}
              style={{
                left: group.x, top: group.y, width: group.width, height: group.height,
                borderColor: selectedFrame === group.id && !frameColor ? 'hsl(var(--accent))' : borderColor,
                borderStyle: bStyle === 'none' ? 'solid' : bStyle,
                borderWidth: bStyle === 'none' ? 0 : undefined,
                backgroundColor: bgColor,
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                setSelectedFrame(group.id);
                const { x, y } = screenToCanvas(e.clientX, e.clientY);
                setDraggingFrame({ frameId: group.id, startX: x, startY: y, origX: group.x, origY: group.y });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFrameCustomize({ frameId: group.id, x: e.clientX, y: e.clientY });
              }}
            >
              <span
                data-frame-label
                className="absolute -top-5 left-2 text-[11px] uppercase tracking-wider cursor-text"
                style={{ color: group.color || 'hsl(var(--muted-foreground))' }}
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
            );
          })}

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

          {drawingShapeBox && (
            <div
              className="absolute border-[1.5px] border-dashed rounded-md pointer-events-none z-[10]"
              style={{
                left: Math.min(drawingShapeBox.startX, drawingShapeBox.curX),
                top: Math.min(drawingShapeBox.startY, drawingShapeBox.curY),
                width: Math.abs(drawingShapeBox.curX - drawingShapeBox.startX),
                height: Math.abs(drawingShapeBox.curY - drawingShapeBox.startY),
                borderColor: 'hsl(var(--accent))',
                backgroundColor: 'rgba(139,111,71,0.06)',
              }}
            />
          )}

          {shapes.map((sh) => {
            const isSel = selectedShapeId === sh.id;
            const isHover = hoveredShapeId === sh.id;
            const sw = shapeStrokeWidthPx(sh);
            const bc = sh.borderColor || defaultShapeBorderColor();
            const bs = sh.borderStyle || 'solid';
            const fill = sh.fill;
            const showHandles = (isHover || (drawingArrow && !arrowSourceMatches(drawingArrow.from, 'shape', sh.id))) && editingShapeTextId !== sh.id;

            return (
              <div
                key={sh.id}
                data-canvas-shape
                className={`absolute z-[10] ${isSel ? 'ring-1 ring-accent/60' : ''}`}
                style={{ left: sh.x, top: sh.y, width: sh.width, height: sh.height }}
                onMouseEnter={() => setHoveredShapeId(sh.id)}
                onMouseLeave={() => setHoveredShapeId(null)}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  setSelectedShapeId(sh.id);
                  setSelectedCards(new Set());
                  setSelectedFreeTextId(null);
                  const { x, y } = screenToCanvas(e.clientX, e.clientY);
                  setDraggingShape({ id: sh.id, startX: x, startY: y, ox: sh.x, oy: sh.y });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingShapeTextId(sh.id);
                  setTimeout(() => shapeTextEditRef.current?.focus(), 0);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShapeCustomize({ shapeId: sh.id, x: e.clientX, y: e.clientY });
                }}
              >
                {sh.shapeType === 'rect' && (
                  <div
                    className="w-full h-full box-border pointer-events-none"
                    style={{
                      borderRadius: 6,
                      backgroundColor: fill || 'transparent',
                      borderWidth: bs === 'none' ? 0 : sw,
                      borderStyle: bs === 'dashed' ? 'dashed' : 'solid',
                      borderColor: bs === 'none' ? 'transparent' : bc,
                    }}
                  />
                )}
                {sh.shapeType === 'ellipse' && (
                  <div
                    className="w-full h-full box-border rounded-[50%] pointer-events-none"
                    style={{
                      backgroundColor: fill || 'transparent',
                      borderWidth: bs === 'none' ? 0 : sw,
                      borderStyle: bs === 'dashed' ? 'dashed' : 'solid',
                      borderColor: bs === 'none' ? 'transparent' : bc,
                    }}
                  />
                )}
                {(sh.shapeType === 'triangle' || sh.shapeType === 'line') && (() => {
                  const w = sh.width;
                  const h = sh.height;
                  const pts = `${w / 2},0 ${w},${h} 0,${h}`;
                  const dash = bs === 'dashed' ? `${6 * (sw / 1.5)} ${4 * (sw / 1.5)}` : undefined;
                  return (
                    <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={w} height={h}>
                      <polygon
                        points={pts}
                        fill={fill || 'none'}
                        stroke={bs === 'none' ? 'none' : bc}
                        strokeWidth={bs === 'none' ? 0 : sw}
                        strokeDasharray={dash}
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })()}

                {editingShapeTextId === sh.id && (
                  <textarea
                    ref={shapeTextEditRef}
                    data-shape-text-edit
                    className="absolute inset-0 m-auto w-[90%] h-[90%] min-h-[24px] bg-transparent outline-none text-center resize-none border-none font-sans pointer-events-auto"
                    style={{ fontSize: 13, color: bc, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
                    value={sh.text || ''}
                    onChange={(e) => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, text: e.target.value } : s))}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingShapeTextId(null);
                        (e.target as HTMLTextAreaElement).blur();
                      }
                    }}
                    onBlur={() => setEditingShapeTextId(null)}
                  />
                )}

                {!editingShapeTextId && (sh.text || '').trim() && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none px-1 text-center font-sans whitespace-pre-wrap break-words"
                    style={{ fontSize: 13, color: bc, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
                  >
                    {sh.text}
                  </div>
                )}

                {isSel && !editingShapeTextId && (
                  <>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                      let style: React.CSSProperties = { width: 8, height: 8 };
                      if (corner === 'nw') style = { ...style, left: -4, top: -4, cursor: 'nwse-resize' };
                      if (corner === 'ne') style = { ...style, right: -4, top: -4, cursor: 'nesw-resize' };
                      if (corner === 'sw') style = { ...style, left: -4, bottom: -4, cursor: 'nesw-resize' };
                      if (corner === 'se') style = { ...style, right: -4, bottom: -4, cursor: 'nwse-resize' };
                      return (
                        <div
                          key={corner}
                          data-shape-resize
                          className="absolute z-20 bg-background border border-accent rounded-sm"
                          style={style}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const { x, y } = screenToCanvas(e.clientX, e.clientY);
                            setResizingShape({
                              id: sh.id,
                              corner,
                              startX: x,
                              startY: y,
                              ox: sh.x,
                              oy: sh.y,
                              ow: sh.width,
                              oh: sh.height,
                            });
                          }}
                        />
                      );
                    })}
                  </>
                )}

                {showHandles && (
                  <>
                    {handles.map((side) => {
                      let style: React.CSSProperties = {};
                      if (side === 'top') style = { top: -4, left: '50%', marginLeft: -4 };
                      if (side === 'bottom') style = { bottom: -4, left: '50%', marginLeft: -4 };
                      if (side === 'left') style = { left: -4, top: '50%', marginTop: -4 };
                      if (side === 'right') style = { right: -4, top: '50%', marginTop: -4 };
                      return (
                        <div
                          key={side}
                          data-handle
                          className={`absolute w-3 h-3 flex items-center justify-center z-20 ${
                            drawingArrow ? 'cursor-alias' : 'cursor-crosshair'
                          }`}
                          style={style}
                          onDragStart={(e) => e.preventDefault()}
                          onMouseDown={(e) => !drawingArrow && startArrowDrawFromShape(sh.id, side, e)}
                          onMouseUp={(e) => {
                            if (drawingArrow && !arrowSourceMatches(drawingArrow.from, 'shape', sh.id)) {
                              e.stopPropagation();
                              const newArrow: CanvasArrow = {
                                id: `ca-${Date.now()}`,
                                fromCardId: drawingArrow.from.kind === 'card' ? drawingArrow.from.id : undefined,
                                fromShapeId: drawingArrow.from.kind === 'shape' ? drawingArrow.from.id : undefined,
                                toShapeId: sh.id,
                                fromSide: drawingArrow.fromSide as CanvasArrow['fromSide'],
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
              </div>
            );
          })}

          {freeTexts.map((ft) => (
            <div
              key={ft.id}
              data-free-text
              className={`absolute z-[10] ${selectedFreeTextId === ft.id ? 'ring-1 ring-accent/70 rounded' : ''} ${
                editingFreeTextId === ft.id ? '' : 'cursor-move'
              }`}
              style={{ left: ft.x, top: ft.y, width: ft.width, minWidth: 40, maxWidth: 600 }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const el = e.target as HTMLElement;
                if (el.closest('[data-free-text-toolbar]') || el.closest('[data-free-text-resize]')) return;
                if (editingFreeTextId === ft.id) return;
                e.stopPropagation();
                setSelectedFreeTextId(ft.id);
                setSelectedCards(new Set());
                setSelectedShapeId(null);
                const { x, y } = screenToCanvas(e.clientX, e.clientY);
                setDraggingFreeText({ id: ft.id, startX: x, startY: y, ox: ft.x, oy: ft.y });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingFreeTextId(ft.id);
                setTimeout(() => freeTextEditRef.current?.focus(), 0);
              }}
            >
              {selectedFreeTextId === ft.id && editingFreeTextId !== ft.id && (
                <div
                  data-free-text-toolbar
                  className="absolute left-0 bottom-full mb-2 flex flex-nowrap items-center gap-1 bg-popover border border-border rounded-lg px-1.5 py-1 shadow-md z-30 max-w-[min(420px,calc(100vw-48px))] overflow-x-auto"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  {([12, 16, 24, 32, 48] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`text-[10px] px-1.5 py-0.5 rounded ${ft.fontSize === sz ? 'bg-accent text-accent-foreground' : 'hover:bg-surface-hover'}`}
                      onClick={() => updateFreeTexts(freeTexts.map((t) => t.id === ft.id ? { ...t, fontSize: sz } : t))}
                    >
                      {sz}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`text-[11px] font-bold px-1.5 rounded ${ft.bold ? 'bg-accent text-accent-foreground' : 'hover:bg-surface-hover'}`}
                    onClick={() => updateFreeTexts(freeTexts.map((t) => t.id === ft.id ? { ...t, bold: !t.bold } : t))}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={`text-[11px] italic px-1.5 rounded ${ft.italic ? 'bg-accent text-accent-foreground' : 'hover:bg-surface-hover'}`}
                    onClick={() => updateFreeTexts(freeTexts.map((t) => t.id === ft.id ? { ...t, italic: !t.italic } : t))}
                  >
                    I
                  </button>
                  {(Object.entries(FREE_TEXT_COLORS) as [keyof typeof FREE_TEXT_COLORS, string][]).map(([k, col]) => (
                    <button
                      key={k}
                      type="button"
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: col }}
                      title={k}
                      onClick={() => updateFreeTexts(freeTexts.map((t) => t.id === ft.id ? { ...t, color: col } : t))}
                    />
                  ))}
                </div>
              )}
              {editingFreeTextId === ft.id ? (
                <textarea
                  ref={freeTextEditRef}
                  data-free-text-edit
                  className="w-full bg-transparent outline-none font-sans resize-none border-none overflow-hidden"
                  style={{
                    fontSize: ft.fontSize,
                    fontWeight: ft.bold ? 700 : 400,
                    fontStyle: ft.italic ? 'italic' : 'normal',
                    color: ft.color,
                    textAlign: 'left',
                    minHeight: ft.fontSize * 1.35,
                    maxWidth: 600,
                    width: '100%',
                  }}
                  value={ft.content}
                  onChange={(e) => {
                    if (!note) return;
                    const ta = e.target as HTMLTextAreaElement;
                    const val = ta.value;
                    requestAnimationFrame(() => {
                      ta.style.height = 'auto';
                      ta.style.height = `${ta.scrollHeight}px`;
                      const nextW = Math.min(600, Math.max(40, ta.scrollWidth + 12));
                      const st = useAppStore.getState();
                      const list = st.notes.find((n) => n.id === note.id)?.canvasFreeTexts || [];
                      st.updateNote(note.id, {
                        canvasFreeTexts: list.map((t) => (t.id === ft.id ? { ...t, content: val, width: nextW } : t)),
                      });
                    });
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => setEditingFreeTextId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      (e.target as HTMLTextAreaElement).blur();
                    }
                  }}
                />
              ) : (
                <div
                  className="font-sans whitespace-pre-wrap break-words"
                  style={{
                    fontSize: ft.fontSize,
                    fontWeight: ft.bold ? 700 : 400,
                    fontStyle: ft.italic ? 'italic' : 'normal',
                    color: ft.color,
                    textAlign: 'left',
                  }}
                >
                  {ft.content || '\u00a0'}
                </div>
              )}
              {selectedFreeTextId === ft.id && editingFreeTextId !== ft.id && (
                <div
                  data-free-text-resize
                  className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-6 cursor-ew-resize flex items-center justify-center opacity-60 hover:opacity-100 z-20"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const { x } = screenToCanvas(e.clientX, e.clientY);
                    setResizingFreeText({ id: ft.id, startX: x, startW: ft.width });
                  }}
                >
                  <div className="w-0.5 h-4 bg-accent rounded-full" />
                </div>
              )}
            </div>
          ))}

          {/* Arrows SVG */}
          <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
            <defs>
              <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 7 3.5, 0 7" fill="hsl(var(--accent))" />
              </marker>
            </defs>

            {arrows.map((arrow) => {
              const fromCard = arrow.fromCardId ? cards.find((c) => c.id === arrow.fromCardId) : undefined;
              const fromShape = arrow.fromShapeId ? shapes.find((s) => s.id === arrow.fromShapeId) : undefined;
              const toCard = arrow.toCardId ? cards.find((c) => c.id === arrow.toCardId) : undefined;
              const toShape = arrow.toShapeId ? shapes.find((s) => s.id === arrow.toShapeId) : undefined;
              let from: { x: number; y: number } | null = null;
              let to: { x: number; y: number } | null = null;
              if (fromCard) from = getCardCenter(fromCard, arrow.fromSide);
              else if (fromShape) from = shapeEdgePoint(fromShape, arrow.fromSide);
              if (toCard) to = getCardCenter(toCard, arrow.toSide);
              else if (toShape) to = shapeEdgePoint(toShape, arrow.toSide);
              if (!from || !to) return null;
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
              let from: { x: number; y: number } | null = null;
              if (drawingArrow.from.kind === 'card') {
                const fromCard = cards.find((c) => c.id === drawingArrow.from.id);
                if (!fromCard) return null;
                from = getCardCenter(fromCard, drawingArrow.fromSide);
              } else {
                const sh = shapes.find((s) => s.id === drawingArrow.from.id);
                if (!sh) return null;
                from = shapeEdgePoint(sh, drawingArrow.fromSide as 'top' | 'right' | 'bottom' | 'left');
              }
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
            const effectiveContent = getEffectiveCardContent(card);
            const cardEditDisplayValue =
              isEditMode && effectiveContent === NEW_CARD_PLACEHOLDER ? '' : effectiveContent;
            const isHovered = hoveredCard === card.id;
            const isSnapTarget = snapTarget === card.id;
            const cardMagnetGroup = magnetGroups.find((mg) => mg.cardIds.includes(card.id));
            const isGrouped = !!cardMagnetGroup;
            const isLiveDragging = !!dragState && !!dragState.offsets[card.id];

            // All templates (built-in + custom), filtered by cardTemplateFilter
            const allTemplates = [...BUILT_IN_TEMPLATES, ...getCustomTemplates()];
            const filteredTemplates = cardTemplateFilter
              ? allTemplates.filter((t) => t.name.toLowerCase().includes(cardTemplateFilter.toLowerCase()))
              : allTemplates;

            const applyTemplate = (templateContent: string) => {
              const contentLines = effectiveContent.split('\n');
              const tLineIdx = contentLines.findIndex((l) => l.trimStart().toLowerCase().startsWith('/template'));
              if (tLineIdx >= 0) {
                contentLines[tLineIdx] = templateContent;
                const newContent = templateContent === '' ? contentLines.filter((_, i) => i !== tLineIdx).join('\n') : contentLines.join('\n');
                if (card.linkedNoteId) {
                  const { title: nt, content: nc } = splitCardTextToNote(newContent);
                  updateNote(card.linkedNoteId, { title: nt, content: nc });
                } else {
                  updateCards(cards.map((c) => c.id === card.id ? { ...c, content: newContent } : c));
                }
              }
              setCardTemplateOpen(null);
              setCardTemplateFilter('');
            };

            return (
              <motion.div
                key={card.id}
                data-card
                dragTransition={{ power: 0, timeConstant: 200 }}
                className="absolute z-20 origin-top-left"
                style={{ left: card.x, top: card.y, willChange: isLiveDragging ? 'left, top' : undefined }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={isLiveDragging ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 }}
                onMouseEnter={() => setHoveredCard(card.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div
                  ref={(el) => {
                    if (el) cardInnerRefs.current.set(card.id, el);
                    else cardInnerRefs.current.delete(card.id);
                  }}
                  className={`bg-card rounded-lg shadow-sm cursor-move relative transition-shadow duration-150 ${
                    isSelected || isEditMode ? 'border-[1.5px] border-accent' : 'border border-border'
                  } ${isSnapTarget ? 'shadow-[0_0_0_2px_hsl(var(--accent)),0_0_16px_2px_hsl(var(--accent)/0.35)]' : ''}`}
                  style={{ width: card.width || DEFAULT_CARD_WIDTH, minWidth: 180, boxSizing: 'border-box', padding: 16 }}
                  onMouseDown={(e) => {
                    if (isEditMode || e.button !== 0) return;
                    e.stopPropagation();
                    const { x, y } = screenToCanvas(e.clientX, e.clientY);
                    startCardDrag(card.id, x, y);
                  }}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingCard(card.id); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCardContextMenu({ cardId: card.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {isEditMode ? (
                    <div className="relative">
                      <textarea
                        ref={cardEditorRef}
                        autoFocus
                        value={cardEditDisplayValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (card.linkedNoteId) {
                            const { title: nt, content: nc } = splitCardTextToNote(val);
                            updateNote(card.linkedNoteId, { title: nt, content: nc });
                          } else {
                            updateCards(cards.map((c) => c.id === card.id ? { ...c, content: val } : c));
                          }
                          const selStart = e.target.selectionStart;
                          const textBefore = val.slice(0, selStart);
                          const currentLine = textBefore.split('\n').pop() || '';
                          if (currentLine.trimStart().toLowerCase().startsWith('/template')) {
                            setCardTemplateOpen(card.id);
                            setCardTemplateFilter(currentLine.replace(/^\s*\/template\s*/i, ''));
                            setCardSlashOpen(false);
                            setCardSlashFilter('');
                          } else if (currentLine.startsWith('/')) {
                            setCardSlashFilter(currentLine.slice(1));
                            setCardSlashOpen(true);
                            setCardSlashIndex(0);
                            setCardTemplateOpen(null);
                            setCardTemplateFilter('');
                            setTimeout(() => computeCardSlashPosition(), 0);
                          } else {
                            setCardSlashOpen(false);
                            setCardSlashFilter('');
                            setCardTemplateOpen(null);
                            setCardTemplateFilter('');
                          }
                        }}
                        onBlur={() => {
                          const cardId = card.id;
                          setTimeout(() => {
                            const st = useAppStore.getState();
                            const wsId = st.workspaceNoteId;
                            const wn = wsId ? st.notes.find((n) => n.id === wsId) : undefined;
                            const list = wn?.canvasCards || [];
                            const fresh = list.find((c) => c.id === cardId);
                            if (fresh && !fresh.linkedNoteId) {
                              const raw = (fresh.content || '').trim();
                              if (raw && fresh.content !== NEW_CARD_PLACEHOLDER) {
                                const { title: nt, content: nc } = splitCardTextToNote(fresh.content);
                                const newNoteId = `note-${Date.now()}`;
                                st.addNote({
                                  id: newNoteId,
                                  title: nt,
                                  type: 'text',
                                  content: nc,
                                  createdAt: Date.now(),
                                  updatedAt: Date.now(),
                                });
                                if (wsId) {
                                  st.updateNote(wsId, {
                                    canvasCards: list.map((c) =>
                                      c.id === cardId ? { ...c, linkedNoteId: newNoteId } : c
                                    ),
                                  });
                                }
                              }
                            }
                            setEditingCard(null);
                            setCardTemplateOpen(null);
                            setCardTemplateFilter('');
                            setCardSlashOpen(false);
                            setCardSlashFilter('');
                          }, 150);
                        }}
                        onKeyDown={(e) => {
                          if (cardSlashOpen && editingCard === card.id) {
                            if (e.key === 'Escape') {
                              setCardSlashOpen(false);
                              setCardSlashFilter('');
                              e.preventDefault();
                              return;
                            }
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setCardSlashIndex((i) =>
                                Math.min(i + 1, Math.max(0, filteredCardSlashCommands.length - 1))
                              );
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setCardSlashIndex((i) => Math.max(i - 1, 0));
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const cmd = filteredCardSlashCommands[cardSlashIndex];
                              if (cmd) executeCardSlashCommand(cmd);
                              return;
                            }
                          }
                          if (cardTemplateOpen === card.id) {
                            if (e.key === 'Escape') { setCardTemplateOpen(null); setCardTemplateFilter(''); e.preventDefault(); return; }
                            if (e.key === 'Enter' && filteredTemplates.length > 0) { e.preventDefault(); applyTemplate(filteredTemplates[0].content); return; }
                          }
                          if (e.key === 'Escape') setEditingCard(null);
                        }}
                        className="w-full text-xs text-foreground bg-transparent outline-none resize-none font-sans min-h-[60px] max-h-[min(480px,45vh)] overflow-y-auto"
                        placeholder="Write something… (type / for commands, /template for templates)"
                      />
                      <AnimatePresence>
                        {cardSlashOpen && editingCard === card.id && filteredCardSlashCommands.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className="absolute z-[60] w-[200px] bg-card border border-border rounded-lg shadow-xl overflow-hidden"
                            style={{ top: cardSlashPosition.top, left: cardSlashPosition.left }}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {filteredCardSlashCommands.map((cmd, i) => (
                              <button
                                key={cmd.label}
                                type="button"
                                onClick={() => executeCardSlashCommand(cmd)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors duration-200 ${
                                  i === cardSlashIndex ? 'bg-surface-active' : 'hover:bg-surface-hover'
                                }`}
                              >
                                <span className="text-[10px] font-mono text-accent w-5 text-center">{cmd.label.slice(0, 2)}</span>
                                <div>
                                  <p className="text-xs text-foreground">{cmd.label}</p>
                                  <p className="text-[10px] text-muted-foreground">{cmd.desc}</p>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* Template picker */}
                      {cardTemplateOpen === card.id && filteredTemplates.length > 0 && (
                        <div
                          className="absolute left-0 top-full mt-1 z-50 w-[220px] bg-card border border-border rounded-lg shadow-xl overflow-hidden"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Templates</p>
                          {filteredTemplates.map((tmpl) => (
                            <button
                              key={tmpl.name}
                              onClick={() => applyTemplate(tmpl.content)}
                              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors"
                            >
                              {tmpl.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="text-[12px] leading-relaxed text-foreground max-h-[min(480px,45vh)] overflow-y-auto overflow-x-hidden pr-0.5 [&_h1]:font-display [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:mt-0 [&_h1]:mb-1 [&_h2]:font-display [&_h2]:text-[13px] [&_h2]:font-medium [&_h2]:mt-1 [&_h2]:mb-0.5 [&_blockquote]:text-[11px] [&_p]:text-muted-foreground [&_li]:text-muted-foreground"
                      onMouseDown={(e) => {
                        const el = e.target as HTMLElement;
                        if (el.closest('button')) e.stopPropagation();
                      }}
                    >
                      {effectiveContent.trim() ? (
                        renderMarkdown(effectiveContent, handleLinkClick)
                      ) : (
                        <p className="text-muted-foreground/50 text-xs">Start writing…</p>
                      )}
                    </div>
                  )}

                  {card.linkedNoteId && (
                    <div className="absolute top-1 right-1 text-[10px] text-muted-foreground">⛓</div>
                  )}

                  {/* Unlink button for grouped cards */}
                  {isGrouped && isHovered && !isEditMode && (
                    <button
                      type="button"
                      className="absolute -top-2 -right-2 z-30 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium leading-none cursor-pointer shadow-md border-2 border-accent/70 bg-accent text-accent-foreground transition-colors hover:bg-destructive hover:border-destructive hover:text-destructive-foreground"
                      title="Unlink from group"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!note) return;
                        const mgs = useAppStore.getState().notes.find((x) => x.id === note.id)?.magnetGroups || [];
                        const newGroups = mgs
                          .map((mg) => ({ ...mg, cardIds: mg.cardIds.filter((id) => id !== card.id) }))
                          .filter((mg) => mg.cardIds.length > 1);
                        useAppStore.getState().updateNote(note.id, { magnetGroups: newGroups });
                      }}
                    >
                      ⊗
                    </button>
                  )}

                  {selectedCards.size === 1 && selectedCards.has(card.id) && !isEditMode && (
                    <div
                      data-card-resize
                      className="absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize flex items-center justify-center opacity-40 hover:opacity-100 z-20"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const { x } = screenToCanvas(e.clientX, e.clientY);
                        setResizingCard({ id: card.id, startX: x, startW: card.width || DEFAULT_CARD_WIDTH });
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M7 1L1 7M7 4L4 7M7 7H7.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Connection handles (visible on hover or when drawing) */}
                {(isHovered || (drawingArrow && !arrowSourceMatches(drawingArrow.from, 'card', card.id))) && !isEditMode && (
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
                          onMouseDown={(e) => !drawingArrow && startArrowDrawFromCard(card.id, side, e)}
                          onMouseUp={(e) => {
                            if (drawingArrow && !arrowSourceMatches(drawingArrow.from, 'card', card.id)) {
                              e.stopPropagation();
                              const newArrow: CanvasArrow = {
                                id: `ca-${Date.now()}`,
                                fromCardId: drawingArrow.from.kind === 'card' ? drawingArrow.from.id : undefined,
                                fromShapeId: drawingArrow.from.kind === 'shape' ? drawingArrow.from.id : undefined,
                                toCardId: card.id,
                                fromSide: drawingArrow.fromSide as CanvasArrow['fromSide'],
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

      {/* Card context menu */}
      {cardContextMenu && (
        <div
          className="fixed z-[2000] bg-card border border-border rounded-lg shadow-lg py-1 w-52 text-card-foreground"
          style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm"
            onClick={() => {
              const name = window.prompt('Template name:');
              if (!name?.trim()) { setCardContextMenu(null); return; }
              const card = cards.find((c) => c.id === cardContextMenu.cardId);
              if (card) saveCustomTemplate(name.trim(), getEffectiveCardContent(card));
              setCardContextMenu(null);
            }}
          >
            Save as template
          </button>
        </div>
      )}

      {/* Frame customization popover */}
      {frameCustomize && (() => {
        const frame = groups.find((g) => g.id === frameCustomize.frameId);
        if (!frame) return null;
        const bStyle = frame.borderStyle || 'dashed';
        return (
          <div
            className="fixed z-[2000] bg-popover border border-border rounded-xl shadow-xl p-3 w-[216px]"
            style={{ left: frameCustomize.x, top: frameCustomize.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Background</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {/* Transparent / no color */}
              <button
                onClick={() => updateGroups(groups.map((g) => g.id === frame.id ? { ...g, color: undefined } : g))}
                className={`w-6 h-6 rounded-full border border-border flex items-center justify-center text-[8px] text-muted-foreground ${!frame.color ? 'ring-2 ring-accent ring-offset-1 ring-offset-popover' : ''}`}
                title="Transparent"
              >
                ✕
              </button>
              {FRAME_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateGroups(groups.map((g) => g.id === frame.id ? { ...g, color } : g))}
                  className={`w-6 h-6 rounded-full transition-all ${frame.color === color ? 'ring-2 ring-accent ring-offset-1 ring-offset-popover scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Border</p>
            <div className="flex gap-1.5">
              {(['solid', 'dashed', 'none'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => updateGroups(groups.map((g) => g.id === frame.id ? { ...g, borderStyle: style } : g))}
                  className={`flex-1 text-[10px] py-1 rounded border capitalize transition-colors ${bStyle === style ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:bg-surface-hover'}`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {shapeCustomize && (() => {
        const sh = shapes.find((s) => s.id === shapeCustomize.shapeId);
        if (!sh) return null;
        const bStyle = sh.borderStyle || 'solid';
        const bw = sh.borderWidth;
        return (
          <div
            className="fixed z-[2000] bg-popover border border-border rounded-xl shadow-xl p-3 w-[220px]"
            style={{ left: shapeCustomize.x, top: shapeCustomize.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Fill</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, fill: undefined } : s))}
                className={`w-6 h-6 rounded-full border border-border flex items-center justify-center text-[8px] text-muted-foreground ${!sh.fill ? 'ring-2 ring-accent ring-offset-1 ring-offset-popover' : ''}`}
                title="Transparent"
              >
                ✕
              </button>
              {FRAME_COLORS.map((color) => (
                <button
                  key={`fill-${color}`}
                  type="button"
                  onClick={() => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, fill: color } : s))}
                  className={`w-6 h-6 rounded-full transition-all ${sh.fill === color ? 'ring-2 ring-accent ring-offset-1 ring-offset-popover scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Border color</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, borderColor: undefined } : s))}
                className={`w-6 h-6 rounded-full border border-border flex items-center justify-center text-[8px] text-muted-foreground ${!sh.borderColor ? 'ring-2 ring-accent ring-offset-1 ring-offset-popover' : ''}`}
                title="Default"
              >
                A
              </button>
              {FRAME_COLORS.map((color) => (
                <button
                  key={`bd-${color}`}
                  type="button"
                  onClick={() => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, borderColor: color } : s))}
                  className={`w-6 h-6 rounded-full transition-all ${sh.borderColor === color ? 'ring-2 ring-accent ring-offset-1 ring-offset-popover scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Border style</p>
            <div className="flex gap-1.5 mb-3">
              {(['solid', 'dashed', 'none'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, borderStyle: style } : s))}
                  className={`flex-1 text-[10px] py-1 rounded border capitalize transition-colors ${bStyle === style ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:bg-surface-hover'}`}
                >
                  {style}
                </button>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Border width</p>
            <div className="flex gap-1.5">
              {([1, 2, 3] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateShapes(shapes.map((s) => s.id === sh.id ? { ...s, borderWidth: w } : s))}
                  className={`flex-1 text-[10px] py-1 rounded border transition-colors ${bw === w ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:bg-surface-hover'}`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
        );
      })()}

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
          { id: 'shape' as CanvasTool, icon: Circle, label: `Shape (${shortcutsConfig.shapeTool})` },
          { id: 'text' as CanvasTool, icon: Type, label: `Text (${shortcutsConfig.textTool})` },
          { id: 'ink' as CanvasTool, icon: Pencil, label: 'Ink (I)' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-spring-micro text-sm ${
              tool === t.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/25 dark:hover:bg-accent/20'
            }`}
            title={t.label}
          >
            <t.icon size={17} />
          </button>
        ))}
        <div className="w-px h-5 bg-popover-foreground/20 mx-0.5" />
        <button
          onClick={handleFitView}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent/25 dark:hover:bg-accent/20 transition-spring-micro"
          title="Fit view (F)"
        >
          <Maximize2 size={17} />
        </button>
        <div className="w-px h-5 bg-popover-foreground/20 mx-0.5" />
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent/25 dark:hover:bg-accent/20 transition-spring-micro"
          title="Zoom out (Ctrl+-)"
        >
          <ZoomOut size={17} />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent/25 dark:hover:bg-accent/20 transition-spring-micro"
          title="Zoom in (Ctrl+=)"
        >
          <ZoomIn size={17} />
        </button>

        {tool === 'shape' && (
          <>
            <div className="w-px h-5 bg-popover-foreground/20 mx-0.5" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Rectangle"
                onClick={() => setShapeToolType('rect')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-spring-micro ${
                  shapeToolType === 'rect'
                    ? 'ring-2 ring-popover-foreground/40 ring-offset-1 ring-offset-popover'
                    : 'hover:bg-accent/25 dark:hover:bg-accent/20'
                }`}
              >
                <span className="block w-3.5 h-2.5 border-2 border-current rounded-[3px]" />
              </button>
              <button
                type="button"
                title="Ellipse"
                onClick={() => setShapeToolType('ellipse')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-spring-micro ${
                  shapeToolType === 'ellipse'
                    ? 'ring-2 ring-popover-foreground/40 ring-offset-1 ring-offset-popover'
                    : 'hover:bg-accent/25 dark:hover:bg-accent/20'
                }`}
              >
                <Circle size={17} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                title="Triangle"
                onClick={() => setShapeToolType('triangle')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-spring-micro ${
                  shapeToolType === 'triangle'
                    ? 'ring-2 ring-popover-foreground/40 ring-offset-1 ring-offset-popover'
                    : 'hover:bg-accent/25 dark:hover:bg-accent/20'
                }`}
              >
                <Triangle size={17} strokeWidth={2.25} />
              </button>
            </div>
          </>
        )}

        {tool === 'text' && (
          <>
            <div className="w-px h-5 bg-popover-foreground/20 mx-0.5" />
            <div className="flex items-center gap-1">
              {([12, 16, 24, 32, 48] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setTextToolStyle((s) => ({ ...s, fontSize: sz }))}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    textToolStyle.fontSize === sz
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-surface-hover'
                  }`}
                >
                  {sz}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTextToolStyle((s) => ({ ...s, bold: !s.bold }))}
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                  textToolStyle.bold ? 'bg-accent text-accent-foreground' : 'hover:bg-surface-hover'
                }`}
              >
                B
              </button>
              <button
                type="button"
                onClick={() => setTextToolStyle((s) => ({ ...s, italic: !s.italic }))}
                className={`text-[11px] italic px-1.5 py-0.5 rounded ${
                  textToolStyle.italic ? 'bg-accent text-accent-foreground' : 'hover:bg-surface-hover'
                }`}
              >
                I
              </button>
              {(Object.entries(FREE_TEXT_COLORS) as [keyof typeof FREE_TEXT_COLORS, string][]).map(([k, col]) => (
                <button
                  key={k}
                  type="button"
                  title={k}
                  onClick={() => setTextToolStyle((s) => ({ ...s, color: col }))}
                  className={`w-4 h-4 rounded-full transition-spring-micro ${textToolStyle.color === col ? 'ring-2 ring-popover-foreground/40 ring-offset-1 ring-offset-popover' : ''}`}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
          </>
        )}

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
