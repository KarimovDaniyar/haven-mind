import { create } from 'zustand';

export type NoteType = 'text' | 'canvas';

export interface Note {
  id: string;
  title: string;
  type: NoteType;
  content: string;
  createdAt: number;
  updatedAt: number;
  canvasCards?: CanvasCard[];
  canvasArrows?: CanvasArrow[];
  canvasGroups?: CanvasGroup[];
  canvasShapes?: CanvasShape[];
  canvasFreeTexts?: CanvasFreeText[];
  inkStrokes?: InkStroke[];
  magnetGroups?: MagnetGroup[];
}

export interface CanvasCard {
  id: string;
  x: number;
  y: number;
  content: string;
  linkedNoteId?: string;
  width?: number;
}

export interface CanvasArrow {
  id: string;
  /** Card id when endpoint is a card (legacy arrows use both). */
  fromCardId?: string;
  toCardId?: string;
  /** Shape id when endpoint is a canvas shape. */
  fromShapeId?: string;
  toShapeId?: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
}

/** `line` is legacy (stored data); rendered as a triangle like `triangle`. */
export type CanvasShapeType = 'rect' | 'ellipse' | 'triangle' | 'line';

export interface CanvasShape {
  id: string;
  shapeType: CanvasShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'none';
  borderWidth?: 1 | 2 | 3;
  text?: string;
}

export interface CanvasFreeText {
  id: string;
  x: number;
  y: number;
  width: number;
  content: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface CanvasGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;
  borderStyle?: 'solid' | 'dashed' | 'none';
}

export interface MagnetGroup {
  id: string;
  cardIds: string[];
}

export interface InkStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
}

export interface TimerSession {
  date: string;
  minutes: number;
  completedAt: number;
}

export type ViewType = 'notes' | 'graph' | 'tracker' | 'settings';

export interface ShortcutsConfig {
  newNote: string;
  quickCapture: string;
  search: string;
  toggleDarkMode: string;
  fitCanvas: string;
  selectTool: string;
  panTool: string;
  inkTool: string;
  frameTool: string;
  shapeTool: string;
  textTool: string;
  undo: string;
}

const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  newNote: 'Ctrl+N',
  quickCapture: 'Ctrl+Space',
  search: 'Ctrl+F',
  toggleDarkMode: 'Ctrl+Shift+D',
  fitCanvas: 'F',
  selectTool: 'V',
  panTool: 'H',
  inkTool: 'I',
  frameTool: 'R',
  shapeTool: 'S',
  textTool: 'T',
  undo: 'Ctrl+Z',
};

function loadShortcuts(): ShortcutsConfig {
  try {
    const saved = localStorage.getItem('shortcutsConfig');
    if (saved) return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SHORTCUTS;
}

interface AppState {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  /** Single canvas workspace note (infinite canvas data lives here). */
  workspaceNoteId: string | null;
  setWorkspaceNoteId: (id: string | null) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;

  timerSessions: TimerSession[];
  addTimerSession: (session: TimerSession) => void;

  focusData: Record<string, number>;

  // Timer UI state (shared between sidebar and timer widget)
  timerOpen: boolean;
  timerRunning: boolean;
  toggleTimerOpen: () => void;
  setTimerOpen: (open: boolean) => void;
  setTimerRunning: (running: boolean) => void;
  rocketPanelCollapsed: boolean;
  setRocketPanelCollapsed: (collapsed: boolean) => void;

  /** Hides note list + editor column; canvas stays full width (Notes view). */
  notesSidebarCollapsed: boolean;
  setNotesSidebarCollapsed: (collapsed: boolean) => void;

  shortcutsConfig: ShortcutsConfig;
  setShortcutsConfig: (config: ShortcutsConfig) => void;

  quickCaptureOpen: boolean;
  setQuickCaptureOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'notes',
  setActiveView: (view) => set({ activeView: view }),

  notes: [],
  activeNoteId: null,
  setActiveNoteId: (id) => set({ activeNoteId: id }),

  workspaceNoteId: null,
  setWorkspaceNoteId: (id) => set({ workspaceNoteId: id }),

  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  updateNote: (id, updates) => set((s) => ({
    notes: s.notes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n),
  })),
  deleteNote: (id) => set((s) => {
    if (s.workspaceNoteId === id) return s;
    return {
      notes: s.notes.filter((n) => n.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    };
  }),

  timerSessions: [],
  addTimerSession: (session) => set((s) => ({
    timerSessions: [...s.timerSessions, session],
    focusData: {
      ...s.focusData,
      [session.date]: (s.focusData[session.date] || 0) + session.minutes,
    },
  })),

  focusData: {},

  timerOpen: false,
  timerRunning: false,
  toggleTimerOpen: () => set((s) => ({ timerOpen: !s.timerOpen })),
  setTimerOpen: (open) => set({ timerOpen: open }),
  setTimerRunning: (running) => set({ timerRunning: running }),

  rocketPanelCollapsed: false,
  setRocketPanelCollapsed: (collapsed) => set({ rocketPanelCollapsed: collapsed }),

  notesSidebarCollapsed: false,
  setNotesSidebarCollapsed: (collapsed) => set({ notesSidebarCollapsed: collapsed }),

  shortcutsConfig: loadShortcuts(),
  setShortcutsConfig: (config) => {
    try { localStorage.setItem('shortcutsConfig', JSON.stringify(config)); } catch {}
    set({ shortcutsConfig: config });
  },

  quickCaptureOpen: false,
  setQuickCaptureOpen: (open) => set({ quickCaptureOpen: open }),
}));
