/** Hard page break: own line in source markdown. */
export const MAIN_PAGE_PAGEBREAK_LINE = '/pagebreak';

export function splitHardPageSegments(source: string): string[] {
  return source.split(/\r?\n\/pagebreak\s*\r?\n/);
}

/** Spacers before segments 1..n so each segment starts on a new virtual A4 page (screen layout). */
export function computeHardBreakSpacersPX(segmentHeightsPX: number[], pageHeightPX: number): number[] {
  if (segmentHeightsPX.length <= 1 || pageHeightPX <= 0) return [];
  const spacers: number[] = [];
  let cumulative = segmentHeightsPX[0] ?? 0;
  for (let i = 1; i < segmentHeightsPX.length; i++) {
    const h = segmentHeightsPX[i] ?? 0;
    const s = (pageHeightPX - (cumulative % pageHeightPX)) % pageHeightPX;
    spacers.push(s);
    cumulative += s + h;
  }
  return spacers;
}

export function measureMmToPx(mm: number): number {
  if (typeof document === 'undefined') return Math.round((mm / 25.4) * 96);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;height:0;width:0;overflow:hidden;';
  const inner = document.createElement('div');
  inner.style.height = `${mm}mm`;
  probe.appendChild(inner);
  document.body.appendChild(probe);
  const px = inner.offsetHeight;
  document.body.removeChild(probe);
  return px || Math.round((mm / 25.4) * 96);
}
