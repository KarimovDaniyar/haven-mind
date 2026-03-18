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
  inkStrokes?: InkStroke[];
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
  fromCardId: string;
  toCardId: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
}

export interface CanvasGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
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

interface AppState {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
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
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'notes',
  setActiveView: (view) => set({ activeView: view }),

  notes: [],
  activeNoteId: null,
  setActiveNoteId: (id) => set({ activeNoteId: id }),

  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  updateNote: (id, updates) => set((s) => ({
    notes: s.notes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n),
  })),
  deleteNote: (id) => set((s) => ({
    notes: s.notes.filter((n) => n.id !== id),
    activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
  })),

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
}));
