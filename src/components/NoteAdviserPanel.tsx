import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { useAppStore } from '../store/appStore';

type Msg = { id: string; role: 'user' | 'assistant'; text: string };

const SAMPLE_REPLIES = [
  'Sample reply: Try breaking the idea into one next action you could do in under two minutes.',
  'Sample reply: A clear title plus three bullets often beats a long paragraph for future you.',
  'Sample reply: Link this note to a related one with [[wiki-links]] so the graph stays useful.',
  'Sample reply: If you are stuck, write one honest sentence about what you do not know yet.',
];

const DEFAULT_SIDEBAR_WIDTH = 350;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 880;

export default function NoteAdviserPanel() {
  const { noteAdviserOpen, setNoteAdviserOpen, rocketPanelCollapsed } = useAppStore();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const moveHandlerRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const upHandlerRef = useRef<(() => void) | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Sample adviser (not a real LLM). Ask anything about your notes or workflow — you will get canned demo replies.',
    },
  ]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const replyIdx = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (moveHandlerRef.current) window.removeEventListener('mousemove', moveHandlerRef.current);
    if (upHandlerRef.current) window.removeEventListener('mouseup', upHandlerRef.current);

    const onMove = (ev: MouseEvent) => {
      const next = window.innerWidth - ev.clientX;
      const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(next)));
      setSidebarWidth(clamped);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      moveHandlerRef.current = null;
      upHandlerRef.current = null;
    };

    moveHandlerRef.current = onMove;
    upHandlerRef.current = onUp;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    return () => {
      if (moveHandlerRef.current) window.removeEventListener('mousemove', moveHandlerRef.current);
      if (upHandlerRef.current) window.removeEventListener('mouseup', upHandlerRef.current);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, noteAdviserOpen]);

  const send = () => {
    const t = input.trim();
    if (!t || pending) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', text: t };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setPending(true);
    setTimeout(() => {
      const text = SAMPLE_REPLIES[replyIdx.current % SAMPLE_REPLIES.length];
      replyIdx.current += 1;
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', text }]);
      setPending(false);
    }, 450 + Math.random() * 400);
  };

  const rightInset = rocketPanelCollapsed ? 4 : DEFAULT_SIDEBAR_WIDTH;

  return (
    <AnimatePresence initial={false}>
      {noteAdviserOpen && (
        <motion.aside
          key="adviser"
          initial={{ x: sidebarWidth + 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: sidebarWidth + 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          style={{ top: 0, bottom: 0, right: rightInset, width: sidebarWidth, zIndex: 45 }}
          className="pointer-events-auto fixed flex min-h-0 flex-col overflow-hidden border-l border-border bg-background shadow-lg"
        >
          <div
            role="separator"
            aria-label="Resize note adviser"
            onMouseDown={startResize}
            className="absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-ew-resize bg-transparent"
          />
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-medium text-foreground">Note Adviser</span>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              title="Close"
              onClick={() => setNoteAdviserOpen(false)}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[95%] rounded-lg px-2.5 py-1.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'ml-auto bg-accent text-accent-foreground'
                    : 'mr-auto bg-muted/60 text-foreground'
                }`}
              >
                {msg.text}
              </div>
            ))}
            {pending && (
              <div className="mr-auto rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground italic">
                …
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-border p-2">
            <div className="flex gap-1.5">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-accent"
                placeholder="Message (sample)…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded-md bg-accent p-2 text-accent-foreground hover:opacity-90 disabled:opacity-40"
                disabled={pending || !input.trim()}
                title="Send"
                onClick={send}
              >
                <Send className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
