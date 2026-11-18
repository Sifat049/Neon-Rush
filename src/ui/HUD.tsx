import { useEffect, useState } from 'react';
import { useHud } from '../store/hudStore';
import { useGame } from '../store/gameStore';
import { SURFACE_NAMES } from '../game/core/types';
import { formatTime } from '../game/core/math';
import { NeonButton, Panel } from './primitives';
import { SettingsBody } from './Settings';

const ORD = ['', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];
const SURF_ICON = ['▼', '▶', '▲', '◀']; // floor, right wall, ceiling, left wall

function Flash({ n, color }: { n: number; color: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!n) return; setOn(true); const t = setTimeout(() => setOn(false), 260); return () => clearTimeout(t); }, [n]);
  return <div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ opacity: on ? 1 : 0, background: `radial-gradient(ellipse at center, transparent 45%, ${color} 140%)` }} />;
}

export function HUD() {
  const h = useHud();
  const { paused, setPaused, save } = useGame();
  const showFps = save.settings.showFps;
  const challenge = h.mode === 'challenge';
  const ev = h.event;
  const surfName = SURFACE_NAMES[h.surf] ?? 'FLOOR';
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <Flash n={h.flashGrav} color="rgba(139,92,255,0.55)" />
      <Flash n={h.flashHit} color="rgba(255,40,60,0.6)" />
      <Flash n={h.flashBoost} color="rgba(34,229,255,0.45)" />
      {/* top-left: lap / position */}
      <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-3 flex flex-col gap-2">
        {ev && <EventPanel ev={ev} />}
        {h.mode !== 'free' && !ev && (
          <Panel className="px-4 py-2">
            <div className="text-[9px] tracking-[0.3em] text-cyan-100/60">LAP</div>
            <div className="font-display text-2xl font-black text-cyan-100">{Math.min(h.lap, h.laps)}<span className="text-base text-cyan-100/50">/{h.laps}</span></div>
          </Panel>
        )}
        {h.mode === 'quick' && (
          <Panel className="px-4 py-2">
            <div className="text-[9px] tracking-[0.3em] text-cyan-100/60">POSITION</div>
            <div className="font-display text-2xl font-black text-fuchsia-300 drop-shadow-[0_0_8px_#ff2bd6]">{ORD[h.place] ?? h.place}<span className="text-base text-fuchsia-100/50">/{h.total}</span></div>
          </Panel>
        )}
      </div>
      {/* top-center: timers + progress */}
      <div className="absolute left-1/2 top-3 flex w-[min(24rem,36vw)] -translate-x-1/2 flex-col items-center gap-1">
        {h.mode !== 'free' && !ev && (
          <Panel className="px-4 py-1.5 text-center">
            <div className="font-display text-xl font-black tracking-widest text-white">{formatTime(h.time)}</div>
            <div className="text-[10px] tracking-widest text-cyan-100/70">LAP {formatTime(h.lapTime)} · BEST {formatTime(h.bestLap)}</div>
          </Panel>
        )}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${Math.min(100, h.progress * 100)}%` }} /></div>
      </div>
      {/* top-right: pause + gravity */}
      <div className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-3 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {showFps && <Panel className="px-2 py-1 text-[10px] text-lime-300">{h.fps} FPS</Panel>}
          <NeonButton size="sm" onClick={() => setPaused(!paused)}>❚❚</NeonButton>
        </div>
        <Panel className="flex items-center gap-2 px-3 py-2">
          <div className={`font-display text-2xl text-violet-300 drop-shadow-[0_0_8px_#8b5cff] ${h.transit ? 'animate-pulse' : ''}`}>{SURF_ICON[h.surf] ?? '▼'}</div>
          <div><div className="text-[9px] tracking-[0.3em] text-cyan-100/60">GRAVITY</div><div className="font-display text-xs font-bold tracking-widest text-violet-200">{surfName}</div></div>
        </Panel>
        {challenge && h.gateInfo && (
          <Panel className="px-3 py-2 text-right">
            <div className="text-[9px] tracking-[0.3em] text-cyan-100/60">SCORE</div>
            <div className="font-display text-xl font-black text-amber-200">{Math.round(h.gateInfo.score).toLocaleString()}</div>
            <div className="text-[10px] tracking-widest text-cyan-100/70">GATES {h.gateInfo.hit}/{h.gateInfo.total} · x{h.gateInfo.combo}</div>
            <div className="mt-1 text-[10px] tracking-widest text-fuchsia-300">NEXT: {SURFACE_NAMES[h.gateInfo.nextSurface] ?? ''}</div>
          </Panel>
        )}
      </div>
      {/* bottom-center: speed + boost */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[4.5rem] [@media(pointer:coarse)]:hidden sm:[@media(pointer:coarse)]:flex">
        <div className="font-display text-[clamp(2rem,9vh,4rem)] font-black leading-none text-white drop-shadow-[0_0_14px_#22e5ff]">{Math.round(h.speed)}<span className="ml-1 text-sm text-cyan-200/70">KM/H</span></div>
        <div className="h-2.5 w-[min(16rem,40vw)] overflow-hidden rounded-full border border-white/20 bg-black/40">
          <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${h.boost * 100}%`, background: h.boosting ? 'linear-gradient(90deg,#ff2bd6,#fff)' : 'linear-gradient(90deg,#22e5ff,#8b5cff)', boxShadow: '0 0 12px #22e5ff' }} />
        </div>
        <div className="text-[9px] tracking-[0.3em] text-cyan-100/60">BOOST</div>
      </div>
      {/* message */}
      {h.msg && <div key={h.msg.id} className="nr-toast absolute left-1/2 top-[28%] -translate-x-1/2 font-display text-lg font-black tracking-[0.3em] sm:text-2xl" style={{ color: h.msg.kind === 'bad' ? '#ff5a6e' : h.msg.kind === 'good' ? '#b6ff3b' : '#7df3ff', textShadow: '0 0 14px currentColor' }}>{h.msg.text}</div>}
      {/* countdown */}
      {h.phase === 'countdown' && h.count && <div key={h.count} className="nr-pop absolute inset-0 flex items-center justify-center font-display text-[clamp(5rem,28vh,12rem)] font-black text-white drop-shadow-[0_0_30px_#ff2bd6]">{h.count}</div>}
      {paused && <PauseMenu />}
    </div>
  );
}

function EventPanel({ ev }: { ev: NonNullable<ReturnType<typeof useHud.getState>['event']> }) {
  const mins = Math.floor(ev.timeLeft / 60), secs = Math.floor(ev.timeLeft % 60);
  const col = ev.kind === 'police' ? '#ff5a6e' : ev.kind === 'stunt' ? '#7df3ff' : '#ff2bd6';
  return (
    <Panel className="w-[min(15rem,34vw)] px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="font-display text-[10px] font-black tracking-[0.3em]" style={{ color: col }}>{ev.title}</div>
        <div className="font-display text-base font-black text-white">{mins}:{String(secs).padStart(2, '0')}</div>
      </div>
      <div className="font-display text-2xl font-black text-amber-200">{ev.score.toLocaleString()}</div>
      <div className="font-display text-sm font-bold tracking-widest" style={{ color: col }}>{ev.big}</div>
      <div className="text-[9px] tracking-widest text-cyan-100/70">{ev.small}</div>
      {ev.meter != null && (
        <div className="mt-1.5">
          <div className="mb-0.5 text-[8px] tracking-[0.3em] text-cyan-100/60">{ev.meterLabel}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.min(100, ev.meter * 100)}%`, background: ev.meterDanger ? 'linear-gradient(90deg,#ff9a3b,#ff2b3a)' : 'linear-gradient(90deg,#22e5ff,#3bff9a)' }} /></div>
        </div>
      )}
      <div className="mt-1 text-[9px] font-bold tracking-widest text-lime-300">{ev.status}</div>
    </Panel>
  );
}

function PauseMenu() {
  const { setPaused, restartRace, quitRace, showSettingsInPause, openSettings, closeSettings } = useGame();
  return (
    <div className="nr-in pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {showSettingsInPause ? (
        <div className="nr-scroll max-h-[92%] w-[min(40rem,94%)] overflow-y-auto p-2">
          <SettingsBody compact />
          <div className="mt-3 text-center"><NeonButton variant="primary" onClick={closeSettings}>Done</NeonButton></div>
        </div>
      ) : (
        <Panel className="grid w-[min(20rem,90%)] gap-3 p-6">
          <div className="nr-title mb-1 text-center font-display text-2xl font-black tracking-[0.3em]">PAUSED</div>
          <NeonButton variant="primary" onClick={() => setPaused(false)}>Resume</NeonButton>
          <NeonButton onClick={restartRace}>Restart</NeonButton>
          <NeonButton onClick={openSettings}>Settings</NeonButton>
          <NeonButton variant="danger" onClick={quitRace}>Quit to menu</NeonButton>
        </Panel>
      )}
    </div>
  );
}
