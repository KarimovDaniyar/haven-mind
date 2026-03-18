import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Pencil } from 'lucide-react';
import { useAppStore } from '../store/appStore';

import { extractWikiLinks, renderMarkdown } from '../utils/markdown';

// Slash command definitions
const slashCommands = [
  { label: 'H1', desc: 'Large heading', insert: '# ', type: 'line' },
  { label: 'H2', desc: 'Medium heading', insert: '## ', type: 'line' },
  { label: 'Bold', desc: 'Bold text', insert: '****', cursor: -2, type: 'inline' },
  { label: 'Italic', desc: 'Italic text', insert: '**', cursor: -1, type: 'inline' },
  { label: 'Bullet', desc: 'Bullet list', insert: '- ', type: 'line' },
  { label: 'Quote', desc: 'Block quote', insert: '> ', type: 'line' },
  { label: 'Code', desc: 'Inline code', insert: '``', cursor: -1, type: 'inline' },
  { label: 'Divider', desc: 'Horizontal rule', insert: '---', type: 'line' },
  { label: 'Wiki link', desc: 'Link to note', insert: '[[]]', cursor: -2, type: 'inline' },
];

export default function NoteEditor() {
  const { notes, activeNoteId, updateNote, setActiveNoteId } = useAppStore();
  const note = notes.find((n) => n.id === activeNoteId);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Slash command state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (note) {
      setEditTitle(note.title);
      setEditContent(note.content);
      setIsEditing(false);
      setSlashOpen(false);
    }
  }, [activeNoteId]);

  const scrollPosRef = useRef<number>(0);

  // Auto-resize textarea before repaint
  useLayoutEffect(() => {
    if (isEditing && contentRef.current) {
      const textarea = contentRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
      
      const scrollContainer = editorContainerRef.current?.parentElement;
      if (scrollContainer && scrollPosRef.current > 0) {
        scrollContainer.scrollTop = scrollPosRef.current;
        scrollPosRef.current = 0; // reset after restoring once
      }
    }
  }, [isEditing, editContent]);

  const handleLinkClick = useCallback((title: string) => {
    const target = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (target) setActiveNoteId(target.id);
  }, [notes, setActiveNoteId]);

  const backlinks = useMemo(() => {
    if (!note) return [];
    return notes.filter((n) => n.id !== note.id && extractWikiLinks(n.content).some(
      (link) => link.toLowerCase() === note.title.toLowerCase()
    ));
  }, [note, notes]);

  const startEditing = (target: 'title' | 'content' = 'content') => {
    if (!note) return;
    const scrollContainer = editorContainerRef.current?.parentElement;
    if (scrollContainer) scrollPosRef.current = scrollContainer.scrollTop;
    
    setIsEditing(true);
    setTimeout(() => {
      if (target === 'title') titleRef.current?.focus({ preventScroll: true });
      else contentRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const saveEdit = () => {
    if (!note) return;
    updateNote(note.id, { title: editTitle, content: editContent });
    setIsEditing(false);
    setSlashOpen(false);
  };

  // Slash command logic
  const filteredCommands = useMemo(() => {
    if (!slashFilter) return slashCommands;
    return slashCommands.filter((c) =>
      c.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
      c.desc.toLowerCase().includes(slashFilter.toLowerCase())
    );
  }, [slashFilter]);

  const computeSlashPosition = useCallback(() => {
    const textarea = contentRef.current;
    const container = editorContainerRef.current;
    if (!textarea || !container) return;

    const selStart = textarea.selectionStart;
    const textBefore = editContent.slice(0, selStart);
    const lines = textBefore.split('\n');
    const lineNum = lines.length - 1;
    const lineHeight = 25.5; // 15px * 1.7
    const scrollTop = textarea.scrollTop;

    const top = (lineNum + 1) * lineHeight - scrollTop + 8;
    const left = 0;

    setSlashPosition({ top, left });
  }, [editContent]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const selStart = e.target.selectionStart;
    setEditContent(value);

    // Check for slash at line start
    const textBefore = value.slice(0, selStart);
    const lines = textBefore.split('\n');
    const currentLine = lines[lines.length - 1];

    if (currentLine.startsWith('/')) {
      const filter = currentLine.slice(1);
      setSlashFilter(filter);
      setSlashOpen(true);
      setSlashIndex(0);
      setTimeout(computeSlashPosition, 0);
    } else {
      setSlashOpen(false);
    }
  };

  const executeSlashCommand = (cmd: typeof slashCommands[0]) => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const selStart = textarea.selectionStart;
    const text = editContent;
    const textBefore = text.slice(0, selStart);
    const lines = textBefore.split('\n');
    const currentLine = lines[lines.length - 1];

    // Remove the slash command text from current line
    const lineStart = textBefore.length - currentLine.length;
    const before = text.slice(0, lineStart);
    const after = text.slice(selStart);

    const newText = before + cmd.insert + after;
    setEditContent(newText);
    setSlashOpen(false);

    // Update note immediately
    if (note) updateNote(note.id, { title: editTitle, content: newText });

    setTimeout(() => {
      if (textarea) {
        const cursorPos = lineStart + cmd.insert.length + (cmd.cursor || 0);
        textarea.selectionStart = cursorPos;
        textarea.selectionEnd = cursorPos;
        textarea.focus();
      }
    }, 10);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (slashOpen) {
        setSlashOpen(false);
        e.preventDefault();
        return;
      }
      saveEdit();
      return;
    }

    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[slashIndex]) {
          executeSlashCommand(filteredCommands[slashIndex]);
        }
        return;
      }
    }
  };

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Select a note to begin</p>
      </div>
    );
  }

  if (note.type === 'canvas') return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={note.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-1 overflow-y-auto"
      >
        <div ref={editorContainerRef} className="w-full px-6 py-6 relative group">
          {/* Read/Edit Toggle */}
          <button
            onClick={() => {
              if (isEditing) saveEdit();
              else startEditing('content');
            }}
            className={`absolute top-6 right-6 p-2 rounded-md transition-all duration-200 z-10 ${
              isEditing 
                ? 'text-accent bg-accent/10 hover:bg-accent/20' 
                : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-surface-hover'
            }`}
            title={isEditing ? 'Switch to Read Mode' : 'Switch to Edit Mode'}
          >
            {isEditing ? <BookOpen size={16} /> : <Pencil size={16} />}
          </button>

          {/* Title */}
          {isEditing ? (
            <input
              ref={titleRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') contentRef.current?.focus();
                if (e.key === 'Escape') saveEdit();
              }}
              placeholder="Untitled"
              className="w-full font-display text-2xl font-normal text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50 mb-3"
            />
          ) : (
            <h1 onClick={() => startEditing('title')} className="font-display text-2xl font-normal text-foreground mb-3 cursor-text">
              {note.title || <span className="text-muted-foreground/50">Untitled</span>}
            </h1>
          )}

          {/* Content */}
          {isEditing ? (
            <div className="relative">
              <textarea
                ref={contentRef}
                value={editContent}
                onChange={handleContentChange}
                onBlur={() => { if (!slashOpen) saveEdit(); }}
                onKeyDown={handleContentKeyDown}
                className="w-full text-[15px] leading-[1.7] text-foreground bg-transparent outline-none resize-none font-sans overflow-hidden"
                placeholder="Start writing... (type / for commands)"
                style={{ minHeight: '60vh' }}
              />

              {/* Slash command menu */}
              <AnimatePresence>
                {slashOpen && filteredCommands.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute z-50 w-[240px] bg-card border border-border rounded-lg shadow-lg overflow-hidden"
                    style={{ top: slashPosition.top, left: slashPosition.left }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {filteredCommands.map((cmd, i) => (
                      <button
                        key={cmd.label}
                        onClick={() => executeSlashCommand(cmd)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-200 ${
                          i === slashIndex ? 'bg-surface-active' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <span className="text-xs font-mono text-accent w-6 text-center">{cmd.label.slice(0, 2)}</span>
                        <div>
                          <p className="text-sm text-foreground">{cmd.label}</p>
                          <p className="text-[11px] text-muted-foreground">{cmd.desc}</p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div onClick={() => startEditing('content')} className="text-[15px] leading-[1.7] text-foreground cursor-text min-h-[200px]">
              {note.content ? renderMarkdown(note.content, handleLinkClick) : (
                <p className="text-muted-foreground/50">Start writing...</p>
              )}
            </div>
          )}

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div className="mt-16 pt-6 border-t border-border">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Referenced by</p>
              {backlinks.map((bl) => (
                <button key={bl.id} onClick={() => setActiveNoteId(bl.id)}
                  className="block text-sm text-accent font-medium hover:underline mb-1">
                  {bl.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
