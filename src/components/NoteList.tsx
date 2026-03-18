import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, FileText, LayoutGrid } from 'lucide-react';
import { useAppStore, Note } from '../store/appStore';

export default function NoteList() {
  const { notes, activeNoteId, setActiveNoteId, addNote } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const createNote = (type: 'text' | 'canvas') => {
    const note: Note = {
      id: `note-${Date.now()}`,
      title: '',
      type,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(type === 'canvas' ? { canvasCards: [], canvasArrows: [], canvasGroups: [] } : {}),
    };
    addNote(note);
    setActiveNoteId(note.id);
    setShowNewMenu(false);
  };

  const getPreview = (note: Note) => {
    if (note.type === 'canvas') return `${note.canvasCards?.length || 0} cards`;
    const lines = note.content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    return lines[0]?.replace(/[*_\[\]#>`]/g, '').trim().slice(0, 60) || 'Empty note';
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-[260px] h-full flex flex-col border-r border-border bg-surface flex-shrink-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        {searchOpen ? (
          <motion.input
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '100%', opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); } }}
            placeholder="Search notes..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        ) : (
          <h2 className="font-display text-[15px] font-medium text-foreground">Notes</h2>
        )}
        <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-spring-micro"
          >
            <Search size={14} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-spring-micro"
            >
              <Plus size={14} />
            </button>
            <AnimatePresence>
              {showNewMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute right-0 top-8 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border/50 py-1 z-50 min-w-[140px]"
                >
                  <button
                    onClick={() => createNote('text')}
                    className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-accent/20 transition-spring-micro"
                  >
                    <FileText size={13} /> Text note
                  </button>
                  <button
                    onClick={() => createNote('canvas')}
                    className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-accent/20 transition-spring-micro"
                  >
                    <LayoutGrid size={13} /> Canvas
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredNotes.map((note) => {
          const isActive = activeNoteId === note.id;
          return (
            <button
              key={note.id}
              onClick={() => setActiveNoteId(note.id)}
              className={`w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-spring-micro ${
                isActive
                  ? 'bg-surface-active border-l-2 border-l-accent'
                  : 'hover:bg-surface-active border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {note.type === 'canvas' && (
                  <LayoutGrid size={11} className="text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-[13px] font-medium text-foreground truncate">
                  {note.title || 'Untitled'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{getPreview(note)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(note.updatedAt)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
