import * as THREE from 'three';
import { clamp, HALF_PI, mod, TAU } from '../core/math';
import type { CarStats, DriveInput, Obstacle, RaceEvent } from '../core/types';
import { emptyInput } from '../core/types';
import type { TrackData } from '../tracks/trackData';
import { surfacePose } from '../tracks/trackData';
import { frameAt, makeFrame } from '../tracks/trackBuilder';

export const GRAV = 38;
export const JUMP_V = 14.5;
export const HOVER = 0.55;
export const MARGIN = 1.7;
export const BOOST_DRAIN = 30;
const CURVE_FACTOR = 0.5;

export interface AIState {
  skill: number; speedScale: number; baseScale: number;
  planT: number; targetX: number; dwell: number; mistakeT: number; mistake: number;
  seed: number; jumpCool: number;
}

export interface Racer {
  id: number; name: string; isPlayer: boolean; carId: string; stats: CarStats; primary: string; accent: string;
  dist: number; s: number; x: number; vx: number; h: number; vh: number; speed: number;
  theta: number; thetaTarget: number; gravCool: number; surf: number; transit: boolean;
  boostEnergy: number; boosting: boolean; padBoost: number; padCool: number; drifting: boolean;
  stun: number; invuln: number; grounded: boolean; scrapeT: number;
  lap: number; lapIdx: number; lapStart: number; lapTimes: number[]; bestLap: number; lastCpDist: number; cpCount: number;
  finished: boolean; finishTime: number; place: number;
  input: DriveInput; ai: AIState | null;
  // stats
  gravSwitches: number; jumps: number; hits: number; driftTime: number; surfacesUsed: number; distance: number; falls: number;
  // pose
  pos: THREE.Vector3; prevPos: THREE.Vector3; quat: THREE.Quaternion; prevQuat: THREE.Quaternion;
  normal: THREE.Vector3; lat: THREE.Vector3; fwd: THREE.Vector3;
}

export interface RaceCtx {
  track: TrackData;
  time: number;
  laps: number;
  obstacles: Obstacle[];
  events: RaceEvent[];
}

export function obstacleX(o: Obstacle, time: number) {
  return o.kind === 'mover' ? o.x + Math.sin(time * o.freq * 2 + o.phase) * o.amp : o.x;
}
export const wrapDelta = (d: number, L: number) => {
  d = mod(d, L);
  return d > L / 2 ? d - L : d;
};

export function createRacer(id: number, name: string, isPlayer: boolean, carId: string, stats: CarStats, primary: string, accent: string): Racer {
  return {
    id, name, isPlayer, carId, stats, primary, accent,
    dist: 0, s: 0, x: 0, vx: 0, h: 0, vh: 0, speed: 0,
    theta: 0, thetaTarget: 0, gravCool: 0, surf: 0, transit: false,
    boostEnergy: stats.boost * 0.5, boosting: false, padBoost: 0, padCool: 0, drifting: false,
    stun: 0, invuln: 0, grounded: true, scrapeT: 0,
    lap: 1, lapIdx: -1, lapStart: 0, lapTimes: [], bestLap: Infinity, lastCpDist: -10, cpCount: 0,
    finished: false, finishTime: 0, place: 0,
    input: emptyInput(), ai: null,
    gravSwitches: 0, jumps: 0, hits: 0, driftTime: 0, surfacesUsed: 1, distance: 0, falls: 0,
    pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), quat: new THREE.Quaternion(), prevQuat: new THREE.Quaternion(),
    normal: new THREE.Vector3(0, 1, 0), lat: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 0, -1),
  };
}

const F = makeFrame();
const _m = new THREE.Matrix4();
const _nt = new THREE.Vector3();

export function updatePose(ctx: RaceCtx, r: Racer) {
  const tr = ctx.track;
  frameAt(tr.samples, r.s, F);
  surfacePose(F, tr.W, r.theta, r.x, r.h + HOVER, r.pos, r.normal, r.lat);
  r.fwd.copy(F.t);
  _nt.copy(F.t).negate();
  _m.makeBasis(r.lat, r.normal, _nt);
  r.quat.setFromRotationMatrix(_m);
}

export function placeAt(ctx: RaceCtx, r: Racer, dist: number, x: number, theta: number) {
  r.dist = dist; r.s = mod(dist, ctx.track.length); r.x = x; r.vx = 0; r.h = 0; r.vh = 0;
  r.theta = r.thetaTarget = theta; r.grounded = true;
  updatePose(ctx, r);
  r.prevPos.copy(r.pos); r.prevQuat.copy(r.quat);
}

export function respawn(ctx: RaceCtx, r: Racer) {
  const sp = Math.max(r.lastCpDist, r.dist - 3000);
  placeAt(ctx, r, sp, 0, 0);
  r.speed = 28; r.invuln = 2.2; r.stun = 0; r.boosting = false; r.padBoost = 0;
  r.lapIdx = Math.floor(r.dist / ctx.track.length);
  ctx.events.push({ type: 'respawn', racer: r.id });
}

export function stepRacer(ctx: RaceCtx, r: Racer, dt: number, racing: boolean) {
  r.prevPos.copy(r.pos); r.prevQuat.copy(r.quat);
  if (!racing) { updatePose(ctx, r); return; }
  const tr = ctx.track, L = tr.length, W = tr.W;
  const inp = r.input;
  const ev = ctx.events;

  r.stun = Math.max(0, r.stun - dt);
  r.invuln = Math.max(0, r.invuln - dt);
  r.gravCool = Math.max(0, r.gravCool - dt);
  r.padBoost = Math.max(0, r.padBoost - dt);
  r.padCool = Math.max(0, r.padCool - dt);
  r.scrapeT = Math.max(0, r.scrapeT - dt);

  // ---- gravity switching (changes which tube surface the car lives on)
  if ((inp.gravLeft || inp.gravRight) && r.gravCool <= 0) {
    r.thetaTarget += inp.gravRight ? HALF_PI : -HALF_PI;
    r.gravCool = 0.24;
    r.gravSwitches++;
    ev.push({ type: 'gravity', racer: r.id });
  }
  const dth = r.thetaTarget - r.theta;
  r.theta += dth * (1 - Math.exp(-15 * dt));
  if (Math.abs(dth) < 0.002) r.theta = r.thetaTarget;
  const wrapT = Math.floor(r.thetaTarget / TAU) * TAU;
  if (wrapT !== 0) { r.thetaTarget -= wrapT; r.theta -= wrapT; }
  const q = r.theta / HALF_PI;
  const kNear = mod(Math.round(q), 4);
  r.surf = kNear;
  r.transit = Math.abs(q - Math.round(q)) > 0.18;
  r.surfacesUsed |= 1 << kNear;

  frameAt(tr.samples, r.s, F);
  const c = Math.cos(r.theta), sn = Math.sin(r.theta);
  // surface lateral axis = R*cos + U*sin
  const latx = F.r.x * c + F.u.x * sn, laty = F.r.y * c + F.u.y * sn, latz = F.r.z * c + F.u.z * sn;

  // ---- boost
  const wantBoost = inp.boost && r.boostEnergy > 3 && r.speed > 5;
  if (wantBoost && !r.boosting) { r.boosting = true; ev.push({ type: 'boostStart', racer: r.id }); }
  if (!wantBoost && r.boosting) r.boosting = false;
  if (r.boosting) {
    r.boostEnergy -= BOOST_DRAIN * dt;
    if (r.boostEnergy <= 0) { r.boostEnergy = 0; r.boosting = false; }
  }
  // ---- longitudinal
  const padOn = r.padBoost > 0;
  const topMul = Math.max(r.boosting ? 1.4 : 1, padOn ? 1.28 : 1) * (r.stun > 0 ? 0.55 : 1);
  const targetTop = r.stats.top * topMul;
  if (inp.throttle > 0) {
    const aMul = (r.boosting ? 2.3 : 1) * (padOn ? 2 : 1);
    const k = clamp(1 - r.speed / targetTop, 0, 1);
    r.speed += r.stats.accel * aMul * inp.throttle * (0.25 + 0.75 * Math.sqrt(k)) * dt * (k > 0 ? 1 : 0);
  }
  if (r.speed > targetTop) r.speed -= (r.speed - targetTop) * 1.4 * dt;
  if (inp.brake > 0) r.speed -= 75 * inp.brake * dt;
  else if (inp.throttle === 0) r.speed -= (3 + r.speed * 0.12) * dt;
  r.speed = Math.max(0, r.speed);

  // ---- drift
  const wasDrift = r.drifting;
  r.drifting = inp.drift && Math.abs(inp.steer) > 0.25 && r.speed > 32 && r.grounded && !r.transit;
  if (r.drifting) {
    r.driftTime += dt;
    r.boostEnergy = Math.min(r.stats.boost, r.boostEnergy + 13 * dt);
  } else if (!r.boosting) {
    r.boostEnergy = Math.min(r.stats.boost, r.boostEnergy + 2.2 * dt);
  }
  void wasDrift;

  // ---- lateral
  const spdF = clamp(r.speed / 22, 0.2, 1);
  const maxLat = 17 * r.stats.handling * (r.drifting ? 1.4 : 1);
  const steer = inp.steer * (r.stun > 0 ? 0.35 : 1);
  const targetVx = steer * maxLat * spdF;
  const push = -(F.k.x * latx + F.k.y * laty + F.k.z * latz) * r.speed * r.speed * CURVE_FACTOR;
  r.vx += clamp(push, -60, 60) * dt;
  const rate = r.drifting ? 4.2 : 9;
  r.vx += (targetVx - r.vx) * (1 - Math.exp(-rate * dt));
  r.x += r.vx * dt;
  const lim = W - MARGIN;
  if (r.x > lim || r.x < -lim) {
    const side = Math.sign(r.x);
    r.x = side * lim;
    if (r.vx * side > 2) {
      r.speed *= 1 - 0.5 * dt;
      if (r.scrapeT <= 0) { ev.push({ type: 'scrape', racer: r.id }); r.scrapeT = 0.12; }
    }
    r.vx = -r.vx * 0.15;
  }

  // ---- vertical / support
  const supported = r.transit || !(tr.gapMask(r.s) & (1 << kNear));
  if (r.grounded) {
    if (!supported) { r.grounded = false; r.vh = 0; }
    else if (inp.jump && r.stun < 0.25) {
      r.vh = JUMP_V; r.grounded = false; r.jumps++;
      ev.push({ type: 'jump', racer: r.id });
    }
  }
  if (!r.grounded) {
    r.vh -= GRAV * dt;
    r.h += r.vh * dt;
    if (supported && r.h <= 0 && r.h > -1.3 && r.vh <= 0) {
      if (r.vh < -9) ev.push({ type: 'land', racer: r.id, intensity: clamp(-r.vh / 22, 0, 1) });
      r.h = 0; r.vh = 0; r.grounded = true;
    }
  }
  const hMax = 2 * W - 3.4;
  if (r.h > hMax) { r.h = hMax; if (r.vh > 0) r.vh = -r.vh * 0.25; }
  if (r.h < -24) {
    r.falls++;
    ev.push({ type: 'fall', racer: r.id });
    respawn(ctx, r);
    updatePose(ctx, r);
    return;
  }

  // ---- obstacles
  if (r.invuln <= 0 && !r.transit) {
    for (let i = 0; i < ctx.obstacles.length; i++) {
      const o = ctx.obstacles[i];
      if (o.surface !== kNear) continue;
      const d = wrapDelta(o.s - r.s, L);
      if (d > o.hl + 1.9 || d < -(o.hl + 1.9)) continue;
      if (Math.abs(r.x - obstacleX(o, ctx.time)) > o.hw + 1.15) continue;
      if (r.h > o.height - 0.35) continue;
      r.hits++;
      r.invuln = 1.1; r.stun = 0.7;
      const inten = clamp(r.speed / r.stats.top, 0.2, 1.3);
      r.speed *= 0.42; r.boosting = false;
      r.vx = (r.x >= obstacleX(o, ctx.time) ? 1 : -1) * 9;
      ev.push({ type: 'hit', racer: r.id, intensity: inten });
      break;
    }
  }
  // ---- pads
  if (r.padCool <= 0 && !r.transit) {
    for (let i = 0; i < tr.pads.length; i++) {
      const p = tr.pads[i];
      if (p.surface !== kNear) continue;
      const d = wrapDelta(p.s - r.s, L);
      if (Math.abs(d) > p.hl + 1) continue;
      if (Math.abs(r.x - p.x) > p.hw + 1.1 || r.h > 2) continue;
      r.padCool = 0.5;
      if (p.kind === 'boost') {
        r.padBoost = 1.5;
        r.speed = Math.max(r.speed, r.stats.top * 0.92) + 4;
        ev.push({ type: 'pad', racer: r.id, kind: 'boost' });
      } else if (r.grounded) {
        r.vh = 21; r.grounded = false; r.jumps++;
        ev.push({ type: 'pad', racer: r.id, kind: 'jump' });
      }
      break;
    }
  }

  // ---- advance along the track, laps and checkpoints
  const prev = r.dist;
  r.dist += r.speed * dt;
  r.distance += r.speed * dt;
  r.s = mod(r.dist, L);
  const idx = Math.floor(r.dist / L);
  if (idx > r.lapIdx) {
    if (idx >= 1) {
      const lt = ctx.time - r.lapStart;
      const best = lt < r.bestLap;
      if (best) r.bestLap = lt;
      r.lapTimes.push(lt);
      ev.push({ type: 'lap', racer: r.id, lap: idx, time: lt, best });
    }
    r.lapStart = ctx.time;
    r.lapIdx = idx;
    r.lap = ctx.laps > 0 ? Math.min(idx + 1, ctx.laps) : idx + 1;
  }
  for (let k = 0; k < tr.checkpoints.length; k++) {
    const base = Math.floor(prev / L) * L + tr.checkpoints[k];
    for (const off of [0, L]) {
      const b = base + off;
      if (prev < b && r.dist >= b) {
        r.lastCpDist = b; r.cpCount++;
        ev.push({ type: 'checkpoint', racer: r.id, index: k });
      }
    }
  }
  if (!r.finished && ctx.laps > 0 && r.dist >= ctx.laps * L) {
    r.finished = true;
    r.finishTime = ctx.time - (r.dist - ctx.laps * L) / Math.max(r.speed, 1);
  }
  updatePose(ctx, r);
}
