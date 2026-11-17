import { TRACKS } from '../src/game/tracks/definitions';
import { buildTrack } from '../src/game/tracks/trackData';
import { frameAt, makeFrame } from '../src/game/tracks/trackBuilder';
import * as THREE from 'three';

for (const def of TRACKS) {
  const t0 = Date.now();
  const t = buildTrack(def);
  const sm = t.samples;
  const lens = def.cmds.map((c, i) => (c.t === 's' && c.free ? i : -1)).filter((i) => i >= 0);
  console.log(`\n== ${def.name}  length=${t.length.toFixed(0)}m samples=${sm.n} closureErr(before warp)=${t.closureError.toFixed(2)}m build=${Date.now() - t0}ms`);
  console.log(' free idx', lens);
  // seam continuity
  const f0 = makeFrame(), f1 = makeFrame();
  frameAt(sm, 0, f0); frameAt(sm, t.length - 0.01, f1);
  console.log(' seam pos gap', f0.p.distanceTo(f1.p).toFixed(3), 'tangent angle(deg)', (f0.t.angleTo(f1.t) * 180 / Math.PI).toFixed(3), 'up angle(deg)', (f0.u.angleTo(f1.u) * 180 / Math.PI).toFixed(3));
  // max curvature / smoothness
  let maxK = 0, maxJump = 0;
  for (let i = 0; i < sm.n; i++) {
    const k = Math.hypot(sm.K[i * 3], sm.K[i * 3 + 1], sm.K[i * 3 + 2]);
    maxK = Math.max(maxK, k);
    const j = (i + 1) % sm.n;
    const du = new THREE.Vector3(sm.U[i * 3] - sm.U[j * 3], sm.U[i * 3 + 1] - sm.U[j * 3 + 1], sm.U[i * 3 + 2] - sm.U[j * 3 + 2]).length();
    maxJump = Math.max(maxJump, du);
  }
  console.log(` min radius ${(1 / maxK).toFixed(1)}m, max up-vector step ${maxJump.toFixed(4)}`);
  // self-intersection: min distance between samples far apart in arc length
  let minSep = 1e9, at = [0, 0];
  const step = 3;
  for (let i = 0; i < sm.n; i += step) {
    for (let j = i + 1; j < sm.n; j += step) {
      const ds = Math.min((j - i) * sm.ds, t.length - (j - i) * sm.ds);
      if (ds < 140) continue;
      const d = Math.hypot(sm.P[i * 3] - sm.P[j * 3], sm.P[i * 3 + 1] - sm.P[j * 3 + 1], sm.P[i * 3 + 2] - sm.P[j * 3 + 2]);
      if (d < minSep) { minSep = d; at = [i * sm.ds, j * sm.ds]; }
    }
  }
  console.log(` min separation between distant parts: ${minSep.toFixed(1)}m (need > ${(2 * t.W + 4).toFixed(0)}) at s=${at.map((v) => v.toFixed(0))}`);
  console.log(` obstacles=${t.obstacles.length} pads=${t.pads.length} gaps=${t.gaps.length} checkpoints=${t.checkpoints.map((c) => c.toFixed(0))} gates=${t.gates.length}`);
  let ymin = 1e9, ymax = -1e9;
  for (let i = 0; i < sm.n; i++) { ymin = Math.min(ymin, sm.P[i * 3 + 1]); ymax = Math.max(ymax, sm.P[i * 3 + 1]); }
  console.log(` height range y=[${ymin.toFixed(0)}, ${ymax.toFixed(0)}]`);
}
