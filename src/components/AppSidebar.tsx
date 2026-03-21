import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Hexagon, BarChart3, Settings, Sun, Moon } from 'lucide-react';
import { useAppStore, ViewType } from '../store/appStore';

const navItems: { id: ViewType; icon: React.ElementType; label: string }[] = [
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'graph', icon: Hexagon, label: 'Graph' },
  { id: 'tracker', icon: BarChart3, label: 'Tracker' },
];

export default function AppSidebar() {
  const { activeView, setActiveView, notesSidebarCollapsed, setNotesSidebarCollapsed } = useAppStore();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const isNowDark = !isDark;
    setIsDark(isNowDark);
    if (isNowDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    // Dispatch a custom event so other components (like FocusTimer border) can update without global state
    window.dispatchEvent(new Event('theme-change'));
  };

  return (
    <div className="w-16 h-full bg-surface border-r border-border flex flex-col items-center py-6 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-40 relative">
      {/* Top nav icons */}
      <div className="flex flex-col items-center gap-1 flex-1 relative z-10">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          const notesCollapsedToggle = item.id === 'notes' && activeView === 'notes' && notesSidebarCollapsed;
          return (
            <div key={item.id} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (item.id === 'notes') {
                    if (activeView !== 'notes') {
                      setActiveView('notes');
                      setNotesSidebarCollapsed(false);
                    } else {
                      setNotesSidebarCollapsed(!notesSidebarCollapsed);
                    }
                  } else {
                    setActiveView(item.id);
                  }
                }}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors duration-200 ${
                  isActive && !(item.id === 'notes' && notesCollapsedToggle)
                    ? 'bg-surface-active text-foreground'
                    : notesCollapsedToggle
                      ? 'text-foreground bg-surface-hover ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                }`}
                title={
                  item.id === 'notes'
                    ? activeView !== 'notes'
                      ? 'Notes'
                      : notesSidebarCollapsed
                        ? 'Show notes panel'
                        : 'Hide notes panel'
                    : undefined
                }
              >
                <Icon size={18} strokeWidth={1.5} />
              </button>
              <AnimatePresence>
                {hoveredItem === item.id && (
                  <motion.div
                    initial={{ opacity: 0, x: -4, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -4, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
                    className="absolute left-12 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs px-2.5 py-1 rounded-full whitespace-nowrap z-50 pointer-events-none"
                  >
                    {item.id === 'notes' && activeView === 'notes'
                      ? notesSidebarCollapsed
                        ? 'Show notes'
                        : 'Hide notes'
                      : item.label}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Theme Toggle */}
      <div className="relative z-10 mb-2">
        <button
          onClick={toggleTheme}
          onMouseEnter={() => setHoveredItem('theme')}
          onMouseLeave={() => setHoveredItem(null)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors duration-200"
        >
          {isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
        </button>
        <AnimatePresence>
          {hoveredItem === 'theme' && (
            <motion.div
              initial={{ opacity: 0, x: -4, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -4, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
              className="absolute left-12 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs px-2.5 py-1 rounded-full whitespace-nowrap z-50 pointer-events-none shadow-sm border border-border"
            >
              Toggle Theme
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Settings */}
      <div className="relative z-10">
        <button
          onClick={() => setActiveView('settings')}
          onMouseEnter={() => setHoveredItem('settings')}
          onMouseLeave={() => setHoveredItem(null)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors duration-200 ${
            activeView === 'settings'
              ? 'bg-surface-active text-foreground'
              : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
          }`}
        >
          <Settings size={18} strokeWidth={1.5} />
        </button>
        <AnimatePresence>
          {hoveredItem === 'settings' && (
            <motion.div
              initial={{ opacity: 0, x: -4, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -4, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
              className="absolute left-12 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs px-2.5 py-1 rounded-full whitespace-nowrap z-50 pointer-events-none"
            >
              Settings
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
