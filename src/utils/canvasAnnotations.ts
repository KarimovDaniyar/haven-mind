import type { CanvasShape } from '../store/appStore';

export function shapeBounds(s: CanvasShape) {
  return {
    x: s.x,
    y: s.y,
    w: s.width,
    h: s.height,
    cx: s.x + s.width / 2,
    cy: s.y + s.height / 2,
  };
}

export function shapeEdgePoint(s: CanvasShape, side: 'top' | 'right' | 'bottom' | 'left') {
  const { x, y, w, h } = shapeBounds(s);
  if (side === 'top') return { x: x + w / 2, y };
  if (side === 'bottom') return { x: x + w / 2, y: y + h };
  if (side === 'left') return { x, y: y + h / 2 };
  return { x: x + w, y: y + h / 2 };
}

export function pointInShapePad(s: CanvasShape, px: number, py: number, pad = 8) {
  const { x, y, w, h } = shapeBounds(s);
  return px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad;
}

export function defaultShapeBorderColor(): string {
  if (typeof document === 'undefined') return '#1C1917';
  return document.documentElement.classList.contains('dark') ? '#F0EDE8' : '#1C1917';
}
