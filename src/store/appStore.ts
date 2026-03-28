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
  /** Rendered Mermaid SVG blocks placed on the infinite canvas (not inside A4 markdown). */
  canvasMermaidDiagrams?: CanvasMermaidDiagram[];
  inkStrokes?: InkStroke[];
  canvasMainPages?: CanvasMainPage[];
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
  /** Arrow ends on the A4 main note stack (wiki-style link to the sheet). */
  toMainPage?: boolean;
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

export interface CanvasMermaidDiagram {
  id: string;
  x: number;
  y: number;
  /** @deprecated Ignored; container size follows SVG getBBox(). */
  width?: number;
  svg: string;
  /** When set without `svg`, the client renders via Mermaid and may persist `svg`. */
  mermaidSource?: string;
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



export interface InkStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
}

/** Fixed-width A4 sheets on the workspace canvas (main document, not floating cards). */
export interface CanvasMainPage {
  id: string;
  content: string;
}

export interface TimerSession {
  date: string;
  minutes: number;
  completedAt: number;
}

export type MissionDestination = 'MOON' | 'MARS' | 'JUPITER' | 'SATURN' | 'NEPTUNE';

export interface MissionStats {
  notesCreated: number;
  linksCreated: number;
  focusMinutes: number;
}

export interface MissionState {
  active: boolean;
  title: string;
  destination: MissionDestination | null;
  fuel: number;
  typedWordsCarry: number;
  stats: MissionStats;
  completed: boolean;
  completionCardOpen: boolean;
  trophyMode: boolean;
  /** When set, replaces MISSION_REQUIRED_FUEL for this mission (scaled focus duration). */
  customRequiredFuel: number | null;
}

export type ViewType = 'notes';

export interface ShortcutsConfig {
  newNote: string;
  quickCapture: string;
  search: string;
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

export const MISSION_REQUIRED_FUEL: Record<MissionDestination, number> = {
  MOON: 100,
  MARS: 300,
  JUPITER: 600,
  SATURN: 1200,
  NEPTUNE: 2500,
};

const defaultMissionStats: MissionStats = {
  notesCreated: 0,
  linksCreated: 0,
  focusMinutes: 0,
};

const defaultMissionState: MissionState = {
  active: false,
  title: '',
  destination: null,
  fuel: 0,
  typedWordsCarry: 0,
  stats: defaultMissionStats,
  completed: false,
  completionCardOpen: false,
  trophyMode: false,
  customRequiredFuel: null,
};

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function countWikiLinks(text: string): number {
  const matches = text.match(/\[\[[^\[\]]+\]\]/g);
  return matches ? matches.length : 0;
}

function countWordsInMainPages(pages?: CanvasMainPage[]): number {
  if (!pages || pages.length === 0) return 0;
  return pages.reduce((acc, page) => acc + countWords(page.content || ''), 0);
}

function countLinksInMainPages(pages?: CanvasMainPage[]): number {
  if (!pages || pages.length === 0) return 0;
  return pages.reduce((acc, page) => acc + countWikiLinks(page.content || ''), 0);
}

function countWordsInCards(cards?: CanvasCard[]): number {
  if (!cards || cards.length === 0) return 0;
  return cards.reduce((acc, card) => acc + countWords(card.content || ''), 0);
}

function countLinksInCards(cards?: CanvasCard[]): number {
  if (!cards || cards.length === 0) return 0;
  return cards.reduce((acc, card) => acc + countWikiLinks(card.content || ''), 0);
}

const MISSION_STORAGE_KEY = 'havenMindMission';

function loadMission(): MissionState {
  try {
    const raw = localStorage.getItem(MISSION_STORAGE_KEY);
    if (!raw) {
      return { ...defaultMissionState, stats: { ...defaultMissionStats } };
    }
    const parsed = JSON.parse(raw) as Partial<MissionState>;
    return {
      ...defaultMissionState,
      ...parsed,
      stats: { ...defaultMissionStats, ...parsed.stats },
      customRequiredFuel:
        parsed.customRequiredFuel != null && parsed.customRequiredFuel > 0
          ? parsed.customRequiredFuel
          : null,
    };
  } catch {
    return { ...defaultMissionState, stats: { ...defaultMissionStats } };
  }
}

function persistMission(mission: MissionState): void {
  try {
    localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(mission));
  } catch {}
}

function applyMissionActivity(
  mission: MissionState,
  baseFuelGain: number,
  statsDelta?: Partial<MissionStats>,
): MissionState {
  if (!mission.active || !mission.destination || mission.trophyMode) return mission;

  const fuelGain = Math.max(0, Math.floor(baseFuelGain));

  const required =
    mission.customRequiredFuel != null && mission.customRequiredFuel > 0
      ? mission.customRequiredFuel
      : MISSION_REQUIRED_FUEL[mission.destination];
  const fuel = Math.min(required, mission.fuel + fuelGain);
  const completedNow = fuel >= required;
  const stats: MissionStats = {
    notesCreated: mission.stats.notesCreated + (statsDelta?.notesCreated || 0),
    linksCreated: mission.stats.linksCreated + (statsDelta?.linksCreated || 0),
    focusMinutes: mission.stats.focusMinutes + (statsDelta?.focusMinutes || 0),
  };

  return {
    ...mission,
    fuel,
    stats,
    completed: mission.completed || completedNow,
    completionCardOpen: mission.completionCardOpen || completedNow,
  };
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

  /** Right sidebar: mock LLM Note Adviser chat. */
  noteAdviserOpen: boolean;
  setNoteAdviserOpen: (open: boolean) => void;
  toggleNoteAdviser: () => void;

  mission: MissionState;
  launchMission: (title: string, destination: MissionDestination, customRequiredFuel?: number | null) => void;
  resetMission: () => void;
  keepExploringMission: () => void;
  recordMissionNoteCreated: () => void;
  recordMissionMermaidInserted: () => void;
  recordMissionFocusTicks: (deltaMinutes: number) => void;
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
  updateNote: (id, updates) => set((s) => {
    const prevNote = s.notes.find((n) => n.id === id);
    let nextMission = s.mission;

    if (prevNote) {
      let addedWords = 0;
      let addedLinks = 0;

      if (typeof updates.content === 'string') {
        const prevWords = countWords(prevNote.content || '');
        const nextWords = countWords(updates.content);
        addedWords += Math.max(0, nextWords - prevWords);

        const prevLinks = countWikiLinks(prevNote.content || '');
        const nextLinks = countWikiLinks(updates.content);
        addedLinks += Math.max(0, nextLinks - prevLinks);
      }

      if (Array.isArray(updates.canvasMainPages)) {
        const prevWords = countWordsInMainPages(prevNote.canvasMainPages);
        const nextWords = countWordsInMainPages(updates.canvasMainPages);
        addedWords += Math.max(0, nextWords - prevWords);

        const prevLinks = countLinksInMainPages(prevNote.canvasMainPages);
        const nextLinks = countLinksInMainPages(updates.canvasMainPages);
        addedLinks += Math.max(0, nextLinks - prevLinks);
      }

      if (Array.isArray(updates.canvasCards)) {
        const prevWords = countWordsInCards(prevNote.canvasCards);
        const nextWords = countWordsInCards(updates.canvasCards);
        addedWords += Math.max(0, nextWords - prevWords);

        const prevLinks = countLinksInCards(prevNote.canvasCards);
        const nextLinks = countLinksInCards(updates.canvasCards);
        addedLinks += Math.max(0, nextLinks - prevLinks);
      }

      if (addedWords > 0 || addedLinks > 0) {
        const carryTotal = s.mission.typedWordsCarry + addedWords;
        const wordFuel = Math.floor(carryTotal / 100);
        const nextCarry = carryTotal % 100;
        nextMission = {
          ...applyMissionActivity(s.mission, wordFuel * 5 + addedLinks * 20, {
            linksCreated: addedLinks,
          }),
          typedWordsCarry: nextCarry,
        };
      }
    }

    persistMission(nextMission);
    return {
      notes: s.notes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n),
      mission: nextMission,
    };
  }),
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

  rocketPanelCollapsed: true,
  setRocketPanelCollapsed: (collapsed) => set({ rocketPanelCollapsed: collapsed }),

  notesSidebarCollapsed: true,
  setNotesSidebarCollapsed: (collapsed) => set({ notesSidebarCollapsed: collapsed }),

  shortcutsConfig: loadShortcuts(),
  setShortcutsConfig: (config) => {
    try { localStorage.setItem('shortcutsConfig', JSON.stringify(config)); } catch {}
    set({ shortcutsConfig: config });
  },

  quickCaptureOpen: false,
  setQuickCaptureOpen: (open) => set({ quickCaptureOpen: open }),

  noteAdviserOpen: false,
  setNoteAdviserOpen: (open) => set({ noteAdviserOpen: open }),
  toggleNoteAdviser: () => set((s) => ({ noteAdviserOpen: !s.noteAdviserOpen })),

  mission: loadMission(),
  launchMission: (title, destination, customRequiredFuel) => set(() => {
    const scaled =
      customRequiredFuel != null &&
      Number.isFinite(customRequiredFuel) &&
      customRequiredFuel > 0
        ? Math.max(1, Math.floor(customRequiredFuel))
        : null;
    const mission: MissionState = {
      active: true,
      title: title.trim(),
      destination,
      fuel: 0,
      typedWordsCarry: 0,
      stats: { ...defaultMissionStats },
      completed: false,
      completionCardOpen: false,
      trophyMode: false,
      customRequiredFuel: scaled,
    };
    persistMission(mission);
    return { mission };
  }),
  resetMission: () => set(() => {
    const mission = { ...defaultMissionState, stats: { ...defaultMissionStats } };
    persistMission(mission);
    return { mission };
  }),
  keepExploringMission: () => set((s) => {
    const mission: MissionState = {
      ...s.mission,
      fuel: 0,
      typedWordsCarry: 0,
      completed: false,
      completionCardOpen: false,
      trophyMode: true,
    };
    persistMission(mission);
    return { mission };
  }),
  recordMissionNoteCreated: () => set((s) => {
    const mission = applyMissionActivity(s.mission, 10, { notesCreated: 1 });
    persistMission(mission);
    return { mission };
  }),
  recordMissionMermaidInserted: () => set((s) => {
    const mission = applyMissionActivity(s.mission, 30);
    persistMission(mission);
    return { mission };
  }),
  recordMissionFocusTicks: (deltaMinutes) => set((s) => {
    const d = Math.max(0, Math.floor(deltaMinutes));
    if (d <= 0) return s;
    const mission = applyMissionActivity(s.mission, d * 3, {
      focusMinutes: d,
    });
    if (mission === s.mission) return s;
    persistMission(mission);
    return { mission };
  }),
}));
