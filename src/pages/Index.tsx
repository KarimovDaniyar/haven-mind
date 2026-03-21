import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { sampleNotes, generateFocusData } from '../data/sampleData';
import AppSidebar from '../components/AppSidebar';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import CanvasView from '../components/CanvasView';
import GraphView from '../components/GraphView';
import TrackerView from '../components/TrackerView';
import SettingsView from '../components/SettingsView';
import FocusTimer from '../components/FocusTimer';
import QuickCapture from '../components/QuickCapture';

export default function Index() {
  const { activeView, rocketPanelCollapsed, notesSidebarCollapsed, notes, activeNoteId } = useAppStore();
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
        magnetGroups: [],
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
      <AppSidebar />

      <div 
        className="flex flex-1 h-full overflow-hidden relative"
        style={{ 
          marginRight: rocketPanelCollapsed ? 4 : 128, 
          transition: 'margin-right 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)' 
        }}
      >
        <AnimatePresence mode="wait">
          {activeView === 'notes' && (
            <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={viewTransition} className="flex flex-1 h-full min-h-0 min-w-0">
              {!notesSidebarCollapsed && (
                <>
                  <NoteList />
                  {editorColumnOpen && (
                  <div className="w-[min(420px,40vw)] max-w-[420px] shrink-0 min-w-0 border-r border-border h-full min-h-0 overflow-hidden flex flex-col">
                    <NoteEditor />
                  </div>
                  )}
                </>
              )}
              <CanvasView />
            </motion.div>
          )}
          {activeView === 'graph' && (
            <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={viewTransition} className="flex flex-1 h-full">
              <GraphView />
            </motion.div>
          )}
          {activeView === 'tracker' && (
            <motion.div key="tracker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={viewTransition} className="flex flex-1 h-full">
              <TrackerView />
            </motion.div>
          )}
          {activeView === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={viewTransition} className="flex flex-1 h-full">
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <FocusTimer />
      <QuickCapture />
    </div>
  );
}
