import type { ObstacleKind, ThemeId } from '../core/types';
import type { Cmd } from './trackBuilder';

export interface TrackPalette {
  a: string; b: string; c: string; base: string; fog: string; skyTop: string; skyBottom: string;
}
export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: 1 | 2 | 3;
  theme: ThemeId;
  width: number; // half width of the square gravity tube
  laps: number;
  seed: number;
  unlockCost: number;
  palette: TrackPalette;
  cmds: Cmd[];
  tunnels: [number, number][]; // fractions of the lap
  gaps: { f: number; len: number; surfaces: number[] }[];
  obstacles: {
    count: number;
    f0: number; f1: number;
    kinds: [ObstacleKind, number][];
    surfaceWeights: [number, number, number, number];
    slalom: number; // probability an event becomes a two-block slalom
  };
  pads: { boost: number; jump: number; surfaceWeights: [number, number, number, number] };
}

export const TRACKS: TrackDef[] = [
  {
    id: 'neon-city',
    name: 'NEON CITY',
    subtitle: 'Beginner · Cyberpunk skyline',
    description: 'A glowing megacity circuit. Wide gravity tube, long tunnels, a crest jump and friendly obstacles. Learn to ride the walls.',
    difficulty: 1,
    theme: 'city',
    width: 9,
    laps: 3,
    seed: 1101,
    unlockCost: 0,
    palette: { a: '#22e5ff', b: '#6b5bff', c: '#ff2bd6', base: '#05061c', fog: '#07071f', skyTop: '#02020b', skyBottom: '#1a0c46' },
    cmds: [
      { t: 's', len: 300, free: true },
      { t: 'hill', deg: 9, len: 80 }, { t: 'hill', deg: -9, len: 80 },
      { t: 's', len: 120 },
      { t: 'turn', deg: 90, r: 110 },
      { t: 's', len: 300, free: true },
      { t: 'turn', deg: 90, r: 110 },
      { t: 's', len: 330 },
      { t: 'turn', deg: -45, r: 140 }, { t: 'turn', deg: 45, r: 140 },
      { t: 's', len: 250 },
      { t: 'turn', deg: 90, r: 110 },
      { t: 's', len: 320 },
      { t: 'turn', deg: 90, r: 110 },
      { t: 's', len: 200 },
    ],
    tunnels: [[0.12, 0.2], [0.42, 0.52], [0.7, 0.78]],
    gaps: [],
    obstacles: { count: 26, f0: 0.07, f1: 0.93, kinds: [['block', 3], ['low', 3], ['mover', 1]], surfaceWeights: [5, 2, 1, 2], slalom: 0.1 },
    pads: { boost: 14, jump: 2, surfaceWeights: [4, 2, 2, 2] },
  },
  {
    id: 'gravity-core',
    name: 'GRAVITY CORE',
    subtitle: 'Advanced · Loops & ceilings',
    description: 'Two giant vertical loops, a barrel-roll tube and moving platforms. The floor is crowded — the ceiling is where you win.',
    difficulty: 2,
    theme: 'core',
    width: 8,
    laps: 3,
    seed: 2202,
    unlockCost: 1500,
    palette: { a: '#b45cff', b: '#ff2bd6', c: '#22e5ff', base: '#0a0518', fog: '#0b0518', skyTop: '#04010a', skyBottom: '#2e0a46' },
    cmds: [
      { t: 's', len: 300, free: true },
      { t: 'loop', r: 60, shift: 28 },
      { t: 's', len: 100 },
      { t: 'turn', deg: 90, r: 90 },
      { t: 's', len: 200, free: true },
      { t: 'loop', r: 50, shift: -28 },
      { t: 's', len: 80 },
      { t: 'turn', deg: 90, r: 90 },
      { t: 's', len: 160 },
      { t: 'twist', deg: 360, len: 340 },
      { t: 's', len: 80 },
      { t: 'turn', deg: 90, r: 90 },
      { t: 's', len: 120 },
      { t: 'hill', deg: 14, len: 80 }, { t: 'hill', deg: -14, len: 80 },
      { t: 's', len: 80 },
      { t: 'turn', deg: 90, r: 90 },
      { t: 's', len: 170 },
    ],
    tunnels: [[0.3, 0.37], [0.8, 0.86]],
    gaps: [],
    obstacles: { count: 34, f0: 0.07, f1: 0.94, kinds: [['block', 3], ['low', 2], ['mover', 3]], surfaceWeights: [5, 2, 1, 2], slalom: 0.2 },
    pads: { boost: 16, jump: 2, surfaceWeights: [1, 2, 6, 2] },
  },
  {
    id: 'void-station',
    name: 'VOID STATION',
    subtitle: 'Expert · Floating sections',
    description: 'A derelict orbital station. Broken track, huge gaps, dynamic hazards and sustained top speed. Switch surfaces or jump — or fall.',
    difficulty: 3,
    theme: 'void',
    width: 8,
    laps: 3,
    seed: 3303,
    unlockCost: 4000,
    palette: { a: '#3bffd9', b: '#3b6bff', c: '#ff4d8d', base: '#03060f', fog: '#02040c', skyTop: '#01010a', skyBottom: '#06163a' },
    cmds: [
      { t: 's', len: 220, free: true },
      { t: 'turn', deg: 40, r: 200 }, { t: 'turn', deg: -40, r: 200 },
      { t: 's', len: 60 },
      { t: 'hill', deg: 10, len: 80 }, { t: 'hill', deg: -10, len: 80 },
      { t: 's', len: 40 },
      { t: 'turn', deg: 90, r: 150 },
      { t: 's', len: 200, free: true },
      { t: 'turn', deg: 90, r: 150 },
      { t: 's', len: 250 },
      { t: 'turn', deg: -40, r: 200 }, { t: 'turn', deg: 40, r: 200 },
      { t: 's', len: 130 },
      { t: 'hill', deg: 8, len: 80 }, { t: 'hill', deg: -8, len: 80 },
      { t: 's', len: 130 },
      { t: 'turn', deg: 90, r: 150 },
      { t: 's', len: 300 },
      { t: 'turn', deg: 90, r: 150 },
      { t: 's', len: 170 },
    ],
    tunnels: [[0.58, 0.64]],
    gaps: [
      { f: 0.14, len: 22, surfaces: [0] },
      { f: 0.26, len: 26, surfaces: [0, 1, 3] },
      { f: 0.4, len: 20, surfaces: [0, 1, 2, 3] },
      { f: 0.52, len: 28, surfaces: [0, 2] },
      { f: 0.68, len: 22, surfaces: [0, 1, 2, 3] },
      { f: 0.8, len: 30, surfaces: [2, 3, 0] },
    ],
    obstacles: { count: 30, f0: 0.07, f1: 0.94, kinds: [['block', 3], ['low', 2], ['mover', 3]], surfaceWeights: [4, 3, 2, 3], slalom: 0.25 },
    pads: { boost: 14, jump: 1, surfaceWeights: [3, 2, 3, 2] },
  },
];

export const getTrackDef = (id: string) => TRACKS.find((t) => t.id === id) ?? TRACKS[0];
