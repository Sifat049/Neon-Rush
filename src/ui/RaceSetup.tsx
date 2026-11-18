import { useGame } from '../store/gameStore';
import { TRACKS, registerCustomTrack } from '../game/tracks/definitions';
import { useMemo } from 'react';
import { loadTracks } from '../editor/storage';
import { compileDoc } from '../editor/compile';
import { CARS, getCar } from '../game/vehicles/cars';
import { formatTime } from '../game/core/math';
import type { GameMode } from '../game/core/types';
import { Credits, NeonButton, Panel, ScreenFrame, fmtNum } from './primitives';
import { getTrack } from '../game/tracks/trackData';
import { WEATHER_LIST } from '../game/weather/weather';

const MODES: { id: GameMode; name: string; desc: string }[] = [
  { id: 'quick', name: 'Quick Race', desc: 'Race 3 AI opponents for position and credits.' },
  { id: 'trial', name: 'Time Trial', desc: 'Alone against the clock. Records are saved.' },
  { id: 'challenge', name: 'Gravity Challenge', desc: 'Hit gravity gates on the right surface. Precision pays.' },
  { id: 'drift', name: 'Drift Challenge', desc: '90 s. Hold DRIFT + steer to build chains, score x2 in pink drift zones, bank before you crash.' },
  { id: 'stunt', name: 'Stunt Arena', desc: '90 s. Hit ramps, hold steer to spin and brake to flip, land clean to build combos.' },
  { id: 'police', name: 'Police Chase', desc: 'Outrun 3 police cars and EMP drones. Reach a green zone with nobody close, or ram them off.' },
  { id: 'free', name: 'Free Drive', desc: 'No timer. Explore and practise the controls.' },
];

export function RaceSetup() {
  const { mode, setMode, trackId, setTrack, save, startRace, go, buyTrack, selectCar, openGarage, weather, setWeather } = useGame();
  const owned = save.unlockedCars;
  const car = getCar(save.selectedCar);
  const cycle = (d: number) => {
    const list = CARS.filter((c) => owned.includes(c.id));
    const i = list.findIndex((c) => c.id === car.id);
    selectCar(list[(i + d + list.length) % list.length].id);
  };
  const customs = useMemo(() => loadTracks().map((d) => compileDoc(d).def).filter((d): d is NonNullable<typeof d> => !!d), []);
  useMemo(() => customs.forEach(registerCustomTrack), [customs]);
  const allTracks = [...TRACKS, ...customs];
  const isCustom = (id: string) => customs.some((c) => c.id === id);
  const unlocked = save.unlockedTracks.includes(trackId) || isCustom(trackId);
  return (
    <ScreenFrame title="RACE SETUP" subtitle="Choose mode · track · vehicle" onBack={() => go('menu')} right={<Credits n={save.credits} />}>
      <div className="pointer-events-none flex h-full min-h-0 flex-col gap-3">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {MODES.map((m) => (
            <NeonButton key={m.id} size="sm" variant={mode === m.id ? 'primary' : 'ghost'} onClick={() => setMode(m.id)}>{m.name}</NeonButton>
          ))}
        </div>
        <div className="text-[11px] tracking-[0.2em] text-cyan-100/70">{MODES.find((m) => m.id === mode)?.desc}</div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] tracking-[0.25em] text-cyan-100/60">WEATHER</span>
          <NeonButton size="sm" variant={weather === 'default' ? 'primary' : 'ghost'} onClick={() => setWeather('default')}>Map default</NeonButton>
          {WEATHER_LIST.map((w) => <NeonButton key={w.id} size="sm" variant={weather === w.id ? 'primary' : 'ghost'} onClick={() => setWeather(w.id)}>{w.icon} {w.name}</NeonButton>)}
        </div>
        <div className="nr-scroll pointer-events-auto grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 pr-1 sm:grid-cols-3">
          {allTracks.map((t) => {
            const isUnlocked = save.unlockedTracks.includes(t.id) || isCustom(t.id);
            const rec = save.records[t.id];
            const sel = t.id === trackId;
            const len = getTrack(t.id).length;
            return (
              <button key={t.id} onClick={() => setTrack(t.id)} className={`nr-panel relative overflow-hidden p-4 text-left transition hover:shadow-neon ${sel ? 'ring-2 ring-cyan-300 shadow-neon' : ''}`}>
                <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 80% 10%, ${t.palette.c}, transparent 55%), radial-gradient(circle at 10% 90%, ${t.palette.a}, transparent 55%)` }} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-lg font-black tracking-widest" style={{ color: t.palette.a, textShadow: `0 0 12px ${t.palette.a}` }}>{t.name}</div>
                    {!isUnlocked && <span className="rounded bg-black/50 px-2 py-1 text-[10px] text-amber-300">🔒 {fmtNum(t.unlockCost)}</span>}
                  </div>
                  <div className="text-[10px] tracking-[0.2em] text-cyan-100/60">{t.subtitle}</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-cyan-50/80 [@media(max-height:520px)]:hidden">{t.description}</p>
                  <div className="mt-3 flex gap-1 text-[10px] tracking-widest">
                    <span className="rounded bg-white/10 px-2 py-1">{(len / 1000).toFixed(1)} KM</span>
                    <span className="rounded bg-white/10 px-2 py-1">{t.laps} LAPS</span>
                    <span className="rounded bg-white/10 px-2 py-1">{'★'.repeat(t.difficulty)}{'☆'.repeat(3 - t.difficulty)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] tracking-wider text-cyan-100/70">
                    <div>BEST TRIAL<br /><span className="font-display text-sm text-amber-200">{formatTime(rec?.bestTime)}</span></div>
                    <div>BEST LAP<br /><span className="font-display text-sm text-amber-200">{formatTime(rec?.bestLap)}</span></div>
                    {rec?.bestScore != null && <div className="col-span-2">CHALLENGE <span className="font-display text-sm text-amber-200">{fmtNum(rec.bestScore)}</span> {rec.medal && <span className="ml-1 text-amber-300">{rec.medal}</span>}</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <Panel className="flex flex-wrap items-center gap-3 p-3">
          <NeonButton size="sm" onClick={() => cycle(-1)}>◀</NeonButton>
          <div className="min-w-[8rem] text-center">
            <div className="font-display text-sm font-black tracking-widest text-cyan-200">{car.name}</div>
            <div className="text-[10px] tracking-widest text-cyan-100/60">{car.tagline}</div>
          </div>
          <NeonButton size="sm" onClick={() => cycle(1)}>▶</NeonButton>
          <NeonButton size="sm" variant="magenta" onClick={() => openGarage('vehicles')}>Garage</NeonButton>
          <div className="ml-auto flex items-center gap-2">
            {!unlocked ? (
              <NeonButton variant="gold" size="lg" disabled={save.credits < (allTracks.find((t) => t.id === trackId)?.unlockCost ?? 0)} onClick={() => buyTrack(trackId)}>
                Unlock · {fmtNum(allTracks.find((t) => t.id === trackId)!.unlockCost)}
              </NeonButton>
            ) : (
              <NeonButton variant="primary" size="lg" onClick={startRace}>Start ▶</NeonButton>
            )}
          </div>
        </Panel>
      </div>
    </ScreenFrame>
  );
}
