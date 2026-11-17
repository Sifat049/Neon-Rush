import { clamp, HALF_PI } from './math';
import type { CarStats, ChallengeGate, DriveInput, GameMode, Obstacle, RaceEvent } from './types';
import { emptyInput } from './types';
import { CARS, PAINTS, effectiveStats, getCar, noUpgrades } from '../vehicles/cars';
import { TrackData, getTrack } from '../tracks/trackData';
import { Racer, RaceCtx, createRacer, placeAt, stepRacer, wrapDelta, updatePose } from '../physics/racerPhysics';
import { AI_PROFILES, createAI, updateAI } from '../ai/ai';

export interface RaceConfig {
  mode: GameMode;
  trackId: string;
  carId: string;
  paintIndex: number;
  stats: CarStats;
  laps?: number;
}

export interface Standing {
  id: number; name: string; isPlayer: boolean; place: number; time: number | null; bestLap: number | null; carId: string;
}
export interface RaceSummary {
  mode: GameMode; trackId: string; laps: number;
  standings: Standing[]; playerPlace: number; totalTime: number; bestLap: number | null; lapTimes: number[];
  topSpeed: number; hits: number; falls: number; gravSwitches: number; jumps: number; driftTime: number; distance: number; surfaces: number;
  challenge?: { score: number; hit: number; total: number; avgPrecision: number; bestCombo: number; medal: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE' };
}

export class Race implements RaceCtx {
  track: TrackData;
  mode: GameMode;
  laps: number;
  racers: Racer[] = [];
  player: Racer;
  obstacles: Obstacle[];
  events: RaceEvent[] = [];
  time = 0;
  phase: 'countdown' | 'racing' | 'finished' = 'countdown';
  countdown = 3.4;
  private lastCount = 4;
  finishTimer = 0;
  over = false;
  topSpeed = 0;
  gates: ChallengeGate[] = [];
  challenge = { score: 0, hit: 0, total: 0, combo: 0, bestCombo: 0, precisionSum: 0, nextGate: 0, lastGateOk: true, results: [] as number[] };
  summary: RaceSummary | null = null;

  constructor(public cfg: RaceConfig) {
    this.track = getTrack(cfg.trackId);
    this.mode = cfg.mode;
    this.laps = cfg.mode === 'free' ? 0 : cfg.mode === 'challenge' ? 1 : cfg.laps ?? this.track.def.laps;
    this.obstacles = cfg.mode === 'challenge' ? [] : this.track.obstacles;
    if (cfg.mode === 'challenge') {
      this.gates = this.track.gates;
      this.challenge.total = this.gates.length;
      this.challenge.results = this.gates.map(() => 0);
    }
    const paint = PAINTS[cfg.paintIndex % PAINTS.length];
    this.player = createRacer(0, 'YOU', true, cfg.carId, cfg.stats, paint.primary, paint.accent);
    this.racers.push(this.player);
    if (cfg.mode === 'quick') {
      AI_PROFILES.forEach((p, i) => {
        const car = getCar(p.carId);
        const pt = PAINTS[p.paint % PAINTS.length];
        const st = effectiveStats(car, noUpgrades());
        const r = createRacer(i + 1, p.name, false, p.carId, st, pt.primary, pt.accent);
        r.ai = createAI(p, 17 + i * 31);
        r.input = emptyInput();
        this.racers.push(r);
      });
    }
    // starting grid (player starts 3rd in quick race), behind the start line
    const slots: [number, number, number][] =
      cfg.mode === 'quick'
        ? [[-8, -3.4, 0], [-8, 3.4, 1], [-18, -3.4, 2], [-18, 3.4, 3]] // [dist, x, racerIdx] mapped below
        : [[-8, 0, 0]];
    if (cfg.mode === 'quick') {
      const order = [1, 2, 0, 3]; // AI1(adv), AI2, player, AI3
      order.forEach((ri, i) => placeAt(this, this.racers[ri], slots[i][0], slots[i][1], 0));
    } else placeAt(this, this.player, slots[0][0], slots[0][1], 0);
    this.updatePlaces();
  }

  /** Called by the host with the player's input; advances the simulation by a fixed dt. */
  step(dt: number, playerInput: DriveInput) {
    if (this.over) return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.4);
      if (n !== this.lastCount && n >= 1 && n <= 3) { this.lastCount = n; this.events.push({ type: 'count', n }); }
      if (this.countdown <= 0.4 && this.lastCount !== 0) { this.lastCount = 0; this.events.push({ type: 'go' }); this.phase = 'racing'; }
      for (const r of this.racers) stepRacer(this, r, dt, false);
      return;
    }
    this.time += dt;
    for (const r of this.racers) {
      if (r.isPlayer && !r.finished) {
        const pi = r.input;
        pi.throttle = playerInput.throttle; pi.brake = playerInput.brake; pi.steer = playerInput.steer;
        pi.jump = playerInput.jump; pi.boost = playerInput.boost; pi.drift = playerInput.drift;
        pi.gravLeft = playerInput.gravLeft; pi.gravRight = playerInput.gravRight;
      } else {
        if (!r.ai) r.ai = createAI({ skill: 0.9, speedScale: 0.8 }, 5); // autopilot after finishing
        updateAI(this, r, dt, this.player);
      }
    }
    for (const r of this.racers) {
      const before = r.finished;
      stepRacer(this, r, dt, true);
      if (r.speed > this.topSpeed && r.isPlayer) this.topSpeed = r.speed;
      if (!before && r.finished) this.onFinish(r);
    }
    this.carCollisions();
    this.updateGates();
    this.updatePlaces();
    if (this.phase === 'finished') {
      this.finishTimer += dt;
      if (this.finishTimer > 2.6 && !this.over) { this.over = true; this.summary = this.buildSummary(); }
    }
  }

  private onFinish(r: Racer) {
    this.events.push({ type: 'finish', racer: r.id, place: r.place });
    if (r.isPlayer) {
      this.phase = 'finished';
      for (const o of this.racers) if (!o.isPlayer && !o.finished) { /* continue racing under AI */ }
    }
  }

  private carCollisions() {
    const L = this.track.length;
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.surf !== b.surf || a.transit || b.transit) continue;
      const d = wrapDelta(a.s - b.s, L);
      if (Math.abs(d) > 4.2) continue;
      const dx = a.x - b.x;
      if (Math.abs(dx) > 2.3 || Math.abs(a.h - b.h) > 1.4) continue;
      const side = dx >= 0 ? 1 : -1;
      a.vx += side * 4; b.vx -= side * 4;
      a.x += side * 0.05; b.x -= side * 0.05;
      const rear = d < 0 ? a : b;
      rear.speed *= 0.985;
      if (a.isPlayer || b.isPlayer) this.events.push({ type: 'bump', racer: a.isPlayer ? a.id : b.id });
    }
  }

  private updateGates() {
    if (this.mode !== 'challenge') return;
    const p = this.player;
    const c = this.challenge;
    while (c.nextGate < this.gates.length && p.dist >= this.gates[c.nextGate].s) {
      const g = this.gates[c.nextGate++];
      const onSurface = Math.round(p.thetaTarget / HALF_PI) % 4 === g.surface || (((Math.round(p.thetaTarget / HALF_PI) % 4) + 4) % 4) === g.surface;
      const settled = Math.abs(p.theta - p.thetaTarget) < 0.5;
      const dx = Math.abs(p.x - g.x);
      if (onSurface && settled && dx < g.hw) {
        const precision = clamp(1 - dx / g.hw, 0, 1);
        c.hit++; c.combo++; c.bestCombo = Math.max(c.bestCombo, c.combo); c.precisionSum += precision;
        c.score += Math.round(100 + 100 * precision + Math.min(c.combo, 10) * 10);
        c.lastGateOk = true; c.results[g.id] = 1;
        this.events.push({ type: 'gate', racer: p.id, ok: true, precision });
      } else {
        c.combo = 0; c.lastGateOk = false; c.results[g.id] = 2;
        this.events.push({ type: 'gate', racer: p.id, ok: false, precision: 0 });
      }
    }
  }

  updatePlaces() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    sorted.forEach((r, i) => (r.place = i + 1));
  }

  drainEvents() {
    if (!this.events.length) return this.events;
    const e = this.events;
    this.events = [];
    return e;
  }

  progress() {
    return clamp(this.player.dist / (this.laps > 0 ? this.laps * this.track.length : this.track.length), 0, 1);
  }

  buildSummary(): RaceSummary {
    this.updatePlaces();
    const p = this.player;
    const standings: Standing[] = [...this.racers].sort((a, b) => a.place - b.place).map((r) => ({
      id: r.id, name: r.name, isPlayer: r.isPlayer, place: r.place,
      time: r.finished ? r.finishTime : null, bestLap: isFinite(r.bestLap) ? r.bestLap : null, carId: r.carId,
    }));
    const s: RaceSummary = {
      mode: this.mode, trackId: this.track.def.id, laps: this.laps,
      standings, playerPlace: p.place, totalTime: p.finished ? p.finishTime : this.time,
      bestLap: isFinite(p.bestLap) ? p.bestLap : null, lapTimes: [...p.lapTimes],
      topSpeed: this.topSpeed, hits: p.hits, falls: p.falls, gravSwitches: p.gravSwitches, jumps: p.jumps,
      driftTime: p.driftTime, distance: p.distance,
      surfaces: [0, 1, 2, 3].reduce((a, k) => a + (p.surfacesUsed & (1 << k) ? 1 : 0), 0),
    };
    if (this.mode === 'challenge') {
      const c = this.challenge;
      const ratio = c.total ? c.hit / c.total : 0;
      s.challenge = {
        score: c.score, hit: c.hit, total: c.total, bestCombo: c.bestCombo,
        avgPrecision: c.hit ? c.precisionSum / c.hit : 0,
        medal: ratio >= 0.85 ? 'GOLD' : ratio >= 0.6 ? 'SILVER' : ratio >= 0.35 ? 'BRONZE' : 'NONE',
      };
    }
    return s;
  }

  /** Force the pose of every racer to be current (used before first render). */
  refreshPoses() { for (const r of this.racers) updatePose(this, r); }
}

export { CARS };
