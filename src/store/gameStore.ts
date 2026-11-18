import { create } from 'zustand';
import type { GameMode } from '../game/core/types';
import { Race, RaceSummary } from '../game/core/race';
import { setRace } from '../game/core/session';
import { CARS, MAX_UPGRADE, UpgradeKey, effectiveStats, getCar, upgradeCost, PAINTS } from '../game/vehicles/cars';
import { TRACKS, getTrackDef } from '../game/tracks/definitions';
import { ACHIEVEMENTS, Rewards, SaveData, Settings, computeRewards, levelInfo, loadSave, persist, persistNow } from './saveData';
import type { WeatherId } from '../game/weather/weather';
import { audio } from '../game/audio/audio';

export type Screen = 'menu' | 'editor' | 'tracks' | 'garage' | 'settings' | 'howto' | 'profile' | 'race' | 'results';
export interface Results { summary: RaceSummary; rewards: Rewards; carId: string; records: { time: boolean; lap: boolean; score: boolean }; leaderboard?: { name: string; score: number; car: string; date: number }[]; lbRank?: number | null }
export interface Toast { id: number; text: string; kind: 'good' | 'info' | 'bad' }

interface GameStore {
  screen: Screen;
  settingsReturn: Screen;
  garageTab: 'vehicles' | 'paint' | 'upgrades';
  previewCar: string;
  setPreview: (id: string) => void;
  mode: GameMode;
  trackId: string;
  save: SaveData;
  raceKey: number;
  paused: boolean;
  showSettingsInPause: boolean;
  results: Results | null;
  toasts: Toast[];

  go: (s: Screen) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setGarageTab: (t: 'vehicles' | 'paint' | 'upgrades') => void;
  openGarage: (tab: 'vehicles' | 'paint' | 'upgrades') => void;
  setMode: (m: GameMode) => void;
  setTrack: (id: string) => void;
  /** screen to return to after a race (e.g. back to the track editor after a test race) */
  afterRace: Screen | null;
  setAfterRace: (s: Screen | null) => void;
  weather: WeatherId | 'default';
  setWeather: (w: WeatherId | 'default') => void;
  startRace: () => void;
  restartRace: () => void;
  quitRace: () => void;
  setPaused: (p: boolean) => void;
  finishRace: (s: RaceSummary) => void;
  buyCar: (id: string) => boolean;
  selectCar: (id: string) => void;
  setPaint: (carId: string, idx: number) => void;
  buyUpgrade: (carId: string, key: UpgradeKey) => boolean;
  buyTrack: (id: string) => boolean;
  setSettings: (p: Partial<Settings>) => void;
  setName: (n: string) => void;
  resetSave: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
}

let toastId = 1;

export const useGame = create<GameStore>((set, get) => {
  const updateSave = (fn: (s: SaveData) => SaveData, now = false) => {
    const next = fn(get().save);
    set({ save: next });
    (now ? persistNow : persist)(next);
  };
  const makeRace = () => {
    const { save, mode, trackId, weather } = get();
    const car = getCar(save.selectedCar);
    const def = getTrackDef(trackId);
    const cr = def.custom ? def.race : undefined;
    const race = new Race({
      mode, trackId, weather: weather === 'default' ? undefined : weather, carId: car.id,
      laps: cr?.laps, aiCount: cr ? cr.maxRacers - 1 : undefined, aiDifficulty: cr?.aiDifficulty, startSlot: cr?.startSlot, timeLimit: cr?.timeLimit, paintIndex: save.paint[car.id] ?? car.defaultPaint,
      stats: effectiveStats(car, save.upgrades[car.id]),
    });
    setRace(race);
  };
  return {
    screen: 'menu',
    settingsReturn: 'menu',
    garageTab: 'vehicles',
    previewCar: 'viper',
    setPreview: (previewCar) => set({ previewCar }),
    mode: 'quick',
    trackId: 'neon-city',
    save: loadSave(),
    raceKey: 0,
    paused: false,
    showSettingsInPause: false,
    results: null,
    toasts: [],

    go: (screen) => set({ screen }),
    openSettings: () => {
      if (get().screen === 'race') set({ showSettingsInPause: true });
      else set({ settingsReturn: get().screen, screen: 'settings' });
    },
    closeSettings: () => {
      if (get().screen === 'race') set({ showSettingsInPause: false });
      else set({ screen: get().settingsReturn === 'settings' ? 'menu' : get().settingsReturn });
    },
    setGarageTab: (garageTab) => set({ garageTab }),
    openGarage: (garageTab) => set((s) => ({ garageTab, screen: 'garage', previewCar: s.save.selectedCar })),
    setMode: (mode) => set({ mode }),
    setTrack: (trackId) => set({ trackId }),
    weather: 'default',
    setWeather: (weather) => set({ weather }),
    afterRace: null,
    setAfterRace: (afterRace) => set({ afterRace }),
    startRace: () => {
      makeRace();
      set((s) => ({ screen: 'race', raceKey: s.raceKey + 1, paused: false, results: null, showSettingsInPause: false }));
    },
    restartRace: () => {
      makeRace();
      set((s) => ({ screen: 'race', raceKey: s.raceKey + 1, paused: false, results: null, showSettingsInPause: false }));
    },
    quitRace: () => {
      setRace(null);
      audio.engineStop();
      const back = get().afterRace;
      set({ screen: back ?? 'menu', afterRace: null, paused: false, showSettingsInPause: false });
    },
    setPaused: (paused) => set({ paused }),
    finishRace: (summary) => {
      const st = get();
      const base = computeRewards(summary);
      const track = summary.trackId;
      const before = levelInfo(st.save.xp).level;
      const rec = { ...(st.save.records[track] ?? {}) };
      const flags = { time: false, lap: false, score: false };
      const p = summary.playerPlace;
      if (summary.mode === 'quick') {
        if (p === 1) rec.wins = (rec.wins ?? 0) + 1;
      }
      if ((summary.mode === 'trial' || (summary.mode === 'quick' && p === 1)) && summary.totalTime > 0) {
        if (summary.mode === 'trial' && (rec.bestTime == null || summary.totalTime < rec.bestTime)) { rec.bestTime = summary.totalTime; flags.time = true; }
      }
      if (summary.bestLap != null && (summary.mode === 'trial' || summary.mode === 'quick') && (rec.bestLap == null || summary.bestLap < rec.bestLap)) { rec.bestLap = summary.bestLap; flags.lap = true; }
      if (summary.mode === 'challenge' && summary.challenge) {
        if (rec.bestScore == null || summary.challenge.score > rec.bestScore) { rec.bestScore = summary.challenge.score; flags.score = true; }
        const rank = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 } as Record<string, number>;
        if ((rank[summary.challenge.medal] ?? 0) > (rank[rec.medal ?? 'NONE'] ?? 0)) rec.medal = summary.challenge.medal;
      }
      // event leaderboards (local top 5 per event + track)
      let leaderboards = st.save.leaderboards;
      let lbList: Results['leaderboard'];
      let lbRank: number | null = null;
      if (summary.event) {
        const key = `${summary.event.kind}:${summary.trackId}`;
        const entry = { name: st.save.name, score: summary.event.score, car: st.save.selectedCar, date: Date.now() };
        const list = [...(leaderboards?.[key] ?? []), entry].sort((a, b) => b.score - a.score);
        const idx = list.indexOf(entry);
        lbRank = idx < 5 && entry.score > 0 ? idx + 1 : null;
        lbList = list.slice(0, 5);
        leaderboards = { ...(leaderboards ?? {}), [key]: lbList };
        if (lbRank === 1 && list.length > 1) flags.score = true;
      }
      let credits = base.credits;
      const lines = [...base.lines];
      if (flags.time) { lines.push(['New time record', 250]); credits += 250; }
      if (flags.score) { lines.push(['New high score', 150]); credits += 150; }
      let next: SaveData = {
        ...st.save,
        credits: st.save.credits + credits,
        xp: st.save.xp + base.xp,
        records: { ...st.save.records, [track]: rec },
        leaderboards,
        stats: {
          ...st.save.stats,
          races: st.save.stats.races + 1,
          wins: st.save.stats.wins + (summary.mode === 'quick' && p === 1 ? 1 : 0),
          distance: st.save.stats.distance + summary.distance,
          gravSwitches: st.save.stats.gravSwitches + summary.gravSwitches,
          driftTime: st.save.stats.driftTime + summary.driftTime,
          jumps: st.save.stats.jumps + summary.jumps,
          hits: st.save.stats.hits + summary.hits,
        },
      };
      const newAch: string[] = [];
      for (const a of ACHIEVEMENTS) {
        if (!next.achievements.includes(a.id) && a.check(next, summary)) {
          newAch.push(a.name);
          next = { ...next, achievements: [...next.achievements, a.id], credits: next.credits + 200 };
          lines.push([`Achievement: ${a.name}`, 200]);
          credits += 200;
        }
      }
      const after = levelInfo(next.xp).level;
      const rewards: Rewards = { credits, xp: base.xp, lines, newRecord: flags.time || flags.score || flags.lap, newAchievements: newAch, levelUp: after > before ? after : null };
      set({ save: next, results: { summary, rewards, carId: st.save.selectedCar, records: flags, leaderboard: lbList, lbRank }, screen: 'results' });
      persistNow(next);
      audio.engineStop();
    },
    buyCar: (id) => {
      const car = CARS.find((c) => c.id === id)!;
      const s = get().save;
      if (s.unlockedCars.includes(id) || s.credits < car.price) return false;
      updateSave((sv) => ({ ...sv, credits: sv.credits - car.price, unlockedCars: [...sv.unlockedCars, id], selectedCar: id }), true);
      get().toast(`${car.name} unlocked!`, 'good');
      return true;
    },
    selectCar: (id) => { if (get().save.unlockedCars.includes(id)) updateSave((s) => ({ ...s, selectedCar: id })); },
    setPaint: (carId, idx) => updateSave((s) => ({ ...s, paint: { ...s.paint, [carId]: idx % PAINTS.length } })),
    buyUpgrade: (carId, key) => {
      const s = get().save;
      const lvl = s.upgrades[carId]?.[key] ?? 0;
      const cost = upgradeCost(lvl);
      if (lvl >= MAX_UPGRADE || s.credits < cost) return false;
      updateSave((sv) => ({ ...sv, credits: sv.credits - cost, upgrades: { ...sv.upgrades, [carId]: { ...sv.upgrades[carId], [key]: lvl + 1 } } }), true);
      return true;
    },
    buyTrack: (id) => {
      const t = TRACKS.find((x) => x.id === id)!;
      const s = get().save;
      if (s.unlockedTracks.includes(id) || s.credits < t.unlockCost) return false;
      updateSave((sv) => ({ ...sv, credits: sv.credits - t.unlockCost, unlockedTracks: [...sv.unlockedTracks, id] }), true);
      get().toast(`${t.name} unlocked!`, 'good');
      return true;
    },
    setSettings: (p) => {
      updateSave((s) => ({ ...s, settings: { ...s.settings, ...p } }));
      const s = get().save.settings;
      audio.setVolumes(s);
    },
    setName: (name) => updateSave((s) => ({ ...s, name: name.slice(0, 14) || 'PILOT' })),
    resetSave: () => {
      localStorage.removeItem('neonrush.save.v1');
      set({ save: loadSave() });
    },
    toast: (text, kind = 'info') => {
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
      window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3300);
    },
  };
});
