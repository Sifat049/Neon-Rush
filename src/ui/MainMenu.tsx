import { useGame } from '../store/gameStore';
import { levelInfo } from '../store/saveData';
import { getTrackDef, TRACKS } from '../game/tracks/definitions';
import { formatTime } from '../game/core/math';
import { Credits, NeonButton, Panel } from './primitives';
import { toggleFullscreen } from '../app/fullscreen';
import { getCar } from '../game/vehicles/cars';

export function MainMenu() {
  const { save, go, openGarage, openSettings } = useGame();
  const lvl = levelInfo(save.xp);
  // best race record: fastest completed time trial; fall back to best lap
  let best: { track: string; time: number; kind: string } | null = null;
  for (const t of TRACKS) {
    const r = save.records[t.id];
    if (r?.bestTime != null && (!best || best.kind === 'LAP' || r.bestTime / t.laps < best.time)) best = { track: t.name, time: r.bestTime, kind: 'RACE' };
    else if (r?.bestLap != null && !best) best = { track: t.name, time: r.bestLap, kind: 'LAP' };
  }
  return (
    <div className="nr-in pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="nr-title font-display text-[clamp(2rem,9vh,4.8rem)] font-black leading-none tracking-[0.12em]">NEON RUSH</h1>
          <div className="mt-1 font-display text-[clamp(0.7rem,2.2vh,1.1rem)] font-bold tracking-[0.6em] text-fuchsia-300 drop-shadow-[0_0_8px_#ff2bd6]">GRAVITY RACER</div>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Credits n={save.credits} />
            <NeonButton size="sm" onClick={toggleFullscreen} title="Fullscreen (F)">⛶</NeonButton>
          </div>
          <Panel className="w-[min(18rem,46vw)] cursor-pointer p-3 transition hover:shadow-neon" >
            <button className="w-full text-left" onClick={() => go('profile')}>
              <div className="flex items-center justify-between">
                <div className="font-display text-sm font-bold tracking-widest">{save.name}</div>
                <div className="rounded bg-cyan-400/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-cyan-200">LVL {lvl.level}</div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${lvl.pct * 100}%` }} /></div>
              <div className="mt-1 text-[10px] tracking-widest text-cyan-100/60">{lvl.into} / {lvl.need} XP · {getCar(save.selectedCar).name}</div>
              <div className="mt-2 border-t border-white/10 pt-2 text-[10px] tracking-[0.2em] text-cyan-100/70">
                BEST {best ? `${best.kind} · ${best.track}` : 'RACE'}
                <div className="mt-0.5 font-display text-base font-bold tracking-wider text-amber-200">{best ? formatTime(best.time) : '--:--.---'}</div>
              </div>
            </button>
          </Panel>
        </div>
      </div>
      <div className="grid w-[min(22rem,60vw)] gap-2.5 [@media(max-height:520px)]:w-[min(26rem,52vw)] [@media(max-height:520px)]:grid-cols-2 [@media(max-height:520px)]:gap-2">
        <NeonButton variant="primary" size="lg" className="[@media(max-height:520px)]:col-span-2" onClick={() => go('tracks')}>▶ Play</NeonButton>
        <NeonButton onClick={() => openGarage('vehicles')}>Garage</NeonButton>
        <NeonButton onClick={() => go('tracks')}>Tracks</NeonButton>
        <NeonButton variant="magenta" onClick={() => openGarage('upgrades')}>Upgrade</NeonButton>
        <NeonButton onClick={openSettings}>Settings</NeonButton>
        <NeonButton className="[@media(max-height:520px)]:col-span-2" onClick={() => go('howto')}>How to play</NeonButton>
      </div>
    </div>
  );
}

export { getTrackDef };
