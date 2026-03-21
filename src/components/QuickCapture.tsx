import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';

export default function QuickCapture() {
  const {
    quickCaptureOpen,
    setQuickCaptureOpen,
    shortcutsConfig,
    notes,
    workspaceNoteId,
    updateNote,
    addNote,
  } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const binding = shortcutsConfig.quickCapture || 'Ctrl+Space';
      const parts = binding.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needsCtrl = parts.includes('ctrl');
      const matches =
        e.key.toLowerCase() === key &&
        (needsCtrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey));
      if (matches) {
        e.preventDefault();
        setQuickCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutsConfig, setQuickCaptureOpen]);

  useEffect(() => {
    if (quickCaptureOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [quickCaptureOpen]);

  const handleSubmit = (value: string) => {
    if (!value.trim()) { setQuickCaptureOpen(false); return; }
    const canvasNote =
      notes.find((n) => n.id === workspaceNoteId && n.type === 'canvas') ||
      notes.find((n) => n.type === 'canvas');
    if (canvasNote) {
      const x = window.innerWidth / 2 - 120;
      const y = 100;
      const trimmed = value.trim();
      const title = trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
      const newNoteId = `note-${Date.now()}`;
      addNote({
        id: newNoteId,
        title,
        type: 'text',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const newCard = { id: `qc-${Date.now()}`, x, y, content: '', linkedNoteId: newNoteId, width: 320 };
      updateNote(canvasNote.id, { canvasCards: [...(canvasNote.canvasCards || []), newCard] });
    }
    setQuickCaptureOpen(false);
  };

  return (
    <AnimatePresence>
      {quickCaptureOpen && (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-[999]"
            onClick={() => setQuickCaptureOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-[1000] w-[400px]"
          >
            <div className="bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center px-4 py-3 gap-3">
                <span className="text-muted-foreground text-sm">✦</span>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Capture a thought…"
                  className="flex-1 bg-transparent outline-none text-[14px] text-foreground placeholder:text-muted-foreground"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e.currentTarget.value); }
                    if (e.key === 'Escape') { e.preventDefault(); setQuickCaptureOpen(false); }
                  }}
                />
                <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
              </div>
              <div className="px-4 py-1.5 border-t border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground">Press ↵ to add card to canvas</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
