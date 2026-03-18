import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Hexagon, BarChart3, Settings } from 'lucide-react';
import { useAppStore, ViewType } from '../store/appStore';

const navItems: { id: ViewType; icon: React.ElementType; label: string }[] = [
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'graph', icon: Hexagon, label: 'Graph' },
  { id: 'tracker', icon: BarChart3, label: 'Tracker' },
];

interface SidebarProps {
  onTimerClick: () => void;
  timerRunning: boolean;
}

export default function AppSidebar({ onTimerClick, timerRunning }: SidebarProps) {
  const { activeView, setActiveView } = useAppStore();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div className="w-sidebar h-screen flex flex-col items-center py-4 bg-surface border-r border-border flex-shrink-0 relative z-20">
      {/* Top nav icons */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => setActiveView(item.id)}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-spring-micro ${
                  isActive
                    ? 'bg-surface-active text-foreground'
                    : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                }`}
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
                    {item.label}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Timer button */}
      <div className="flex flex-col items-center gap-1 mb-1">
        <div className="relative">
          <button
            onClick={onTimerClick}
            onMouseEnter={() => setHoveredItem('timer')}
            onMouseLeave={() => setHoveredItem(null)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-spring-micro"
          >
            <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] border-current flex items-center justify-center ${timerRunning ? 'animate-pulse-ring' : ''}`}>
              <div className="w-1 h-1 rounded-full bg-current" />
            </div>
          </button>
          <AnimatePresence>
            {hoveredItem === 'timer' && (
              <motion.div
                initial={{ opacity: 0, x: -4, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -4, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
                className="absolute left-12 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs px-2.5 py-1 rounded-full whitespace-nowrap z-50 pointer-events-none"
              >
                Focus Timer
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Settings (pinned bottom) */}
      <div className="relative">
        <button
          onClick={() => setActiveView('settings')}
          onMouseEnter={() => setHoveredItem('settings')}
          onMouseLeave={() => setHoveredItem(null)}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-spring-micro ${
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
