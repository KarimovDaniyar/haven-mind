import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';

// Parse wiki-links from content
function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

// Render markdown to JSX
function renderMarkdown(text: string, onLinkClick: (title: string) => void): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const key = `line-${i}`;

    if (line.startsWith('# ')) {
      elements.push(<h1 key={key} className="font-display text-2xl font-semibold text-foreground mt-6 mb-2">{renderInline(line.slice(2), onLinkClick)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key} className="font-display text-lg font-medium text-foreground mt-5 mb-2">{renderInline(line.slice(3), onLinkClick)}</h2>);
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={key} className="border-l-2 border-accent pl-3 my-2 text-muted-foreground italic">
          {renderInline(line.slice(2), onLinkClick)}
        </blockquote>
      );
    } else if (line.match(/^(\d+)\.\s/)) {
      const content = line.replace(/^\d+\.\s/, '');
      elements.push(
        <div key={key} className="flex gap-2 my-0.5">
          <span className="text-muted-foreground">{line.match(/^(\d+)/)?.[1]}.</span>
          <span>{renderInline(content, onLinkClick)}</span>
        </div>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={key} className="flex gap-2 my-0.5 ml-1">
          <span className="text-accent mt-0.5">•</span>
          <span>{renderInline(line.slice(2), onLinkClick)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={key} className="h-3" />);
    } else {
      elements.push(<p key={key} className="my-1">{renderInline(line, onLinkClick)}</p>);
    }
  });

  return elements;
}

function renderInline(text: string, onLinkClick: (title: string) => void): React.ReactNode {
  // Split by inline patterns
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[\[(.+?)\]\])/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push(<strong key={idx++} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={idx++} className="italic">{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={idx++} className="font-mono text-sm bg-surface-active px-1 py-0.5 rounded">{match[4]}</code>);
    } else if (match[5]) {
      parts.push(
        <button
          key={idx++}
          onClick={(e) => { e.stopPropagation(); onLinkClick(match![5]); }}
          className="text-accent font-medium border-b border-dotted border-accent/50 hover:border-accent transition-spring-micro"
        >
          {match[5]}
        </button>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function NoteEditor() {
  const { notes, activeNoteId, updateNote, setActiveNoteId } = useAppStore();
  const note = notes.find((n) => n.id === activeNoteId);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (note) {
      setEditTitle(note.title);
      setEditContent(note.content);
      setIsEditing(false);
    }
  }, [activeNoteId]);

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

  const startEditing = () => {
    if (!note) return;
    setIsEditing(true);
    setTimeout(() => contentRef.current?.focus(), 50);
  };

  const saveEdit = () => {
    if (!note) return;
    updateNote(note.id, { title: editTitle, content: editContent });
    setIsEditing(false);
  };

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Select a note to begin</p>
        </div>
      </div>
    );
  }

  if (note.type === 'canvas') {
    // Canvas will be rendered by parent — just indicate
    return null;
  }

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
        <div className="max-w-[680px] mx-auto px-8 py-12">
          {/* Title */}
          {isEditing ? (
            <input
              ref={titleRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Untitled"
              className="w-full font-display text-2xl font-normal text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50 mb-6"
            />
          ) : (
            <h1
              onClick={startEditing}
              className="font-display text-2xl font-normal text-foreground mb-6 cursor-text"
            >
              {note.title || <span className="text-muted-foreground/50">Untitled</span>}
            </h1>
          )}

          {/* Content */}
          {isEditing ? (
            <textarea
              ref={contentRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => { if (e.key === 'Escape') saveEdit(); }}
              className="w-full min-h-[60vh] text-[15px] leading-[1.7] text-foreground bg-transparent outline-none resize-none font-sans"
              placeholder="Start writing..."
            />
          ) : (
            <div
              onClick={startEditing}
              className="text-[15px] leading-[1.7] text-foreground cursor-text min-h-[200px]"
            >
              {note.content ? (
                renderMarkdown(note.content, handleLinkClick)
              ) : (
                <p className="text-muted-foreground/50">Start writing...</p>
              )}
            </div>
          )}

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div className="mt-16 pt-6 border-t border-border">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Referenced by</p>
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  onClick={() => setActiveNoteId(bl.id)}
                  className="block text-sm text-accent font-medium hover:underline mb-1"
                >
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
