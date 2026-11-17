import { rng, TAU } from '../core/math';
import type { ChallengeGate, Gap, Obstacle, ObstacleKind, Pad, Range } from '../core/types';
import { TrackDef, getTrackDef } from './definitions';
import { buildPath, frameAt, makeFrame, Frame, TrackSamples } from './trackBuilder';

export interface TrackData {
  def: TrackDef;
  W: number;
  samples: TrackSamples;
  length: number;
  gaps: Gap[];
  tunnels: Range[];
  obstacles: Obstacle[];
  pads: Pad[];
  checkpoints: number[];
  gates: ChallengeGate[];
  closureError: number;
  /** Bitmask of surfaces with no floor at arc position s. */
  gapMask(s: number): number;
  inTunnel(s: number): boolean;
}

const cache = new Map<string, TrackData>();

function weighted<T>(r: () => number, items: [T, number][]): T {
  const tot = items.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const [v, w] of items) { if ((x -= w) <= 0) return v; }
  return items[items.length - 1][0];
}

export function buildTrack(def: TrackDef): TrackData {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const built = buildPath(def.cmds);
  const samples = built.samples;
  const L = samples.length;
  const rand = rng(def.seed);

  const gaps: Gap[] = def.gaps.map((g) => {
    let mask = 0;
    for (const k of g.surfaces) mask |= 1 << k;
    // snap to sample boundaries so the rendered hole matches the physics exactly
    const ds = samples.ds;
    const s0 = Math.round((g.f * L) / ds) * ds;
    return { s0, s1: s0 + Math.max(1, Math.round(g.len / ds)) * ds, mask };
  });
  const tunnels: Range[] = def.tunnels.map(([a, b]) => ({ s0: a * L, s1: b * L }));
  const gapMask = (s: number) => {
    const q = ((s % L) + L) % L;
    for (let i = 0; i < gaps.length; i++) if (q >= gaps[i].s0 && q <= gaps[i].s1) return gaps[i].mask;
    return 0;
  };
  const nearGap = (s: number, pad: number) => gaps.some((g) => s > g.s0 - pad && s < g.s1 + pad);

  // checkpoints
  const checkpoints: number[] = [];
  for (const f of [0.25, 0.5, 0.75]) {
    let s = f * L;
    while (nearGap(s, 60)) s += 20;
    checkpoints.push(s);
  }

  // obstacles
  const obstacles: Obstacle[] = [];
  const pads: Pad[] = [];
  const spec = def.obstacles;
  let id = 0;
  const span = (spec.f1 - spec.f0) * L;
  for (let i = 0; i < spec.count; i++) {
    const s = spec.f0 * L + ((i + 0.5 + (rand() - 0.5) * 0.5) * span) / spec.count;
    if (s < 160 || s > L - 140 || nearGap(s, 40)) continue;
    if (checkpoints.some((c) => Math.abs(c - s) < 30)) continue;
    const kind = weighted<ObstacleKind>(rand, spec.kinds);
    const surface = weighted<number>(rand, spec.surfaceWeights.map((w, k) => [k, w] as [number, number]));
    const mk = (x: number, k: ObstacleKind): Obstacle => {
      const o: Obstacle = {
        id: id++, kind: k, s, surface, x, hw: 1.8, hl: 1.6, height: 3.4, amp: 0, freq: 0, phase: 0,
      };
      if (k === 'low') { o.hw = 3.4; o.hl = 1.2; o.height = 1.0; }
      if (k === 'mover') { o.x = 0; o.hw = 1.6; o.amp = def.width * 0.45; o.freq = 0.8 + rand() * 0.7; o.phase = rand() * TAU; }
      return o;
    };
    if (kind === 'block' && rand() < spec.slalom) {
      obstacles.push(mk(-4.2, 'block'), mk(4.2, 'block'));
    } else if (kind === 'mover') {
      obstacles.push(mk(0, 'mover'));
    } else {
      obstacles.push(mk((rand() - 0.5) * 9, kind));
    }
  }
  // pads
  id = 0;
  const addPad = (kind: 'boost' | 'jump', s: number, surface: number, x: number) => {
    pads.push({ id: id++, kind, s, surface, x, hw: 2.6, hl: kind === 'boost' ? 4.5 : 3.5 });
  };
  const padSurfaces = def.pads.surfaceWeights.map((w, k) => [k, w] as [number, number]);
  for (let i = 0; i < def.pads.boost; i++) {
    const s = ((i + 0.5 + (rand() - 0.5) * 0.4) / def.pads.boost) * (L - 400) + 200;
    if (nearGap(s, 25)) continue;
    addPad('boost', s, weighted<number>(rand, padSurfaces), (rand() - 0.5) * 7);
  }
  for (let i = 0; i < def.pads.jump; i++) {
    const s = ((i + 0.7) / Math.max(1, def.pads.jump)) * (L - 500) + 250;
    if (nearGap(s, 25)) continue;
    addPad('jump', s, 0, (rand() - 0.5) * 4);
  }
  // run-up boost pads before gaps that cover every surface
  for (const g of gaps) if (g.mask === 15) addPad('boost', g.s0 - 40, 0, 0);

  // keep obstacles clear of pads on the same surface
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (pads.some((p) => p.surface === o.surface && Math.abs(p.s - o.s) < 14)) obstacles.splice(i, 1);
  }
  obstacles.forEach((o, i) => (o.id = i));

  // gravity challenge gates: neighbouring gates differ by at most one quarter turn
  const gates: ChallengeGate[] = [];
  {
    const gr = rng(def.seed + 77);
    let surf = 0;
    let gid = 0;
    for (let s = 150; s < L - 120; s += 62) {
      let ns = surf;
      if (gr() < 0.7) ns = (surf + (gr() < 0.5 ? 1 : 3)) % 4;
      let tries = 0;
      while (gapMask(s) & (1 << ns) && tries++ < 4) ns = (ns + 1) % 4;
      if (gapMask(s) === 15) continue;
      surf = ns;
      gates.push({ id: gid++, s, surface: surf, x: (gr() - 0.5) * 6, hw: 4.6 });
    }
  }

  const td: TrackData = {
    def, W: def.width, samples, length: L, gaps, tunnels, obstacles, pads, checkpoints, gates,
    closureError: built.closureError,
    gapMask,
    inTunnel: (s: number) => {
      const q = ((s % L) + L) % L;
      return tunnels.some((t) => q >= t.s0 && q <= t.s1);
    },
  };
  cache.set(def.id, td);
  return td;
}

export const getTrack = (id: string) => buildTrack(getTrackDef(id));

/** World placement of a point on the gravity tube. theta=0 is the floor. */
export function surfacePose(f: Frame, W: number, theta: number, x: number, h: number, outPos: { x: number; y: number; z: number } & { set: (x: number, y: number, z: number) => unknown }, normal?: { set: (x: number, y: number, z: number) => unknown }, lat?: { set: (x: number, y: number, z: number) => unknown }) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const nx = f.u.x * c - f.r.x * s, ny = f.u.y * c - f.r.y * s, nz = f.u.z * c - f.r.z * s;
  const rx = f.r.x * c + f.u.x * s, ry = f.r.y * c + f.u.y * s, rz = f.r.z * c + f.u.z * s;
  const d = W - h;
  outPos.set(f.p.x - nx * d + rx * x, f.p.y - ny * d + ry * x, f.p.z - nz * d + rz * x);
  normal?.set(nx, ny, nz);
  lat?.set(rx, ry, rz);
}
export { frameAt, makeFrame };
