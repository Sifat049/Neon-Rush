/* Headless tests for the Phase 4 event modes: drift, stunt arena, police chase. */
import { Race } from '../src/game/core/race';
import { CARS, effectiveStats, noUpgrades } from '../src/game/vehicles/cars';
import { emptyInput } from '../src/game/core/types';
import { createAI, updateAI } from '../src/game/ai/ai';
import { wrapDelta, placeAt } from '../src/game/physics/racerPhysics';
import { TAU } from '../src/game/core/math';

const DT = 1 / 60;
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const mk = (mode: any, trackId: string, car = 'viper') => new Race({ mode, trackId, carId: car, paintIndex: 0, stats: effectiveStats(CARS.find((c) => c.id === car)!, noUpgrades()) });
function skipCountdown(r: Race) { for (let i = 0; i < 300 && r.phase === 'countdown'; i++) r.step(DT, emptyInput()); }
const TRACK_IDS = ['neon-city', 'gravity-core', 'void-station'];

// ============================================================ DRIFT
for (const tid of TRACK_IDS) {
  const r = mk('drift', tid);
  r.player.ai = createAI({ skill: 0.95, speedScale: 1 }, 7);
  let steps = 0, banked = 0, lost = 0, maxChain = 0;
  while (!r.over && steps < 60 * 200) {
    updateAI(r, r.player, DT);
    const inp = r.player.input;
    inp.drift = true;
    if (Math.abs(inp.steer) < 0.3) inp.steer = 0.4 * (Math.sin(r.time * 1.1) >= 0 ? 1 : -1);
    r.step(DT, inp);
    for (const e of r.drainEvents()) { if (e.type === 'ev' && /BANKED/.test(e.text)) banked++; if (e.type === 'ev' && /LOST/.test(e.text)) lost++; }
    steps++;
  }
  const ev = r.summary?.event;
  console.log(`\n  [DRIFT / ${tid}] score ${ev?.score} outcome ${ev?.outcome} banked ${banked} lost ${lost} stats ${JSON.stringify(ev?.stats)}`);
  ok(`${tid}: drift event ends after its duration`, r.over && r.time >= 89 && r.time < 95, `t=${r.time.toFixed(1)}`);
  ok(`${tid}: drift scoring accumulates`, !!ev && ev.score > 500 && banked > 0);
  ok(`${tid}: drift summary has rewards`, !!ev && ev.rewards.length > 0 && ev.rewards[0][1] > 0);
}
{ // no drift -> no score
  const r = mk('drift', 'neon-city'); skipCountdown(r);
  r.player.ai = createAI({ skill: 0.95, speedScale: 1 }, 7);
  for (let i = 0; i < 60 * 20; i++) { updateAI(r, r.player, DT); r.player.input.drift = false; r.step(DT, r.player.input); r.drainEvents(); }
  ok('drift: driving straight without drifting scores 0', (r.event as any).score === 0 && (r.event as any).chainPts === 0);
}
{ // crash loses the chain
  const r = mk('drift', 'neon-city'); skipCountdown(r);
  const inp = emptyInput(); inp.throttle = 1; inp.drift = true; inp.steer = 0.6;
  for (let i = 0; i < 60 * 8 && (r.event as any).chainPts < 300; i++) { r.step(DT, inp); }
  const had = (r.event as any).chainPts;
  r.player.hits++; // simulate an obstacle hit
  r.step(DT, inp);
  ok('drift: a hit destroys the live chain', had > 100 && (r.event as any).chainPts < had && (r.event as any).lost === 1, `chain ${had.toFixed(0)} -> ${(r.event as any).chainPts.toFixed(0)}`);
}

// ============================================================ STUNT
for (const tid of TRACK_IDS) {
  const r = mk('stunt', tid);
  r.player.ai = createAI({ skill: 0.95, speedScale: 1 }, 3);
  ok(`${tid}: stunt arena has ramps and no obstacles`, (r.extraPads?.length ?? 0) >= 5 && r.obstacles.length === 0, `${r.extraPads?.length} ramps`);
  let steps = 0, good = 0, sloppy = 0;
  let spinHeld = 0;
  while (!r.over && steps < 60 * 200) {
    const p = r.player, inp = p.input, L = r.track.length;
    // find next ramp ahead
    let target = null as any, best = 1e9;
    for (const pad of r.extraPads!) { const d = wrapDelta(pad.s - p.s, L); if (d > 5 && d < best) { best = d; target = pad; } }
    inp.throttle = p.speed < p.stats.top ? 1 : 0.4; inp.brake = 0; inp.boost = false; inp.jump = false; inp.drift = false; inp.gravLeft = inp.gravRight = false;
    if (target) {
      const cur = ((Math.round(p.thetaTarget / (Math.PI / 2)) % 4) + 4) % 4;
      if (cur !== target.surface && p.gravCool <= 0) { const d = (target.surface - cur + 4) % 4; if (d === 1 || d === 2) inp.gravRight = true; else inp.gravLeft = true; }
      inp.steer = Math.max(-1, Math.min(1, (target.x - p.x) * 0.6 - p.vx * 0.08));
    }
    if (!p.grounded) {
      const ev = r.event as any;
      // one clean spin: hold steer until ~360 degrees, then release
      inp.steer = Math.abs(ev.trick.spin) < TAU * 0.97 ? 1 : 0;
      spinHeld++;
    }
    r.step(DT, inp);
    for (const e of r.drainEvents()) { if (e.type === 'ev' && /SPIN|FLIP/.test(e.text)) good++; if (e.type === 'ev' && /SLOPPY/.test(e.text)) sloppy++; }
    steps++;
  }
  const ev = r.summary?.event;
  console.log(`\n  [STUNT / ${tid}] score ${ev?.score} outcome ${ev?.outcome} clean tricks ${good} sloppy ${sloppy} stats ${JSON.stringify(ev?.stats)}`);
  ok(`${tid}: stunt event ends after its duration`, r.over && r.time >= 89 && r.time < 95);
  ok(`${tid}: ramps launch the car and tricks score`, !!ev && ev.score > 500 && good > 0 && spinHeld > 0);
}
{ // a plain hop is not a trick, spin without finishing is sloppy
  const r = mk('stunt', 'neon-city'); skipCountdown(r);
  (r.event as any).extraPads.length = 0; // no ramps for this isolated hop test
  r.track.pads.length = 0; // nor track pads
  const inp = emptyInput(); inp.throttle = 1;
  for (let i = 0; i < 240; i++) r.step(DT, inp);
  const sc0 = (r.event as any).score;
  inp.jump = true; r.step(DT, inp); inp.jump = false;
  inp.steer = 0.0; for (let i = 0; i < 120; i++) r.step(DT, inp);
  ok('stunt: a plain hop is worth only a few points and builds no combo', (r.event as any).score - sc0 <= 45 && (r.event as any).combo === 0, `+${((r.event as any).score - sc0).toFixed(0)}`);
  // long airtime with a half spin -> sloppy landing, reduced score, combo reset
  const ev = r.event as any;
  const before = ev.score;
  r.player.vh = 30; r.player.grounded = false; r.player.h = 0.5;
  for (let i = 0; i < 40; i++) { inp.steer = 1; r.step(DT, inp); }
  inp.steer = 0;
  for (let i = 0; i < 200 && !r.player.grounded; i++) r.step(DT, inp);
  for (let i = 0; i < 5; i++) r.step(DT, inp);
  ok('stunt: unfinished spin is a sloppy landing', ev.sloppy >= 1 && ev.score > before && ev.combo === 0, `sloppy ${ev.sloppy}, +${(ev.score - before).toFixed(0)}`);
}
{ // flip scoring via brake in the air
  const r = mk('stunt', 'neon-city'); skipCountdown(r);
  const inp = emptyInput(); inp.throttle = 1;
  for (let i = 0; i < 200; i++) r.step(DT, inp);
  const ev = r.event as any;
  r.player.vh = 30; r.player.grounded = false; r.player.h = 0.5;
  for (let i = 0; i < 400 && !r.player.grounded; i++) { inp.brake = Math.abs(ev.trick.flip) < TAU * 0.98 ? 1 : 0; r.step(DT, inp); }
  for (let i = 0; i < 3; i++) r.step(DT, inp);
  ok('stunt: a clean backflip scores and builds a combo', ev.flipsTotal === 1 && ev.score > 400 && ev.combo === 1, `score ${ev.score.toFixed(0)} flips ${ev.flipsTotal}`);
}

// ============================================================ POLICE
for (const tid of TRACK_IDS) {
  const r = mk('police', tid, 'viper');
  const pol = r.event as any;
  ok(`${tid}: police chase spawns 3 units + 2 drones`, pol.cops.length === 3 && pol.drones.length === 2 && r.racers.length === 4);
  r.player.ai = createAI({ skill: 0.9, speedScale: 0.95 }, 5);
  let steps = 0, maxBusted = 0, nan = false, emp = 0, falls = 0;
  while (!r.over && steps < 60 * 200) {
    updateAI(r, r.player, DT);
    r.step(DT, r.player.input);
    for (const e of r.drainEvents()) { if (e.type === 'ev' && /DRONE LOCK/.test(e.text)) emp++; }
    maxBusted = Math.max(maxBusted, pol.busted);
    for (const c of pol.cops) if (!isFinite(c.racer.dist) || !isFinite(c.racer.pos.x)) nan = true;
    steps++;
  }
  const ev = r.summary?.event;
  const cf = pol.cops.reduce((a: number, c: any) => a + c.racer.falls, 0); falls = cf;
  console.log(`\n  [POLICE / ${tid}] outcome ${ev?.outcome} score ${ev?.score} t=${r.time.toFixed(0)}s maxBusted ${maxBusted.toFixed(2)} drones ${emp} cop falls ${falls} stats ${JSON.stringify(ev?.stats)}`);
  ok(`${tid}: police chase reaches an outcome`, r.over && !!ev && ['ESCAPED', 'SURVIVED', 'BUSTED'].includes(ev.outcome));
  ok(`${tid}: police simulation stays finite`, !nan);
  ok(`${tid}: police close in on the player`, maxBusted > 0 || ev?.outcome === 'ESCAPED' || pol.nearestGap() < 400);
  ok(`${tid}: drone EMP warnings are issued`, emp >= 1);
}
{ // ramming a cop damages and eventually wrecks it
  const r = mk('police', 'neon-city'); skipCountdown(r);
  const pol = r.event as any; const cop = pol.cops[0];
  const p = r.player;
  let wrecked = 0;
  for (let k = 0; k < 4; k++) {
    placeAt(r, p, 500, 0, 0); placeAt(r, cop.racer, 500, 0.5, 0);
    p.speed = 60; cop.racer.speed = 40; cop.ramCool = 0;
    const hp0 = cop.hp;
    r.step(DT, emptyInput());
    if (cop.hp < hp0 || pol.takedowns > wrecked) wrecked = pol.takedowns;
  }
  ok('police: ramming wrecks a unit (takedown +500)', pol.takedowns === 1 && pol.score >= 500, `takedowns ${pol.takedowns} score ${pol.score}`);
}
{ // being rammed from behind fills the busted meter, staying away drains it
  const r = mk('police', 'neon-city'); skipCountdown(r);
  const pol = r.event as any; const cop = pol.cops[0], p = r.player;
  placeAt(r, p, 600, 0, 0); p.speed = 40;
  for (let i = 0; i < 60; i++) { placeAt(r, cop.racer, p.dist - 3, p.x, 0); cop.racer.speed = 45; r.step(DT, emptyInput()); if (pol.busted >= 1) break; }
  const hi = pol.busted;
  ok('police: contact from behind raises the busted meter', hi > 0.3, `busted ${hi.toFixed(2)}`);
}
{ // escape zone: staying in a green zone with no cops close ends as ESCAPED
  const r = mk('police', 'neon-city'); skipCountdown(r);
  const pol = r.event as any; const p = r.player; const z = pol.zones[0];
  placeAt(r, p, (z.s0 + z.s1) / 2, 0, 0); p.speed = 30;
  for (const c of pol.cops) { placeAt(r, c.racer, p.dist - 400, 0, 0); c.racer.speed = 0; }
  const inp = emptyInput(); inp.throttle = 0;
  for (let i = 0; i < 60 * 3 && !r.over && r.phase === 'racing'; i++) { for (const c of pol.cops) { c.racer.speed = 0; c.racer.dist = p.dist - 400; } r.step(DT, inp); }
  ok('police: holding an escape zone ends the chase as ESCAPED', pol.result === 'ESCAPED', `result ${pol.result}`);
}

{ // a driver who boosts and heads for the green zones can win the chase (balance check, not a guarantee for every skill level)
  const outs: string[] = [];
  for (const tid of TRACK_IDS) {
    const r = mk('police', tid, 'viper');
    const pol = r.event as any;
    r.player.ai = createAI({ skill: 0.95, speedScale: 1.0 }, 5);
    let steps = 0;
    while (!r.over && steps < 60 * 200) {
      updateAI(r, r.player, DT);
      const inp = r.player.input, p = r.player;
      inp.boost = p.boostEnergy > 8 && Math.abs(inp.steer) < 0.5; // use boost whenever safe
      inp.drift = Math.abs(inp.steer) > 0.3; // drifting refills boost
      r.step(DT, inp); r.drainEvents(); steps++;
    }
    outs.push(`${tid}:${pol.result}@${r.time.toFixed(0)}s`);
  }
  console.log(`\n  [POLICE boost-bot] ${outs.join('  ')}`);
  ok('police: a boosting driver can escape or survive on at least one track', outs.some((o) => !/BUSTED/.test(o)), outs.join(' '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
