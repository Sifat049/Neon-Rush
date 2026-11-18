import * as THREE from 'three';
import { smooth01 } from '../core/math';

/** Path commands interpreted by a "turtle". Angles in degrees. */
export type Cmd =
  | { t: 's'; len: number; free?: boolean }
  | { t: 'turn'; deg: number; r: number } // +deg = left yaw
  | { t: 'hill'; deg: number; len: number } // +deg = pitch up over len
  | { t: 'loop'; r: number; shift: number } // vertical loop with lateral shift (exact, analytic)
  | { t: 'twist'; deg: number; len: number }; // roll the whole tube over len

export const DS = 2; // sample spacing (m)

export interface TrackSamples {
  n: number;
  length: number;
  ds: number;
  P: Float32Array;
  T: Float32Array;
  U: Float32Array;
  R: Float32Array;
  K: Float32Array; // dT/ds
}

const RAW_STEP = 1;

interface RawPath { pts: THREE.Vector3[]; ups: THREE.Vector3[]; startT: THREE.Vector3[] }

function simulate(cmds: Cmd[], lens: number[]): RawPath {
  const pts: THREE.Vector3[] = [];
  const ups: THREE.Vector3[] = [];
  const startT: THREE.Vector3[] = [];
  const p = new THREE.Vector3(0, 0, 0);
  const T = new THREE.Vector3(0, 0, -1);
  const U = new THREE.Vector3(0, 1, 0);
  const R = new THREE.Vector3(1, 0, 0);
  let yr = 0, pr = 0, rr = 0;
  pts.push(p.clone());
  ups.push(U.clone());

  const ortho = () => {
    T.normalize();
    R.crossVectors(T, U).normalize();
    U.crossVectors(R, T).normalize();
  };
  const adv = (ty: number, tp: number, tr: number) => {
    const a = 0.14;
    yr += (ty - yr) * a; pr += (tp - pr) * a; rr += (tr - rr) * a;
    if (yr) { T.applyAxisAngle(U, yr); R.applyAxisAngle(U, yr); }
    if (pr) { T.applyAxisAngle(R, pr); U.applyAxisAngle(R, pr); }
    if (rr) { U.applyAxisAngle(T, rr); R.applyAxisAngle(T, rr); }
    ortho();
    p.addScaledVector(T, RAW_STEP);
    pts.push(p.clone());
    ups.push(U.clone());
  };

  cmds.forEach((c, i) => {
    startT[i] = T.clone();
    if (c.t === 's') {
      const steps = Math.max(1, Math.round(lens[i]));
      for (let k = 0; k < steps; k++) adv(0, 0, 0);
    } else if (c.t === 'turn') {
      const rad = (c.deg * Math.PI) / 180;
      const steps = Math.max(2, Math.round(Math.abs(rad) * c.r));
      for (let k = 0; k < steps; k++) adv(rad / steps, 0, 0);
    } else if (c.t === 'hill') {
      const rad = (c.deg * Math.PI) / 180;
      const steps = Math.max(2, Math.round(c.len));
      for (let k = 0; k < steps; k++) adv(0, rad / steps, 0);
    } else if (c.t === 'twist') {
      const rad = (c.deg * Math.PI) / 180;
      const steps = Math.max(2, Math.round(c.len));
      for (let k = 0; k < steps; k++) adv(0, 0, rad / steps);
    } else if (c.t === 'loop') {
      yr = pr = rr = 0;
      const T0 = T.clone(), U0 = U.clone(), R0 = R.clone(), p0 = p.clone();
      const steps = Math.ceil((2 * Math.PI * c.r * 1.08) / RAW_STEP);
      const tmpT = new THREE.Vector3(), tmpU = new THREE.Vector3();
      for (let j = 1; j <= steps; j++) {
        const f = j / steps;
        const phi = f * Math.PI * 2;
        const sf = smooth01(f);
        const dsf = 6 * f * (1 - f); // d(smooth)/df
        p.copy(p0)
          .addScaledVector(T0, c.r * Math.sin(phi))
          .addScaledVector(U0, c.r * (1 - Math.cos(phi)))
          .addScaledVector(R0, c.shift * sf);
        // tangent = derivative wrt phi
        tmpT.set(0, 0, 0)
          .addScaledVector(T0, c.r * Math.cos(phi))
          .addScaledVector(U0, c.r * Math.sin(phi))
          .addScaledVector(R0, (c.shift * dsf) / (2 * Math.PI))
          .normalize();
        tmpU.set(0, 0, 0).addScaledVector(T0, -Math.sin(phi)).addScaledVector(U0, Math.cos(phi));
        tmpU.addScaledVector(tmpT, -tmpU.dot(tmpT)).normalize();
        pts.push(p.clone());
        ups.push(tmpU.clone());
      }
      p.copy(pts[pts.length - 1]);
      T.copy(T0); U.copy(U0); R.copy(R0);
    }
  });
  return { pts, ups, startT };
}

/** End position (x,z) and heading vector of a command list, using each straight's nominal length. */
export function endPose(cmds: Cmd[]) {
  const raw = simulate(cmds, cmds.map((c) => (c.t === 's' ? c.len : 0)));
  const n = raw.pts.length;
  const a = raw.pts[n - 2], b = raw.pts[n - 1];
  const tx = b.x - a.x, tz = b.z - a.z, m = Math.hypot(tx, tz) || 1;
  return { x: b.x, y: b.y, z: b.z, tx: tx / m, tz: tz / m };
}

/** Like endPose, plus the heading at the start of every command (used by the track editor's closure planner). */
export function analyzePath(cmds: Cmd[]) {
  const raw = simulate(cmds, cmds.map((c) => (c.t === 's' ? c.len : 0)));
  const n = raw.pts.length;
  const a = raw.pts[n - 2], b = raw.pts[n - 1];
  const m = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { end: { x: b.x, y: b.y, z: b.z, tx: (b.x - a.x) / m, tz: (b.z - a.z) / m }, startT: raw.startT.map((t) => ({ x: t.x, z: t.z })) };
}

export interface BuiltPath { samples: TrackSamples; closureError: number; closureXZ: number; rollFix: number; lens: number[] }

export function buildPath(cmds: Cmd[]): BuiltPath {
  const lens = cmds.map((c) => (c.t === 's' ? c.len : 0));
  const free = cmds.map((c, i) => (c.t === 's' && c.free ? i : -1)).filter((i) => i >= 0);
  let raw = simulate(cmds, lens);
  // Solve closure by adjusting two "free" straights (least squares in 3D).
  if (free.length >= 2) {
    for (let it = 0; it < 8; it++) {
      const e = raw.pts[raw.pts.length - 1].clone().sub(raw.pts[0]);
      if (e.length() < 0.4) break;
      const a = raw.startT[free[0]], b = raw.startT[free[1]];
      const aa = a.dot(a), ab = a.dot(b), bb = b.dot(b);
      const ea = -e.dot(a), eb = -e.dot(b);
      const det = aa * bb - ab * ab;
      if (Math.abs(det) < 1e-6) break;
      const da = (ea * bb - eb * ab) / det;
      const db = (aa * eb - ab * ea) / det;
      lens[free[0]] = Math.max(30, lens[free[0]] + da);
      lens[free[1]] = Math.max(30, lens[free[1]] + db);
      raw = simulate(cmds, lens);
    }
  }
  const { pts, ups } = raw;
  const closureError = pts[pts.length - 1].distanceTo(pts[0]);
  const err = pts[pts.length - 1].clone().sub(pts[0]);
  const upEnd = ups[ups.length - 1].clone();
  // cumulative raw length
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const totalRaw = cum[cum.length - 1];
  for (let i = 0; i < pts.length; i++) pts[i].addScaledVector(err, -cum[i] / totalRaw);
  pts.pop();
  ups.pop();

  // Resample uniformly along the closed polyline.
  const m = pts.length;
  const seg: number[] = [0];
  for (let i = 1; i <= m; i++) seg[i] = seg[i - 1] + pts[i % m].distanceTo(pts[i - 1]);
  const L = seg[m];
  const n = Math.round(L / DS);
  const ds = L / n;
  const P = new Float32Array(n * 3), T = new Float32Array(n * 3), U = new Float32Array(n * 3), R = new Float32Array(n * 3), K = new Float32Array(n * 3);
  const pp: THREE.Vector3[] = [], uu: THREE.Vector3[] = [];
  let cur = 0;
  for (let k = 0; k < n; k++) {
    const target = k * ds;
    while (cur < m - 1 && seg[cur + 1] < target) cur++;
    const a = pts[cur], b = pts[(cur + 1) % m];
    const f = (target - seg[cur]) / Math.max(1e-6, seg[cur + 1] - seg[cur]);
    pp.push(a.clone().lerp(b, f));
    uu.push(ups[cur].clone().lerp(ups[(cur + 1) % m], f).normalize());
  }
  const tt: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    tt.push(pp[(k + 1) % n].clone().sub(pp[(k - 1 + n) % n]).normalize());
  }
  // Up-vector roll closure
  const u0 = uu[0].clone().addScaledVector(tt[0], -uu[0].dot(tt[0])).normalize();
  const ue = upEnd.clone().addScaledVector(tt[0], -upEnd.dot(tt[0])).normalize();
  let rollFix = Math.acos(Math.min(1, Math.max(-1, u0.dot(ue))));
  const sgn = Math.sign(tt[0].dot(new THREE.Vector3().crossVectors(ue, u0)));
  rollFix *= sgn || 1;
  const tmp = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const u = uu[k].addScaledVector(tt[k], -uu[k].dot(tt[k])).normalize();
    u.applyAxisAngle(tt[k], (rollFix * k) / n);
    const r = tmp.crossVectors(tt[k], u).normalize().clone();
    u.crossVectors(r, tt[k]).normalize();
    uu[k] = u;
    R.set([r.x, r.y, r.z], k * 3);
    U.set([u.x, u.y, u.z], k * 3);
    P.set([pp[k].x, pp[k].y, pp[k].z], k * 3);
    T.set([tt[k].x, tt[k].y, tt[k].z], k * 3);
  }
  for (let k = 0; k < n; k++) {
    const a = tt[(k + 1) % n], b = tt[(k - 1 + n) % n];
    K.set([(a.x - b.x) / (2 * ds), (a.y - b.y) / (2 * ds), (a.z - b.z) / (2 * ds)], k * 3);
  }
  return { samples: { n, length: L, ds, P, T, U, R, K }, closureError, closureXZ: Math.hypot(err.x, err.z), rollFix, lens };
}

export interface Frame {
  p: THREE.Vector3; t: THREE.Vector3; u: THREE.Vector3; r: THREE.Vector3; k: THREE.Vector3;
}
export const makeFrame = (): Frame => ({
  p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), r: new THREE.Vector3(), k: new THREE.Vector3(),
});

/** Interpolated frame at arc position s (wraps). */
export function frameAt(sm: TrackSamples, s: number, out: Frame): Frame {
  let q = s / sm.ds;
  q = ((q % sm.n) + sm.n) % sm.n;
  const i = Math.floor(q);
  const f = q - i;
  const j = (i + 1) % sm.n;
  const i3 = i * 3, j3 = j * 3;
  const l = (A: Float32Array, o: number) => A[i3 + o] + (A[j3 + o] - A[i3 + o]) * f;
  out.p.set(l(sm.P, 0), l(sm.P, 1), l(sm.P, 2));
  out.t.set(l(sm.T, 0), l(sm.T, 1), l(sm.T, 2)).normalize();
  out.u.set(l(sm.U, 0), l(sm.U, 1), l(sm.U, 2));
  out.u.addScaledVector(out.t, -out.u.dot(out.t)).normalize();
  out.r.crossVectors(out.t, out.u).normalize();
  out.k.set(l(sm.K, 0), l(sm.K, 1), l(sm.K, 2));
  return out;
}
