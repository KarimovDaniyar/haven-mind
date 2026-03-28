import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Pause } from 'lucide-react';
import { MissionDestination, MISSION_REQUIRED_FUEL, useAppStore } from '../store/appStore';
import { renderPlanetIcon } from './PlanetRenderer';

type AmbientSound = 'off' | 'rain' | 'white' | 'hum';

interface AudioState {
  ctx: AudioContext;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
}

const DESTINATION_META: Record<MissionDestination, {
  label: string;
  focusMinutes: number;
  requiredFuel: number;
  color: string;
  size: number;
}> = {
  MOON: { label: 'Moon', focusMinutes: 30, requiredFuel: 100, color: '#8A8A8A', size: 20 },
  MARS: { label: 'Mars', focusMinutes: 90, requiredFuel: 300, color: '#C1440E', size: 24 },
  JUPITER: { label: 'Jupiter', focusMinutes: 210, requiredFuel: 600, color: '#C88B3A', size: 42 },
  SATURN: { label: 'Saturn', focusMinutes: 1440, requiredFuel: 1200, color: '#D4A843', size: 38 },
  NEPTUNE: { label: 'Neptune', focusMinutes: 2880, requiredFuel: 2500, color: '#2E4482', size: 30 },
};

const DESTINATION_ROUTE: MissionDestination[] = ['MOON', 'MARS', 'JUPITER', 'SATURN', 'NEPTUNE'];

const ROCKET_PANEL_WIDTH = 340;

function parseDurationInput(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const m = Number.parseInt(t, 10);
    return m > 0 ? m : null;
  }
  let minutes = 0;
  let matched = false;
  const hourRe = /(\d+)\s*h(?:our)?s?\b/gi;
  const minRe = /(\d+)\s*m(?:in)?(?:ute)?s?\b/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hourRe.exec(t)) !== null) {
    minutes += Number.parseInt(hm[1], 10) * 60;
    matched = true;
  }
  while ((hm = minRe.exec(t)) !== null) {
    minutes += Number.parseInt(hm[1], 10);
    matched = true;
  }
  if (matched && minutes > 0) return minutes;
  return null;
}

export default function FocusTimer() {
  const {
    addTimerSession,
    setTimerRunning,
    rocketPanelCollapsed,
    setRocketPanelCollapsed,
    mission,
    launchMission,
    resetMission,
    keepExploringMission,
  } = useAppStore();

  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sound, setSound] = useState<AmbientSound>('off');
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);
  
  const [aborting, setAborting] = useState(false);
  const [missionTitleDraft, setMissionTitleDraft] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<MissionDestination>('MOON');
  const [focusMinutesOverride, setFocusMinutesOverride] = useState<number | null>(null);
  const [missionTimeEditing, setMissionTimeEditing] = useState(false);
  const [missionTimeInput, setMissionTimeInput] = useState('');
  const [hoveredDestination, setHoveredDestination] = useState<MissionDestination | null>(null);
  const completionOpenRef = useRef(mission.completionCardOpen);
  const missionTimeInputRef = useRef<HTMLInputElement | null>(null);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioState | null>(null);
  const abortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef(duration);
  const focusMinutesCreditedRef = useRef(0);
  const focusSessionDrainedRef = useRef(false);

  const [sessionEndNotice, setSessionEndNotice] = useState<null | 'progress' | 'idle'>(null);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!sessionEndNotice) return;
    const t = setTimeout(() => setSessionEndNotice(null), 4200);
    return () => clearTimeout(t);
  }, [sessionEndNotice]);

  // Sync running state to global store (for overlay)
  useEffect(() => {
    setTimerRunning(running && !isPaused);
  }, [running, isPaused, setTimerRunning]);

  // Stars Generation
  const stars = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    size: Math.random() < 0.6 ? 1 : Math.random() < 0.9 ? 1.5 : 2,
    left: Math.random() * ROCKET_PANEL_WIDTH,
    startTop: Math.random() * 100,
    opacity: 0.3 + Math.random() * 0.5,
    speedIdle: 20 + Math.random() * 40,
    speedFlying: 8 + Math.random() * 7,
    delay: -(Math.random() * 20),
  })), []);

  // Sync theme
  useEffect(() => {
    const handleThemeChange = () => setIsDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('theme-change', handleThemeChange);
    return () => window.removeEventListener('theme-change', handleThemeChange);
  }, []);

  const stopSound = useCallback(() => {
    if (audioRef.current) {
      const { ctx, gain, sources } = audioRef.current;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 1);
      setTimeout(() => {
        sources.forEach(s => s.stop());
        ctx.close();
        audioRef.current = null;
      }, 2000);
    }
  }, []);

  // Timer tick: 1 min focus while running = +3 fuel (credited each full minute)
  useEffect(() => {
    if (!running || isPaused || focusSessionDrainedRef.current) return;

    intervalRef.current = setInterval(() => {
      setRemaining((t) => {
        const d = durationRef.current;
        if (t <= 1) {
          focusSessionDrainedRef.current = true;
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          const mFull = Math.floor(d / 60);
          if (mFull > focusMinutesCreditedRef.current) {
            useAppStore.getState().recordMissionFocusTicks(mFull - focusMinutesCreditedRef.current);
            focusMinutesCreditedRef.current = mFull;
          }
          queueMicrotask(() => {
            setRunning(false);
            const m = useAppStore.getState().mission;
            if (!m.completionCardOpen) {
              if (m.fuel > 0) setSessionEndNotice('progress');
              else setSessionEndNotice('idle');
            }
            const today = new Date().toISOString().split('T')[0];
            addTimerSession({
              date: today,
              minutes: Math.round(d / 60),
              completedAt: Date.now(),
            });
            stopSound();
            setRemaining(d);
          });
          return 0;
        }
        const nt = t - 1;
        const elapsed = d - nt;
        const mNow = Math.floor(elapsed / 60);
        if (mNow > focusMinutesCreditedRef.current) {
          useAppStore.getState().recordMissionFocusTicks(mNow - focusMinutesCreditedRef.current);
          focusMinutesCreditedRef.current = mNow;
        }
        return nt;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, isPaused, addTimerSession, stopSound]);

  const playCompletionChime = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const playTone = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + 1.5);
        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + 1.5);
      };
      playTone(440, 0);
      playTone(880, 0.15);
      playTone(1320, 0.3);
      setTimeout(() => ctx.close(), 2000);
    } catch {}
  }, []);

  useEffect(() => {
    if (!completionOpenRef.current && mission.completionCardOpen) {
      playCompletionChime();
      setSessionEndNotice(null);
      completionOpenRef.current = mission.completionCardOpen;
      return;
    }
    completionOpenRef.current = mission.completionCardOpen;
  }, [mission.completionCardOpen, playCompletionChime]);

  useEffect(() => {
    if (!mission.active || !mission.destination) {
      focusMinutesCreditedRef.current = 0;
      focusSessionDrainedRef.current = false;
    }
  }, [mission.active, mission.destination]);

  // Audio Engine
  useEffect(() => {
    if (sound === 'off' || !running || isPaused) {
      stopSound();
      return;
    }
    try {
      const ctx = new AudioContext();
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      masterGain.gain.value = 0;
      masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
      
      const sources: AudioBufferSourceNode[] = [];

      if (sound === 'white' || sound === 'rain') {
        const bufferSize = ctx.sampleRate * 2; // 2 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        
        const filter = ctx.createBiquadFilter();
        if (sound === 'rain') {
          filter.type = 'lowpass';
          filter.frequency.value = 400;
          masterGain.gain.value = 0.5;
        } else {
          filter.type = 'lowpass';
          filter.frequency.value = 1000;
          masterGain.gain.value = 0.1;
        }
        
        noise.connect(filter);
        filter.connect(masterGain);
        noise.start();
        sources.push(noise);
      } else if (sound === 'hum') {
        const osc1 = ctx.createOscillator();
        osc1.frequency.value = 60;
        const osc2 = ctx.createOscillator();
        osc2.frequency.value = 120;
        
        masterGain.gain.value = 0.02;
        osc1.connect(masterGain);
        osc2.connect(masterGain);
        osc1.start();
        osc2.start();
        // push dummy source with stop method
        sources.push({ stop: () => { osc1.stop(); osc2.stop(); } } as any);
      }

      audioRef.current = { ctx, gain: masterGain, sources };
    } catch (e) {}

    return stopSound;
  }, [sound, running, isPaused, stopSound]);

  const launch = () => {
    if (remaining > 0) {
      focusMinutesCreditedRef.current = 0;
      focusSessionDrainedRef.current = false;
      setSessionEndNotice(null);
      setRunning(true);
      setIsPaused(false);
    }
  };

  const startAbort = () => {
    setAborting(true);
    abortTimerRef.current = setTimeout(() => {
      setRunning(false);
      setIsPaused(false);
      setRemaining(duration);
      setAborting(false);
      stopSound();
    }, 600);
  };

  const cancelAbort = () => {
    setAborting(false);
    if (abortTimerRef.current) clearTimeout(abortTimerRef.current);
  };

  const cancelMission = () => {
    setRunning(false);
    setIsPaused(false);
    setAborting(false);
    setRemaining(duration);
    stopSound();
    resetMission();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatMinutesExact = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} h`;
    return `${hours} h ${mins} min`;
  };

  const isFlying = running && !isPaused;
  const hasMission = mission.active && !!mission.destination;
  const destination = mission.destination ? DESTINATION_META[mission.destination] : null;
  const planet = destination
    ? {
        name: mission.destination!,
        label: destination.label,
        color: destination.color,
        size: destination.size,
      }
    : null;
  const requiredFuel =
    mission.destination != null
      ? (mission.customRequiredFuel ?? MISSION_REQUIRED_FUEL[mission.destination])
      : 1;
  const missionFuel = destination ? Math.min(mission.fuel, requiredFuel) : 0;
  const missionProgress = destination && requiredFuel > 0 ? Math.min(1, missionFuel / requiredFuel) : 0;

  const panelHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
  const planetY = 98;
  const rocketStartY = Math.max(320, panelHeight - 240);
  const rocketTargetY = (planetY + (planet?.size || 20) + 26);
  const rocketY = hasMission ? rocketStartY - ((rocketStartY - rocketTargetY) * missionProgress) : rocketStartY;

  const effectiveSetupFocusMinutes =
    focusMinutesOverride ?? DESTINATION_META[selectedDestination].focusMinutes;

  const commitMissionTimeEdit = () => {
    const parsed = parseDurationInput(missionTimeInput);
    if (parsed != null && parsed > 0) setFocusMinutesOverride(parsed);
    else setFocusMinutesOverride(null);
    setMissionTimeEditing(false);
  };

  const launchMissionNow = () => {
    const cleanTitle = missionTitleDraft.trim();
    if (!cleanTitle) return;
    const defaultMins = DESTINATION_META[selectedDestination].focusMinutes;
    const focusMinutes = effectiveSetupFocusMinutes;
    const baseFuel = MISSION_REQUIRED_FUEL[selectedDestination];
    const scaledFuel = Math.max(1, Math.round((baseFuel * focusMinutes) / defaultMins));
    const missionSeconds = focusMinutes * 60;
    setDuration(missionSeconds);
    setRemaining(missionSeconds);
    launchMission(cleanTitle, selectedDestination, scaledFuel);
    focusSessionDrainedRef.current = false;
    focusMinutesCreditedRef.current = 0;
    setMissionTitleDraft('');
    setFocusMinutesOverride(null);
    setMissionTimeEditing(false);
  };

  const focusMinutesTotal = Math.max(0, Math.floor(mission.stats.focusMinutes));
  const focusDurationLabel = (() => {
    if (focusMinutesTotal < 60) return `${focusMinutesTotal} min`;
    const hours = Math.floor(focusMinutesTotal / 60);
    const minutes = focusMinutesTotal % 60;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes} min`;
  })();

  const routeBaseIconSize = (planetName: MissionDestination) => {
    if (planetName === 'JUPITER') return 33;
    if (planetName === 'SATURN') return 31;
    if (planetName === 'NEPTUNE') return 26;
    if (planetName === 'MARS') return 24;
    return 21;
  };

  const routeStops = useMemo(
    () => DESTINATION_ROUTE.map((d, i) => ({ destination: d, topPercent: 65 - i * 12 })),
    [],
  );

  const completionParticles = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2 + 0.35;
        const dist = 36 + (i % 3) * 10;
        return {
          id: i,
          dx: `${Math.round(Math.cos(angle) * dist)}px`,
          dy: `${Math.round(Math.sin(angle) * dist)}px`,
          delay: i * 0.45,
          size: 2 + (i % 2),
        };
      }),
    [],
  );

  useEffect(() => {
    if (!missionTimeEditing) return;
    const el = missionTimeInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [missionTimeEditing]);

  return (
    <>
      <style>{`
        @keyframes driftDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(100vh); }
        }
        @keyframes rotateBlob {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes hoverRocket {
          0% { transform: translateY(-4px) translateX(-50%); }
          50% { transform: translateY(0px) translateX(-50%); }
          100% { transform: translateY(-4px) translateX(-50%); }
        }
        @keyframes driftRocket {
          0% { transform: translateX(calc(-50% - 2px)); }
          50% { transform: translateX(calc(-50% + 2px)); }
          100% { transform: translateX(calc(-50% - 2px)); }
        }
        @keyframes flickerFlame {
          0% { transform: scaleY(0.8); }
          50% { transform: scaleY(1.2); }
          100% { transform: scaleY(0.8); }
        }
        @keyframes rotatePlanet {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes missionCompleteParticle {
          0% { transform: translate(0, 0); opacity: 0.5; }
          100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
        }
      `}</style>

      <div
        className={`fixed right-0 top-0 h-screen bg-[#0D0D12] border-l z-50 flex flex-col items-center transition-transform duration-[400ms] cubic-bezier(0.175, 0.885, 0.32, 1.275)`}
        style={{
          width: ROCKET_PANEL_WIDTH,
          transform: `translateX(${rocketPanelCollapsed ? ROCKET_PANEL_WIDTH - 4 : 0}px)`,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)'
        }}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setRocketPanelCollapsed(!rocketPanelCollapsed)}
          className="absolute -left-3 top-4 w-6 h-6 bg-[#0D0D12] border border-white/10 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 transition-colors z-50"
        >
          {rocketPanelCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* --- BACKGROUND LAYER --- */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
          <div className="absolute top-1/4 left-1/2 w-[200px] h-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[40px] mix-blend-screen" style={{ background: 'radial-gradient(circle, rgba(139,111,71,0.15) 0%, transparent 70%)', animation: 'rotateBlob 120s linear infinite' }} />
          <div className="absolute bottom-1/4 left-1/2 w-[180px] h-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[40px] mix-blend-screen" style={{ background: 'radial-gradient(circle, rgba(107,78,140,0.12) 0%, transparent 70%)', animation: 'rotateBlob 90s reverse infinite' }} />
        </div>

        {/* Stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {stars.map((s) => (
            <div
              key={s.id}
              className="absolute bg-white rounded-full"
              style={{
                width: s.size,
                height: s.size,
                left: s.left,
                opacity: s.opacity,
                animation: `driftDown ${isFlying ? s.speedFlying : s.speedIdle}s linear infinite`,
                animationDelay: `${s.delay}s`
              }}
            />
          ))}
        </div>

        {/* --- DYNAMIC SCENE --- */}

        {!hasMission && (
          <>
            <div
              className="absolute left-1/2 -translate-x-1/2 w-px border-l border-white/20 border-dotted opacity-40 z-0"
              style={{ top: '18%', bottom: '22%' }}
            />

            {routeStops.map(({ destination: routeDestination, topPercent }) => {
              const meta = DESTINATION_META[routeDestination];
              const isHovered = hoveredDestination === routeDestination;
              const isSelected = selectedDestination === routeDestination;
              const baseSize = routeBaseIconSize(routeDestination);
              const iconSize = isSelected ? baseSize + 8 : isHovered ? baseSize + 4 : baseSize;
              const effectiveMins =
                isSelected
                  ? (focusMinutesOverride ?? meta.focusMinutes)
                  : meta.focusMinutes;

              return (
                <div
                  key={routeDestination}
                  className="absolute left-1/2 z-40 flex flex-col items-center transition-transform"
                  style={{
                    top: `${topPercent}%`,
                    transform: `translateX(-50%) scale(${isHovered || isSelected ? 1.08 : 1})`,
                  }}
                  onMouseEnter={() => setHoveredDestination(routeDestination)}
                  onMouseLeave={() => setHoveredDestination(null)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDestination(routeDestination);
                      setFocusMinutesOverride(null);
                      setMissionTimeEditing(false);
                    }}
                    className="rounded-full border transition-colors bg-transparent p-0 outline-none"
                    style={{
                      borderColor: isSelected ? '#8B6F47' : 'rgba(255,255,255,0.2)',
                      padding: isSelected ? 2 : 0,
                    }}
                  >
                    {renderPlanetIcon(routeDestination, iconSize)}
                  </button>
                  {isSelected && missionTimeEditing ? (
                    <input
                      ref={missionTimeInputRef}
                      value={missionTimeInput}
                      onChange={(e) => setMissionTimeInput(e.target.value)}
                      onBlur={commitMissionTimeEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitMissionTimeEdit();
                        }
                        if (e.key === 'Escape') {
                          setMissionTimeEditing(false);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-[88px] rounded border border-[#8B6F47]/60 bg-[#0D0D12] px-1 py-0.5 text-center text-[9px] text-[#F9F7F4] outline-none"
                      placeholder="2h, 90min"
                    />
                  ) : isSelected ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMissionTimeInput(formatMinutesExact(effectiveMins));
                        setMissionTimeEditing(true);
                      }}
                      className="mt-1 inline-flex items-center gap-1 text-[9px] text-white/55 hover:text-white/80"
                    >
                      <span>{formatMinutesExact(effectiveMins)}</span>
                      <span className="text-white/40" aria-hidden>✎</span>
                    </button>
                  ) : (
                    <span className="mt-1 text-[9px] text-white/45">{formatMinutesExact(meta.focusMinutes)}</span>
                  )}
                  <span
                    className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/65 transition-opacity"
                    style={{ opacity: isHovered || isSelected ? 1 : 0 }}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}

            <div
              className="absolute left-1/2 w-6 h-12 z-20 pointer-events-none"
              style={{ top: '78%', animation: 'hoverRocket 4s ease-in-out infinite' }}
            >
              <svg width="24" height="48" viewBox="0 0 24 48">
                <rect x="0" y="6" width="24" height="38" rx="12" fill="#F9F7F4" />
                <polygon points="0,32 -6,44 0,44" fill="#C4B09A" transform="translate(6, 0)" />
                <polygon points="24,32 30,44 24,44" fill="#C4B09A" transform="translate(-6, 0)" />
                <circle cx="12" cy="20" r="4" fill="none" stroke="#8B6F47" strokeWidth="1.5" />
              </svg>
            </div>
          </>
        )}

        {hasMission && planet && !mission.completionCardOpen && (
          <>
            <div
              className="absolute left-1/2 flex flex-col items-center pointer-events-none z-10"
              style={{
                transform: `translate(-50%, ${planetY}px)`,
                transition: running ? 'transform 1s linear' : 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div
                className="relative"
                style={{
                  width: planet.size,
                  height: planet.size,
                  animation: !running ? 'rotatePlanet 30s linear infinite' : 'none',
                }}
              >
                {renderPlanetIcon(planet.name, planet.size)}
              </div>
              {!running && (
                <span className="mt-2 text-[9px] font-sans tracking-[0.1em] font-medium text-white/40">
                  {planet.name}
                </span>
              )}
            </div>

            <div
              className="absolute left-1/2 -translate-x-1/2 w-px border-l border-white/20 border-dotted opacity-30 z-0"
              style={{
                top: planetY + planet.size + 20,
                bottom: Math.max(130, panelHeight - rocketY - 36),
              }}
            />

            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-6 h-12 z-30 pointer-events-none"
              animate={{ top: rocketY }}
              transition={{ type: 'spring', stiffness: 220, damping: 22, mass: 0.65 }}
              style={{ animation: running ? 'driftRocket 6s ease-in-out infinite' : 'hoverRocket 4s ease-in-out infinite' }}
            >
              <svg width="24" height="48" viewBox="0 0 24 48">
                <rect x="0" y="6" width="24" height="38" rx="12" fill="#F9F7F4" />
                <polygon points="0,32 -6,44 0,44" fill="#C4B09A" transform="translate(6, 0)" />
                <polygon points="24,32 30,44 24,44" fill="#C4B09A" transform="translate(-6, 0)" />
                <circle cx="12" cy="20" r="4" fill="none" stroke="#8B6F47" strokeWidth="1.5" />
              </svg>

              {running && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full flex justify-center w-full z-30" style={{ mixBlendMode: 'screen' }}>
                  <div className="w-4 h-6 rounded-b-full bg-gradient-to-b from-[#8B6F47] to-transparent opacity-80 absolute" style={{ animation: 'flickerFlame 200ms ease-in-out infinite alternate' }} />
                  <div className="w-2 h-4 rounded-b-full bg-white opacity-95 absolute top-0" style={{ animation: 'flickerFlame 150ms ease-in-out infinite alternate-reverse' }} />
                </div>
              )}
            </motion.div>

            <AnimatePresence>
              {running && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute inset-y-0 left-0 w-full flex flex-col items-center justify-center pointer-events-none z-20"
                >
                  <div className="font-display text-[28px] font-light text-[#F9F7F4] tracking-tight">{formatTime(remaining)}</div>
                  <div className="text-[8px] tracking-[0.1em] text-white/40 mt-1 uppercase">{planet.name}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        <div className="w-full h-full flex flex-col items-center z-30 relative py-6 px-4">
          {hasMission && !mission.completionCardOpen ? (
            <div className="absolute top-10 left-0 w-full px-4 text-center">
              <p className="text-[11px] font-sans uppercase tracking-[0.14em] text-white/50 truncate">
                {mission.title}
              </p>
              {mission.trophyMode && (
                <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#8B6F47]">Trophy</p>
              )}
              {sessionEndNotice === 'progress' && (
                <p className="mt-2 px-1 text-[10px] font-sans leading-snug text-white/55">
                  Session complete · Progress saved
                </p>
              )}
              {sessionEndNotice === 'idle' && (
                <p className="mt-2 px-1 text-[10px] font-sans leading-snug text-white/45">
                  Session ended · No activity recorded
                </p>
              )}
              {running && (
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSound('off')}
                    className={`text-[14px] transition-colors ${sound === 'off' ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                    title="Off"
                  >☁</button>
                  <button
                    type="button"
                    onClick={() => setSound('white')}
                    className={`text-[14px] transition-colors ${sound === 'white' ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                    title="White noise"
                  >〜</button>
                  <button
                    type="button"
                    onClick={() => setSound('rain')}
                    className={`text-[14px] transition-colors ${sound === 'rain' ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                    title="Rain"
                  >≋</button>
                </div>
              )}
            </div>
          ) : !hasMission ? (
            <div className="absolute top-[48px] left-0 w-full px-4">
              <label className="block text-center text-[10px] font-sans tracking-[0.12em] text-white/50 mb-2 uppercase">
                What do you want to master?
              </label>
              <input
                value={missionTitleDraft}
                onChange={(e) => setMissionTitleDraft(e.target.value)}
                placeholder="e.g. Learn red-black trees"
                className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-[12px] text-[#F9F7F4] outline-none focus:border-[#8B6F47] placeholder:text-white/30"
              />
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-4 mt-auto w-full">
            {hasMission && !mission.completionCardOpen ? (
              <>
                <div className="w-full">
                  <div className="h-[4px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${missionProgress * 100}%`, background: '#8B6F47' }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-center text-white/40 font-sans">
                    {missionFuel} / {requiredFuel}
                  </p>
                </div>

                {!running ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={launch}
                      className="w-[80px] h-[32px] rounded-full bg-[#8B6F47] hover:bg-[#9B7F57] active:bg-[#9B7F57] text-[#F9F7F4] text-[9px] font-sans font-semibold tracking-[0.12em] uppercase transition-colors hover:scale-[1.02] active:scale-[1.02]"
                    >
                      Launch
                    </button>
                    <button
                      onClick={cancelMission}
                      className="h-[32px] px-3 rounded-full border border-white/25 text-[9px] font-sans font-semibold tracking-[0.12em] uppercase text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => setIsPaused(!isPaused)}
                      className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/20 hover:text-white transition-colors"
                    >
                      {isPaused ? <ChevronRight size={12} fill="currentColor" /> : <Pause size={10} fill="currentColor" />}
                    </button>
                    <div
                      className="relative w-[80px] h-[32px] rounded-full border border-white/20 overflow-hidden"
                      onMouseDown={startAbort}
                      onMouseUp={cancelAbort}
                      onMouseLeave={cancelAbort}
                    >
                      <div
                        className="absolute inset-0 bg-[#EF4444]/40 scale-x-0 origin-left"
                        style={{ transition: aborting ? 'transform 600ms linear' : 'transform 0s', transform: aborting ? 'scaleX(1)' : 'scaleX(0)' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-white/40 text-[9px] font-sans font-medium tracking-[0.12em] uppercase select-none pointer-events-none">
                        Abort
                      </div>
                    </div>
                    <button
                      onClick={cancelMission}
                      className="h-[28px] px-3 rounded-full border border-white/20 text-[9px] font-sans font-semibold tracking-[0.12em] uppercase text-white/65 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Cancel Mission
                    </button>
                  </div>
                )}
              </>
            ) : !hasMission ? (
              <button
                onClick={launchMissionNow}
                disabled={!missionTitleDraft.trim()}
                className="w-[120px] h-[32px] rounded-full bg-[#8B6F47] hover:bg-[#9B7F57] disabled:opacity-40 disabled:hover:bg-[#8B6F47] text-[#F9F7F4] text-[9px] font-sans font-semibold tracking-[0.12em] uppercase transition-colors"
              >
                Launch Mission
              </button>
            ) : null}
          </div>

          {mission.completionCardOpen && destination && mission.destination && (
            <div className="absolute inset-0 z-[60] flex flex-col bg-[#0D0D12] px-4 pb-8 pt-10">
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {completionParticles.map((p) => (
                  <div
                    key={p.id}
                    className="absolute left-1/2 top-[120px] rounded-full bg-white"
                    style={
                      {
                        width: p.size,
                        height: p.size,
                        marginLeft: -p.size / 2,
                        marginTop: -p.size / 2,
                        opacity: 0.45,
                        '--dx': p.dx,
                        '--dy': p.dy,
                        animation: `missionCompleteParticle ${5 + (p.id % 3) * 0.6}s ease-out infinite`,
                        animationDelay: `${p.delay}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
              <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative flex items-center justify-center gap-3">
                    <div
                      className="flex items-center justify-center"
                      style={{
                        filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.22)) drop-shadow(0 0 36px rgba(139,111,71,0.35))',
                      }}
                    >
                      {renderPlanetIcon(mission.destination, 48)}
                    </div>
                    <div className="mb-0.5 shrink-0">
                      <svg width="24" height="48" viewBox="0 0 24 48" aria-hidden>
                        <rect x="0" y="6" width="24" height="38" rx="12" fill="#F9F7F4" />
                        <polygon points="0,32 -6,44 0,44" fill="#C4B09A" transform="translate(6, 0)" />
                        <polygon points="24,32 30,44 24,44" fill="#C4B09A" transform="translate(-6, 0)" />
                        <circle cx="12" cy="20" r="4" fill="none" stroke="#8B6F47" strokeWidth="1.5" />
                      </svg>
                    </div>
                  </div>
                </div>
                <h3 className="font-display mt-8 text-[22px] font-light tracking-tight text-white">
                  Mission Complete
                </h3>
                <p className="mt-2 max-w-[280px] truncate text-center text-[11px] text-white/45">{mission.title}</p>
                <p
                  className="mt-4 font-sans text-[11px] tracking-tight"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {mission.stats.notesCreated} notes · {mission.stats.linksCreated} links · {focusDurationLabel} focus
                </p>
              </div>
              <div className="relative z-[1] flex w-full max-w-[280px] flex-col gap-2 self-center">
                <button
                  type="button"
                  onClick={resetMission}
                  className="h-[36px] w-full rounded-full border border-white/25 bg-transparent text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-white/75 hover:border-white/40 hover:bg-white/5 hover:text-white"
                >
                  New Mission
                </button>
                <button
                  type="button"
                  onClick={keepExploringMission}
                  className="h-[36px] w-full rounded-full bg-[#8B6F47] text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-[#F9F7F4] hover:bg-[#9B7F57]"
                >
                  Keep Exploring
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
