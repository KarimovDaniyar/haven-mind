import { create } from 'zustand';

export type NoteType = 'text' | 'canvas';

export interface Note {
  id: string;
  title: string;
  type: NoteType;
  content: string; // markdown for text notes
  createdAt: number;
  updatedAt: number;
  // Canvas-specific
  canvasCards?: CanvasCard[];
  canvasArrows?: CanvasArrow[];
  canvasGroups?: CanvasGroup[];
}

export interface CanvasCard {
  id: string;
  x: number;
  y: number;
  content: string;
  linkedNoteId?: string; // if embedded from note list
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

export interface TimerSession {
  date: string; // YYYY-MM-DD
  minutes: number;
  completedAt: number;
}

export type ViewType = 'notes' | 'graph' | 'tracker' | 'settings';

interface AppState {
  // Navigation
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  // Notes
  notes: Note[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;

  // Timer
  timerSessions: TimerSession[];
  addTimerSession: (session: TimerSession) => void;

  // Tracker data (fake focus data for heatmap)
  focusData: Record<string, number>; // date -> minutes
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
}));
