import React, { useMemo } from 'react';
import { useAppStore } from '../store/appStore';

export default function TrackerView() {
  const { focusData, notes, timerSessions } = useAppStore();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Heatmap: 12 weeks × 7 days
  const heatmapData = useMemo(() => {
    const cells: { date: string; minutes: number; label: string }[] = [];
    for (let w = 11; w >= 0; w--) {
      for (let d = 6; d >= 0; d--) {
        const date = new Date(today);
        date.setDate(date.getDate() - (w * 7 + d));
        const key = date.toISOString().split('T')[0];
        cells.push({
          date: key,
          minutes: focusData[key] || 0,
          label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        });
      }
    }
    return cells;
  }, [focusData, today]);

  // Streak calculation
  const streak = useMemo(() => {
    let count = 0;
    const d = new Date(today);
    while (true) {
      const key = d.toISOString().split('T')[0];
      if (focusData[key] && focusData[key] > 0) {
        count++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return count;
  }, [focusData]);

  const bestStreak = useMemo(() => {
    let best = 0, current = 0;
    const d = new Date(today);
    for (let i = 0; i < 90; i++) {
      const key = d.toISOString().split('T')[0];
      if (focusData[key] && focusData[key] > 0) {
        current++;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
      d.setDate(d.getDate() - 1);
    }
    return best;
  }, [focusData]);

  // Focus time stats
  const todayMinutes = focusData[todayStr] || 0;
  const weekMinutes = useMemo(() => {
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      total += focusData[d.toISOString().split('T')[0]] || 0;
    }
    return total;
  }, [focusData]);

  // Bar chart data (last 7 days)
  const barData = useMemo(() => {
    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      bars.push({
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        minutes: focusData[key] || 0,
        isToday: i === 0,
      });
    }
    return bars;
  }, [focusData]);

  const maxBar = Math.max(...barData.map((b) => b.minutes), 1);

  // Notes stats
  const totalNotes = notes.length;
  const notesThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return notes.filter((n) => n.createdAt > weekAgo).length;
  }, [notes]);

  const getHeatColor = (minutes: number) => {
    if (minutes === 0) return 'bg-border';
    if (minutes <= 25) return 'bg-[#D4C4AE]';
    if (minutes <= 50) return 'bg-[#B89B74]';
    if (minutes <= 90) return 'bg-accent';
    return 'bg-accent-deep';
  };

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-8 py-12 space-y-12">
        {/* Writing Streak */}
        <section>
          <h2 className="font-display text-lg font-medium text-foreground mb-6">Writing streak</h2>
          <div className="flex flex-wrap gap-[3px]" style={{ maxWidth: 12 * (10 + 3) + 'px' }}>
            {heatmapData.map((cell, i) => (
              <div
                key={i}
                className={`w-[10px] h-[10px] rounded-[2px] ${getHeatColor(cell.minutes)} transition-spring-micro`}
                title={`${cell.label} · ${cell.minutes} min focus`}
              />
            ))}
          </div>
          <div className="mt-4 space-y-0.5">
            <p className="text-[13px] text-muted-foreground">{streak} day streak</p>
            <p className="text-xs text-muted-foreground">Best streak: {bestStreak} days</p>
          </div>
        </section>

        {/* Focus Time */}
        <section>
          <h2 className="font-display text-lg font-medium text-foreground mb-6">Focus time</h2>
          <div className="flex gap-12 mb-8">
            <div>
              <p className="font-display text-[32px] font-semibold text-foreground">{todayMinutes}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today (min)</p>
            </div>
            <div>
              <p className="font-display text-[32px] font-semibold text-foreground">{Math.floor(weekMinutes / 60)}h {weekMinutes % 60}m</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">This week</p>
            </div>
          </div>

          {/* Bar chart */}
          <div className="flex items-end gap-3 h-[100px]">
            {barData.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-[3px] transition-spring ${bar.isToday ? 'bg-accent' : 'bg-node-default'}`}
                  style={{ height: `${Math.max((bar.minutes / maxBar) * 80, 2)}px` }}
                />
                <span className="text-[11px] text-muted-foreground">{bar.day}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Notes Activity */}
        <section>
          <h2 className="font-display text-lg font-medium text-foreground mb-6">Notes written</h2>
          <div className="flex gap-12">
            <div>
              <p className="font-display text-[32px] font-semibold text-foreground">{totalNotes}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
            </div>
            <div>
              <p className="font-display text-[32px] font-semibold text-foreground">{notesThisWeek}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">This week</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
