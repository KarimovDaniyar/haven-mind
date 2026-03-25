/**
 * Makes Mermaid SVG suitable for transparent canvas overlay: removes common
 * theme background rects and clears root SVG background styling.
 */
export function sanitizeMermaidSvgForTransparentCanvas(svgMarkup: string): string {
  const trimmed = svgMarkup.trim();
  if (!trimmed || typeof DOMParser === 'undefined') return trimmed;

  try {
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return trimmed;

    const rootStyle = svgEl.getAttribute('style');
    if (rootStyle && /background/i.test(rootStyle)) {
      const next = rootStyle
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !/^\s*background/i.test(p));
      if (next.length) svgEl.setAttribute('style', next.join('; '));
      else svgEl.removeAttribute('style');
    }

    doc.querySelectorAll('rect.background, rect[class*="background"]').forEach((n) => n.remove());

    doc.querySelectorAll('rect').forEach((r) => {
      const cls = r.getAttribute('class') || '';
      if (/\bbackground\b/i.test(cls)) {
        r.remove();
        return;
      }
      const w = (r.getAttribute('width') || '').trim();
      const h = (r.getAttribute('height') || '').trim();
      if (w !== '100%' || h !== '100%') return;
      const fill = (r.getAttribute('fill') || '').toLowerCase().replace(/\s/g, '');
      if (
        fill === '#ffffff' ||
        fill === '#fff' ||
        fill === 'white' ||
        fill === '#f9f9f9' ||
        fill === '#f4f4f4'
      ) {
        r.remove();
      }
    });

    doc.querySelectorAll('g.background, g[class*="background"]').forEach((g) => {
      if (g.querySelector('rect') && !g.querySelector('text, path, polygon, ellipse, circle')) {
        g.remove();
      }
    });

    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    return trimmed;
  }
}
