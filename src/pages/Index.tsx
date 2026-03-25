import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { sampleNotes, generateFocusData, createDefaultCanvasMainPages } from '../data/sampleData';
import { createDefaultCanvasMermaidDiagrams } from '../data/defaultCanvasErMermaid';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import CanvasView from '../components/CanvasView';
import NoteAdviserPanel from '../components/NoteAdviserPanel';
import FocusTimer from '../components/FocusTimer';
import QuickCapture from '../components/QuickCapture';

export default function Index() {
  const { activeView, notesSidebarCollapsed, notes, activeNoteId } = useAppStore();
  const editorColumnOpen =
    Boolean(activeNoteId && notes.some((n) => n.id === activeNoteId && n.type === 'text'));

  useEffect(() => {
    const store = useAppStore.getState();
    const ensureWorkspace = () => {
      if (store.workspaceNoteId) return;
      const existing =
        store.notes.find((n) => n.id === 'note-5') ||
        store.notes.find((n) => n.type === 'canvas');
      if (existing) {
        store.setWorkspaceNoteId(existing.id);
        return;
      }
      const id = `workspace-${Date.now()}`;
      store.addNote({
        id,
        title: 'Workspace',
        type: 'canvas',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        canvasCards: [],
        canvasArrows: [],
        canvasGroups: [],
        canvasShapes: [],
        canvasFreeTexts: [],
        canvasMermaidDiagrams: createDefaultCanvasMermaidDiagrams(),
        canvasMainPages: createDefaultCanvasMainPages(),
      });
      store.setWorkspaceNoteId(id);
    };
    if (store.notes.length === 0) {
      sampleNotes.forEach((n) => store.addNote(n));
      store.setActiveNoteId('note-1');
      ensureWorkspace();
      const focusData = generateFocusData();
      Object.keys(focusData).forEach((date) => {
        store.addTimerSession({ date, minutes: focusData[date], completedAt: Date.now() });
      });
    } else {
      ensureWorkspace();
    }
  }, []);

  const viewTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

  return (
    <div className="flex h-screen w-full min-w-[1280px] overflow-hidden bg-background">
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden" style={{ marginRight: 4 }}>
        <AnimatePresence mode="wait">
          {activeView === 'notes' && (
            <motion.div
              key="notes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={viewTransition}
              className="relative flex h-full min-h-0 min-w-0 flex-1"
            >
              <div className="absolute inset-0 min-h-0 min-w-0">
                <CanvasView />
              </div>
              {!notesSidebarCollapsed && (
                <div className="pointer-events-auto absolute inset-y-0 left-0 z-[40] flex shadow-[4px_0_24px_rgba(0,0,0,0.12)]">
                  <NoteList />
                  {editorColumnOpen && (
                    <div className="flex h-full min-h-0 min-w-0 max-w-[420px] w-[min(420px,40vw)] shrink-0 flex-col overflow-hidden border-r border-border bg-background">
                      <NoteEditor />
                    </div>
                  )}
                </div>
              )}
              <NoteAdviserPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FocusTimer />
      <QuickCapture />
    </div>
  );
}
