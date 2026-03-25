import React, { useState, useEffect, useRef } from 'react';
import { ensureMermaidReady } from '../utils/mermaidCdn';
import { sanitizeMermaidSvgForTransparentCanvas } from '../utils/mermaidSvgCleanup';

type Props = {
  diagramId: string;
  svg: string;
  mermaidSource?: string;
  onPersistSvg: (svg: string) => void;
};

/**
 * Renders Mermaid SVG at natural dimensions; container grows with the SVG (no crop, no scroll).
 */
export default function MermaidCanvasContent({ diagramId, svg, mermaidSource, onPersistSvg }: Props) {
  const [html, setHtml] = useState(() => sanitizeMermaidSvgForTransparentCanvas(svg || ''));
  const persistRef = useRef(onPersistSvg);
  persistRef.current = onPersistSvg;

  useEffect(() => {
    setHtml(sanitizeMermaidSvgForTransparentCanvas(svg || ''));
  }, [svg]);

  useEffect(() => {
    if (html.trim()) return;
    if (!mermaidSource?.trim()) return;
    let cancelled = false;
    (async () => {
      await ensureMermaidReady();
      if (cancelled || !window.mermaid?.render) return;
      try {
        const { svg: out } = await window.mermaid.render(
          `mmd-canvas-${diagramId}-${Date.now()}`,
          mermaidSource.trim()
        );
        if (cancelled) return;
        const cleaned = sanitizeMermaidSvgForTransparentCanvas(out);
        setHtml(cleaned);
        persistRef.current(cleaned);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramId, mermaidSource, html]);

  if (!html.trim()) {
    return (
      <p className="pointer-events-none px-1 py-2 text-xs text-zinc-500">Loading diagram…</p>
    );
  }

  return (
    <div
      className="pointer-events-none inline-block text-zinc-900 [&_svg]:block [&_svg]:max-w-none [&_svg]:max-h-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
