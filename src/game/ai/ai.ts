import { angDiff, clamp, HALF_PI, mod, rng } from '../core/math';
import { AIState, Racer, RaceCtx, obstacleX, wrapDelta, MARGIN } from '../physics/racerPhysics';

export interface AIProfile { name: string; carId: string; skill: number; speedScale: number; paint: number }
export const AI_PROFILES: AIProfile[] = [
  { name: 'ZERO-9', carId: 'eclipse', skill: 0.92, speedScale: 0.9, paint: 7 },
  { name: 'JETT', carId: 'nova', skill: 0.62, speedScale: 0.88, paint: 3 },
  { name: 'ROOK', carId: 'viper', skill: 0.3, speedScale: 0.82, paint: 2 },
];

export function createAI(profile: { skill: number; speedScale: number }, seed: number): AIState {
  return {
    skill: profile.skill, speedScale: profile.speedScale, baseScale: profile.speedScale,
    planT: 0, targetX: 0, dwell: 0, mistakeT: 3 + (seed % 5), mistake: 0, seed, jumpCool: 0,
  };
}

/** Waypoint/spline following AI: picks a gravity surface, a lateral line and throttle/boost each tick. */
export function updateAI(ctx: RaceCtx, r: Racer, dt: number, player?: Racer) {
  const ai = r.ai!;
  const tr = ctx.track, L = tr.length, W = tr.W;
  const inp = r.input;
  inp.gravLeft = false; inp.gravRight = false; inp.jump = false; inp.drift = false;
  ai.dwell += dt; ai.planT -= dt; ai.jumpCool = Math.max(0, ai.jumpCool - dt);
  const look = clamp(r.speed * 0.85, 32, 90);
  const curK = mod(Math.round(r.thetaTarget / HALF_PI), 4);
  const lim = W - MARGIN - 0.4;

  // rubber banding keeps races close without cheating the player
  if (player && !player.finished && !r.isPlayer) {
    const gap = player.dist - r.dist;
    const bump = clamp(gap / 900, -0.07, 0.08) * (0.4 + ai.skill * 0.6);
    ai.speedScale = ai.baseScale + bump;
  }

  if (ai.planT <= 0) {
    ai.planT = 0.1;
    const cost = [0, 0, 0, 0];
    let fullGap = false;
    for (const g of tr.gaps) {
      const gs = wrapDelta(g.s0 - r.s, L), ge = wrapDelta(g.s1 - r.s, L);
      if (ge > -6 && gs < look + 18) {
        if (g.mask === 15) fullGap = true;
        else for (let k = 0; k < 4; k++) if (g.mask & (1 << k)) cost[k] += 900;
      }
    }
    void fullGap;
    for (const o of ctx.obstacles) {
      const d = wrapDelta(o.s - r.s, L);
      if (d < -3 || d > look + 12) continue;
      const w = o.kind === 'mover' ? 34 : o.kind === 'low' ? 14 : 22;
      cost[o.surface] += w * (1 - d / (look + 12));
    }
    for (const p of tr.pads) {
      if (p.kind !== 'boost') continue;
      const d = wrapDelta(p.s - r.s, L);
      if (d < 0 || d > look + 12) continue;
      cost[p.surface] -= 9 * (1 - d / (look + 12));
    }
    for (let k = 0; k < 4; k++) {
      const steps = Math.abs(Math.round(angDiff(curK * HALF_PI, k * HALF_PI) / HALF_PI));
      cost[k] += steps * 6;
    }
    cost[curK] -= 8 + (1 - ai.skill) * 18; // beginners are lazier about switching
    let best = curK;
    for (let k = 0; k < 4; k++) if (cost[k] < cost[best]) best = k;
    if (best !== curK && (ai.dwell > 0.9 || cost[curK] > 800) && r.gravCool <= 0) {
      const diff = mod(best - curK, 4);
      if (diff === 1) inp.gravRight = true;
      else if (diff === 3) inp.gravLeft = true;
      else (cost[mod(curK + 1, 4)] <= cost[mod(curK + 3, 4)] ? (inp.gravRight = true) : (inp.gravLeft = true));
      ai.dwell = 0;
    }

    // lateral line on the surface we are (heading to)
    const surf = best === curK ? curK : curK;
    let bestX = ai.targetX, bestC = 1e9;
    for (let x = -lim; x <= lim + 0.01; x += 0.9) {
      let c = Math.abs(x - r.x) * 0.25 + Math.abs(x - ai.targetX) * 0.1 + Math.max(0, Math.abs(x) - lim + 1) * 3;
      for (const o of ctx.obstacles) {
        if (o.surface !== surf) continue;
        const d = wrapDelta(o.s - r.s, L);
        if (d < -2 || d > look) continue;
        const ox = obstacleX(o, ctx.time);
        const half = o.hw + (o.kind === 'mover' ? o.amp : 0) + 1.7;
        if (Math.abs(x - ox) < half) c += 60 * (1 - d / look) + 8;
      }
      for (const p of tr.pads) {
        if (p.surface !== surf || p.kind !== 'boost') continue;
        const d = wrapDelta(p.s - r.s, L);
        if (d < 0 || d > look) continue;
        if (Math.abs(x - p.x) < p.hw) c -= 2.5;
      }
      if (c < bestC) { bestC = c; bestX = x; }
    }
    ai.targetX += (bestX - ai.targetX) * 0.5;
  }

  // mistakes: beginners occasionally drift wide or lift off the throttle
  ai.mistakeT -= dt;
  if (ai.mistakeT <= 0) {
    const r2 = rng(ai.seed++ * 9301 + 49297)();
    ai.mistakeT = 2 + r2 * 6 * (0.5 + ai.skill);
    ai.mistake = r2 < (1 - ai.skill) * 0.6 ? 0.6 : 0;
  }
  const noise = ai.mistake > 0 ? (ai.mistake -= dt, Math.sin(ctx.time * 5 + ai.seed) * 0.6) : 0;

  const err = ai.targetX - r.x;
  inp.steer = clamp(err * 0.55 - r.vx * 0.085 + noise, -1, 1);

  // speed management
  const targetSpeed = r.stats.top * ai.speedScale * (ai.mistake > 0 ? 0.8 : 1);
  inp.throttle = r.speed < targetSpeed ? 1 : 0.35;
  inp.brake = r.speed > targetSpeed * 1.25 ? 0.5 : 0;
  const boostAt = 100 - ai.skill * 70;
  inp.boost = r.boosting ? r.boostEnergy > 5 : r.boostEnergy / r.stats.boost * 100 > boostAt && Math.abs(inp.steer) < 0.4 && r.speed > r.stats.top * 0.8;

  // jump gaps that cover the surface we are on
  if (r.grounded && ai.jumpCool <= 0) {
    for (const g of tr.gaps) {
      const d = wrapDelta(g.s0 - r.s, L);
      if (d > 0 && d < r.speed * 0.2 + 3 && (g.mask & (1 << curK))) {
        inp.jump = true; ai.jumpCool = 1.0;
        break;
      }
    }
  }
}
