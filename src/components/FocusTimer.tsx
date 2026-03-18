import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Pause } from 'lucide-react';
import { useAppStore } from '../store/appStore';

type AmbientSound = 'off' | 'rain' | 'white' | 'hum';

interface AudioState {
  ctx: AudioContext;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
}

export default function FocusTimer() {
  const { addTimerSession, timerRunning, setTimerRunning, rocketPanelCollapsed, setRocketPanelCollapsed } = useAppStore();

  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sound, setSound] = useState<AmbientSound>('off');
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);
  
  const [customMin, setCustomMin] = useState('');
  const [aborting, setAborting] = useState(false);
  const [arrivedGlow, setArrivedGlow] = useState(false);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioState | null>(null);
  const abortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync running state to global store (for overlay)
  useEffect(() => {
    setTimerRunning(running && !isPaused);
  }, [running, isPaused, setTimerRunning]);

  // Stars Generation
  const stars = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    size: Math.random() < 0.6 ? 1 : Math.random() < 0.9 ? 1.5 : 2,
    left: Math.random() * 128,
    startTop: Math.random() * 100,
    opacity: 0.3 + Math.random() * 0.5,
    speedIdle: 20 + Math.random() * 40,
    speedFlying: 8 + Math.random() * 7,
  })), []);

  // Timer Tick
  useEffect(() => {
    if (running && !isPaused && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((t) => {
          if (t <= 1) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            handleComplete();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, isPaused, remaining]);

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

  const handleComplete = useCallback(() => {
    // Arrival sequence
    setArrivedGlow(true);
    setRunning(false);
    
    // Multi-tone chime
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
    } catch (e) {}

    const today = new Date().toISOString().split('T')[0];
    const mins = Math.round(duration / 60);
    addTimerSession({ date: today, minutes: mins, completedAt: Date.now() });

    stopSound();

    setTimeout(() => {
      setArrivedGlow(false);
      setRemaining(duration);
    }, 2000);
  }, [duration, addTimerSession, stopSound]);

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

  const selectDuration = (m: number) => {
    const d = m * 60;
    setDuration(d);
    setRemaining(d);
    setCustomMin('');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomMin(val);
    if (val) {
      const d = parseInt(val, 10) * 60;
      setDuration(d);
      setRemaining(d);
    }
  };

  const launch = () => {
    if (remaining > 0) {
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isFlying = running && !isPaused;

  const getPlanetInfo = () => {
    const m = duration / 60;
    if (m <= 15) return { name: 'MOON', color: '#8A8A8A', size: 18 };
    if (m <= 30) return { name: 'MARS', color: '#C1440E', size: 22 };
    if (m <= 50) return { name: 'JUPITER', color: '#C88B3A', size: 32 };
    if (m <= 70) return { name: 'SATURN', color: '#D4A843', size: 28 };
    return { name: 'NEPTUNE', color: '#2E4482', size: 24 };
  };

  const planet = getPlanetInfo();

  // Animation values
  // Distance: Rocket is at 50% bottom when flying, planet starts offscreen top.
  // Actually, let's map planet Y:
  // idle: 40px from top
  // flying: from -100px to window height / 2 (rocket position)
  const windowHalf = typeof window !== 'undefined' ? window.innerHeight / 2 : 400;
  const planetY = running 
    ? (arrivedGlow ? windowHalf : -100 + ((duration - remaining) / duration) * (windowHalf + 100))
    : 40;

  const rocketY = running ? '50%' : '70%';

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
          from { transform: translateX(-50%) rotate(0deg); }
          to { transform: translateX(-50%) rotate(360deg); }
        }
      `}</style>
      
      {/* Global Arrived Glow */}
      <div 
        className={`fixed inset-0 pointer-events-none z-40 transition-opacity duration-1000 ${arrivedGlow ? 'opacity-100' : 'opacity-0'}`}
        style={{ boxShadow: 'inset -30px 0 60px rgba(139,111,71,0.2)' }}
      />

      <div 
        className={`fixed right-0 top-0 h-screen bg-[#0D0D12] border-l z-50 flex flex-col items-center transition-transform duration-[400ms] cubic-bezier(0.175, 0.885, 0.32, 1.275)`}
        style={{ 
          width: 128, 
          transform: `translateX(${rocketPanelCollapsed ? 124 : 0}px)`,
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
                opacity: arrivedGlow ? 0 : s.opacity,
                transform: arrivedGlow ? 'scale(3)' : 'scale(1)',
                transition: arrivedGlow ? 'all 0.6s ease-out' : 'none',
                animation: `driftDown ${isFlying ? s.speedFlying : s.speedIdle}s linear infinite`,
                animationDelay: `-${Math.random() * 20}s`
              }}
            />
          ))}
        </div>

        {/* --- DYNAMIC SCENE --- */}

        {/* Planet */}
        <div 
          className="absolute left-1/2 flex flex-col items-center pointer-events-none z-10"
          style={{ transform: `translate(-50%, ${planetY}px)`, transition: running ? 'transform 1s linear' : 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          <div className="relative" style={{ width: planet.size, height: planet.size, animation: !running ? 'rotatePlanet 30s linear infinite' : 'none' }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${planet.size} ${planet.size}`}>
              <circle cx={planet.size/2} cy={planet.size/2} r={planet.size/2} fill={planet.color} />
              {planet.name === 'MOON' && (
                <>
                  <circle cx={planet.size*0.3} cy={planet.size*0.4} r={planet.size*0.15} fill="rgba(0,0,0,0.2)" />
                  <circle cx={planet.size*0.7} cy={planet.size*0.3} r={planet.size*0.1} fill="rgba(0,0,0,0.2)" />
                  <circle cx={planet.size*0.6} cy={planet.size*0.7} r={planet.size*0.12} fill="rgba(0,0,0,0.2)" />
                </>
              )}
              {planet.name === 'JUPITER' && (
                <>
                  <rect x="0" y={planet.size*0.2} width={planet.size} height={planet.size*0.15} fill="rgba(80,40,0,0.2)" />
                  <rect x="0" y={planet.size*0.5} width={planet.size} height={planet.size*0.2} fill="rgba(80,40,0,0.3)" />
                  <rect x="0" y={planet.size*0.8} width={planet.size} height={planet.size*0.1} fill="rgba(80,40,0,0.2)" />
                </>
              )}
              {planet.name === 'SATURN' && (
                <ellipse cx={planet.size/2} cy={planet.size/2} rx={planet.size*0.8} ry={planet.size*0.2} fill="none" stroke="#B8924A" strokeWidth="2" transform={`rotate(-20 ${planet.size/2} ${planet.size/2})`} />
              )}
            </svg>
          </div>
          {(!running || arrivedGlow) && (
            <span className="mt-2 text-[9px] font-sans tracking-[0.1em] font-medium" style={{ color: arrivedGlow ? '#6B8F71' : 'rgba(255,255,255,0.4)' }}>
              {arrivedGlow ? 'ARRIVED' : planet.name}
            </span>
          )}
        </div>

        {/* Trajectory dotted line */}
        {!running && (
          <div 
            className="absolute left-1/2 -translate-x-1/2 w-px border-l border-white/20 border-dotted opacity-30 z-0"
            style={{ 
              top: planetY + planet.size + 20, 
              bottom: `calc(${100 - parseInt(rocketY)}% + 30px)` 
            }} 
          />
        )}

        {/* Time display (Flying) */}
        <AnimatePresence>
          {running && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="absolute left-0 w-full flex flex-col items-center pointer-events-none z-20"
              style={{ top: `calc(${rocketY} - 80px)` }}
            >
              <div className="font-display text-[28px] font-light text-[#F9F7F4] tracking-tight">{formatTime(remaining)}</div>
              <div className="text-[8px] tracking-[0.1em] text-white/40 mt-1 uppercase">→ {planet.name}</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rocket */}
        <div 
          className="absolute left-1/2 w-6 h-12 z-20 pointer-events-none"
          style={{ 
            top: rocketY, 
            animation: !running ? 'hoverRocket 4s ease-in-out infinite' : 'driftRocket 6s ease-in-out infinite',
            transition: 'top 1s cubic-bezier(0.4, 0, 0.2, 1)' 
          }}
        >
          <svg width="24" height="48" viewBox="0 0 24 48">
            <rect x="0" y="6" width="24" height="38" rx="12" fill="#F9F7F4" />
            <polygon points="0,32 -6,44 0,44" fill="#C4B09A" transform="translate(6, 0)" />
            <polygon points="24,32 30,44 24,44" fill="#C4B09A" transform="translate(-6, 0)" />
            <circle cx="12" cy="20" r="4" fill="none" stroke="#8B6F47" strokeWidth="1.5" />
          </svg>
          
          {/* Flame */}
          {running && !arrivedGlow && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full flex justify-center w-full" style={{ mixBlendMode: 'screen' }}>
              <div className="w-4 h-6 rounded-b-full bg-gradient-to-b from-[#8B6F47] to-transparent opacity-60 absolute" style={{ animation: 'flickerFlame 200ms ease-in-out infinite alternate' }} />
              <div className="w-2 h-4 rounded-b-full bg-white opacity-90 absolute top-0" style={{ animation: 'flickerFlame 150ms ease-in-out infinite alternate-reverse' }} />
            </div>
          )}
        </div>

        {/* Launchpad line */}
        <AnimatePresence>
          {!running && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute left-1/2 -translate-x-1/2 h-px bg-white/10 w-[60px] z-10"
              style={{ top: `calc(${rocketY} + 50px)` }}
            />
          )}
        </AnimatePresence>


        <div className="w-full h-full flex flex-col items-center z-30 relative py-6 px-4">
          
          {/* Middle: Presets (IDLE only) */}
          <div className={`absolute top-[40%] -translate-y-1/2 flex flex-col items-center w-full transition-opacity duration-300 ${running ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <span className="text-[8px] text-white/30 tracking-[0.15em] mb-3">MISSION</span>
            <div className="flex flex-col gap-1.5 w-full items-center">
              {[15, 25, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  onClick={() => selectDuration(m)}
                  className={`w-[56px] h-[24px] rounded-full text-[11px] font-medium transition-colors ${
                    duration === m * 60
                      ? 'border border-[#8B6F47] bg-[#8B6F47]/20 text-[#F9F7F4]'
                      : 'border border-white/15 bg-transparent text-white/50 hover:bg-white/5'
                  }`}
                >
                  {m}m
                </button>
              ))}
              <input
                value={customMin}
                onChange={handleCustomChange}
                placeholder="mm"
                className="w-[56px] bg-transparent border-b border-white/20 text-[#F9F7F4] text-[12px] text-center mt-2 pb-0.5 outline-none focus:border-[#8B6F47] transition-colors placeholder:text-white/30"
              />
            </div>
          </div>

          {/* Bottom: Controls */}
          <div className="flex flex-col items-center gap-4 mt-auto">
            {/* Audio Toggles */}
            <div className="flex gap-2">
              <button 
                onClick={() => setSound('off')} 
                className={`text-[14px] transition-colors ${sound === 'off' ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                title="Sound Off"
              >☁</button>
              <button 
                onClick={() => setSound('white')} 
                className={`text-[14px] transition-colors ${sound === 'white' ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                title="White Noise"
              >〜</button>
              <button 
                onClick={() => setSound('hum')} 
                className={`text-[14px] transition-colors ${sound === 'hum' ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                title="Space Hum"
              >⚡</button>
            </div>

            {/* Launch / Abort */}
            {!running ? (
              <button
                onClick={launch}
                className="w-[80px] h-[32px] rounded-full bg-[#8B6F47] hover:bg-[#9B7F57] text-[#F9F7F4] text-[9px] font-sans font-semibold tracking-[0.12em] uppercase transition-all hover:scale-[1.02]"
              >
                Launch
              </button>
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
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
