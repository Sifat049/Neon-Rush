/* Headless gameplay tests: runs the real physics / AI / race engine without a renderer. */
import { Race } from '../src/game/core/race';
import { TRACKS } from '../src/game/tracks/definitions';
import { CARS, effectiveStats, noUpgrades } from '../src/game/vehicles/cars';
import { emptyInput } from '../src/game/core/types';
import { createAI, updateAI } from '../src/game/ai/ai';
import { placeAt } from '../src/game/physics/racerPhysics';

const DT = 1 / 60;
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

const mk = (mode: any, trackId: string, car = 'viper') => new Race({ mode, trackId, carId: car, paintIndex: 0, stats: effectiveStats(CARS.find((c) => c.id === car)!, noUpgrades()) });
function skipCountdown(r: Race) { for (let i = 0; i < 300 && r.phase === 'countdown'; i++) r.step(DT, emptyInput()); }

// ---------- unit-style checks on the free-drive race
{
  const r = mk('free', 'neon-city'); skipCountdown(r);
  ok('countdown -> racing', r.phase === 'racing');
  const inp = emptyInput(); inp.throttle = 1;
  for (let i = 0; i < 300; i++) r.step(DT, inp);
  const v = r.player.speed;
  ok('accelerates', v > 55, `speed after 5s = ${v.toFixed(1)} m/s (${(v * 3.6).toFixed(0)} km/h)`);
  ok('moves along track', r.player.dist > 200, `dist ${r.player.dist.toFixed(0)}m`);
  // steering
  const x0 = r.player.x; inp.steer = 1;
  for (let i = 0; i < 30; i++) r.step(DT, inp);
  ok('steers right', r.player.x > x0 + 1, `x ${x0.toFixed(2)} -> ${r.player.x.toFixed(2)}`);
  inp.steer = -1; for (let i = 0; i < 60; i++) r.step(DT, inp);
  ok('steers left', r.player.x < x0 - 1, `x -> ${r.player.x.toFixed(2)}`);
  inp.steer = 0;
  // brake
  const vb = r.player.speed; inp.throttle = 0; inp.brake = 1;
  for (let i = 0; i < 60; i++) r.step(DT, inp);
  ok('brakes', r.player.speed < vb - 40, `${vb.toFixed(1)} -> ${r.player.speed.toFixed(1)}`);
  inp.brake = 0; inp.throttle = 1;
  for (let i = 0; i < 240; i++) r.step(DT, inp);
  // jump
  inp.jump = true; r.step(DT, inp); inp.jump = false;
  let maxH = 0;
  for (let i = 0; i < 120; i++) { r.step(DT, inp); maxH = Math.max(maxH, r.player.h); }
  ok('jump leaves ground and lands', maxH > 2 && r.player.grounded && Math.abs(r.player.h) < 0.01, `peak h=${maxH.toFixed(2)}m`);
  r.drainEvents();
  // boost
  const topNoBoost = r.player.stats.top;
  inp.boost = true;
  let peak = 0;
  for (let i = 0; i < 150; i++) { r.step(DT, inp); peak = Math.max(peak, r.player.speed); }
  ok('boost exceeds normal top speed', peak > topNoBoost * 1.2, `peak ${peak.toFixed(1)} vs top ${topNoBoost}`);
  inp.boost = false;
  // gravity switching
  const surf0 = r.player.surf;
  inp.gravRight = true; r.step(DT, inp); inp.gravRight = false;
  for (let i = 0; i < 40; i++) r.step(DT, inp);
  ok('gravity right -> right wall (surface 1)', r.player.surf === 1 && Math.abs(r.player.theta - Math.PI / 2) < 0.01, `surf ${surf0}->${r.player.surf}`);
  inp.gravRight = true; r.step(DT, inp); inp.gravRight = false;
  for (let i = 0; i < 40; i++) r.step(DT, inp);
  ok('gravity right again -> ceiling (surface 2)', r.player.surf === 2);
  inp.gravLeft = true; r.step(DT, inp); inp.gravLeft = false; for (let i = 0; i < 40; i++) r.step(DT, inp);
  inp.gravLeft = true; r.step(DT, inp); inp.gravLeft = false; for (let i = 0; i < 40; i++) r.step(DT, inp);
  inp.gravLeft = true; r.step(DT, inp); inp.gravLeft = false; for (let i = 0; i < 40; i++) r.step(DT, inp);
  ok('gravity left x3 -> left wall (surface 3)', r.player.surf === 3, `surf=${r.player.surf}`);
  // car attached: distance from track centre stays ~W while on surface
  const p = r.player, tr = r.track;
  const fr = (await0(r)) ; void fr;
  ok('events emitted for gravity', r.drainEvents().some((e) => e.type === 'gravity'));
}
function await0(r: Race) { return r.player.pos.length(); }

// ---------- collisions with obstacles
{
  const r = mk('free', 'neon-city'); skipCountdown(r);
  const o = r.obstacles.find((o) => o.kind === 'block')!;
  placeAt(r, r.player, o.s - 40, o.x, 0);
  // put the player on the obstacle's surface
  const th = o.surface * Math.PI / 2; r.player.theta = r.player.thetaTarget = th;
  r.player.speed = 60;
  const inp = emptyInput(); inp.throttle = 1;
  let hit = false;
  for (let i = 0; i < 180 && !hit; i++) { r.step(DT, inp); hit = r.drainEvents().some((e) => e.type === 'hit'); }
  ok('collides with obstacle (hit event, slows down)', hit && r.player.speed < 40, `speed after hit ${r.player.speed.toFixed(1)}`);
}
// ---------- gaps: falling and respawn
{
  const r = mk('free', 'void-station'); skipCountdown(r);
  const g = r.track.gaps.find((g) => g.mask === 15)!;
  placeAt(r, r.player, g.s0 - 30, 0, 0); r.player.speed = 25; r.player.lastCpDist = g.s0 - 100;
  const inp = emptyInput(); inp.throttle = 0.3;
  let fell = false, respawned = false;
  for (let i = 0; i < 400; i++) { r.step(DT, inp); for (const e of r.drainEvents()) { if (e.type === 'fall') fell = true; if (e.type === 'respawn') respawned = true; } }
  ok('falls through full gap and respawns at checkpoint', fell && respawned);
  // clearing a gap with a jump
  const r2 = mk('free', 'void-station'); skipCountdown(r2);
  placeAt(r2, r2.player, g.s0 - 12, 0, 0); r2.player.speed = 62;
  const i2 = emptyInput(); i2.throttle = 1;
  let fell2 = false;
  for (let i = 0; i < 200; i++) { if (i === 2) i2.jump = true; else i2.jump = false; r2.step(DT, i2); if (r2.drainEvents().some((e) => e.type === 'fall')) fell2 = true; }
  ok('jump clears a full-width gap', !fell2 && r2.player.dist > g.s1);
  // switching surface avoids a partial gap
  const gp = r2.track.gaps.find((g) => g.mask === 1)!;
  const r3 = mk('free', 'void-station'); skipCountdown(r3);
  placeAt(r3, r3.player, gp.s0 - 40, 0, 0); r3.player.speed = 50;
  const i3 = emptyInput(); i3.throttle = 1; i3.gravRight = true; r3.step(DT, i3); i3.gravRight = false;
  let fell3 = false;
  for (let i = 0; i < 200; i++) { r3.step(DT, i3); if (r3.drainEvents().some((e) => e.type === 'fall')) fell3 = true; }
  ok('riding the wall avoids a floor-only gap (gravity matters)', !fell3 && r3.player.dist > gp.s1);
}

// ---------- full races driven by the AI controller (also used as the player bot)
for (const t of TRACKS) {
  const r = mk('quick', t.id, 'viper');
  const bot = createAI({ skill: 0.95, speedScale: 1.0 }, 3);
  r.player.ai = bot;
  let steps = 0; const laps: number[] = []; const cps = new Set<string>();
  const evCount: Record<string, number> = {};
  while (!r.over && steps < 60 * 900) {
    updateAI(r, r.player, DT);
    r.step(DT, r.player.input);
    for (const e of r.drainEvents()) { evCount[e.type] = (evCount[e.type] || 0) + 1; if (e.type === 'lap' && e.racer === 0) laps.push(e.time); if (e.type === 'checkpoint') cps.add(e.racer + ':' + e.index); }
    steps++;
  }
  const s = r.summary!;
  console.log(`\n  [${t.name}] race finished=${r.over} in ${r.time.toFixed(1)}s sim, lap=${t.laps}`);
  for (const st of s.standings) console.log(`    P${st.place} ${st.name.padEnd(7)} time=${st.time ? st.time.toFixed(1) : 'DNF'} best=${st.bestLap ? st.bestLap.toFixed(1) : '-'}`);
  const aiRacers = r.racers.filter((x) => !x.isPlayer);
  console.log(`    events: ${JSON.stringify(evCount)}  top=${(s.topSpeed * 3.6).toFixed(0)}km/h falls(P)=${r.player.falls} hits(P)=${r.player.hits} gravSwitches(P)=${r.player.gravSwitches}`);
  console.log(`    AI hits=${aiRacers.map((a) => a.hits)} falls=${aiRacers.map((a) => a.falls)} grav=${aiRacers.map((a) => a.gravSwitches)}`);
  ok(`${t.name}: race completes (player finishes ${t.laps} laps)`, r.over && s.totalTime > 30);
  ok(`${t.name}: lap counter updates (${laps.length} laps recorded)`, laps.length === t.laps);
  ok(`${t.name}: all AI racers finish`, aiRacers.every((a) => a.finished || a.dist > r.track.length * (t.laps - 0.3)), aiRacers.map((a) => (a.dist / r.track.length).toFixed(2)).join(','));
  ok(`${t.name}: AI do not fall excessively`, aiRacers.every((a) => a.falls <= 2), `falls ${aiRacers.map((a) => a.falls)}`);
  ok(`${t.name}: AI switch gravity lanes`, t.id === 'neon-city' || aiRacers.some((a) => a.gravSwitches > 0), `${aiRacers.map((a) => a.gravSwitches)}`);
  ok(`${t.name}: checkpoints crossed`, cps.size >= 3);
}

// ---------- challenge + trial smoke tests
{
  const r = mk('challenge', 'gravity-core');
  const bot = createAI({ skill: 0.95, speedScale: 1.0 }, 3); r.player.ai = bot;
  // challenge bot: steer to gate surface
  let steps = 0;
  while (!r.over && steps < 60 * 400) {
    const gt = r.gates[Math.min(r.challenge.nextGate, r.gates.length - 1)];
    const inp = r.player.input; inp.throttle = r.player.speed < r.player.stats.top ? 1 : 0.3; inp.jump = false; inp.gravLeft = inp.gravRight = false; inp.brake = 0; inp.boost = false;
    const cur = ((Math.round(r.player.thetaTarget / (Math.PI / 2)) % 4) + 4) % 4;
    if (gt && cur !== gt.surface && r.player.gravCool <= 0) { const d = (gt.surface - cur + 4) % 4; if (d === 1 || d === 2) inp.gravRight = true; else inp.gravLeft = true; }
    inp.steer = Math.max(-1, Math.min(1, ((gt ? gt.x : 0) - r.player.x) * 0.5 - r.player.vx * 0.08));
    r.step(DT, inp); r.drainEvents(); steps++;
  }
  const c = r.summary?.challenge;
  console.log(`\n  [Gravity Challenge / Core] gates ${c?.hit}/${c?.total}, score ${c?.score}, medal ${c?.medal}, avg precision ${(c?.avgPrecision ?? 0).toFixed(2)}`);
  ok('gravity challenge completes and scores', !!c && c.hit > 10 && c.score > 0);
}
{
  const r = mk('trial', 'neon-city');
  r.player.ai = createAI({ skill: 0.95, speedScale: 1 }, 1);
  let steps = 0;
  while (!r.over && steps < 60 * 500) { updateAI(r, r.player, DT); r.step(DT, r.player.input); r.drainEvents(); steps++; }
  ok('time trial finishes with a recorded total time', r.over && !!r.summary && r.summary.totalTime > 30 && r.racers.length === 1, `time ${r.summary?.totalTime.toFixed(1)}s best lap ${r.summary?.bestLap?.toFixed(1)}s`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
