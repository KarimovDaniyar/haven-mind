import React, { useLayoutEffect, useState } from 'react';
import { PanelLeftOpen, PanelLeftClose, MessageSquareText, Printer, Workflow } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { measureMmToPx } from '../utils/mainPageBreaks';
import { openMainPagePrintDocument } from '../utils/mainPagePrint';

/** Identical row styling to `data-free-text-toolbar` in CanvasView (no position classes). */
const floatingBarClass =
  'flex flex-nowrap items-center gap-1.5 bg-popover border border-border rounded-lg px-2 py-1.5 shadow-md z-30 max-w-[min(420px,calc(100vw-48px))] overflow-x-auto';

const btnClass =
  'inline-flex items-center gap-1.5 text-[13px] px-2 py-1 rounded-md hover:bg-surface-hover text-foreground';

const btnActiveClass = 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

type Props = {
  hasMainPages: boolean;
  mergedMarkdownForPrint: string;
  onOpenDiagram: () => void;
};

export default function CanvasActionToolbar({ hasMainPages, mergedMarkdownForPrint, onOpenDiagram }: Props) {
  const {
    notesSidebarCollapsed,
    setNotesSidebarCollapsed,
    toggleNoteAdviser,
    noteAdviserOpen,
  } = useAppStore();

  const [pageHeightPx, setPageHeightPx] = useState(1123);

  useLayoutEffect(() => {
    setPageHeightPx(measureMmToPx(297));
  }, []);

  const exportPdf = () => {
    if (!hasMainPages || !mergedMarkdownForPrint.trim()) return;
    const innerW = Math.max(320, measureMmToPx(210) - 80);
    openMainPagePrintDocument({
      title: 'Main note',
      fullMarkdown: mergedMarkdownForPrint,
      pageHeightPx,
      contentInnerWidthPx: innerW,
    });
  };

  return (
    <div
      data-action-toolbar
      className={floatingBarClass}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`${btnClass} ${!notesSidebarCollapsed ? btnActiveClass : ''}`}
        title={notesSidebarCollapsed ? 'Show notes' : 'Hide notes'}
        onClick={() => setNotesSidebarCollapsed(!notesSidebarCollapsed)}
      >
        {notesSidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={2} />
        ) : (
          <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={2} />
        )}
        <span>{notesSidebarCollapsed ? 'Show notes' : 'Hide notes'}</span>
      </button>
      <button
        type="button"
        className={`${btnClass} ${noteAdviserOpen ? btnActiveClass : ''}`}
        title="Note Adviser"
        onClick={() => toggleNoteAdviser()}
      >
        <MessageSquareText className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>Adviser</span>
      </button>
      <button
        type="button"
        className={`${btnClass} ${!hasMainPages ? 'opacity-40 pointer-events-none' : ''}`}
        title="Export PDF / Print"
        onClick={exportPdf}
      >
        <Printer className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>PDF</span>
      </button>
      <button
        type="button"
        className={`${btnClass} ${!hasMainPages ? 'opacity-40 pointer-events-none' : ''}`}
        title="Diagram (Mermaid)"
        onClick={onOpenDiagram}
      >
        <Workflow className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>Diagram</span>
      </button>
    </div>
  );
}
