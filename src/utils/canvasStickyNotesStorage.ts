export type StickyNoteColor = 'yellow' | 'green' | 'pink' | 'blue';

export interface CanvasStickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: StickyNoteColor;
  rotationDeg: number;
}

export const STICKY_NOTE_SIZE = 160;

export const STICKY_PASTEL_BG: Record<StickyNoteColor, string> = {
  yellow: '#FFF9C4',
  green: '#C8E6C9',
  pink: '#F8BBD0',
  blue: '#BBDEFB',
};

const STORAGE_PREFIX = 'haven-canvas-stickies:';

function storageKey(workspaceNoteId: string): string {
  return `${STORAGE_PREFIX}${workspaceNoteId}`;
}

/** Fixed per note: between -3deg and +2deg. */
export function randomStickyRotationDeg(): number {
  return Math.round((Math.random() * 5 - 3) * 10) / 10;
}

export function loadCanvasStickyNotes(workspaceNoteId: string): CanvasStickyNote[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(workspaceNoteId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is CanvasStickyNote =>
        row &&
        typeof row === 'object' &&
        typeof (row as CanvasStickyNote).id === 'string' &&
        typeof (row as CanvasStickyNote).x === 'number' &&
        typeof (row as CanvasStickyNote).y === 'number' &&
        typeof (row as CanvasStickyNote).text === 'string' &&
        ['yellow', 'green', 'pink', 'blue'].includes((row as CanvasStickyNote).color) &&
        typeof (row as CanvasStickyNote).rotationDeg === 'number',
    );
  } catch {
    return [];
  }
}

export function saveCanvasStickyNotes(workspaceNoteId: string, list: CanvasStickyNote[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(workspaceNoteId), JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

/** Writes defaults only if this workspace has no sticky key yet (first visit / new device). */
export function seedCanvasStickyNotesIfEmpty(workspaceNoteId: string, defaults: CanvasStickyNote[]): void {
  if (typeof localStorage === 'undefined' || defaults.length === 0) return;
  const key = storageKey(workspaceNoteId);
  if (localStorage.getItem(key) !== null) return;
  try {
    localStorage.setItem(key, JSON.stringify(defaults));
  } catch {
    /* ignore */
  }
}
