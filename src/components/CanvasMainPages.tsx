import React, { useLayoutEffect, useRef, useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { Plus } from 'lucide-react';
import { CanvasMainPage } from '../store/appStore';
import { renderMarkdown } from '../utils/markdown';
import {
  splitHardPageSegments,
  computeHardBreakSpacersPX,
  measureMmToPx,
} from '../utils/mainPageBreaks';
type Props = {
  pages: CanvasMainPage[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onUpdateContent: (id: string, content: string) => void;
  onAddPage: () => void;
  onWikiLink: (title: string) => void;
};

const mainPageSlashCommands = [
  { label: 'Page break', desc: 'Hard page break (new page)', insert: '/pagebreak\n', cursor: 0 as number | undefined },
];

const sheetFrameStyle: React.CSSProperties = {
  width: '210mm',
  maxWidth: 794,
  minHeight: '297mm',
  boxSizing: 'border-box',
};

function SoftPageBreakRulers({
  contentHeightPx,
  pageHeightPx,
  lineClassName,
}: {
  contentHeightPx: number;
  pageHeightPx: number;
  lineClassName: string;
}) {
  if (pageHeightPx <= 0 || contentHeightPx <= pageHeightPx + 1) return null;
  const lines: number[] = [];
  for (let y = pageHeightPx; y < contentHeightPx - 0.5; y += pageHeightPx) {
    lines.push(y);
  }
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden"
      style={{ height: contentHeightPx }}
    >
      {lines.map((top, i) => (
        <Fragment key={top}>
          <div
            className={`absolute border-t border-dashed border-zinc-300/40 ${lineClassName}`}
            style={{ top }}
          />
          <span
            className="absolute left-1 text-[10px] font-normal tracking-wide text-zinc-400/90 select-none"
            style={{ top: top - 7 }}
          >
            Page {i + 2}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function HardPageSpacer({ heightPx }: { heightPx: number }) {
  if (heightPx <= 0) {
    return (
      <div className="relative my-1 h-px w-full shrink-0" aria-hidden>
        <div className="absolute inset-x-10 top-0 border-t border-dashed border-zinc-400/40" />
        <span className="absolute left-1 -top-2 text-[9px] uppercase tracking-[0.14em] text-zinc-400/85">
          Break
        </span>
      </div>
    );
  }
  return (
    <div
      className="relative w-full shrink-0 bg-white"
      style={{ height: heightPx }}
      aria-hidden
    >
      <div className="absolute inset-x-10 bottom-0 border-t border-dashed border-zinc-400/40" />
      <span className="absolute left-1 bottom-1 text-[9px] uppercase tracking-[0.14em] text-zinc-400/85">
        Break
      </span>
    </div>
  );
}

function SegmentBody({
  markdown,
  onWikiLink,
  onHeight,
}: {
  markdown: string;
  onWikiLink: (title: string) => void;
  onHeight: (h: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    onHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [markdown, onHeight]);

  return (
    <div ref={ref} className="relative z-[1]">
      {markdown.trim()
        ? renderMarkdown(markdown, onWikiLink, true)
        : (
          <p className="text-zinc-400 italic my-0">Click to write on this sheet…</p>
        )}
    </div>
  );
}

function MainPageReadView({
  content,
  onWikiLink,
  pageHeightPx,
}: {
  content: string;
  onWikiLink: (title: string) => void;
  pageHeightPx: number;
}) {
  const segments = useMemo(() => splitHardPageSegments(content), [content]);
  const [heights, setHeights] = useState<number[]>(() => segments.map(() => 0));

  useEffect(() => {
    setHeights(segments.map(() => 0));
  }, [content]);

  const setHeightAt = useCallback((i: number, h: number) => {
    setHeights((prev) => {
      if (prev[i] === h) return prev;
      const next = [...prev];
      next[i] = h;
      return next;
    });
  }, []);

  const spacers = useMemo(
    () => computeHardBreakSpacersPX(heights, pageHeightPx),
    [heights, pageHeightPx]
  );

  const flowRef = useRef<HTMLDivElement>(null);
  const [flowH, setFlowH] = useState(0);

  useLayoutEffect(() => {
    const el = flowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFlowH(el.offsetHeight));
    ro.observe(el);
    setFlowH(el.offsetHeight);
    return () => ro.disconnect();
  }, [segments, heights, spacers, content]);

  return (
    <div className="relative min-h-[297mm] pl-12 pr-10 pt-10 pb-10 text-[15px] leading-relaxed select-text">
      <div ref={flowRef} className="relative z-[1]">
        {segments.map((seg, i) => (
          <Fragment key={i}>
            {i > 0 ? <HardPageSpacer heightPx={spacers[i - 1] ?? 0} /> : null}
            <SegmentBody
              markdown={seg}
              onWikiLink={onWikiLink}
              onHeight={(h) => setHeightAt(i, h)}
            />
          </Fragment>
        ))}
      </div>
      <SoftPageBreakRulers
        contentHeightPx={flowH}
        pageHeightPx={pageHeightPx}
        lineClassName="left-10 right-10"
      />
    </div>
  );
}

export default function CanvasMainPages({
  pages,
  editingId,
  setEditingId,
  onUpdateContent,
  onAddPage,
  onWikiLink,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [pageHeightPx, setPageHeightPx] = useState(1123);
  const [editScrollH, setEditScrollH] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPos, setSlashPos] = useState({ top: 0, left: 0 });

  const editingPage = editingId ? pages.find((p) => p.id === editingId) : null;

  useLayoutEffect(() => {
    setPageHeightPx(measureMmToPx(297));
  }, []);

  useLayoutEffect(() => {
    if (!editingId || !taRef.current) return;
    const t = taRef.current;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    setEditScrollH(t.scrollHeight);
  }, [editingId, editingPage?.content, pages]);

  const filteredSlash = useMemo(() => {
    if (!slashFilter) return mainPageSlashCommands;
    return mainPageSlashCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
        c.desc.toLowerCase().includes(slashFilter.toLowerCase())
    );
  }, [slashFilter]);

  const computeSlashPos = useCallback(() => {
    const textarea = taRef.current;
    if (!textarea) return;
    const selStart = textarea.selectionStart;
    const val = textarea.value;
    const textBefore = val.slice(0, selStart);
    const lineNum = textBefore.split('\n').length - 1;
    const lineHeight = 24.5;
    const scrollTop = textarea.scrollTop;
    setSlashPos({ top: (lineNum + 1) * lineHeight - scrollTop + 8, left: 0 });
  }, []);

  const executeSlash = useCallback(
    (cmd: (typeof mainPageSlashCommands)[0]) => {
      const textarea = taRef.current;
      if (!textarea || !editingPage) return;
      const selStart = textarea.selectionStart;
      const text = textarea.value;
      const textBefore = text.slice(0, selStart);
      const lines = textBefore.split('\n');
      const currentLine = lines[lines.length - 1];
      if (!currentLine.startsWith('/')) return;
      const lineStart = textBefore.length - currentLine.length;
      const before = text.slice(0, lineStart);
      const after = text.slice(selStart);
      const newText = before + cmd.insert + after;
      onUpdateContent(editingPage.id, newText);
      setSlashOpen(false);
      setSlashFilter('');
      setTimeout(() => {
        const t = taRef.current;
        if (t) {
          const pos = lineStart + cmd.insert.length + (cmd.cursor || 0);
          t.selectionStart = pos;
          t.selectionEnd = pos;
          t.focus();
        }
      }, 10);
    },
    [editingPage, onUpdateContent]
  );

  const handleTextChange = (pageId: string, value: string, selStart: number) => {
    onUpdateContent(pageId, value);
    const textBefore = value.slice(0, selStart);
    const lines = textBefore.split('\n');
    const currentLine = lines[lines.length - 1] || '';
    if (currentLine.startsWith('/')) {
      setSlashFilter(currentLine.slice(1));
      setSlashOpen(true);
      setSlashIndex(0);
      setTimeout(computeSlashPos, 0);
    } else {
      setSlashOpen(false);
    }
    requestAnimationFrame(() => {
      const t = taRef.current;
      if (t) setEditScrollH(t.scrollHeight);
    });
  };

  return (
    <div
      data-main-page-stack
      className="relative z-[2] flex flex-col items-stretch gap-8"
    >
      {pages.map((page) => {
        const isEdit = editingId === page.id;
        return (
          <div
            key={page.id}
            data-main-page-doc
            className="rounded-[2px] bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.08)] border border-zinc-200/90"
            style={sheetFrameStyle}
          >
            <div className="relative">
              {isEdit ? (
                <div className="relative min-h-[297mm] pl-12 pr-10 pt-10 pb-10">
                  <textarea
                    ref={taRef}
                    data-main-page-textarea
                    className="relative z-[1] w-full min-h-[calc(297mm-5rem)] resize-none bg-transparent outline-none text-[15px] leading-relaxed font-sans text-zinc-900 placeholder:text-zinc-400"
                    value={page.content}
                    autoFocus
                    onChange={(e) =>
                      handleTextChange(page.id, e.target.value, e.target.selectionStart)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        if (slashOpen) {
                          e.preventDefault();
                          setSlashOpen(false);
                          return;
                        }
                        e.preventDefault();
                        setEditingId(null);
                        return;
                      }
                      if (slashOpen) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSlashIndex((i) =>
                            Math.min(i + 1, Math.max(0, filteredSlash.length - 1))
                          );
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSlashIndex((i) => Math.max(i - 1, 0));
                          return;
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const cmd = filteredSlash[slashIndex];
                          if (cmd) executeSlash(cmd);
                          return;
                        }
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onScroll={() => {
                      if (slashOpen) computeSlashPos();
                    }}
                  />
                  <SoftPageBreakRulers
                    contentHeightPx={editScrollH}
                    pageHeightPx={pageHeightPx}
                    lineClassName="left-10 right-10"
                  />
                  {slashOpen && filteredSlash.length > 0 && (
                    <div
                      data-main-page-slash
                      className="absolute z-20 mt-1 w-[min(220px,calc(100%-2rem))] rounded-lg border border-zinc-200/90 bg-white py-1 shadow-md"
                      style={{ top: slashPos.top, left: slashPos.left }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {filteredSlash.map((cmd, idx) => (
                        <button
                          key={cmd.label}
                          type="button"
                          className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${
                            idx === slashIndex ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => executeSlash(cmd)}
                        >
                          <span className="font-medium text-zinc-800">{cmd.label}</span>
                          <span className="text-xs text-zinc-500">{cmd.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="cursor-text"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setEditingId(page.id);
                  }}
                >
                  <MainPageReadView
                    content={page.content}
                    onWikiLink={onWikiLink}
                    pageHeightPx={pageHeightPx}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        data-main-page-add
        className="flex min-h-[297mm] flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-zinc-400 hover:bg-zinc-50/80 hover:text-zinc-800 transition-colors"
        style={sheetFrameStyle}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAddPage();
        }}
      >
        <Plus className="h-5 w-5 shrink-0 opacity-70" strokeWidth={2} />
        Add another A4 page
      </button>
    </div>
  );
}
