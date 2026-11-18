import { create } from 'zustand';
import type { EventHud } from '../game/events/events';

export interface HudState {
  speed: number; // km/h
  lap: number; laps: number; place: number; total: number;
  time: number; lapTime: number; lastLap: number | null; bestLap: number | null;
  boost: number; // 0..1
  boosting: boolean;
  surf: number; transit: boolean;
  progress: number;
  phase: 'countdown' | 'racing' | 'finished';
  count: string; // '3','2','1','GO!' or ''
  msg: { text: string; kind: 'info' | 'good' | 'bad'; id: number } | null;
  flashGrav: number; flashHit: number; flashBoost: number;
  fps: number;
  mode: string;
  gateInfo: { score: number; combo: number; hit: number; missed: number; total: number; nextSurface: number; nextIdx: number; lastOk: boolean } | null;
  nextCheckpoint: number;
  event: EventHud | null;
}
export const useHud = create<HudState>(() => ({
  speed: 0, lap: 1, laps: 3, place: 1, total: 4, time: 0, lapTime: 0, lastLap: null, bestLap: null,
  boost: 0, boosting: false, surf: 0, transit: false, progress: 0, phase: 'countdown', count: '', msg: null,
  flashGrav: 0, flashHit: 0, flashBoost: 0, fps: 0, mode: 'quick', gateInfo: null, nextCheckpoint: 0, event: null,
}));
let msgId = 1;
export const hudMessage = (text: string, kind: 'info' | 'good' | 'bad' = 'info') => useHud.setState({ msg: { text, kind, id: msgId++ } });
