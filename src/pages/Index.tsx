import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/appStore';
import { sampleNotes, generateFocusData, generateTimerSessions } from '../data/sampleData';
import AppSidebar from '../components/AppSidebar';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import CanvasView from '../components/CanvasView';
import GraphView from '../components/GraphView';
import TrackerView from '../components/TrackerView';
import SettingsView from '../components/SettingsView';
import FocusTimer from '../components/FocusTimer';

export default function Index() {
  const { activeView, notes, activeNoteId, setActiveNoteId } = useAppStore();
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);

  // Initialize sample data on first load
  useEffect(() => {
    const store = useAppStore.getState();
    if (store.notes.length === 0) {
      sampleNotes.forEach((n) => store.addNote(n));
      store.setActiveNoteId('note-1');

      // Populate focus data
      const focusData = generateFocusData();
      Object.keys(focusData).forEach((date) => {
        store.addTimerSession({ date, minutes: focusData[date], completedAt: Date.now() });
      });
    }
  }, []);

  const activeNote = notes.find((n) => n.id === activeNoteId);
  const isCanvasNote = activeNote?.type === 'canvas';

  return (
    <div className="flex h-screen w-full min-w-[1280px] overflow-hidden bg-background">
      <AppSidebar onTimerClick={() => setTimerOpen(!timerOpen)} timerRunning={timerRunning} />

      <div className="flex flex-1 h-full overflow-hidden">
        <AnimatePresence mode="wait">
          {activeView === 'notes' && (
            <motion.div
              key="notes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex flex-1 h-full"
            >
              <NoteList />
              {isCanvasNote ? <CanvasView /> : <NoteEditor />}
            </motion.div>
          )}

          {activeView === 'graph' && (
            <motion.div
              key="graph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex flex-1 h-full"
            >
              <GraphView />
            </motion.div>
          )}

          {activeView === 'tracker' && (
            <motion.div
              key="tracker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex flex-1 h-full"
            >
              <TrackerView />
            </motion.div>
          )}

          {activeView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex flex-1 h-full"
            >
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FocusTimer />
    </div>
  );
}
