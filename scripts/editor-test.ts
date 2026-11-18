/* Headless tests for the track editor: compile, validation, undo model, save formats, share codes, and racing a custom track. */
import { Race } from '../src/game/core/race';
import { registerCustomTrack } from '../src/game/tracks/definitions';
import { CARS, effectiveStats, noUpgrades } from '../src/game/vehicles/cars';
import { emptyInput } from '../src/game/core/types';
import { createAI, updateAI } from '../src/game/ai/ai';
import { compileDoc } from '../src/editor/compile';
import { PIECE_TYPES, PieceInst, PieceType, TrackDoc, emptyDoc, exportJson, fromShareCode, importJson, parseTrackDoc, starterDoc, toShareCode } from '../src/editor/trackDoc';
import { History } from '../src/editor/history';

const DT = 1 / 60;
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const mkRace = (id: string, mode: any = 'trial', extra: object = {}) => new Race({ mode, trackId: id, carId: 'viper', paintIndex: 0, stats: effectiveStats(CARS.find((c) => c.id === 'viper')!, noUpgrades()), ...extra });
const P = (t: PieceType, dir: 1 | -1 = 1): PieceInst => ({ type: t, dir });
/** a rectangular circuit (four left turns) with one feature piece on the west leg */
const rect = (t: PieceType, dir: 1 | -1 = 1) => [P('straight'), P('straight'), P('sharp'), P('straight'), P(t, dir), P('straight'), P('sharp'), P('straight'), P('straight'), P('straight'), P('straight'), P('straight'), P('sharp'), P('straight'), P('straight'), P('straight'), P('sharp')];

// 1. starter track compiles and is valid
const starter = starterDoc();
const c1 = compileDoc(starter);
ok('starter track compiles', !!c1.def && c1.report.ok, c1.report.errors.join('; ') || `${c1.report.length.toFixed(0)}m closure ${c1.report.closureError.toFixed(1)}m sep ${c1.report.minSeparation.toFixed(0)}m`);

// 2. every piece type can be used in a valid track
for (const t of PIECE_TYPES) {
  const d = emptyDoc();
  d.pieces = rect(t);
  const c = compileDoc(d);
  if (t === 'sharp') ok('a 5th left turn (450 deg) is rejected as self-crossing', !c.report.ok, c.report.errors[0]);
  else ok(`piece "${t}" works in a loop`, c.report.ok, c.report.errors.join('; '));
}

// 3. invalid layouts are rejected
{
  const d = emptyDoc(); d.pieces = [P('straight'), P('straight')];
  ok('too few pieces rejected', !compileDoc(d).report.ok);
  const d2 = emptyDoc(); d2.pieces = [P('straight'), P('straight'), P('straight'), P('straight'), P('straight'), P('straight'), P('straight'), P('straight'), P('straight')];
  const c2 = compileDoc(d2); // a long straight line closes only by a huge U-turn but should still be valid or rejected cleanly
  ok('long straight layout handled (valid or cleanly rejected)', c2.report.ok || c2.report.errors.length > 0, c2.report.errors[0] ?? 'valid');
  const d3 = emptyDoc(); d3.pieces = [P('sharp'), P('sharp'), P('sharp'), P('sharp'), P('sharp'), P('sharp'), P('sharp'), P('sharp')];
  ok('tiny circle rejected (too short / touching)', !compileDoc(d3).report.ok, compileDoc(d3).report.errors[0]);
  const d4 = emptyDoc(); d4.pieces = [P('straight'), P('straight'), P('sharp'), P('straight'), P('sharp'), P('sharp', -1), P('straight'), P('sharp', -1), P('straight'), P('sharp', -1)];
  const c4 = compileDoc(d4);
  console.log('    figure-eight-ish layout ->', c4.report.ok ? 'valid' : c4.report.errors[0]);
}

// 4. random layouts never crash; valid ones are actually closed and driveable
{
  let valid = 0, invalid = 0, bad = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 60; n++) {
    const d = emptyDoc();
    const len = 6 + Math.floor(rnd() * 14);
    for (let i = 0; i < len; i++) d.pieces.push(P(PIECE_TYPES[Math.floor(rnd() * PIECE_TYPES.length)], rnd() < 0.5 ? 1 : -1));
    let c;
    try { c = compileDoc(d); } catch (e) { bad++; console.log('    CRASH', (e as Error).message); continue; }
    if (c.report.ok) {
      valid++;
      if (c.report.closureError > 60 || c.report.minSeparation < c.report.needSeparation) bad++;
    } else invalid++;
  }
  ok('60 random layouts: no crashes, no bad "valid" tracks', bad === 0, `${valid} valid, ${invalid} rejected`);
}

// 5. race a custom track end to end (placing pieces -> compile -> register -> race)
{
  const c = compileDoc(starter);
  registerCustomTrack(c.def!);
  const r = mkRace(c.def!.id, 'trial', { laps: 2 });
  r.player.ai = createAI({ skill: 0.95, speedScale: 1 }, 3);
  let steps = 0;
  while (!r.over && steps < 60 * 500) { updateAI(r, r.player, DT); r.step(DT, r.player.input); r.drainEvents(); steps++; }
  ok('custom track race finishes', r.over && !!r.summary && r.summary.totalTime > 20, `time ${r.summary?.totalTime.toFixed(1)}s, falls ${r.player.falls}`);
  ok('custom track: gravity switching works', r.player.gravSwitches > 0, `${r.player.gravSwitches} switches`);
}

// 6. tracks with gap-pieces: AI can drive them without falling much
for (const t of ['bridge', 'wall', 'ceiling', 'platform', 'ramp', 'spiral'] as PieceType[]) {
  const d = emptyDoc(); d.name = 'T ' + t;
  d.pieces = rect(t, t === 'wall' ? -1 : 1);
  const c = compileDoc(d);
  if (!c.def) { ok(`drive "${t}" track`, false, c.report.errors.join(';')); continue; }
  registerCustomTrack(c.def);
  const r = mkRace(c.def.id, 'trial', { laps: 2 });
  r.player.ai = createAI({ skill: 0.95, speedScale: 1 }, 3);
  let steps = 0;
  while (!r.over && steps < 60 * 400) { updateAI(r, r.player, DT); r.step(DT, r.player.input); r.drainEvents(); steps++; }
  ok(`bot completes a custom "${t}" track`, r.over && r.player.falls <= 3, `falls ${r.player.falls}, time ${r.summary?.totalTime.toFixed(0)}s`);
}

// 7. race settings: AI count, start slot, time limit, laps
{
  const c = compileDoc(starter); registerCustomTrack(c.def!);
  const q = mkRace(c.def!.id, 'quick', { aiCount: 2, startSlot: 1, laps: 1, aiDifficulty: 0.9 });
  ok('maxRacers: 2 AI + player = 3 racers', q.racers.length === 3);
  ok('start slot 1 puts the player at the front of the grid', q.player.dist >= q.racers.filter((x) => !x.isPlayer).reduce((m, x) => Math.max(m, x.dist), -99) - 0.01);
  const t = mkRace(c.def!.id, 'trial', { timeLimit: 10 });
  let n = 0; while (!t.over && n < 60 * 60) { t.step(DT, { ...emptyInput(), throttle: 1 }); n++; }
  ok('time limit ends the race', t.over && t.summary?.timedOut === true, `ended at ${t.time.toFixed(1)}s`);
}

// 8. undo / redo
{
  const h = new History<TrackDoc>(emptyDoc());
  const a = { ...h.current, name: 'A' }; h.push(a);
  const b = { ...h.current, name: 'B' }; h.push(b);
  ok('undo goes back one step', h.undo()!.name === 'A');
  ok('undo again reaches the original', h.undo()!.name === 'MY TRACK');
  ok('undo at start does nothing', h.undo() === null && !h.canUndo);
  ok('redo restores', h.redo()!.name === 'A' && h.redo()!.name === 'B' && h.redo() === null);
  h.undo(); h.push({ ...h.current, name: 'C' });
  ok('new edit clears redo history', !h.canRedo && h.current.name === 'C');
}

// 9. save formats: JSON + share codes + validation of untrusted input
{
  const doc = starterDoc(); doc.name = 'SHARE ME'; doc.style.neonColor = '#ff2bd6'; doc.race.laps = 4;
  const json = exportJson(doc);
  const back = importJson(json);
  ok('JSON export/import round trip', back.ok && back.doc!.name === 'SHARE ME' && back.doc!.pieces.length === doc.pieces.length && back.doc!.style.neonColor === '#ff2bd6' && back.doc!.race.laps === 4);
  const code = toShareCode(doc);
  const dec = fromShareCode(code);
  ok('share code round trip', dec.ok && dec.doc!.id === doc.id && dec.doc!.pieces.length === doc.pieces.length, `${code.length} chars`);
  ok('share code: tampering detected', !fromShareCode(code.slice(0, 20) + 'X' + code.slice(21)).ok);
  ok('share code: garbage rejected', !fromShareCode('hello').ok && !importJson('{nope').ok);
  const evil = parseTrackDoc({ v: 1, id: 'x', name: '<script>alert(1)</script>', env: 'hax', pieces: Array.from({ length: 500 }, () => ({ type: 'loop', dir: 5 })), style: { width: 9999, roadColor: 'red' }, race: { laps: 9999, timeLimit: -5 } });
  ok('hostile import: too many pieces rejected', !evil.ok);
  const evil2 = parseTrackDoc({ v: 1, id: 'x', name: '<script>alert(1)</script>', env: 'hax', pieces: [{ type: 'loop' }, { type: 'nuke' }, { type: 'straight' }, { type: 'straight' }], style: { width: 9999, roadColor: 'red' }, race: { laps: 9999, timeLimit: -5 } });
  ok('hostile import: unknown piece rejected, values clamped, name sanitised', !evil2.ok && evil2.doc!.style.width === 12 && evil2.doc!.race.laps === 8 && evil2.doc!.race.timeLimit === 0 && !/[<>]/.test(evil2.doc!.name) && evil2.doc!.env === 'city');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
