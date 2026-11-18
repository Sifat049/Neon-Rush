import * as THREE from 'three';
import { clamp, HALF_PI, mod, TAU } from '../core/math';
import type { Race } from '../core/race';
import type { Pad } from '../core/types';
import { emptyInput } from '../core/types';
import { createRacer, placeAt, Racer, wrapDelta } from '../physics/racerPhysics';
import { createAI, updateAI } from '../ai/ai';

export type EventKind = 'drift' | 'stunt' | 'police';

/** Things drawn in the 3D world for an event (rings, ramps). */
export interface EventMarker { kind: 'ring' | 'ramp'; s: number; surface: number; x: number; hw: number; hl: number; color: string }

export interface EventHud {
  kind: EventKind; title: string; score: number;
  big: string; // large line, e.g. "x4" or "HEAT 2"
  small: string; // small line
  timeLeft: number;
  meter: number | null; meterLabel: string; meterDanger: boolean;
  status: string; // e.g. "IN DRIFT ZONE x2"
}
export interface EventSummary {
  kind: EventKind; score: number;
  outcome: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE' | 'ESCAPED' | 'SURVIVED' | 'BUSTED';
  stats: [string, string | number][];
  rewards: [string, number][]; xp: number;
}
export interface GameEvent {
  kind: EventKind;
  duration: number;
  markers: EventMarker[];
  extraPads: Pad[];
  /** cosmetic rotation of the player car while doing tricks */
  trick: { spin: number; flip: number };
  drones: { pos: THREE.Vector3; warn: number }[];
  update(dt: number): void;
  /** true when this event drives racer `id` itself (police units) */
  owns(id: number): boolean;
  hud(): EventHud;
  summary(): EventSummary;
  endText(): string;
  /** flashing roof light colour for police cars, null for others */
  lightColor(racerId: number, t: number): [number, number, number] | null;
}

// medal thresholds (calibrated with scripts/sim-test.ts bots, see README)
export const DRIFT_MEDALS = [3500, 9000, 18000]; // bronze, silver, gold
export const STUNT_MEDALS = [2500, 6000, 11000];
const medalFor = (score: number, t: number[]): EventSummary['outcome'] => (score >= t[2] ? 'GOLD' : score >= t[1] ? 'SILVER' : score >= t[0] ? 'BRONZE' : 'NONE');
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function say(race: Race, text: string, kind: 'good' | 'bad' | 'info' = 'info', sfx?: string) {
  race.events.push({ type: 'ev', text, kind, sfx });
}

// ======================================================================= DRIFT
class DriftEvent implements GameEvent {
  kind: EventKind = 'drift';
  duration = 90;
  markers: EventMarker[] = [];
  extraPads: Pad[] = [];
  trick = { spin: 0, flip: 0 };
  drones: { pos: THREE.Vector3; warn: number }[] = [];
  zones: { s0: number; s1: number }[] = [];
  score = 0; chainPts = 0; chainT = 0; grace = 0; chains = 0; bestChain = 0; combo = 0; sinceBank = 99;
  lost = 0; zoneTime = 0; lastHits = 0; lastFalls = 0; bestMult = 1;
  constructor(private race: Race) {
    const L = race.track.length, n = 5, len = 200;
    for (let i = 0; i < n; i++) {
      const c = (L * (i + 0.6)) / n;
      this.zones.push({ s0: c - len / 2, s1: c + len / 2 });
      for (const s of [c - len / 2, c + len / 2]) this.markers.push({ kind: 'ring', s: mod(s, L), surface: 0, x: 0, hw: 0, hl: 0, color: '#ff2bd6' });
    }
  }
  inZone(s: number) {
    const L = this.race.track.length;
    return this.zones.some((z) => { const d = wrapDelta(s - (z.s0 + z.s1) / 2, L); return Math.abs(d) <= (z.s1 - z.s0) / 2; });
  }
  mult() { return Math.min(5, 1 + Math.floor(this.chainT / 2)); }
  comboMul() { return 1 + 0.25 * Math.min(this.combo, 8); }
  private bank() {
    const pts = this.chainPts * this.mult() * this.comboMul();
    this.score += pts;
    this.chains++;
    this.bestChain = Math.max(this.bestChain, pts);
    this.bestMult = Math.max(this.bestMult, this.mult());
    this.combo = this.sinceBank < 6 ? this.combo + 1 : 0;
    this.sinceBank = 0;
    say(this.race, `+${fmt(pts)}  DRIFT BANKED`, 'good', 'checkpoint');
    this.chainPts = 0; this.chainT = 0; this.grace = 0;
  }
  owns() { return false; }
  update(dt: number) {
    const r = this.race, p = r.player;
    this.sinceBank += dt;
    if (p.hits > this.lastHits || p.falls > this.lastFalls) {
      if (this.chainPts > 0) { this.lost++; say(r, 'CHAIN LOST', 'bad'); }
      this.chainPts = 0; this.chainT = 0; this.grace = 0; this.combo = 0;
    }
    this.lastHits = p.hits; this.lastFalls = p.falls;
    const zone = this.inZone(p.s);
    if (p.drifting) {
      this.chainT += dt; this.grace = 0.9;
      this.chainPts += p.speed * 0.55 * (zone ? 2 : 1) * dt;
      if (this.chainT >= 10) this.bank(); // long chains are banked automatically
      if (zone) this.zoneTime += dt;
    } else if (this.chainPts > 0) {
      this.grace -= dt;
      if (this.grace <= 0) this.bank();
    }
    if (r.time >= this.duration) {
      if (this.chainPts > 0) this.bank();
      r.endEvent();
    }
  }
  hud(): EventHud {
    const p = this.race.player, zone = this.inZone(p.s);
    const live = this.chainPts * this.mult() * this.comboMul();
    return {
      kind: 'drift', title: 'DRIFT', score: Math.round(this.score), big: this.chainPts > 0 ? `+${fmt(live)}  x${this.mult()}` : 'DRIFT!',
      small: `COMBO ${this.combo}  ·  CHAINS ${this.chains}`, timeLeft: Math.max(0, this.duration - this.race.time),
      meter: this.chainPts > 0 ? clamp(this.grace / 0.9, 0, 1) : null, meterLabel: 'CHAIN', meterDanger: false,
      status: zone ? 'DRIFT ZONE  x2' : 'FIND A DRIFT ZONE (PINK RINGS)',
    };
  }
  summary(): EventSummary {
    const s = this.score;
    const outcome = medalFor(s, DRIFT_MEDALS);
    const rewards: [string, number][] = [[`Drift score ${fmt(s)}`, Math.round(s * 0.03)]];
    const medal = outcome === 'GOLD' ? 400 : outcome === 'SILVER' ? 220 : outcome === 'BRONZE' ? 100 : 0;
    if (medal) rewards.push([`${outcome} medal`, medal]);
    return {
      kind: 'drift', score: Math.round(s), outcome,
      stats: [['BEST CHAIN', fmt(this.bestChain)], ['CHAINS', this.chains], ['BEST MULTIPLIER', `x${this.bestMult}`], ['ZONE TIME', `${this.zoneTime.toFixed(1)}s`], ['CHAINS LOST', this.lost]],
      rewards, xp: 60 + Math.round(s / 150),
    };
  }
  endText() { return `TIME! ${fmt(this.score)} PTS`; }
  lightColor() { return null; }
}

// ======================================================================= STUNT
class StuntEvent implements GameEvent {
  kind: EventKind = 'stunt';
  duration = 90;
  markers: EventMarker[] = [];
  extraPads: Pad[] = [];
  trick = { spin: 0, flip: 0 };
  drones: { pos: THREE.Vector3; warn: number }[] = [];
  score = 0; combo = 0; comboT = 0; airT = 0; maxH = 0; wasAir = false;
  bestTrick = 0; landings = 0; sloppy = 0; spinsTotal = 0; flipsTotal = 0; bestAir = 0; lastHits = 0;
  status = 'HIT A RAMP, HOLD STEER = SPIN, BRAKE = FLIP';
  constructor(private race: Race) {
    const L = race.track.length;
    const n = Math.max(5, Math.floor(L / 170));
    const gap = (L - 260) / n;
    for (let i = 0; i < n; i++) {
      const surface = i % 4 === 3 ? (i % 8 === 3 ? 1 : 3) : 0;
      const x = i % 2 ? 2.4 : -2.4;
      const s = 130 + i * gap;
      const id = 9000 + i;
      this.extraPads.push({ id, kind: 'ramp', s, surface, x, hw: 2.5, hl: 3.2 });
      this.markers.push({ kind: 'ramp', s, surface, x, hw: 2.5, hl: 3.2, color: '#ff2bd6' });
      this.markers.push({ kind: 'ring', s: mod(s - 8, L), surface: 0, x: 0, hw: 0, hl: 0, color: '#22e5ff' });
    }
  }
  owns() { return false; }
  update(dt: number) {
    const r = this.race, p = r.player;
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT === 0) this.combo = 0;
    const air = !p.grounded;
    if (p.hits > this.lastHits) { this.lastHits = p.hits; }
    if (air) {
      if (!this.wasAir) { this.airT = 0; this.maxH = 0; this.trick.spin = 0; this.trick.flip = 0; }
      this.airT += dt; this.maxH = Math.max(this.maxH, p.h);
      this.trick.spin += p.input.steer * TAU * 1.1 * dt;
      this.trick.flip += p.input.brake * TAU * 1.1 * dt;
    } else if (this.wasAir) {
      this.land();
    }
    this.wasAir = air;
    if (r.time >= this.duration) r.endEvent();
  }
  private land() {
    const r = this.race;
    const rotS = Math.abs(this.trick.spin) / TAU, rotF = Math.abs(this.trick.flip) / TAU;
    const nS = Math.round(rotS), nF = Math.round(rotF);
    const cleanRot = Math.abs(rotS - nS) <= 0.2 && Math.abs(rotF - nF) <= 0.2;
    this.bestAir = Math.max(this.bestAir, this.airT);
    this.trick.spin = 0; this.trick.flip = 0;
    if (this.airT < 0.45 || this.maxH < 1) return; // hops do not count
    this.landings++;
    if (rotS < 0.2 && rotF < 0.2) {
      const pts = Math.round(this.airT * 40);
      this.score += pts;
      say(r, `+${pts}  AIR ${this.airT.toFixed(1)}s`, 'info');
      return;
    }
    const base = this.airT * 60 + nS * 300 + nF * 400 + this.maxH * 10;
    if (cleanRot && (nS > 0 || nF > 0)) {
      const pts = Math.round(base * (1 + 0.5 * Math.min(this.combo, 6)));
      this.combo++; this.comboT = 5;
      this.score += pts; this.bestTrick = Math.max(this.bestTrick, pts);
      this.spinsTotal += nS; this.flipsTotal += nF;
      const name = [nS ? `${nS * 360} SPIN` : '', nF ? `${nF > 1 ? nF + 'x ' : ''}FLIP` : ''].filter(Boolean).join(' + ');
      say(r, `+${fmt(pts)}  ${name}  x${this.combo}`, 'good', 'gateOk');
    } else {
      const pts = Math.round(base * 0.25);
      this.score += pts; this.combo = 0; this.sloppy++;
      say(r, `+${pts}  SLOPPY LANDING`, 'bad', 'gateBad');
    }
  }
  hud(): EventHud {
    const air = !this.race.player.grounded;
    return {
      kind: 'stunt', title: 'STUNT', score: Math.round(this.score), big: this.combo > 0 ? `COMBO x${this.combo + 1}` : air ? `AIR ${this.airT.toFixed(1)}s` : 'STUNT ARENA',
      small: `TRICKS ${this.spinsTotal + this.flipsTotal}  ·  BEST ${fmt(this.bestTrick)}`, timeLeft: Math.max(0, this.duration - this.race.time),
      meter: this.comboT > 0 ? this.comboT / 5 : null, meterLabel: 'COMBO', meterDanger: false,
      status: air ? `SPIN ${Math.round(Math.abs(this.trick.spin) / TAU * 360)}°  FLIP ${Math.round(Math.abs(this.trick.flip) / TAU * 360)}°` : this.status,
    };
  }
  summary(): EventSummary {
    const s = this.score;
    const outcome = medalFor(s, STUNT_MEDALS);
    const rewards: [string, number][] = [[`Stunt score ${fmt(s)}`, Math.round(s * 0.04)]];
    const medal = outcome === 'GOLD' ? 400 : outcome === 'SILVER' ? 220 : outcome === 'BRONZE' ? 100 : 0;
    if (medal) rewards.push([`${outcome} medal`, medal]);
    return {
      kind: 'stunt', score: Math.round(s), outcome,
      stats: [['BEST TRICK', fmt(this.bestTrick)], ['SPINS / FLIPS', `${this.spinsTotal} / ${this.flipsTotal}`], ['LANDINGS', this.landings], ['SLOPPY', this.sloppy], ['LONGEST AIR', `${this.bestAir.toFixed(1)}s`]],
      rewards, xp: 60 + Math.round(s / 120),
    };
  }
  endText() { return `TIME! ${fmt(this.score)} PTS`; }
  lightColor() { return null; }
}

// ======================================================================= POLICE
interface Cop { racer: Racer; hp: number; ramCool: number }
const COP_COLORS = { primary: '#0b1a55', accent: '#ff2b3a' };

class PoliceEvent implements GameEvent {
  kind: EventKind = 'police';
  duration = 150;
  markers: EventMarker[] = [];
  extraPads: Pad[] = [];
  trick = { spin: 0, flip: 0 };
  drones: { pos: THREE.Vector3; warn: number }[] = [];
  cops: Cop[] = [];
  zones: { s0: number; s1: number }[] = [];
  busted = 0; takedowns = 0; evades = 0; empHits = 0; shakeT = 0; result: 'ESCAPED' | 'SURVIVED' | 'BUSTED' | null = null;
  heat = 1; score = 0; contact = false;
  private droneCool = [5, 9];
  private droneGrav = [0, 0];
  private droneHits0 = 0;
  constructor(private race: Race) {
    const L = race.track.length, n = 3, len = 240;
    for (let i = 0; i < n; i++) {
      const c = (L * (i + 0.75)) / n;
      this.zones.push({ s0: c - len / 2, s1: c + len / 2 });
      for (const s of [c - len / 2, c + len / 2]) this.markers.push({ kind: 'ring', s: mod(s, L), surface: 0, x: 0, hw: 0, hl: 0, color: '#3bff9a' });
    }
    const offs: [number, number][] = [[-110, -4], [-150, 4], [-190, 0]];
    offs.forEach(([d, x], i) => {
      const st = { accel: 42, top: 84, handling: 1.1, boost: 100 };
      const rc = createRacer(race.racers.length, `UNIT-${i + 1}`, false, 'viper', st, COP_COLORS.primary, COP_COLORS.accent);
      rc.ai = createAI({ skill: 0.75, speedScale: 0.95 }, 101 + i * 13);
      rc.input = emptyInput();
      placeAt(race, rc, d, x, 0);
      race.racers.push(rc);
      this.cops.push({ racer: rc, hp: 3, ramCool: 0 });
    });
    for (let i = 0; i < 2; i++) this.drones.push({ pos: new THREE.Vector3(), warn: 0 });
  }
  inZone(s: number) {
    const L = this.race.track.length;
    return this.zones.some((z) => Math.abs(wrapDelta(s - (z.s0 + z.s1) / 2, L)) <= (z.s1 - z.s0) / 2);
  }
  nearestGap() {
    const p = this.race.player;
    let best = 1e9;
    for (const c of this.cops) best = Math.min(best, Math.abs(wrapDelta(c.racer.dist - p.dist, this.race.track.length)));
    return best;
  }
  owns(id: number) { return this.cops.some((c) => c.racer.id === id); }
  update(dt: number) {
    const r = this.race, p = r.player, L = r.track.length;
    this.heat = 1 + Math.min(3, Math.floor(r.time / 40));
    // ---- police AI: chase the player, ram from behind
    let contactRate = 0;
    for (const c of this.cops) {
      const q = c.racer;
      c.ramCool = Math.max(0, c.ramCool - dt);
      const gap = wrapDelta(p.dist - q.dist, L); // >0 : cop is behind the player
      q.stats.top = r.player.stats.top * 0.97 + this.heat * 2.5;
      const want = p.speed + clamp(gap * 0.22, -14, 26);
      q.ai!.baseScale = clamp(want / q.stats.top, 0.35, 1.12);
      updateAI(r, q, dt, undefined);
      q.ai!.speedScale = q.ai!.baseScale;
      if (gap > -30 && gap < 90 && !q.transit) {
        // steer onto the player's lane, copy surface
        if (q.surf === p.surf) q.input.steer = clamp((p.x - q.x) * 0.5 - q.vx * 0.08, -1, 1);
        else if (q.gravCool <= 0 && gap < 70) {
          const diff = mod(p.surf - q.surf, 4);
          if (diff === 1) q.input.gravRight = true; else if (diff === 3) q.input.gravLeft = true;
        }
      }
      q.input.throttle = q.speed < want ? 1 : 0.4; q.input.brake = q.speed > want * 1.3 ? 0.6 : 0;
      // contact
      if (q.surf === p.surf && !q.transit && !p.transit && Math.abs(gap) < 4.6 && Math.abs(q.x - p.x) < 2.5 && Math.abs(q.h - p.h) < 1.5) {
        if (gap > 1.2) contactRate += 0.4; // being rammed from behind: arrest meter
        else if (c.ramCool <= 0 && p.speed > 30) {
          // player rams the cop
          c.ramCool = 0.9; c.hp--; q.speed *= 0.55; q.stun = 0.6; q.vx += (q.x >= p.x ? 1 : -1) * 6;
          if (c.hp <= 0) {
            this.takedowns++; this.score += 500;
            say(r, 'TAKEDOWN!  +500', 'good', 'gateOk');
            placeAt(r, q, p.dist - 220 - this.takedowns * 20, 0, 0); q.speed = p.speed * 0.8; c.hp = 3; q.invuln = 1;
          } else say(r, `UNIT DAMAGED ${c.hp}/3`, 'info', 'land');
        }
      }
    }
    this.contact = contactRate > 0;
    // ---- drones: EMP pulse you must dodge by boosting, jumping or switching gravity
    const t = r.time;
    this.drones.forEach((d, i) => {
      const ph = i * 3.1;
      d.pos.copy(p.pos).addScaledVector(p.normal, 6.5).addScaledVector(p.fwd, 6 + Math.sin(t * 0.7 + ph) * 9).addScaledVector(p.lat, Math.sin(t * 0.5 + ph) * 5);
      if (d.warn > 0) {
        d.warn -= dt;
        if (d.warn <= 0) {
          const dodged = p.boosting || !p.grounded || p.gravSwitches > this.droneGrav[i];
          if (dodged) { this.evades++; this.score += 150; say(r, 'EMP EVADED  +150', 'good', 'gateOk'); }
          else { this.empHits++; p.speed *= 0.55; p.stun = 0.8; r.events.push({ type: 'hit', racer: p.id, intensity: 0.6 }); say(r, 'EMP HIT!', 'bad'); }
        }
      } else {
        this.droneCool[i] -= dt;
        if (this.droneCool[i] <= 0) {
          d.warn = 1.1; this.droneCool[i] = Math.max(4, 9 - this.heat) + i * 1.5; this.droneGrav[i] = p.gravSwitches;
          say(r, 'DRONE LOCK — BOOST / JUMP / SWITCH!', 'bad', 'beep');
        }
      }
    });
    void this.droneHits0;
    // ---- arrest meter
    this.busted = clamp(this.busted + (contactRate - (contactRate > 0 ? 0 : 0.25)) * dt, 0, 1);
    // ---- escape: stay in a green zone with no cop within 45 m
    if (this.inZone(p.s) && this.nearestGap() > 45) this.shakeT += dt; else this.shakeT = Math.max(0, this.shakeT - dt * 2);
    if (this.busted >= 1) { this.result = 'BUSTED'; r.endEvent(); }
    else if (this.shakeT >= 2.5) { this.result = 'ESCAPED'; r.endEvent(); }
    else if (r.time >= this.duration) { this.result = 'SURVIVED'; r.endEvent(); }
  }
  hud(): EventHud {
    const p = this.race.player;
    const inZ = this.inZone(p.s);
    return {
      kind: 'police', title: 'POLICE CHASE', score: Math.round(this.score), big: `HEAT ${this.heat}`,
      small: `TAKEDOWNS ${this.takedowns}  ·  EMP EVADED ${this.evades}`, timeLeft: Math.max(0, this.duration - this.race.time),
      meter: this.shakeT > 0 && inZ ? this.shakeT / 2.5 : this.busted, meterLabel: this.shakeT > 0 && inZ ? 'LOSING THEM' : 'BUSTED', meterDanger: !(this.shakeT > 0 && inZ),
      status: this.contact ? 'BEING RAMMED!' : inZ ? (this.nearestGap() > 45 ? 'HOLD THE ZONE' : 'COPS TOO CLOSE') : 'REACH A GREEN ZONE TO ESCAPE',
    };
  }
  summary(): EventSummary {
    const res = this.result ?? 'SURVIVED';
    const rewards: [string, number][] = [];
    rewards.push([res === 'ESCAPED' ? 'Escaped the police' : res === 'SURVIVED' ? 'Survived the chase' : 'Busted', res === 'ESCAPED' ? 1200 : res === 'SURVIVED' ? 700 : 150]);
    if (this.takedowns) rewards.push([`Takedowns x${this.takedowns}`, this.takedowns * 250]);
    if (this.evades) rewards.push([`EMP evaded x${this.evades}`, this.evades * 50]);
    const bonus = res === 'ESCAPED' ? 500 : res === 'SURVIVED' ? 250 : 0;
    return {
      kind: 'police', score: Math.round(this.score + bonus), outcome: res,
      stats: [['TAKEDOWNS', this.takedowns], ['EMP EVADED', this.evades], ['EMP HITS', this.empHits], ['MAX HEAT', this.heat], ['TIME', `${this.race.time.toFixed(0)}s`]],
      rewards, xp: res === 'BUSTED' ? 40 : 120 + this.takedowns * 20,
    };
  }
  endText() { return this.result === 'ESCAPED' ? 'YOU ESCAPED!' : this.result === 'BUSTED' ? 'BUSTED!' : 'YOU SURVIVED!'; }
  lightColor(id: number, t: number): [number, number, number] | null {
    if (!this.cops.some((c) => c.racer.id === id)) return null;
    return Math.floor(t * 5 + id) % 2 ? [0.3, 0.5, 3] : [3, 0.3, 0.4];
  }
}

export function createEvent(race: Race): GameEvent | null {
  switch (race.mode) {
    case 'drift': return new DriftEvent(race);
    case 'stunt': return new StuntEvent(race);
    case 'police': return new PoliceEvent(race);
    default: return null;
  }
}
export const EVENT_MODES = ['drift', 'stunt', 'police'] as const;
export { HALF_PI };
