export type GameMode = 'quick' | 'trial' | 'challenge' | 'free';
export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ThemeId = 'city' | 'core' | 'void';

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1 (right positive)
  jump: boolean;
  boost: boolean;
  drift: boolean;
  gravLeft: boolean; // edge pulse
  gravRight: boolean; // edge pulse
}
export const emptyInput = (): DriveInput => ({
  throttle: 0, brake: 0, steer: 0, jump: false, boost: false, drift: false, gravLeft: false, gravRight: false,
});

export interface CarStats {
  accel: number; // m/s^2
  top: number; // m/s
  handling: number; // multiplier
  boost: number; // boost capacity
}

export type SurfaceIndex = 0 | 1 | 2 | 3; // 0 floor, 1 right wall, 2 ceiling, 3 left wall
export const SURFACE_NAMES = ['FLOOR', 'RIGHT WALL', 'CEILING', 'LEFT WALL'] as const;

export type ObstacleKind = 'block' | 'low' | 'mover' | 'gate';
export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  s: number;
  surface: number;
  x: number;
  hw: number; // lateral half width
  hl: number; // half length along track
  height: number;
  amp: number; // lateral sweep amplitude (movers)
  freq: number;
  phase: number;
}
export interface Pad {
  id: number;
  kind: 'boost' | 'jump';
  s: number;
  surface: number;
  x: number;
  hw: number;
  hl: number;
}
export interface Gap { s0: number; s1: number; mask: number }
export interface Range { s0: number; s1: number }
export interface ChallengeGate { id: number; s: number; surface: number; x: number; hw: number }

export type RaceEvent =
  | { type: 'hit'; racer: number; intensity: number }
  | { type: 'scrape'; racer: number }
  | { type: 'bump'; racer: number }
  | { type: 'jump'; racer: number }
  | { type: 'land'; racer: number; intensity: number }
  | { type: 'gravity'; racer: number }
  | { type: 'boostStart'; racer: number }
  | { type: 'pad'; racer: number; kind: 'boost' | 'jump' }
  | { type: 'checkpoint'; racer: number; index: number }
  | { type: 'lap'; racer: number; lap: number; time: number; best: boolean }
  | { type: 'finish'; racer: number; place: number }
  | { type: 'fall'; racer: number }
  | { type: 'respawn'; racer: number }
  | { type: 'gate'; racer: number; ok: boolean; precision: number }
  | { type: 'go' }
  | { type: 'count'; n: number };
