import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from './markdown';
import { measureMmToPx, splitHardPageSegments } from './mainPageBreaks';

const noop = () => {};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/** Matches `.md-root` rules in the print HTML so off-DOM height matches the printed page. */
const PRINT_MD_ROOT_CSS = `
.md-root h1 { font-size: 1.45rem; font-weight: 600; margin: 0 0 0.45em; }
.md-root h2 { font-size: 1.15rem; font-weight: 600; margin: 0.65em 0 0.3em; }
.md-root h3 { font-size: 1rem; font-weight: 600; margin: 0.45em 0 0.2em; }
.md-root p { margin: 0.15em 0; line-height: 1.55; }
.md-root blockquote { margin: 0.35em 0; padding-left: 0.75em; border-left: 2px solid #d4d4d8; color: #52525b; font-style: italic; }
.md-root table { border-collapse: collapse; width: 100%; font-size: 0.92em; margin: 0.45em 0; }
.md-root th, .md-root td { border: 1px solid #d4d4d8; padding: 0.3em 0.45em; vertical-align: top; }
.md-root th { background: #f4f4f5; text-align: left; font-weight: 600; }
.md-root hr { border: none; border-top: 1px solid #e4e4e7; margin: 0.55em 0; }
.md-root code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; background: #f4f4f5; padding: 0.08em 0.28em; border-radius: 3px; }
.md-root .flex { display: flex; flex-direction: row; align-items: flex-start; gap: 0.5rem; }
`;

function segmentToPrintHtml(md: string): string {
  const t = (md.trim() || '\u00a0').replace(/\r\n/g, '\n');
  const nodes = renderMarkdown(t, noop, true, true);
  return renderToStaticMarkup(React.createElement('div', { className: 'md-root' }, nodes));
}

function measureBlockHeightPx(innerHtml: string, containerWidthPx: number): number {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:absolute',
    'left:-99999px',
    'top:0',
    `width:${containerWidthPx}px`,
    'visibility:hidden',
    'box-sizing:border-box',
    'padding:0',
    'margin:0',
    'font-family:system-ui,-apple-system,Segoe UI,sans-serif',
    'font-size:11pt',
    'line-height:1.55',
    'color:#18181b',
  ].join(';');
  wrap.innerHTML = `<style>${PRINT_MD_ROOT_CSS}</style>${innerHtml}`;
  document.body.appendChild(wrap);
  const h = wrap.offsetHeight;
  document.body.removeChild(wrap);
  return h;
}

function packSoftPages(md: string, maxContentHeightPx: number, widthPx: number): string[] {
  const t = md.trim();
  if (!t) return [''];
  const fullHtml = segmentToPrintHtml(t);
  const fullH = measureBlockHeightPx(fullHtml, widthPx);
  if (fullH <= maxContentHeightPx) {
    return [t];
  }
  const raw = t.split(/\n{2,}/);
  const pages: string[] = [];
  let cur: string[] = [];
  let acc = 0;
  for (const block of raw) {
    const html = segmentToPrintHtml(block);
    const h = measureBlockHeightPx(html, widthPx);
    if (acc + h > maxContentHeightPx && cur.length > 0) {
      pages.push(cur.join('\n\n'));
      cur = [];
      acc = 0;
    }
    cur.push(block);
    acc += h;
  }
  if (cur.length) pages.push(cur.join('\n\n'));
  return pages.length ? pages : [md];
}

/**
 * Opens the print dialog (Save as PDF) in a hidden iframe so the app tab stays active.
 * Hard `/pagebreak` lines and soft A4-height packing both emit real page breaks.
 */
export function openMainPagePrintDocument(options: {
  title: string;
  fullMarkdown: string;
  contentInnerWidthPx: number;
}): void {
  const { title, fullMarkdown, contentInnerWidthPx } = options;
  const printableHeightPx = Math.max(240, measureMmToPx(297 - 36));
  const hardSegments = splitHardPageSegments(fullMarkdown);

  const printParts: string[] = [];

  for (let si = 0; si < hardSegments.length; si++) {
    if (si > 0) {
      printParts.push('<div class="hard-page-break"></div>');
    }
    const softPages = packSoftPages(hardSegments[si], printableHeightPx, contentInnerWidthPx);
    softPages.forEach((pageMd, pi) => {
      if (pi > 0) {
        printParts.push('<div class="soft-page-break"></div>');
      }
      printParts.push(`<article class="print-sheet">${segmentToPrintHtml(pageMd)}</article>`);
    });
  }

  const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>
@page { size: A4; margin: 18mm; }
body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; font-size: 11pt; color: #18181b; margin: 0; }
.print-sheet { box-sizing: border-box; }
.soft-page-break, .hard-page-break { page-break-before: always; break-before: page; height: 0; margin: 0; padding: 0; border: 0; }
${PRINT_MD_ROOT_CSS}
</style></head><body>${printParts.join('')}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = '';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const w = iframe.contentWindow;
  if (!w) {
    document.body.removeChild(iframe);
    return;
  }
  const d = w.document;
  d.open();
  d.write(doc);
  d.close();

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  w.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(cleanup, 120_000);

  requestAnimationFrame(() => {
    try {
      w.focus();
      w.print();
    } catch {
      cleanup();
    }
  });
}
