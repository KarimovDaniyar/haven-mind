import type { CanvasMermaidDiagram } from '../store/appStore';
import { MAIN_PAGE_STACK_LEFT } from '../utils/mainPageCanvasLayout';

export const CANVAS_DEFAULT_ER_MERMAID = `erDiagram
  NOTE ||--o{ LINK : contains
  NOTE {
    string title
    string content
    date created
  }
  LINK {
    string source
    string target
  }`;

export function createDefaultCanvasMermaidDiagrams(): CanvasMermaidDiagram[] {
  return [
    {
      id: 'mmd-seed-er',
      x: MAIN_PAGE_STACK_LEFT + 820,
      y: 440,
      svg: '',
      mermaidSource: CANVAS_DEFAULT_ER_MERMAID,
    },
  ];
}
