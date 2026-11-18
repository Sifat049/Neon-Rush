import { WEATHERS, WeatherId } from '../weather/weather';
import { clamp, HALF_PI } from './math';
import type { CarStats, ChallengeGate, DriveInput, GameMode, Obstacle, RaceEvent } from './types';
import { emptyInput } from './types';
import { CARS, PAINTS, effectiveStats, getCar, noUpgrades } from '../vehicles/cars';
import { TrackData, getTrack } from '../tracks/trackData';
import { Racer, RaceCtx, createRacer, placeAt, stepRacer, wrapDelta, updatePose } from '../physics/racerPhysics';
import { AI_PROFILES, createAI, updateAI } from '../ai/ai';
import { createEvent, EventSummary, GameEvent } from '../events/events';

export interface RaceConfig {
  mode: GameMode;
  trackId: string;
  carId: string;
  paintIndex: number;
  stats: CarStats;
  laps?: number;
  weather?: WeatherId;
  /** custom-race settings (track editor) */
  aiCount?: number; // 0..3 AI opponents in a quick race
  aiDifficulty?: number; // 0..1, 0.5 = default
  startSlot?: number; // 1-based grid slot for the player
  timeLimit?: number; // seconds, 0 = none
}

export interface Standing {
  id: number; name: string; isPlayer: boolean; place: number; time: number | null; bestLap: number | null; carId: string;
}
export interface RaceSummary {
  mode: GameMode; trackId: string; laps: number;
  standings: Standing[]; playerPlace: number; totalTime: number; bestLap: number | null; lapTimes: number[];
  topSpeed: number; hits: number; falls: number; gravSwitches: number; jumps: number; driftTime: number; distance: number; surfaces: number;
  timedOut?: boolean;
  event?: EventSummary;
  challenge?: { score: number; hit: number; total: number; avgPrecision: number; bestCombo: number; medal: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE' };
}

export class Race implements RaceCtx {
  track: TrackData;
  weather: WeatherId;
  grip: number;
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
  timeLimit = 0;
  timedOut = false;
  over = false;
  topSpeed = 0;
  gates: ChallengeGate[] = [];
  challenge = { score: 0, hit: 0, total: 0, combo: 0, bestCombo: 0, precisionSum: 0, nextGate: 0, lastGateOk: true, results: [] as number[] };
  summary: RaceSummary | null = null;
  event: GameEvent | null = null;
  extraPads: import('./types').Pad[] | undefined;

  constructor(public cfg: RaceConfig) {
    this.track = getTrack(cfg.trackId);
    this.mode = cfg.mode;
    this.timeLimit = cfg.timeLimit ?? 0;
    this.weather = cfg.weather ?? this.track.def.weather ?? 'clear';
    this.grip = WEATHERS[this.weather].grip;
    this.laps = cfg.mode === 'free' || cfg.mode === 'drift' || cfg.mode === 'stunt' || cfg.mode === 'police' ? 0 : cfg.mode === 'challenge' ? 1 : cfg.laps ?? this.track.def.laps;
    this.obstacles = cfg.mode === 'challenge' || cfg.mode === 'stunt' ? [] : this.track.obstacles;
    if (cfg.mode === 'challenge') {
      this.gates = this.track.gates;
      this.challenge.total = this.gates.length;
      this.challenge.results = this.gates.map(() => 0);
    }
    const paint = PAINTS[cfg.paintIndex % PAINTS.length];
    this.player = createRacer(0, 'YOU', true, cfg.carId, cfg.stats, paint.primary, paint.accent);
    this.racers.push(this.player);
    const aiN = cfg.mode === 'quick' ? Math.max(0, Math.min(AI_PROFILES.length, cfg.aiCount ?? AI_PROFILES.length)) : 0;
    const diff = Math.max(0, Math.min(1, cfg.aiDifficulty ?? 0.5));
    AI_PROFILES.slice(0, aiN).forEach((p, i) => {
      const car = getCar(p.carId);
      const pt = PAINTS[p.paint % PAINTS.length];
      const st = effectiveStats(car, noUpgrades());
      const r = createRacer(i + 1, p.name, false, p.carId, st, pt.primary, pt.accent);
      r.ai = createAI({ skill: Math.max(0.05, Math.min(1, p.skill * (0.6 + 0.8 * diff))), speedScale: Math.min(1, p.speedScale * (0.94 + 0.12 * diff)) }, 17 + i * 31);
      r.input = emptyInput();
      this.racers.push(r);
    });
    // starting grid, behind the start line. In a quick race the player starts 3rd by default.
    if (cfg.mode === 'quick') {
      const grid: [number, number][] = [[-8, -3.4], [-8, 3.4], [-18, -3.4], [-18, 3.4]];
      const n = this.racers.length;
      const playerSlot = Math.max(0, Math.min(n - 1, (cfg.startSlot ?? 3) - 1));
      const ai = this.racers.filter((r) => !r.isPlayer);
      let k = 0;
      for (let slot = 0; slot < n; slot++) {
        const r = slot === playerSlot ? this.player : ai[k++];
        placeAt(this, r, grid[slot][0], grid[slot][1], 0);
      }
    } else placeAt(this, this.player, -8, 0, 0);
    this.event = createEvent(this);
    if (this.event) this.extraPads = this.event.extraPads;
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
    if (this.timeLimit > 0 && this.time >= this.timeLimit && this.phase === 'racing') { this.timedOut = true; this.phase = 'finished'; this.events.push({ type: 'finish', racer: this.player.id, place: this.player.place }); }
    for (const r of this.racers) {
      if (r.isPlayer && !r.finished) {
        const pi = r.input;
        pi.throttle = playerInput.throttle; pi.brake = playerInput.brake; pi.steer = playerInput.steer;
        pi.jump = playerInput.jump; pi.boost = playerInput.boost; pi.drift = playerInput.drift;
        pi.gravLeft = playerInput.gravLeft; pi.gravRight = playerInput.gravRight;
      } else if (this.event?.owns(r.id)) {
        /* driven by the event (police units) */
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
    if (this.event && this.phase === 'racing') this.event.update(dt);
    this.updatePlaces();
    if (this.phase === 'finished') {
      this.finishTimer += dt;
      if (this.finishTimer > 2.6 && !this.over) { this.over = true; this.summary = this.buildSummary(); }
    }
  }

  /** Called by an event mode when it is over (time up, escaped, busted ...). */
  endEvent() {
    if (this.phase !== 'racing') return;
    this.phase = 'finished';
    this.events.push({ type: 'finish', racer: this.player.id, place: this.player.place });
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
    if (this.timedOut) s.timedOut = true;
    if (this.event) s.event = this.event.summary();
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
