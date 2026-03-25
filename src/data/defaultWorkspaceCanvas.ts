import type { CanvasCard, CanvasFreeText, CanvasGroup, CanvasMermaidDiagram, CanvasShape, InkStroke, Note } from '../store/appStore';
import { MAIN_PAGE_STACK_LEFT, MAIN_PAGE_STACK_TOP } from '../utils/mainPageCanvasLayout';
import type { CanvasStickyNote } from '../utils/canvasStickyNotesStorage';
import { CANVAS_DEFAULT_ER_MERMAID } from './defaultCanvasErMermaid';

/** Approximate vertical space from Mermaid top to place the card below it. */
const SEED_GAP_BELOW_MERMAID = 420;

/** Stable ids for seeded canvas cards. */
export const SEED_LINKED_CARD_ID = 'cc-seed-flow';
export const SEED_SECOND_CARD_ID = 'cc-seed-timeblock';

const MERMAID_X = MAIN_PAGE_STACK_LEFT + 818 + 29;

/**
 * Hardcoded initial workspace canvas: ER Mermaid to the right of the sheet,
 * first linked card (Flow state) to the left, second (Time blocking) under the diagram.
 */
export function createDefaultWorkspaceMermaidDiagrams(): CanvasMermaidDiagram[] {
  return [
    {
      id: 'mmd-seed-er',
      x: MERMAID_X,
      y: MAIN_PAGE_STACK_TOP,
      svg: '',
      mermaidSource: CANVAS_DEFAULT_ER_MERMAID,
    },
  ];
}

export function createDefaultWorkspaceCards(): CanvasCard[] {
  const baseY = MAIN_PAGE_STACK_TOP;
  const mermaidTop = baseY;
  return [
    {
      id: SEED_LINKED_CARD_ID,
      x: MAIN_PAGE_STACK_LEFT - 320,
      y: baseY,
      content: '',
      linkedNoteId: 'note-2',
      width: 296,
    },
    {
      id: SEED_SECOND_CARD_ID,
      x: MERMAID_X,
      y: mermaidTop + SEED_GAP_BELOW_MERMAID,
      content: '',
      linkedNoteId: 'note-3',
      width: 296,
    },
  ];
}

/** Demo sticky on the canvas (localStorage seed only; not part of Note). */
export function createDefaultWorkspaceStickyNotes(): CanvasStickyNote[] {
  return [
    {
      id: 'st-seed-welcome',
      x: MAIN_PAGE_STACK_LEFT + 612,
      y: MAIN_PAGE_STACK_TOP + 96,
      text: 'Rough ideas? Right-click the canvas for more stickies — they stay on the desk, not in the sidebar.',
      color: 'yellow',
      rotationDeg: -1.8,
    },
  ];
}

export function getDefaultWorkspaceCanvasFields(): Pick<
  Note,
  | 'canvasCards'
  | 'canvasArrows'
  | 'canvasGroups'
  | 'canvasShapes'
  | 'canvasFreeTexts'
  | 'canvasMermaidDiagrams'
  | 'inkStrokes'
> {
  return {
    canvasCards: createDefaultWorkspaceCards(),
    canvasArrows: [],
    canvasGroups: [] as CanvasGroup[],
    canvasShapes: [] as CanvasShape[],
    canvasFreeTexts: [] as CanvasFreeText[],
    canvasMermaidDiagrams: createDefaultWorkspaceMermaidDiagrams(),
    inkStrokes: [] as InkStroke[],
  };
}
