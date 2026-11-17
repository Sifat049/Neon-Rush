import * as THREE from 'three';
import { TrackData } from './trackData';
import { frameAt, makeFrame, Frame } from './trackBuilder';
import { rng } from '../core/math';

const HALF_PI = Math.PI / 2;

/** Basis of gravity surface k at frame f: n (inward normal), r (lateral axis). */
export function surfaceBasis(f: Frame, k: number, n: THREE.Vector3, r: THREE.Vector3) {
  const c = Math.cos(k * HALF_PI), s = Math.sin(k * HALF_PI);
  n.set(f.u.x * c - f.r.x * s, f.u.y * c - f.r.y * s, f.u.z * c - f.r.z * s);
  r.set(f.r.x * c + f.u.x * s, f.r.y * c + f.u.y * s, f.r.z * c + f.u.z * s);
}

/** All four tube surfaces as one indexed strip geometry. Quads inside gaps are omitted. */
export function buildRoadGeometry(tr: TrackData): THREE.BufferGeometry {
  const sm = tr.samples, n = sm.n, W = tr.W;
  const vCount = 4 * (n + 1) * 2;
  const pos = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2), tun = new Float32Array(vCount), kind = new Float32Array(vCount);
  const idx: number[] = [];
  const f = makeFrame(), nn = new THREE.Vector3(), rr = new THREE.Vector3();
  let v = 0;
  for (let k = 0; k < 4; k++) {
    const base = v;
    for (let i = 0; i <= n; i++) {
      const s = i * sm.ds;
      frameAt(sm, s, f);
      surfaceBasis(f, k, nn, rr);
      const t = tr.inTunnel(s) ? 1 : 0;
      for (const side of [-1, 1]) {
        pos[v * 3] = f.p.x - nn.x * W + rr.x * W * side;
        pos[v * 3 + 1] = f.p.y - nn.y * W + rr.y * W * side;
        pos[v * 3 + 2] = f.p.z - nn.z * W + rr.z * W * side;
        uv[v * 2] = side < 0 ? 0 : 1; uv[v * 2 + 1] = s;
        tun[v] = t; kind[v] = k; v++;
      }
    }
    for (let i = 0; i < n; i++) {
      const mid = (i + 0.5) * sm.ds;
      if (tr.gapMask(mid) & (1 << k)) continue;
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aTun', new THREE.BufferAttribute(tun, 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Glowing corner rails (cross-shaped ribbons) — they stay across gaps and outline the tube. */
export function buildRailGeometry(tr: TrackData, colA: THREE.Color, colB: THREE.Color): THREE.BufferGeometry {
  const sm = tr.samples, n = sm.n, W = tr.W;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const f = makeFrame(), nn = new THREE.Vector3(), rr = new THREE.Vector3();
  const c = new THREE.Vector3(), bis = new THREE.Vector3(), perp = new THREE.Vector3();
  let v = 0;
  for (let k = 0; k < 4; k++) {
    const start = v;
    for (let i = 0; i <= n; i++) {
      const s = i * sm.ds;
      frameAt(sm, s, f);
      surfaceBasis(f, k, nn, rr);
      c.copy(f.p).addScaledVector(nn, -W).addScaledVector(rr, W);
      bis.copy(nn).sub(rr).normalize(); // toward centre
      perp.copy(nn).add(rr).normalize();
      const cc = ((Math.floor(s / 16) + k) % 2 === 0 ? colA : colB);
      const ints = 2.4;
      // ribbon 1 (along bisector)
      for (const o of [0, 0.9]) { pos.push(c.x + bis.x * o, c.y + bis.y * o, c.z + bis.z * o); col.push(cc.r * ints * (1 - o * 0.4), cc.g * ints * (1 - o * 0.4), cc.b * ints * (1 - o * 0.4)); v++; }
      // ribbon 2 (perpendicular, offset inward)
      for (const o of [-0.45, 0.45]) { pos.push(c.x + bis.x * 0.45 + perp.x * o, c.y + bis.y * 0.45 + perp.y * o, c.z + bis.z * 0.45 + perp.z * o); col.push(cc.r * ints, cc.g * ints, cc.b * ints); v++; }
    }
    for (let i = 0; i < n; i++) {
      const a = start + i * 4, b = a + 4;
      idx.push(a, a + 1, b, a + 1, b + 1, b, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _T = new THREE.Vector3();
export function composeBasis(out: THREE.Matrix4, pos: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, sx: number, sy: number, sz: number) {
  out.makeBasis(x, y, z);
  out.scale(_s.set(sx, sy, sz));
  out.setPosition(pos);
  return out;
}

export interface BarInstances { matrices: THREE.Matrix4[]; colors: THREE.Color[] }
/** Square arch frames around the tube (denser inside tunnels), checkpoints and gap warning bars. */
export function buildArches(tr: TrackData, spacing: number, cols: THREE.Color[]): BarInstances {
  const matrices: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
  const f = makeFrame(), nn = new THREE.Vector3(), rr = new THREE.Vector3(), p = new THREE.Vector3(), z = new THREE.Vector3();
  const W = tr.W, L = tr.length;
  const arch = (s: number, color: THREE.Color, thick = 0.45, out = 0.3) => {
    frameAt(tr.samples, s, f);
    for (let k = 0; k < 4; k++) {
      surfaceBasis(f, k, nn, rr);
      p.copy(f.p).addScaledVector(nn, -(W + out));
      z.copy(f.t);
      matrices.push(composeBasis(new THREE.Matrix4(), p, rr, nn, z, 2 * W + 2 * out + thick, thick, thick * 1.2));
      colors.push(color);
    }
  };
  let i = 0;
  for (let s = 20; s < L - 10; ) {
    if (tr.gapMask(s) === 15) { s += spacing; continue; }
    arch(s, cols[i % cols.length].clone().multiplyScalar(tr.inTunnel(s) ? 1.5 : 2.2));
    s += tr.inTunnel(s) ? spacing * 0.45 : spacing;
    i++;
  }
  // start / finish gantry
  arch(0.5, new THREE.Color(1, 1, 1).multiplyScalar(2.6), 1.0, 0.6);
  arch(4, new THREE.Color(1, 0.1, 0.8).multiplyScalar(2.2), 0.6, 0.5);
  // checkpoints
  for (const s of tr.checkpoints) arch(s, new THREE.Color(0.2, 1, 0.5).multiplyScalar(2.4), 0.6, 0.5);
  // gap warning bars lying on the affected surfaces
  const warn = new THREE.Color(1, 0.12, 0.1).multiplyScalar(2.6);
  for (const g of tr.gaps) {
    for (let k = 0; k < 4; k++) {
      if (!(g.mask & (1 << k))) continue;
      for (const s of [g.s0 - 1, g.s1 + 1]) {
        frameAt(tr.samples, s, f);
        surfaceBasis(f, k, nn, rr);
        p.copy(f.p).addScaledVector(nn, -(W - 0.06));
        matrices.push(composeBasis(new THREE.Matrix4(), p, rr, nn, _T.copy(f.t), 2 * W, 0.1, 0.9));
        colors.push(warn);
      }
    }
  }
  void _m; void _p;
  return { matrices, colors };
}

/** Pads (boost chevrons / jump rings) as one geometry. aKind 0 = boost, 1 = jump. */
export function buildPadGeometry(tr: TrackData): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], kind: number[] = [], idx: number[] = [];
  const f = makeFrame(), nn = new THREE.Vector3(), rr = new THREE.Vector3();
  let v = 0;
  for (const p of tr.pads) {
    frameAt(tr.samples, p.s, f);
    surfaceBasis(f, p.surface, nn, rr);
    const sx = p.hw, sz = p.hl;
    const base = new THREE.Vector3().copy(f.p).addScaledVector(nn, -(tr.W - 0.07)).addScaledVector(rr, p.x);
    const corners: [number, number, number, number][] = [[-1, -1, 0, 0], [1, -1, 1, 0], [-1, 1, 0, 1], [1, 1, 1, 1]];
    for (const [cx, cz, u, w] of corners) {
      const q = base.clone().addScaledVector(rr, cx * sx).addScaledVector(f.t, cz * sz);
      pos.push(q.x, q.y, q.z); uv.push(u, w); kind.push(p.kind === 'boost' ? 0 : 1); v++;
    }
    idx.push(v - 4, v - 3, v - 2, v - 3, v - 1, v - 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Checkered start/finish strip on all four surfaces. */
export function buildStartLineGeometry(tr: TrackData): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], kind: number[] = [], idx: number[] = [];
  const f = makeFrame(), nn = new THREE.Vector3(), rr = new THREE.Vector3();
  let v = 0;
  for (let k = 0; k < 4; k++) {
    for (const [s, w] of [[0, 0], [5, 1]] as const) {
      frameAt(tr.samples, s, f);
      surfaceBasis(f, k, nn, rr);
      for (const side of [-1, 1]) {
        const q = new THREE.Vector3().copy(f.p).addScaledVector(nn, -(tr.W - 0.08)).addScaledVector(rr, side * tr.W);
        pos.push(q.x, q.y, q.z); uv.push(side < 0 ? 0 : 1, w); kind.push(0); v++;
      }
    }
    idx.push(v - 4, v - 3, v - 2, v - 3, v - 1, v - 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ scenery placement
export interface SceneryItem { m: THREE.Matrix4; c: THREE.Color }
export interface SceneryData {
  towers: SceneryItem[]; // city
  crystals: SceneryItem[]; // core / void polyhedra
  rings: SceneryItem[]; // big tori
  panels: SceneryItem[]; // flat neon panels / station plates
  groundY: number;
  coreSphere: { pos: THREE.Vector3; r: number } | null;
  planet: { pos: THREE.Vector3; r: number } | null;
  center: THREE.Vector3;
}

export function buildScenery(tr: TrackData, count: number): SceneryData {
  const r = rng(tr.def.seed * 7 + 13);
  const sm = tr.samples, W = tr.W;
  const pal = tr.def.palette;
  const palette = [new THREE.Color(pal.a), new THREE.Color(pal.b), new THREE.Color(pal.c)];
  const out: SceneryData = { towers: [], crystals: [], rings: [], panels: [], groundY: 0, coreSphere: null, planet: null, center: new THREE.Vector3() };
  // bounds
  let ymin = 1e9;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < sm.n; i += 3) {
    const p = new THREE.Vector3(sm.P[i * 3], sm.P[i * 3 + 1], sm.P[i * 3 + 2]);
    pts.push(p); ymin = Math.min(ymin, p.y); out.center.add(p);
  }
  out.center.multiplyScalar(1 / pts.length);
  out.groundY = ymin - 60;
  const clearFlat = (x: number, z: number, top: number, foot: number) => {
    for (const p of pts) {
      const dx = p.x - x, dz = p.z - z;
      if (Math.hypot(dx, dz) < W + 14 + foot && p.y - W - 8 < top) return false;
    }
    return true;
  };
  const clear3 = (pos: THREE.Vector3, rad: number) => {
    for (const p of pts) if (p.distanceTo(pos) < W + 14 + rad) return false;
    return true;
  };
  const f = makeFrame();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3();

  if (tr.def.theme === 'city') {
    let guard = 0;
    while (out.towers.length < count && guard++ < count * 25) {
      const i = Math.floor(r() * pts.length);
      const base = pts[i];
      frameAt(sm, i * 3 * sm.ds, f);
      const side = r() < 0.5 ? -1 : 1;
      const d = W + 18 + Math.pow(r(), 1.6) * 260;
      const dir = new THREE.Vector3(f.r.x, 0, f.r.z).normalize().multiplyScalar(side);
      const x = base.x + dir.x * d + (r() - 0.5) * 20, z = base.z + dir.z * d + (r() - 0.5) * 20;
      const w = 14 + r() * 34, dd = 14 + r() * 34;
      const top = out.groundY + 70 + r() * 260 * (1 - Math.min(0.7, d / 420));
      if (!clearFlat(x, z, top, Math.max(w, dd) * 0.75)) continue;
      const h = top - out.groundY;
      m4.compose(pos.set(x, out.groundY + h / 2, z), q.setFromEuler(e.set(0, r() * 0.6, 0)), sc.set(w, h, dd));
      out.towers.push({ m: m4.clone(), c: palette[Math.floor(r() * 3)].clone().multiplyScalar(0.7 + r() * 0.6) });
    }
    // hovering billboard panels near the tube
    for (let k = 0; k < Math.floor(count / 6); k++) {
      const i = Math.floor(r() * pts.length);
      frameAt(sm, i * 3 * sm.ds, f);
      const side = r() < 0.5 ? -1 : 1;
      const d = W + 12 + r() * 30;
      pos.copy(f.p).addScaledVector(f.r, side * d).addScaledVector(f.u, 8 + r() * 30);
      if (!clear3(pos, 12)) continue;
      const mm = new THREE.Matrix4().compose(pos, q.setFromRotationMatrix(m4.makeBasis(f.r, f.u, f.t.clone().negate())), sc.set(10 + r() * 14, 5 + r() * 8, 0.6));
      out.panels.push({ m: mm, c: palette[Math.floor(r() * 3)].clone().multiplyScalar(1.4) });
    }
  } else if (tr.def.theme === 'core') {
    let guard = 0;
    while (out.crystals.length < count && guard++ < count * 30) {
      const i = Math.floor(r() * pts.length);
      frameAt(sm, i * 3 * sm.ds, f);
      const ang = r() * Math.PI * 2, d = W + 22 + Math.pow(r(), 1.3) * 230;
      pos.copy(f.p).addScaledVector(f.r, Math.cos(ang) * d).addScaledVector(f.u, Math.sin(ang) * d);
      const s = 6 + r() * 26;
      if (!clear3(pos, s * 1.3)) continue;
      m4.compose(pos, q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6)), sc.set(s, s * (1 + r() * 1.5), s));
      out.crystals.push({ m: m4.clone(), c: palette[Math.floor(r() * 3)].clone().multiplyScalar(1.5) });
    }
    for (let k = 0; k < Math.max(6, count / 14); k++) {
      const i = Math.floor(r() * pts.length);
      frameAt(sm, i * 3 * sm.ds, f);
      const ang = r() * Math.PI * 2, d = W + 40 + r() * 160;
      pos.copy(f.p).addScaledVector(f.r, Math.cos(ang) * d).addScaledVector(f.u, Math.sin(ang) * d);
      const s = 18 + r() * 34;
      if (!clear3(pos, s)) continue;
      m4.compose(pos, q.setFromEuler(e.set(r() * 3, r() * 3, 0)), sc.set(s, s, s));
      out.rings.push({ m: m4.clone(), c: palette[Math.floor(r() * 3)].clone().multiplyScalar(1.6) });
    }
    let md = 1e9; for (const p of pts) md = Math.min(md, p.distanceTo(out.center));
    const cr = Math.min(55, md - W - 22);
    if (cr > 18) out.coreSphere = { pos: out.center.clone(), r: cr };
  } else {
    let guard = 0;
    while (out.crystals.length < count * 0.6 && guard++ < count * 30) { // asteroids
      const i = Math.floor(r() * pts.length);
      frameAt(sm, i * 3 * sm.ds, f);
      const ang = r() * Math.PI * 2, d = W + 24 + Math.pow(r(), 1.2) * 300;
      pos.copy(f.p).addScaledVector(f.r, Math.cos(ang) * d).addScaledVector(f.u, Math.sin(ang) * d);
      const s = 4 + r() * 30;
      if (!clear3(pos, s * 1.2)) continue;
      m4.compose(pos, q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6)), sc.set(s, s * (0.6 + r() * 0.6), s * (0.7 + r() * 0.5)));
      out.crystals.push({ m: m4.clone(), c: new THREE.Color(0.15 + r() * 0.1, 0.17 + r() * 0.1, 0.22 + r() * 0.1) });
    }
    for (let k = 0; k < 7; k++) { // station rings + plates far out
      const i = Math.floor(r() * pts.length);
      frameAt(sm, i * 3 * sm.ds, f);
      const ang = r() * Math.PI * 2, d = W + 120 + r() * 260;
      pos.copy(f.p).addScaledVector(f.r, Math.cos(ang) * d).addScaledVector(f.u, Math.sin(ang) * d * 0.6);
      const s = 50 + r() * 90;
      if (!clear3(pos, s)) continue;
      m4.compose(pos, q.setFromEuler(e.set(r() * 3, r() * 3, 0)), sc.set(s, s, s));
      out.rings.push({ m: m4.clone(), c: palette[Math.floor(r() * 3)].clone().multiplyScalar(1.4) });
    }
    for (let k = 0; k < Math.floor(count / 5); k++) {
      const i = Math.floor(r() * pts.length);
      frameAt(sm, i * 3 * sm.ds, f);
      const ang = r() * Math.PI * 2, d = W + 30 + r() * 140;
      pos.copy(f.p).addScaledVector(f.r, Math.cos(ang) * d).addScaledVector(f.u, Math.sin(ang) * d);
      if (!clear3(pos, 22)) continue;
      const mm = new THREE.Matrix4().compose(pos, q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3)), sc.set(20 + r() * 28, 0.8, 10 + r() * 16));
      out.panels.push({ m: mm, c: palette[Math.floor(r() * 3)].clone().multiplyScalar(0.9) });
    }
    out.planet = { pos: out.center.clone().add(new THREE.Vector3(-700, 520, -900)), r: 380 };
  }
  return out;
}
