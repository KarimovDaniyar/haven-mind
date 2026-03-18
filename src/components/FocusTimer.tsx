import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';

type AmbientSound = 'off' | 'rain' | 'white';

interface AudioState {
  ctx: AudioContext;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
}

export default function FocusTimer() {
  const { addTimerSession, timerOpen, setTimerOpen, setTimerRunning } = useAppStore();

  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState<AmbientSound>('off');
  const [volume, setVolume] = useState(0.3);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [minutesToday, setMinutesToday] = useState(0);
  const [editingTime, setEditingTime] = useState(false);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [resetHolding, setResetHolding] = useState(false);
  const [resetProgress, setResetProgress] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioState | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetAnimRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const resetStartRef = useRef(0);

  // Dragging
  const [position, setPosition] = useState({ right: 24, bottom: 24 });
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null);

  const progress = duration > 0 ? 1 - remaining / duration : 0;

  // Sync running state to store
  useEffect(() => {
    setTimerRunning(running);
  }, [running, setTimerRunning]);

  // Countdown
  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((t) => {
          if (t <= 1) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            setRunning(false);
            handleComplete();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  const handleComplete = useCallback(() => {
    // Chime: sine 440→880hz
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => ctx.close(), 1000);
    } catch (e) {}

    const today = new Date().toISOString().split('T')[0];
    const mins = Math.round(duration / 60);
    addTimerSession({ date: today, minutes: mins, completedAt: Date.now() });
    setSessionsToday((s) => s + 1);
    setMinutesToday((m) => m + mins);

    // Fade out ambient sound
    stopSound(3);
  }, [duration, addTimerSession]);

  // ---- RAIN SOUND ----
  const startRain = useCallback((ctx: AudioContext, masterGain: GainNode) => {
    const frequencies = [200, 400, 800, 1200, 2000, 3000, 5000, 8000];
    const sources: AudioBufferSourceNode[] = [];
    const bufferSize = ctx.sampleRate * 2;

    frequencies.forEach((freq, i) => {
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        data[j] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.5;

      const nodeGain = ctx.createGain();
      nodeGain.gain.value = 0.08;

      // LFO for amplitude modulation
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.1 + Math.random() * 0.4;
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(nodeGain.gain);
      lfo.start();

      source.connect(filter);
      filter.connect(nodeGain);
      nodeGain.connect(masterGain);
      source.start();
      sources.push(source);
    });

    return sources;
  }, []);

  // ---- WHITE NOISE ----
  const startWhiteNoise = useCallback((ctx: AudioContext, masterGain: GainNode) => {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    const nodeGain = ctx.createGain();
    nodeGain.gain.value = 0.04;

    source.connect(filter);
    filter.connect(nodeGain);
    nodeGain.connect(masterGain);
    source.start();
    return [source];
  }, []);

  const startSound = useCallback((type: AmbientSound) => {
    stopSound(0);
    if (type === 'off') return;

    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);
      gain.connect(ctx.destination);

      const sources = type === 'rain' ? startRain(ctx, gain) : startWhiteNoise(ctx, gain);
      audioRef.current = { ctx, gain, sources };
    } catch (e) {}
  }, [volume, startRain, startWhiteNoise]);

  const stopSound = useCallback((fadeTime: number = 2) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const { ctx, gain, sources } = audio;
      if (fadeTime > 0) {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeTime);
        setTimeout(() => {
          sources.forEach((s) => { try { s.stop(); } catch(e) {} });
          ctx.close();
        }, fadeTime * 1000 + 200);
      } else {
        sources.forEach((s) => { try { s.stop(); } catch(e) {} });
        ctx.close();
      }
      audioRef.current = null;
    } catch (e) {}
  }, []);

  // Sound toggle
  useEffect(() => {
    if (running && sound !== 'off') {
      startSound(sound);
    } else if (!running || sound === 'off') {
      stopSound(2);
    }
    return () => {};
  }, [sound, running]);

  // Volume adjustment
  useEffect(() => {
    if (audioRef.current) {
      const { ctx, gain } = audioRef.current;
      gain.gain.linearRampToValueAtTime(running ? volume : volume * 0.3, ctx.currentTime + 0.3);
    }
  }, [volume, running]);

  const handleStart = () => {
    if (remaining <= 0) setRemaining(duration);
    setRunning(true);
  };

  const handlePause = () => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Quiet sound to 30%
    if (audioRef.current) {
      const { ctx, gain } = audioRef.current;
      gain.gain.linearRampToValueAtTime(volume * 0.3, ctx.currentTime + 0.5);
    }
  };

  // Reset with 500ms hold
  const handleResetDown = () => {
    setResetHolding(true);
    resetStartRef.current = Date.now();
    const animate = () => {
      const elapsed = Date.now() - resetStartRef.current;
      const p = Math.min(1, elapsed / 500);
      setResetProgress(p);
      if (p < 1) {
        resetAnimRef.current = requestAnimationFrame(animate);
      } else {
        // Reset!
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setRunning(false);
        setRemaining(duration);
        setResetHolding(false);
        setResetProgress(0);
        stopSound(1);
      }
    };
    resetAnimRef.current = requestAnimationFrame(animate);
  };

  const handleResetUp = () => {
    setResetHolding(false);
    setResetProgress(0);
    if (resetAnimRef.current) cancelAnimationFrame(resetAnimRef.current);
  };

  const selectDuration = (mins: number) => {
    const secs = mins * 60;
    setDuration(secs);
    setRemaining(secs);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleTimeEdit = () => {
    if (running) return;
    setEditingTime(true);
    setEditTimeValue(formatTime(remaining));
  };

  const commitTimeEdit = () => {
    setEditingTime(false);
    const parts = editTimeValue.split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(s)) {
        const total = m * 60 + s;
        setDuration(total);
        setRemaining(total);
      }
    }
  };

  // Dragging the collapsed button
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: position.right,
      startBottom: position.bottom,
    };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPosition({
        right: Math.max(8, dragRef.current.startRight - dx),
        bottom: Math.max(8, dragRef.current.startBottom - dy),
      });
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const circumference = 2 * Math.PI * 18; // r=18

  return (
    <>
      <motion.div
        className="fixed z-50"
        style={{ right: position.right, bottom: position.bottom }}
      >
        {!timerOpen && (
          <motion.button
            onClick={() => setTimerOpen(true)}
            onMouseDown={handleDragStart}
            whileHover={{ scale: 1.05 }}
            className="w-11 h-11 rounded-full bg-popover flex items-center justify-center shadow-lg relative"
            title={running ? formatTime(remaining) : 'Focus Timer'}
          >
            {/* Progress ring */}
            <svg className="absolute inset-0 w-11 h-11 -rotate-90">
              {running && (
                <circle
                  cx="22" cy="22" r="18"
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth="2"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (remaining / duration)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              )}
            </svg>
            <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center ${running ? 'border-accent animate-pulse-ring' : 'border-popover-foreground/60'}`}>
              <div className={`w-1 h-1 rounded-full ${running ? 'bg-accent' : 'bg-popover-foreground/60'}`} />
            </div>
          </motion.button>
        )}

        <AnimatePresence>
          {timerOpen && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-[280px] bg-popover rounded-2xl p-5 shadow-2xl"
              style={{ position: 'absolute', bottom: 0, right: 0 }}
            >
              <div className="fixed inset-0 z-[-1]" onClick={() => setTimerOpen(false)} />

              {/* Timer display */}
              <div className="text-center mb-4">
                {editingTime ? (
                  <input
                    autoFocus
                    value={editTimeValue}
                    onChange={(e) => setEditTimeValue(e.target.value)}
                    onBlur={commitTimeEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitTimeEdit(); if (e.key === 'Escape') setEditingTime(false); }}
                    className="font-display text-5xl font-light text-popover-foreground tracking-tight bg-transparent outline-none text-center w-full"
                  />
                ) : (
                  <p
                    className="font-display text-5xl font-light text-popover-foreground tracking-tight cursor-pointer"
                    onClick={handleTimeEdit}
                  >
                    {formatTime(remaining)}
                  </p>
                )}
              </div>

              {/* Duration presets */}
              {!running && (
                <div className="flex gap-2 justify-center mb-4">
                  {[15, 25, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => selectDuration(m)}
                      className={`px-3 py-1 rounded-full text-xs border transition-spring-micro ${
                        duration === m * 60
                          ? 'bg-popover-foreground/15 text-popover-foreground border-popover-foreground/30'
                          : 'text-popover-foreground/60 border-popover-foreground/20 hover:border-popover-foreground/40'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              )}

              {/* Sound selector */}
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-wider text-popover-foreground/40 mb-2">Ambient</p>
                <div className="flex gap-2">
                  {([
                    { id: 'off' as AmbientSound, label: 'Off', icon: '☁' },
                    { id: 'rain' as AmbientSound, label: 'Rain', icon: '🌧' },
                    { id: 'white' as AmbientSound, label: 'Noise', icon: '~' },
                  ]).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSound(s.id)}
                      className={`flex-1 py-1.5 rounded-md text-xs transition-spring-micro ${
                        sound === s.id
                          ? 'bg-accent/40 text-popover-foreground'
                          : 'text-popover-foreground/50 hover:text-popover-foreground/70'
                      }`}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
                {sound !== 'off' && (
                  <input
                    type="range"
                    min="0" max="1" step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-full mt-2 h-1.5 appearance-none rounded-full cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, hsl(var(--accent)) ${volume * 100}%, rgba(249,247,244,0.15) ${volume * 100}%)`,
                    }}
                  />
                )}
              </div>

              {/* Controls */}
              <div className="space-y-2">
                {!running ? (
                  <button
                    onClick={handleStart}
                    className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg font-display text-sm transition-spring-micro hover:opacity-90"
                  >
                    ▶ Start
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handlePause}
                      className="flex-1 py-2.5 text-popover-foreground/60 rounded-lg text-sm transition-spring-micro hover:text-popover-foreground"
                    >
                      ⏸ Pause
                    </button>
                    <button
                      onMouseDown={handleResetDown}
                      onMouseUp={handleResetUp}
                      onMouseLeave={handleResetUp}
                      className="flex-1 py-2.5 text-popover-foreground/60 rounded-lg text-sm transition-spring-micro hover:text-popover-foreground relative overflow-hidden"
                    >
                      {resetHolding && (
                        <div
                          className="absolute inset-0 bg-popover-foreground/10"
                          style={{ width: `${resetProgress * 100}%`, transition: 'none' }}
                        />
                      )}
                      <span className="relative">↺ Reset</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Session log */}
              {(sessionsToday > 0 || minutesToday > 0) && (
                <div className="mt-4 pt-3 border-t border-popover-foreground/10">
                  <p className="text-[11px] text-popover-foreground/40">
                    Today: {sessionsToday} session{sessionsToday !== 1 ? 's' : ''} · {minutesToday} min
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
