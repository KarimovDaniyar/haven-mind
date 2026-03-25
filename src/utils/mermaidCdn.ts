const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1/mermaid.min.js';

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: Record<string, unknown>) => void;
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };
  }
}

let loadPromise: Promise<void> | null = null;

function initMermaid() {
  try {
    window.mermaid?.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral',
    });
  } catch {
    /* ignore */
  }
}

export function ensureMermaidReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.mermaid?.render) {
    initMermaid();
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    const done = () => {
      initMermaid();
      resolve();
    };
    const existing = document.querySelector(`script[src="${CDN}"]`);
    if (existing) {
      if (window.mermaid?.render) {
        done();
      } else {
        existing.addEventListener('load', done);
      }
      return;
    }
    const s = document.createElement('script');
    s.src = CDN;
    s.async = true;
    s.onload = done;
    document.head.appendChild(s);
  });
  return loadPromise;
}
