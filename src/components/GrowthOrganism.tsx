import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';

function extractWikiLinks(content: string): number {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  return matches ? matches.length : 0;
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function computeStreak(focusData: Record<string, number>): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (focusData[key] && focusData[key] > 0) {
      streak++;
    } else if (i > 0) break;
  }
  return streak;
}

export default function GrowthOrganism() {
  const { notes, focusData, timerSessions } = useAppStore();
  const [hovered, setHovered] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevScoreRef = useRef(0);

  const stats = useMemo(() => {
    const totalNotes = notes.length;
    const totalCanvases = notes.filter((n) => n.type === 'canvas').length;
    const totalWords = notes.reduce((sum, n) => sum + countWords(n.content), 0);
    const totalLinks = notes.reduce((sum, n) => sum + extractWikiLinks(n.content), 0);
    const totalArrows = notes.reduce((sum, n) => sum + (n.canvasArrows?.length || 0), 0);
    const totalFocusMinutes = Object.values(focusData).reduce((s, v) => s + v, 0);
    const streak = computeStreak(focusData);
    const focusHours = Math.round(totalFocusMinutes / 60 * 10) / 10;

    const score =
      totalNotes * 2 +
      totalWords * 0.1 +
      totalLinks * 5 +
      totalArrows * 3 +
      totalFocusMinutes * 1 +
      totalCanvases * 4 +
      streak * 10;

    const growthLevel = Math.min(1.0, Math.log(score + 1) / Math.log(500));

    return { totalNotes, totalLinks, focusHours, score, growthLevel };
  }, [notes, focusData]);

  // Pulse on score change
  useEffect(() => {
    if (stats.score > prevScoreRef.current && prevScoreRef.current > 0) {
      setPulse(true);
      setTimeout(() => setPulse(false), 400);
    }
    prevScoreRef.current = stats.score;
  }, [stats.score]);

  const level = stats.growthLevel;
  const sidebarH = 500; // approximate usable sidebar height
  const cx = 28;
  const baseY = sidebarH - 16;
  const stemH = Math.max(20, level * (sidebarH - 100));
  const opacity = 0.15 + level * 0.15;

  const generatePaths = (): string[] => {
    const paths: string[] = [];
    const topY = baseY - stemH;

    // Seed/base blob
    const bw = 8 + level * 6;
    paths.push(
      `M ${cx - bw} ${baseY} Q ${cx} ${baseY - 12 * Math.min(level * 3, 1)}, ${cx + bw} ${baseY} Q ${cx} ${baseY + 6}, ${cx - bw} ${baseY} Z`
    );

    if (level > 0.05) {
      // Main stem
      const sw = 2 + level * 2;
      paths.push(
        `M ${cx - sw} ${baseY - 4} C ${cx - sw - 2} ${baseY - stemH * 0.4}, ${cx + sw + 1} ${baseY - stemH * 0.7}, ${cx + 1} ${topY + 4}
         L ${cx - 1} ${topY + 4}
         C ${cx - sw + 1} ${baseY - stemH * 0.65}, ${cx + sw - 2} ${baseY - stemH * 0.35}, ${cx + sw} ${baseY - 4} Z`
      );
    }

    // Branches
    if (level > 0.25) {
      const by = baseY - stemH * 0.35;
      paths.push(`M ${cx + 1} ${by} Q ${cx + 14} ${by - 12}, ${cx + 20} ${by - 6} Q ${cx + 16} ${by - 2}, ${cx + 1} ${by} Z`);
    }
    if (level > 0.4) {
      const by = baseY - stemH * 0.5;
      paths.push(`M ${cx - 1} ${by} Q ${cx - 16} ${by - 14}, ${cx - 22} ${by - 8} Q ${cx - 17} ${by - 3}, ${cx - 1} ${by} Z`);
    }
    if (level > 0.55) {
      const by = baseY - stemH * 0.65;
      paths.push(`M ${cx + 1} ${by} Q ${cx + 12} ${by - 10}, ${cx + 16} ${by - 4} Q ${cx + 11} ${by - 1}, ${cx + 1} ${by} Z`);
    }
    if (level > 0.7) {
      const by = baseY - stemH * 0.78;
      paths.push(`M ${cx - 1} ${by} Q ${cx - 10} ${by - 8}, ${cx - 14} ${by - 3} Q ${cx - 9} ${by}, ${cx - 1} ${by} Z`);
    }
    if (level > 0.85) {
      const by = baseY - stemH * 0.88;
      paths.push(`M ${cx} ${by} Q ${cx + 8} ${by - 6}, ${cx + 10} ${by - 2} Q ${cx + 7} ${by + 1}, ${cx} ${by} Z`);
    }

    return paths;
  };

  const paths = generatePaths();

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ pointerEvents: 'auto' }}
    >
      <motion.svg
        className="absolute inset-0 w-full h-full"
        animate={pulse ? { scale: [1, 1.03, 1] } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 20, duration: 0.4 }}
      >
        {paths.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="hsl(var(--accent))"
            opacity={opacity}
            initial={false}
            animate={{ d, opacity }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
          />
        ))}
      </motion.svg>

      <AnimatePresence>
        {hovered && level > 0.01 && (
          <motion.div
            initial={{ opacity: 0, x: -4, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
            className="absolute left-[60px] bottom-24 bg-popover text-popover-foreground rounded-xl px-3 py-2 z-50 shadow-lg whitespace-nowrap"
          >
            <p className="font-display text-[13px] mb-0.5">Your knowledge garden</p>
            <p className="text-[11px] text-popover-foreground/60">
              {stats.totalNotes} notes · {stats.totalLinks} connections · {stats.focusHours}h focus
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
