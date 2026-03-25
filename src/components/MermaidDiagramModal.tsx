import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ensureMermaidReady } from '../utils/mermaidCdn';

export const DEFAULT_MERMAID = `graph TD
    A[Start] --> B[Think]
    B --> C[Write]
    C --> D[Review]
    D --> B`;

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert: (svg: string) => void;
};

export default function MermaidDiagramModal({ open, onClose, onInsert }: Props) {
  const [code, setCode] = useState(DEFAULT_MERMAID);
  const [lastValidSvg, setLastValidSvg] = useState('');
  const [syntaxError, setSyntaxError] = useState(false);
  const [mermaidReady, setMermaidReady] = useState(false);
  const previewIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    ensureMermaidReady().then(() => {
      if (!cancelled) setMermaidReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const renderPreview = useCallback(async (text: string) => {
    if (!window.mermaid?.render) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setLastValidSvg('');
      setSyntaxError(false);
      return;
    }
    try {
      previewIdRef.current += 1;
      const id = `mmd-preview-${previewIdRef.current}`;
      const { svg } = await window.mermaid.render(id, trimmed);
      setLastValidSvg(svg);
      setSyntaxError(false);
    } catch {
      setSyntaxError(true);
    }
  }, []);

  useEffect(() => {
    if (!open || !mermaidReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      renderPreview(code);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, open, mermaidReady, renderPreview]);

  useEffect(() => {
    if (open) {
      setCode(DEFAULT_MERMAID);
      setLastValidSvg('');
      setSyntaxError(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2 text-sm font-medium">Diagram</div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Mermaid</span>
            <textarea
              className="min-h-[280px] w-full flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-accent"
              value={code}
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Preview</span>
            <div className="min-h-[280px] flex-1 overflow-auto rounded-md border border-border bg-background p-3">
              {lastValidSvg ? (
                <div
                  className="mermaid-preview [&_svg]:max-w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: lastValidSvg }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {!mermaidReady ? 'Loading…' : 'Diagram preview'}
                </p>
              )}
              {syntaxError && (
                <p className="mt-2 text-xs text-muted-foreground">Check your syntax</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-hover"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-40"
            disabled={!lastValidSvg}
            onClick={() => {
              onInsert(lastValidSvg);
              onClose();
            }}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
