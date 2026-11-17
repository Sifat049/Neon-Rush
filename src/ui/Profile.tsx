import { useState } from 'react';
import { useGame } from '../store/gameStore';
import { ACHIEVEMENTS, levelInfo } from '../store/saveData';
import { formatTime } from '../game/core/math';
import { TRACKS } from '../game/tracks/definitions';
import { NeonButton, Panel, ScreenFrame, fmtNum } from './primitives';

export function Profile() {
  const { save, go, setName } = useGame();
  const [name, setN] = useState(save.name);
  const lvl = levelInfo(save.xp);
  return (
    <ScreenFrame title="PILOT PROFILE" subtitle="Stats · records · achievements" onBack={() => go('menu')}>
      <div className="nr-scroll pointer-events-auto grid h-full gap-3 pr-1 sm:grid-cols-2">
        <Panel className="p-4">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-[10px] tracking-[0.2em] text-cyan-100/60">CALLSIGN
              <input value={name} maxLength={14} onChange={(e) => setN(e.target.value.toUpperCase())} onBlur={() => setName(name)} className="mt-1 block w-full rounded border border-cyan-400/40 bg-black/40 px-3 py-2 font-display text-base tracking-widest text-cyan-100 outline-none focus:border-cyan-300" />
            </label>
            <NeonButton size="sm" onClick={() => setName(name)}>Save</NeonButton>
          </div>
          <div className="mt-4 flex items-center justify-between"><span className="font-display text-xl font-black text-cyan-200">LEVEL {lvl.level}</span><span className="text-[11px] tracking-widest text-cyan-100/60">{lvl.into}/{lvl.need} XP</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" style={{ width: `${lvl.pct * 100}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] tracking-widest text-cyan-100/80">
            {[['RACES', save.stats.races], ['WINS', save.stats.wins], ['DISTANCE', (save.stats.distance / 1000).toFixed(1) + ' KM'], ['GRAVITY SWITCHES', save.stats.gravSwitches], ['DRIFT TIME', Math.round(save.stats.driftTime) + ' S'], ['JUMPS', save.stats.jumps]].map(([k, v]) => (
              <div key={String(k)} className="rounded bg-white/5 p-2"><div className="text-[9px] text-cyan-100/50">{k}</div><div className="font-display text-base text-cyan-50">{typeof v === 'number' ? fmtNum(v) : v}</div></div>
            ))}
          </div>
          <div className="mt-4 text-[10px] tracking-[0.2em] text-cyan-100/60">RECORDS</div>
          {TRACKS.map((t) => { const r = save.records[t.id]; return (
            <div key={t.id} className="mt-1 flex justify-between rounded bg-white/5 px-3 py-2 text-[11px] tracking-widest"><span style={{ color: t.palette.a }}>{t.name}</span><span className="text-amber-200">{formatTime(r?.bestTime)} · LAP {formatTime(r?.bestLap)}</span></div>
          ); })}
        </Panel>
        <Panel className="p-4">
          <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">ACHIEVEMENTS {save.achievements.length}/{ACHIEVEMENTS.length}</div>
          <div className="grid gap-1.5">
            {ACHIEVEMENTS.map((a) => { const has = save.achievements.includes(a.id); return (
              <div key={a.id} className={`flex items-center gap-3 rounded border p-2 ${has ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 opacity-60'}`}>
                <span className={`text-xl ${has ? 'text-amber-300' : 'text-white/30'}`}>{has ? '★' : '☆'}</span>
                <div><div className="font-display text-xs font-bold tracking-widest">{a.name}</div><div className="text-[10px] text-cyan-100/70">{a.desc}</div></div>
              </div>
            ); })}
          </div>
        </Panel>
      </div>
    </ScreenFrame>
  );
}
