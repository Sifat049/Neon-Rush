import type { Cmd } from '../game/tracks/trackBuilder';
import { analyzePath, buildPath, endPose } from '../game/tracks/trackBuilder';
import type { TrackDef } from '../game/tracks/definitions';
import type { ThemeId } from '../game/core/types';
import type { PieceInst, PieceType, TrackDoc, EnvId, SkyId } from './trackDoc';
import { MIN_PIECES } from './trackDoc';

export interface PieceInfo { type: PieceType; label: string; icon: string; blurb: string; restrict: boolean }
export const PIECES: Record<PieceType, PieceInfo> = {
  straight: { type: 'straight', label: 'Straight', icon: '▮', blurb: '120 m straight road', restrict: false },
  curve: { type: 'curve', label: 'Curve', icon: '◜', blurb: 'Gentle 45° bend', restrict: false },
  sharp: { type: 'sharp', label: 'Sharp turn', icon: '┐', blurb: '90° corner', restrict: false },
  loop: { type: 'loop', label: 'Loop', icon: '◯', blurb: 'Full vertical loop', restrict: false },
  spiral: { type: 'spiral', label: 'Spiral', icon: '🌀', blurb: 'Corkscrew: the tube rolls 360°', restrict: false },
  ramp: { type: 'ramp', label: 'Jump ramp', icon: '⛰', blurb: 'Crest with a jump pad', restrict: false },
  bridge: { type: 'bridge', label: 'Bridge', icon: '≡', blurb: 'Open sides: only the floor exists', restrict: true },
  tunnel: { type: 'tunnel', label: 'Tunnel', icon: '◖', blurb: 'Enclosed neon tunnel', restrict: false },
  wall: { type: 'wall', label: 'Wall track', icon: '▌', blurb: 'Only one wall exists: switch gravity', restrict: true },
  ceiling: { type: 'ceiling', label: 'Ceiling track', icon: '▔', blurb: 'Only the ceiling exists', restrict: true },
  platform: { type: 'platform', label: 'Moving platform', icon: '⇄', blurb: 'Sliding blocks to dodge', restrict: false },
};

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  length: number;
  closureError: number;
  minSeparation: number;
  needSeparation: number;
}
export interface Compiled {
  def: TrackDef | null;
  report: Validation;
  /** top-down preview samples: x, z, y and the piece index each sample belongs to (-1 = lead-in / closing road) */
  preview: { x: number; z: number; y: number; piece: number }[];
  pieceFractions: { f0: number; f1: number }[];
}

// ------------------------------------------------------------------ colours
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1;
  const f = (n: number) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const rotate = (hex: string, turns: number) => { const [h, s, l] = hexToHsl(hex); return hslToHex(h + turns, Math.max(0.6, s), Math.min(0.62, Math.max(0.5, l))); };

const SKY: Record<EnvId, [string, string]> = {
  city: ['#02020b', '#1a0c46'], desert: ['#2a1224', '#ff8a3d'], industrial: ['#01010a', '#06163a'], floating: ['#04010a', '#2e0a46'],
};
const SKY_OVERRIDE: Record<Exclude<SkyId, 'default'>, [string, string]> = {
  night: ['#01010a', '#0a1038'], dusk: ['#2a0f4a', '#ff6a3d'], dawn: ['#1a2a5a', '#ffb08a'], void: ['#000000', '#10002a'],
};
const THEME: Record<EnvId, ThemeId> = { city: 'city', desert: 'desert', industrial: 'void', floating: 'core' };

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h >>> 0) % 100000; }

// ------------------------------------------------------------------ piece -> commands
const rawLen = (c: Cmd, lens?: number[], i?: number) =>
  c.t === 's' ? (lens && i != null ? lens[i] : c.len) : c.t === 'turn' ? Math.abs((c.deg * Math.PI) / 180) * c.r : c.t === 'hill' || c.t === 'twist' ? c.len : 2 * Math.PI * c.r * 1.08;

interface Feature { piece: number; kind: 'gap' | 'tunnel' | 'mover' | 'pad'; off: number; len: number; surfaces?: number[]; surface?: number; padKind?: 'boost' | 'jump' }

function pieceCmds(p: PieceInst): { cmds: Cmd[]; features: Feature[] } {
  const d = p.dir;
  const F: Feature[] = [];
  const mk = (cmds: Cmd[]) => ({ cmds, features: F });
  switch (p.type) {
    case 'straight': return mk([{ t: 's', len: 120 }]);
    case 'curve': return mk([{ t: 'turn', deg: 45 * d, r: 150 }]);
    case 'sharp': return mk([{ t: 'turn', deg: 90 * d, r: 90 }]);
    case 'loop': return mk([{ t: 'loop', r: 60, shift: -28 * d }]);
    case 'spiral': return mk([{ t: 'twist', deg: 360 * d, len: 300 }]);
    case 'ramp': F.push({ piece: 0, kind: 'pad', off: 18, len: 0, surface: 0, padKind: 'jump' }); return mk([{ t: 's', len: 50 }, { t: 'hill', deg: 11, len: 70 }, { t: 'hill', deg: -11, len: 70 }, { t: 's', len: 50 }]);
    case 'bridge': F.push({ piece: 0, kind: 'gap', off: 18, len: 140, surfaces: [1, 2, 3] }); return mk([{ t: 's', len: 176 }]);
    case 'tunnel': F.push({ piece: 0, kind: 'tunnel', off: 0, len: 160 }); return mk([{ t: 's', len: 160 }]);
    case 'wall': F.push({ piece: 0, kind: 'gap', off: 18, len: 140, surfaces: d === 1 ? [0, 1, 2] : [0, 2, 3] }); return mk([{ t: 's', len: 176 }]);
    case 'ceiling': F.push({ piece: 0, kind: 'gap', off: 18, len: 140, surfaces: [0, 1, 3] }); return mk([{ t: 's', len: 176 }]);
    case 'platform': for (const off of [30, 70, 110]) F.push({ piece: 0, kind: 'mover', off, len: 0, surface: 0 }); return mk([{ t: 's', len: 150 }]);
  }
}

const angleDeg = (ax: number, az: number, bx: number, bz: number) => (Math.atan2(az * bx - ax * bz, ax * bx + az * bz) * 180) / Math.PI;

const MIN_FREE = 40;
/** If the layout already ends heading north (total turning a multiple of 360 degrees), pick a plain straight whose stretching closes the lap. */
function chooseInlineFree(cmds: Cmd[], owner: number[], pieces: PieceInst[]): number {
  const info = analyzePath(cmds);
  if (Math.abs(info.end.tx) > 0.035 || info.end.tz > 0) return -1; // must end within ~2 degrees of north
  let best = -1, bestCost = 1e9;
  for (let i = 1; i < cmds.length; i++) {
    const c = cmds[i];
    if (c.t !== 's') continue;
    if (owner[i] >= 0 && pieces[owner[i]].type !== 'straight') continue;
    const b = info.startT[i];
    if (Math.abs(b.x) < 0.25) continue; // parallel to the lead-in
    // end + dA*(0,-1) + dC*(b.x,b.z) = 0   (z axis of the lead-in is -1)
    const ex = -info.end.x, ez = -info.end.z;
    const det = b.x;
    const dA = (ex * b.z - b.x * ez) / det, dC = ex / det;
    if (300 + dA < MIN_FREE || c.len + dC < MIN_FREE) continue;
    const cost = Math.abs(dA) + Math.abs(dC);
    if (cost < bestCost) { bestCost = cost; best = i; }
  }
  return best;
}
/**
 * Picks turns + straights that bring the path back to the start line pointing north.
 * Two straights are solved by the path builder (A = lead-in heading north, C = a free closing straight); we search closing shapes
 * (a direct return, or a U-shaped return for layouts that end beyond the start line) where both stay >= MIN_FREE metres long.
 */
function chooseClosing(cmds: Cmd[]): Cmd[] | null {
  const E = endPose(cmds);
  let best: { cmds: Cmd[]; cost: number } | null = null;
  const dirOf = (deg: number) => { const psi = (deg * Math.PI) / 180; return { x: -Math.sin(psi), z: -Math.cos(psi) }; };
  const turnTo = (h: { x: number; z: number }, d: { x: number; z: number }, r: number): Cmd[] => {
    const a = angleDeg(h.x, h.z, d.x, d.z);
    return Math.abs(a) > 0.5 ? [{ t: 'turn', deg: a, r }] : [];
  };
  const evaluate = (close: Cmd[], dC: { x: number; z: number }, extraCost: number) => {
    const end = endPose([...cmds, ...close]);
    const det = dC.x; // |[0 dx; -1 dz]|
    if (Math.abs(det) < 0.2) return;
    const ex = -end.x, ez = -end.z;
    const A = 300 + (ex * dC.z - dC.x * ez) / det;
    const C = 300 + ex / det;
    if (A < MIN_FREE || C < MIN_FREE) return;
    const cost = A + C + extraCost;
    if (!best || cost < best.cost) best = { cmds: close, cost };
  };
  const heading = { x: E.tx, z: E.tz };
  const north = { x: 0, z: -1 }, south = { x: 0, z: 1 };
  for (const r of [90, 150, 240]) {
    // direct return along a free straight at 15° steps
    for (let k = 0; k < 24; k++) {
      const d = dirOf(k * 15);
      if (Math.abs(d.x) < 0.2) continue;
      evaluate([...turnTo(heading, d, r), { t: 's', len: 300, free: true }, ...turnTo(d, north, r)], d, r === 90 ? 0 : 20);
    }
    // U-shaped return: sideways (free) -> south (fixed) -> sideways -> north
    for (const side of [1, -1]) {
      const dSide = { x: side, z: 0 };
      for (let Z = 60; Z <= 1800; Z += 60) {
        for (const back of [1, -1]) {
          const dBack = { x: back, z: 0 };
          const close: Cmd[] = [...turnTo(heading, dSide, r), { t: 's', len: 300, free: true }, ...turnTo(dSide, south, r), { t: 's', len: Z }, ...turnTo(south, dBack, r), { t: 's', len: 60 }, ...turnTo(dBack, north, r)];
          evaluate(close, dSide, Z * 0.5 + 200);
        }
      }
    }
  }
  return best ? (best as { cmds: Cmd[] }).cmds : null;
}

export function compileDoc(doc: TrackDoc): Compiled {
  const errors: string[] = [];
  const warnings: string[] = [];
  const empty = (): Compiled => ({ def: null, preview: [], pieceFractions: [], report: { ok: false, errors, warnings, length: 0, closureError: 0, minSeparation: 0, needSeparation: 0 } });
  if (doc.pieces.length < MIN_PIECES) { errors.push(`Add at least ${MIN_PIECES} pieces`); return empty(); }

  // 1. assemble commands (insert a spacer between two "restricting" pieces so no layout leaves the player without a surface)
  const cmds: Cmd[] = [{ t: 's', len: 300, free: true }];
  const owner: number[] = [-1]; // cmd index -> piece index (-1 = lead-in / closing)
  const features: Feature[] = [];
  const cmdStart: number[] = []; // per piece: first cmd index
  let prevRestrict = false;
  doc.pieces.forEach((p, idx) => {
    const info = PIECES[p.type];
    if (info.restrict && prevRestrict) { cmds.push({ t: 's', len: 80 }); owner.push(-1); warnings.push('A spacer straight was inserted between two surface-limited pieces.'); }
    const { cmds: pc, features: pf } = pieceCmds(p);
    cmdStart[idx] = cmds.length;
    for (const f of pf) features.push({ ...f, piece: idx });
    for (const c of pc) { cmds.push(c); owner.push(idx); }
    prevRestrict = info.restrict;
  });
  // a short run-out after the last piece lets the path builder's turn smoothing settle, so the heading at the seam is exact
  cmds.push({ t: 's', len: 40 }); owner.push(-1);
  const lastPieceCmd = cmds.length - 1;

  // 2. closing leg. Two straights are "free" (the lead-in A, heading north, and the closing straight C); the solver stretches them so
  //    the lap closes exactly. We search for a closing direction / turn radius where both straights stay long enough.
  // (a) preferred: the player's own loop already comes back north; make one of their plain straights the second free straight
  const inline = chooseInlineFree(cmds, owner, doc.pieces);
  if (inline >= 0) {
    (cmds[inline] as { free?: boolean }).free = true;
  } else {
    // (b) otherwise append a closing leg
    const closing = chooseClosing(cmds);
    if (!closing) { errors.push('This layout cannot be closed into a loop. Try adding turns so the track curves back towards the start line (e.g. four 90° turns the same way).'); return empty(); }
    for (const c of closing) { cmds.push(c); owner.push(-1); }
  }
  void lastPieceCmd;

  // 3. solve + build
  const built = buildPath(cmds);
  const sm = built.samples;
  const L = sm.length;
  const W = doc.style.width;
  if (built.closureXZ > 8) errors.push(`The track does not close properly (${built.closureXZ.toFixed(0)} m gap). Make the layout more compact or turn it into one loop.`);
  if (Math.abs(built.closureError) > 60) errors.push('The track climbs too much without coming back down.');
  if (L < 1000) errors.push(`Track is too short (${L.toFixed(0)} m). Add more pieces.`);
  if (L > 9000) errors.push(`Track is too long (${L.toFixed(0)} m, max 9000).`);

  // self-crossing / too-close check
  let minSep = 1e9;
  const step = 3;
  for (let i = 0; i < sm.n; i += step) {
    for (let j = i + step; j < sm.n; j += step) {
      const ds = Math.min((j - i) * sm.ds, L - (j - i) * sm.ds);
      if (ds < 140) continue;
      const d = Math.hypot(sm.P[i * 3] - sm.P[j * 3], sm.P[i * 3 + 1] - sm.P[j * 3 + 1], sm.P[i * 3 + 2] - sm.P[j * 3 + 2]);
      if (d < minSep) minSep = d;
    }
  }
  const need = 2 * W + 4;
  if (minSep < need) errors.push(`The track crosses or touches itself (${minSep.toFixed(0)} m apart, need ${need.toFixed(0)} m). Move pieces so it never overlaps.`);

  // 4. fractions per cmd / piece (using solved straight lengths)
  const lens = built.lens;
  const cum: number[] = [0];
  cmds.forEach((c, i) => cum.push(cum[i] + rawLen(c, lens, i)));
  const total = cum[cum.length - 1];
  const pieceFractions = doc.pieces.map((_, idx) => {
    let first = -1, last = -1;
    owner.forEach((o, ci) => { if (o === idx) { if (first < 0) first = ci; last = ci; } });
    return { f0: cum[first] / total, f1: cum[last + 1] / total };
  });
  const cmdF = (ci: number, off: number) => (cum[ci] + off) / total;

  // 5. features -> def lists
  const gaps: TrackDef['gaps'] = [], tunnels: [number, number][] = [], movers: NonNullable<TrackDef['movers']> = [], fixedPads: NonNullable<TrackDef['fixedPads']> = [];
  for (const f of features) {
    const ci = cmdStart[f.piece];
    const f0 = cmdF(ci, f.off);
    if (f.kind === 'gap') gaps.push({ f: f0, len: f.len, surfaces: f.surfaces ?? [] });
    else if (f.kind === 'tunnel') tunnels.push([f0, cmdF(ci, f.off + f.len)]);
    else if (f.kind === 'mover') movers.push({ f: f0, surface: f.surface ?? 0 });
    else if (f.kind === 'pad') fixedPads.push({ f: f0, kind: f.padKind ?? 'boost', surface: f.surface ?? 0 });
  }
  const cps: number[] = [];
  doc.pieces.forEach((p, i) => { if (p.cp) { const f = pieceFractions[i].f0; if (f > 0.04 && f < 0.96 && !cps.some((c) => Math.abs(c - f) * L < 80)) cps.push(f); } });
  cps.sort((a, b) => a - b);
  if (cps.length > 6) cps.length = 6;

  // 6. preview polyline
  const preview: Compiled['preview'] = [];
  for (let i = 0; i < sm.n; i += 2) {
    const fr = (i * sm.ds) / L;
    let piece = -1;
    for (let k = 0; k < pieceFractions.length; k++) if (fr >= pieceFractions[k].f0 && fr < pieceFractions[k].f1) { piece = k; break; }
    preview.push({ x: sm.P[i * 3], y: sm.P[i * 3 + 1], z: sm.P[i * 3 + 2], piece });
  }

  const st = doc.style;
  const sky = st.sky === 'default' ? SKY[doc.env] : SKY_OVERRIDE[st.sky];
  const neon = st.neonColor;
  const theme = THEME[doc.env];
  const density = st.obstacles;
  const obsCount = density < 0.02 ? 0 : Math.round((L / 115) * (0.25 + density * 1.1));
  const report: Validation = { ok: errors.length === 0, errors, warnings, length: L, closureError: built.closureError, minSeparation: minSep, needSeparation: need };
  if (!report.ok) return { def: null, report, preview, pieceFractions };

  const def: TrackDef = {
    id: doc.id, name: doc.name, subtitle: `Custom · ${doc.env.toUpperCase()}`, description: `Player-made ${doc.env} track · ${doc.pieces.length} pieces · ${(L / 1000).toFixed(1)} km.`,
    difficulty: 2, theme, width: W, laps: doc.race.laps, seed: hashStr(doc.id), unlockCost: 0,
    palette: { a: neon, b: rotate(neon, 0.18), c: rotate(neon, 0.5), base: st.roadColor, fog: hslToHex(hexToHsl(sky[1])[0], 0.5, 0.06), skyTop: sky[0], skyBottom: sky[1] },
    cmds, tunnels, gaps,
    obstacles: { count: obsCount, f0: 0.08, f1: 0.94, kinds: [['block', 3], ['low', 3], ['mover', 1]], surfaceWeights: [5, 2, 1, 2], slalom: 0.12 },
    pads: { boost: Math.max(3, Math.round(L / 220)), jump: 0, surfaceWeights: [4, 2, 2, 2] },
    weather: st.weather, movers, fixedPads, checkpointFs: cps.length ? cps : undefined,
    race: doc.race, fogMul: 0.5 + st.fog * 1.5, decor: 0.2 + st.decor * 1.0, lighting: st.lighting, custom: true,
  };
  return { def, report, preview, pieceFractions };
}
