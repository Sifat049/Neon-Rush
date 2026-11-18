import type { QualityLevel } from '../game/core/types';
import { CARS, UpgradeLevels, noUpgrades } from '../game/vehicles/cars';
import { RaceSummary } from '../game/core/race';
import { getTrackDef } from '../game/tracks/definitions';

export interface Settings {
  master: number; music: number; sfx: number; engine: number;
  quality: QualityLevel; fps: 30 | 60 | 0; renderScale: number;
  touch: 'auto' | 'on' | 'off'; touchSize: number; showFps: boolean; shake: boolean;
}
export interface TrackRecord { bestTime?: number; bestLap?: number; bestScore?: number; medal?: string; wins?: number }
export interface Stats { races: number; wins: number; distance: number; gravSwitches: number; driftTime: number; jumps: number; hits: number; boosts: number }
export interface SaveData {
  version: 1;
  name: string; credits: number; xp: number;
  unlockedCars: string[]; unlockedTracks: string[]; selectedCar: string;
  paint: Record<string, number>; upgrades: Record<string, UpgradeLevels>;
  records: Record<string, TrackRecord>;
  stats: Stats; achievements: string[];
  settings: Settings;
  /** local top-5 lists per event + track, key = `${kind}:${trackId}` */
  leaderboards?: Record<string, LeaderEntry[]>;
}
export interface LeaderEntry { name: string; score: number; car: string; date: number }

export const isTouchDevice = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
export const defaultQuality = (): QualityLevel => (isTouchDevice() ? 'MEDIUM' : 'HIGH');

export const defaultSave = (): SaveData => ({
  version: 1,
  name: 'PILOT', credits: 800, xp: 0,
  unlockedCars: ['viper'], unlockedTracks: ['neon-city'], selectedCar: 'viper',
  paint: Object.fromEntries(CARS.map((c) => [c.id, c.defaultPaint])),
  upgrades: Object.fromEntries(CARS.map((c) => [c.id, noUpgrades()])),
  records: {},
  stats: { races: 0, wins: 0, distance: 0, gravSwitches: 0, driftTime: 0, jumps: 0, hits: 0, boosts: 0 },
  achievements: [],
  settings: {
    master: 0.8, music: 0.5, sfx: 0.8, engine: 0.6,
    quality: defaultQuality(), fps: 60, renderScale: 1,
    touch: 'auto', touchSize: 1, showFps: false, shake: true,
  },
});

const KEY = 'neonrush.save.v1';
export function loadSave(): SaveData {
  const d = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...d, ...p,
      paint: { ...d.paint, ...(p.paint ?? {}) },
      upgrades: { ...d.upgrades, ...(p.upgrades ?? {}) },
      records: { ...(p.records ?? {}) },
      stats: { ...d.stats, ...(p.stats ?? {}) },
      settings: { ...d.settings, ...(p.settings ?? {}) },
      unlockedCars: p.unlockedCars?.length ? p.unlockedCars : d.unlockedCars,
      unlockedTracks: p.unlockedTracks?.length ? p.unlockedTracks : d.unlockedTracks,
      achievements: p.achievements ?? [],
    };
  } catch {
    return d;
  }
}
let saveTimer: number | undefined;
export function persist(s: SaveData) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
  }, 150);
}
export function persistNow(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ---- levels
export const xpForLevel = (lvl: number) => 250 * (lvl - 1) + 75 * (lvl - 1) * (lvl - 2); // xp needed to reach lvl
export function levelInfo(xp: number) {
  let lvl = 1;
  while (xp >= xpForLevel(lvl + 1)) lvl++;
  const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
  return { level: lvl, into: xp - a, need: b - a, pct: (xp - a) / (b - a) };
}

// ---- achievements
export interface Achievement { id: string; name: string; desc: string; check: (s: SaveData, r?: RaceSummary) => boolean }
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'ROLLING OUT', desc: 'Finish your first race', check: (s) => s.stats.races >= 1 },
  { id: 'win', name: 'CHECKERED FLAG', desc: 'Win a Quick Race', check: (s) => s.stats.wins >= 1 },
  { id: 'hat', name: 'GRAND SLAM', desc: 'Win a Quick Race on every track', check: (s) => ['neon-city', 'gravity-core', 'void-station'].every((t) => (s.records[t]?.wins ?? 0) > 0) },
  { id: 'grav', name: 'GRAVITY JUNKIE', desc: 'Switch gravity 100 times', check: (s) => s.stats.gravSwitches >= 100 },
  { id: 'drift', name: 'SIDEWAYS', desc: 'Drift for 30 seconds in total', check: (s) => s.stats.driftTime >= 30 },
  { id: 'air', name: 'AIR TIME', desc: 'Jump 25 times', check: (s) => s.stats.jumps >= 25 },
  { id: 'record', name: 'RECORD BREAKER', desc: 'Set a Time Trial record', check: (s) => Object.values(s.records).some((r) => r.bestTime != null) },
  { id: 'collector', name: 'COLLECTOR', desc: 'Own 3 vehicles', check: (s) => s.unlockedCars.length >= 3 },
  { id: 'gold', name: 'PRECISION', desc: 'Earn a Gold medal in Gravity Challenge', check: (s) => Object.values(s.records).some((r) => r.medal === 'GOLD') },
  { id: 'lvl5', name: 'VETERAN', desc: 'Reach player level 5', check: (s) => levelInfo(s.xp).level >= 5 },
  { id: 'tuned', name: 'FULLY TUNED', desc: 'Max out any upgrade', check: (s) => Object.values(s.upgrades).some((u) => Object.values(u).some((v) => v >= 5)) },
  { id: 'drifter', name: 'DRIFT KING', desc: 'Earn a Gold medal in Drift Challenge', check: (_s, r) => r?.event?.kind === 'drift' && r.event.outcome === 'GOLD' },
  { id: 'stuntman', name: 'STUNT DOUBLE', desc: 'Earn a Gold medal in Stunt Arena', check: (_s, r) => r?.event?.kind === 'stunt' && r.event.outcome === 'GOLD' },
  { id: 'ghost', name: 'GHOST', desc: 'Escape the police', check: (_s, r) => r?.event?.kind === 'police' && r.event.outcome === 'ESCAPED' },
  { id: 'allsurf', name: 'EVERY ANGLE', desc: 'Drive on all four surfaces in one race', check: (_s, r) => !!r && r.surfaces >= 4 },
];

// ---- rewards
export interface Rewards { credits: number; xp: number; lines: [string, number][]; newRecord: boolean; newAchievements: string[]; levelUp: number | null }

export function computeRewards(sum: RaceSummary): { credits: number; xp: number; lines: [string, number][] } {
  const lines: [string, number][] = [];
  let credits = 0, xp = 0;
  if (sum.event) {
    for (const [k, v] of sum.event.rewards) { lines.push([k, v]); credits += v; }
    return { credits, xp: sum.event.xp, lines };
  }
  if (sum.mode === 'quick') {
    const base = [800, 520, 340, 220][sum.playerPlace - 1] ?? 150;
    lines.push([`Position P${sum.playerPlace}`, base]);
    credits += base;
    xp += [220, 150, 100, 70][sum.playerPlace - 1] ?? 50;
  } else if (sum.mode === 'trial') {
    lines.push(['Time trial completed', 350]);
    credits += 350; xp += 130;
  } else if (sum.mode === 'challenge' && sum.challenge) {
    const c = sum.challenge;
    const sc = Math.round(c.score * 0.35);
    lines.push([`Challenge score ${c.score}`, sc]);
    credits += sc;
    const med = c.medal === 'GOLD' ? 400 : c.medal === 'SILVER' ? 220 : c.medal === 'BRONZE' ? 100 : 0;
    if (med) { lines.push([`${c.medal} medal`, med]); credits += med; }
    xp += 80 + c.hit * 3;
  } else if (sum.mode === 'free') {
    const km = Math.round(sum.distance / 100) * 0.1;
    const c = Math.min(250, Math.round(km * 40));
    lines.push([`Distance ${km.toFixed(1)} km`, c]);
    credits += c; xp += Math.min(120, Math.round(km * 25));
  }
  if (sum.mode !== 'free') {
    const clean = Math.max(0, 100 - sum.hits * 30 - sum.falls * 50);
    if (clean > 0) { lines.push(['Clean driving', clean]); credits += clean; }
    const drift = Math.min(120, Math.round(sum.driftTime * 6));
    if (drift > 0) { lines.push(['Drift bonus', drift]); credits += drift; }
    xp += 20 + Math.round(sum.driftTime);
  }
  return { credits, xp, lines };
}

export function trackName(id: string) { return getTrackDef(id).name; }
