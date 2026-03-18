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

export default function Index() {
  const { activeView, notes, activeNoteId, rocketPanelCollapsed, timerRunning } = useAppStore();

  useEffect(() => {
    const store = useAppStore.getState();
    if (store.notes.length === 0) {
      sampleNotes.forEach((n) => store.addNote(n));
      store.setActiveNoteId('note-1');
      const focusData = generateFocusData();
      Object.keys(focusData).forEach((date) => {
        store.addTimerSession({ date, minutes: focusData[date], completedAt: Date.now() });
      });
    }
  }, []);

  const activeNote = notes.find((n) => n.id === activeNoteId);
  const isCanvasNote = activeNote?.type === 'canvas';

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
            <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={viewTransition} className="flex flex-1 h-full">
              <NoteList />
              {isCanvasNote ? <CanvasView /> : <NoteEditor />}
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

        {/* Global Flight Overlay */}
        <div
          className={`absolute inset-0 bg-[#0D0D12]/[0.12] pointer-events-none transition-opacity duration-500 z-40 ${
            timerRunning ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      <FocusTimer />
    </div>
  );
}
