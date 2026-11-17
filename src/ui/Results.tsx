import { useGame } from '../store/gameStore';
import { ACHIEVEMENTS } from '../store/saveData';
import { formatTime } from '../game/core/math';
import { getTrackDef } from '../game/tracks/definitions';
import { NeonButton, Panel, fmtNum } from './primitives';

const ORD = ['', '1ST', '2ND', '3RD', '4TH'];
export function Results() {
  const { results, restartRace, quitRace, go } = useGame();
  if (!results) return null;
  const { summary: s, rewards: r, records } = results;
  const track = getTrackDef(s.trackId);
  const headline = s.mode === 'quick' ? `${ORD[s.playerPlace] ?? s.playerPlace} PLACE` : s.mode === 'challenge' ? `${s.challenge?.medal ?? 'NONE'} MEDAL` : s.mode === 'trial' ? 'TRIAL COMPLETE' : 'DONE';
  return (
    <div className="nr-in pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <div className="nr-scroll grid max-h-full w-[min(56rem,100%)] gap-3 overflow-y-auto sm:grid-cols-2">
        <Panel className="p-5">
          <div className="text-[10px] tracking-[0.3em] text-cyan-100/60">{track.name} · {s.mode.toUpperCase()}</div>
          <div className="nr-title font-display text-4xl font-black tracking-widest">{headline}</div>
          {s.mode !== 'challenge' && <div className="mt-2 font-display text-2xl text-amber-200">{formatTime(s.totalTime)}</div>}
          <div className="text-xs tracking-widest text-cyan-100/70">BEST LAP {formatTime(s.bestLap)} {records.lap && <b className="text-lime-300">NEW RECORD!</b>} {records.time && <b className="text-lime-300">TIME RECORD!</b>}</div>
          {s.challenge && <div className="mt-2 text-sm tracking-widest text-cyan-50">SCORE <b className="text-amber-200">{fmtNum(s.challenge.score)}</b> · GATES {s.challenge.hit}/{s.challenge.total} · PRECISION {(s.challenge.avgPrecision * 100).toFixed(0)}% · COMBO x{s.challenge.bestCombo} {records.score && <b className="text-lime-300">NEW BEST!</b>}</div>}
          {s.mode === 'quick' && (
            <div className="mt-3 grid gap-1">{s.standings.map((st) => (
              <div key={st.id} className={`flex justify-between rounded px-3 py-1.5 text-xs tracking-widest ${st.isPlayer ? 'bg-cyan-400/20 text-cyan-100' : 'bg-white/5 text-cyan-100/70'}`}><span>{st.place}. {st.name}</span><span>{formatTime(st.time)}</span></div>
            ))}</div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] tracking-widest text-cyan-100/70">
            <div>TOP SPEED<br /><b className="text-sm text-cyan-50">{Math.round(s.topSpeed * 3.6)}</b></div>
            <div>GRAV SWITCHES<br /><b className="text-sm text-cyan-50">{s.gravSwitches}</b></div>
            <div>HITS / FALLS<br /><b className="text-sm text-cyan-50">{s.hits} / {s.falls}</b></div>
          </div>
        </Panel>
        <Panel className="flex flex-col p-5">
          <div className="font-display text-sm font-bold tracking-[0.3em] text-cyan-200">REWARDS</div>
          <div className="mt-2 grid gap-1 text-xs tracking-widest">
            {r.lines.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-cyan-100/80">{k}</span><span className="text-amber-200">+{fmtNum(v)}</span></div>)}
          </div>
          <div className="mt-3 flex justify-between border-t border-white/15 pt-3 font-display text-lg font-black"><span className="text-amber-200">◆ {fmtNum(r.credits)} CREDITS</span><span className="text-fuchsia-300">{fmtNum(r.xp)} XP</span></div>
          {r.levelUp && <div className="mt-2 rounded bg-fuchsia-500/20 p-2 text-center font-display text-sm font-bold tracking-widest text-fuchsia-200">LEVEL UP! → LEVEL {r.levelUp}</div>}
          {r.newAchievements.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return a ? <div key={id} className="mt-2 rounded bg-amber-300/15 p-2 text-xs tracking-widest text-amber-200">★ {a.name} — {a.desc} (+200)</div> : null; })}
          <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
            <NeonButton variant="primary" size="sm" onClick={restartRace}>Retry</NeonButton>
            <NeonButton size="sm" onClick={() => { quitRace(); go('tracks'); }}>Tracks</NeonButton>
            <NeonButton size="sm" onClick={quitRace}>Menu</NeonButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
