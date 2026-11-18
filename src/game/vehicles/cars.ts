import type { CarStats } from '../core/types';

export type CarDesign = 'viper' | 'phantom' | 'bulwark' | 'nova' | 'eclipse' | 'bolt';
export interface CarDef {
  id: string;
  name: string;
  tagline: string;
  price: number;
  design: CarDesign;
  base: CarStats;
  defaultPaint: number;
}

export const CARS: CarDef[] = [
  { id: 'viper', name: 'VIPER GT', tagline: 'Balanced all-rounder', price: 0, design: 'viper', base: { accel: 36, top: 78, handling: 1.0, boost: 100 }, defaultPaint: 0 },
  { id: 'phantom', name: 'PHANTOM X', tagline: 'Straight-line missile', price: 2200, design: 'phantom', base: { accel: 31, top: 90, handling: 0.88, boost: 100 }, defaultPaint: 1 },
  { id: 'bulwark', name: 'BULWARK R', tagline: 'Explosive acceleration', price: 3800, design: 'bulwark', base: { accel: 45, top: 74, handling: 0.96, boost: 90 }, defaultPaint: 3 },
  { id: 'bolt', name: 'BOLT-9 BIKE', tagline: 'Light, fast, twitchy — a bike', price: 4800, design: 'bolt', base: { accel: 48, top: 84, handling: 1.35, boost: 95 }, defaultPaint: 4 },
  { id: 'nova', name: 'NOVA FLUX', tagline: 'Nimble with a deep boost tank', price: 6000, design: 'nova', base: { accel: 35, top: 81, handling: 1.2, boost: 135 }, defaultPaint: 2 },
  { id: 'eclipse', name: 'ECLIPSE ZERO', tagline: 'Prototype — best in class', price: 9500, design: 'eclipse', base: { accel: 41, top: 92, handling: 1.12, boost: 145 }, defaultPaint: 7 },
];
export const getCar = (id: string) => CARS.find((c) => c.id === id) ?? CARS[0];

export interface Paint { name: string; primary: string; accent: string }
export const PAINTS: Paint[] = [
  { name: 'Cyan Pulse', primary: '#0b2b3d', accent: '#22e5ff' },
  { name: 'Magenta Surge', primary: '#2a0b36', accent: '#ff2bd6' },
  { name: 'Toxic Lime', primary: '#101c10', accent: '#b6ff3b' },
  { name: 'Solar Flare', primary: '#3a1408', accent: '#ff8a1f' },
  { name: 'Arctic', primary: '#d8e6f2', accent: '#3b6bff' },
  { name: 'Royal Gold', primary: '#2b2208', accent: '#ffd23b' },
  { name: 'Violet Storm', primary: '#1a1038', accent: '#9d6bff' },
  { name: 'Stealth', primary: '#08080c', accent: '#ff3b5c' },
];

export const UPGRADE_KEYS = ['accel', 'top', 'handling', 'boost'] as const;
export type UpgradeKey = (typeof UPGRADE_KEYS)[number];
export const UPGRADE_LABEL: Record<UpgradeKey, string> = { accel: 'ACCELERATION', top: 'TOP SPEED', handling: 'HANDLING', boost: 'BOOST TANK' };
export const MAX_UPGRADE = 5;
export const upgradeCost = (level: number) => [400, 650, 950, 1350, 1900][level] ?? 0;
export type UpgradeLevels = Record<UpgradeKey, number>;
export const noUpgrades = (): UpgradeLevels => ({ accel: 0, top: 0, handling: 0, boost: 0 });

export function effectiveStats(car: CarDef, up: UpgradeLevels): CarStats {
  return {
    accel: car.base.accel * (1 + 0.05 * up.accel),
    top: car.base.top * (1 + 0.04 * up.top),
    handling: car.base.handling * (1 + 0.05 * up.handling),
    boost: car.base.boost * (1 + 0.08 * up.boost),
  };
}
/** 0..1 for UI bars. */
export function statNorm(key: UpgradeKey, v: number) {
  const r: Record<UpgradeKey, [number, number]> = { accel: [28, 58], top: [68, 108], handling: [0.8, 1.6], boost: [80, 200] };
  const [a, b] = r[key];
  return Math.min(1, Math.max(0.04, (v - a) / (b - a)));
}
