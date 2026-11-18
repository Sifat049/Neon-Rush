/**
 * Custom track document: the saved / shared / validated form of a player-made track.
 * This file is pure data + validation (no three.js) so the optional share server can import it too.
 */
export const PIECE_TYPES = ['straight', 'curve', 'sharp', 'loop', 'spiral', 'ramp', 'bridge', 'tunnel', 'wall', 'ceiling', 'platform'] as const;
export type PieceType = (typeof PIECE_TYPES)[number];
export type EnvId = 'city' | 'desert' | 'industrial' | 'floating';
export type SkyId = 'default' | 'night' | 'dusk' | 'dawn' | 'void';
export const ENVS: EnvId[] = ['city', 'desert', 'industrial', 'floating'];
export const SKIES: SkyId[] = ['default', 'night', 'dusk', 'dawn', 'void'];
export const WEATHER_IDS = ['clear', 'rain', 'fog', 'storm', 'sunset', 'night', 'sandstorm'] as const;

export interface PieceInst {
  type: PieceType;
  /** +1 = left, -1 = right (curves, loops, spirals); ignored by straight pieces */
  dir: 1 | -1;
  /** checkpoint marker at the start of this piece */
  cp?: boolean;
}
export interface TrackStyle {
  roadColor: string; // road base colour
  neonColor: string; // main neon colour
  width: number; // half-width of the gravity tube, 6..12
  lighting: number; // 0.6..1.4 scene light
  weather: (typeof WEATHER_IDS)[number];
  fog: number; // 0..1
  sky: SkyId;
  decor: number; // 0..1 scenery density
  obstacles: number; // 0..1 obstacle density
}
export interface RaceSettings {
  laps: number; // 1..8
  aiDifficulty: number; // 0..1
  maxRacers: number; // 1..4 (including the player)
  startSlot: number; // 1..4
  timeLimit: number; // seconds, 0 = none
}
export interface TrackDoc {
  v: 1;
  id: string;
  name: string;
  env: EnvId;
  pieces: PieceInst[];
  style: TrackStyle;
  race: RaceSettings;
  created: number;
}

export const MAX_PIECES = 60;
export const MIN_PIECES = 3;

export const defaultStyle = (): TrackStyle => ({ roadColor: '#05061c', neonColor: '#22e5ff', width: 9, lighting: 1, weather: 'clear', fog: 0.4, sky: 'default', decor: 0.8, obstacles: 0.5 });
export const defaultRace = (): RaceSettings => ({ laps: 3, aiDifficulty: 0.5, maxRacers: 4, startSlot: 3, timeLimit: 0 });

export function newId(): string {
  const r = () => Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `c${Date.now().toString(36)}${r()}`;
}
export function emptyDoc(): TrackDoc {
  return { v: 1, id: newId(), name: 'MY TRACK', env: 'city', pieces: [], style: defaultStyle(), race: defaultRace(), created: Date.now() };
}
/** A ready-made closed starter layout (a rounded rectangle with a loop and a ramp). */
export function starterDoc(): TrackDoc {
  const L = (t: PieceType, dir: 1 | -1 = 1, cp = false): PieceInst => ({ type: t, dir, cp: cp || undefined });
  const d = emptyDoc();
  d.name = 'STARTER LOOP';
  d.pieces = [L('straight'), L('straight'), L('sharp', 1, true), L('straight'), L('ramp'), L('straight'), L('sharp'), L('straight'), L('tunnel', 1, true), L('straight'), L('straight'), L('sharp'), L('straight'), L('loop'), L('straight'), L('straight'), L('sharp')];
  return d;
}

// ------------------------------------------------------------------ validation / sanitising
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const int = (v: unknown, lo: number, hi: number, def: number) => Math.round(num(v, lo, hi, def));

export interface ParseResult { ok: boolean; doc?: TrackDoc; errors: string[] }

/** Strictly validates untrusted JSON (imports, share codes, server uploads). Unknown fields are dropped, numbers clamped. */
export function parseTrackDoc(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['Not a track object'] };
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) errors.push('Unsupported track version');
  if (!Array.isArray(o.pieces)) { errors.push('Missing pieces'); return { ok: false, errors }; }
  if (o.pieces.length < MIN_PIECES) errors.push(`Track needs at least ${MIN_PIECES} pieces`);
  if (o.pieces.length > MAX_PIECES) errors.push(`Track has too many pieces (max ${MAX_PIECES})`);
  const pieces: PieceInst[] = [];
  for (const p of o.pieces.slice(0, MAX_PIECES)) {
    const q = p as Record<string, unknown>;
    if (!q || typeof q.type !== 'string' || !(PIECE_TYPES as readonly string[]).includes(q.type)) { errors.push('Unknown piece type'); continue; }
    pieces.push({ type: q.type as PieceType, dir: q.dir === -1 ? -1 : 1, cp: q.cp === true ? true : undefined });
  }
  const st = (o.style ?? {}) as Record<string, unknown>;
  const rc = (o.race ?? {}) as Record<string, unknown>;
  const d = defaultStyle(), dr = defaultRace();
  const style: TrackStyle = {
    roadColor: typeof st.roadColor === 'string' && HEX.test(st.roadColor) ? st.roadColor : d.roadColor,
    neonColor: typeof st.neonColor === 'string' && HEX.test(st.neonColor) ? st.neonColor : d.neonColor,
    width: num(st.width, 6, 12, d.width),
    lighting: num(st.lighting, 0.6, 1.4, d.lighting),
    weather: (WEATHER_IDS as readonly unknown[]).includes(st.weather) ? (st.weather as TrackStyle['weather']) : d.weather,
    fog: num(st.fog, 0, 1, d.fog),
    sky: (SKIES as readonly unknown[]).includes(st.sky) ? (st.sky as SkyId) : d.sky,
    decor: num(st.decor, 0, 1, d.decor),
    obstacles: num(st.obstacles, 0, 1, d.obstacles),
  };
  const race: RaceSettings = {
    laps: int(rc.laps, 1, 8, dr.laps), aiDifficulty: num(rc.aiDifficulty, 0, 1, dr.aiDifficulty), maxRacers: int(rc.maxRacers, 1, 4, dr.maxRacers),
    startSlot: int(rc.startSlot, 1, 4, dr.startSlot), timeLimit: int(rc.timeLimit, 0, 1800, dr.timeLimit),
  };
  const env = (ENVS as readonly unknown[]).includes(o.env) ? (o.env as EnvId) : 'city';
  const name = typeof o.name === 'string' ? o.name.replace(/[^\w \-.]/g, '').slice(0, 24).toUpperCase().trim() || 'CUSTOM TRACK' : 'CUSTOM TRACK';
  const id = typeof o.id === 'string' && /^[a-z0-9]{6,24}$/.test(o.id) ? o.id : newId();
  const doc: TrackDoc = { v: 1, id, name, env, pieces, style, race, created: num(o.created, 0, 4e12, Date.now()) };
  return { ok: errors.length === 0, doc, errors };
}

// ------------------------------------------------------------------ JSON + share codes
export const exportJson = (d: TrackDoc) => JSON.stringify(d, null, 2);
export function importJson(text: string): ParseResult {
  try { return parseTrackDoc(JSON.parse(text)); } catch { return { ok: false, errors: ['That is not valid JSON'] }; }
}

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (t: string) => {
  const bin = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
/** Compact share code: NR1.<payload>.<checksum>. Contains the whole track, so it works with no server. */
export function toShareCode(d: TrackDoc): string {
  const compact = JSON.stringify({ ...d, created: 0 });
  const payload = b64(compact);
  return `NR1.${payload}.${hash32(payload).toString(36)}`;
}
export function fromShareCode(code: string): ParseResult {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'NR1') return { ok: false, errors: ['Not a Neon Rush share code'] };
  if (hash32(parts[1]).toString(36) !== parts[2]) return { ok: false, errors: ['Share code is damaged (checksum failed)'] };
  try { return parseTrackDoc(JSON.parse(unb64(parts[1]))); } catch { return { ok: false, errors: ['Share code could not be decoded'] }; }
}
