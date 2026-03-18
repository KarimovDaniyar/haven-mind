import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/appStore';

type AmbientSound = 'off' | 'rain' | 'white';

export default function FocusTimer() {
  const { addTimerSession } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [duration, setDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sound, setSound] = useState<AmbientSound>('off');
  const [volume, setVolume] = useState(0.3);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [minutesToday, setMinutesToday] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Position state for dragging
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const progress = 1 - timeLeft / (duration * 60);

  // Timer countdown
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            setIsRunning(false);
            handleComplete();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const handleComplete = useCallback(() => {
    // Chime
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
    } catch (e) {}

    // Log session
    const today = new Date().toISOString().split('T')[0];
    addTimerSession({ date: today, minutes: duration, completedAt: Date.now() });
    setSessionsToday((s) => s + 1);
    setMinutesToday((m) => m + duration);

    stopAmbientSound();
  }, [duration, addTimerSession]);

  // Ambient sound
  const startAmbientSound = useCallback((type: AmbientSound) => {
    stopAmbientSound();
    if (type === 'off') return;

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (type === 'rain' ? 0.3 : 0.15);
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = type === 'rain' ? 400 : 800;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume * 0.5, ctx.currentTime + 2);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      noiseNodeRef.current = source;
      gainNodeRef.current = gain;
    } catch (e) {}
  }, [volume]);

  const stopAmbientSound = useCallback(() => {
    try {
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 1);
        setTimeout(() => {
          noiseNodeRef.current?.stop();
          audioCtxRef.current?.close();
          audioCtxRef.current = null;
        }, 1500);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (isRunning && sound !== 'off') {
      startAmbientSound(sound);
    }
    return () => { if (!isRunning) stopAmbientSound(); };
  }, [sound, isRunning]);

  const handleStart = () => {
    setIsRunning(true);
    if (sound !== 'off') startAmbientSound(sound);
  };

  const handlePause = () => {
    setIsRunning(false);
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.linearRampToValueAtTime(volume * 0.15, audioCtxRef.current.currentTime + 0.5);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(duration * 60);
    stopAmbientSound();
  };

  const selectDuration = (mins: number) => {
    setDuration(mins);
    setTimeLeft(mins * 60);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Collapsed circle */}
      <motion.div
        className="fixed z-50"
        style={{
          right: position.x || 24,
          bottom: position.y || 24,
        }}
      >
        {!isOpen && (
          <motion.button
            onClick={() => setIsOpen(true)}
            whileHover={{ scale: 1.05 }}
            className="w-11 h-11 rounded-full bg-popover flex items-center justify-center shadow-lg relative"
            title={isRunning ? formatTime(timeLeft) : 'Focus Timer'}
          >
            {/* Progress ring */}
            {isRunning && (
              <svg className="absolute inset-0 w-11 h-11 -rotate-90">
                <circle
                  cx="22" cy="22" r="18"
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth="2"
                  strokeDasharray={`${progress * 113} 113`}
                  strokeLinecap="round"
                />
              </svg>
            )}
            <div className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center ${isRunning ? 'border-accent animate-pulse-ring' : 'border-popover-foreground/60'}`}>
              <div className={`w-1 h-1 rounded-full ${isRunning ? 'bg-accent' : 'bg-popover-foreground/60'}`} />
            </div>
          </motion.button>
        )}

        {/* Expanded widget */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-[280px] bg-popover rounded-2xl p-5 shadow-2xl"
              style={{ position: 'absolute', bottom: 0, right: 0 }}
            >
              {/* Close on outside click */}
              <div className="fixed inset-0 z-[-1]" onClick={() => setIsOpen(false)} />

              {/* Timer display */}
              <div className="text-center mb-4">
                <p className="font-display text-5xl font-light text-popover-foreground tracking-tight">
                  {formatTime(timeLeft)}
                </p>
              </div>

              {/* Duration selector */}
              {!isRunning && (
                <div className="flex gap-2 justify-center mb-4">
                  {[15, 25, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => selectDuration(m)}
                      className={`px-3 py-1 rounded-full text-xs border transition-spring-micro ${
                        duration === m
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
                    min="0"
                    max="1"
                    step="0.05"
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
                {!isRunning ? (
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
                      onClick={handleReset}
                      className="flex-1 py-2.5 text-popover-foreground/60 rounded-lg text-sm transition-spring-micro hover:text-popover-foreground"
                    >
                      ↺ Reset
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
