import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, FileText, LayoutGrid, Trash2, Edit2 } from 'lucide-react';
import { useAppStore, Note } from '../store/appStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu';

export default function NoteList() {
  const { notes, activeNoteId, setActiveNoteId, addNote, updateNote, deleteNote } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');

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
    // Start renaming immediately for new notes
    setRenamingId(note.id);
    setTempTitle('');
  };

  const handleRename = (id: string, title: string) => {
    updateNote(id, { title: title.trim() || 'Untitled' });
    setRenamingId(null);
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
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-200"
          >
            <Search size={14} />
          </button>
          
          <button
            onClick={() => createNote('text')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-200"
            title="New text note"
          >
            <FileText size={14} />
          </button>
          
          <button
            onClick={() => createNote('canvas')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-200"
            title="New canvas"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredNotes.map((note) => {
          const isActive = activeNoteId === note.id;
          const isRenaming = renamingId === note.id;
          
          return (
            <ContextMenu key={note.id}>
              <ContextMenuTrigger>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', note.id);
                    e.dataTransfer.setData('noteId', note.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="group relative"
                >
                  <button
                    onClick={() => { if (!isRenaming) setActiveNoteId(note.id); }}
                    className={`w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-colors duration-200 ${
                      isActive
                        ? 'bg-surface-active border-l-2 border-l-accent'
                        : 'hover:bg-surface-hover border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 pr-6">
                      {note.type === 'canvas' && (
                        <LayoutGrid size={11} className="text-muted-foreground flex-shrink-0" />
                      )}
                      
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onBlur={() => handleRename(note.id, tempTitle)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(note.id, tempTitle);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="bg-transparent text-[13px] font-medium text-foreground outline-none w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-[13px] font-medium text-foreground truncate">
                          {note.title || 'Untitled'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{getPreview(note)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(note.updatedAt)}</p>
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="bg-surface border-border shadow-md rounded-lg min-w-[160px] p-1 animate-in fade-in-0 zoom-in-95">
                <ContextMenuItem 
                  onClick={() => {
                    setRenamingId(note.id);
                    setTempTitle(note.title);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-md cursor-pointer transition-colors duration-200 outline-none font-medium"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Rename
                </ContextMenuItem>
                <div className="h-[1px] bg-border my-1 mx-1" />
                <ContextMenuItem 
                  className="flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-md cursor-pointer transition-colors duration-200 outline-none font-medium"
                  onClick={() => { if (confirm('Delete this note?')) deleteNote(note.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
