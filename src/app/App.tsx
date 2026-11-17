import { useEffect } from 'react';
import { GameCanvas } from '../scenes/GameCanvas';
import { useGame } from '../store/gameStore';
import { isTouchDevice } from '../store/saveData';
import { audio } from '../game/audio/audio';
import { attachInput } from '../controls/input';
import { toggleFullscreen } from './fullscreen';
import { MainMenu } from '../ui/MainMenu';
import { RaceSetup } from '../ui/RaceSetup';
import { Garage } from '../ui/Garage';
import { Settings } from '../ui/Settings';
import { HowToPlay } from '../ui/HowToPlay';
import { Profile } from '../ui/Profile';
import { HUD } from '../ui/HUD';
import { TouchControls } from '../ui/TouchControls';
import { Results } from '../ui/Results';
import { Toasts } from '../ui/Toasts';
import { RotateOverlay } from '../ui/RotateOverlay';

export function App() {
  const screen = useGame((s) => s.screen);
  const settings = useGame((s) => s.save.settings);
  const paused = useGame((s) => s.paused);
  const showSettingsInPause = useGame((s) => s.showSettingsInPause);

  // audio unlock on first gesture
  useEffect(() => {
    const unlock = () => audio.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => { audio.setVolumes(settings); }, [settings.master, settings.music, settings.sfx, settings.engine]);

  // music follows screen
  useEffect(() => {
    if (screen === 'race') audio.music('race');
    else { audio.music('menu'); audio.engineStop(); }
  }, [screen]);

  // keyboard shortcuts
  useEffect(() => attachInput({
    pause: () => { const g = useGame.getState(); if (g.screen === 'race') { if (g.paused && g.showSettingsInPause) g.closeSettings(); else g.setPaused(!g.paused); } },
    fullscreen: toggleFullscreen,
    restart: () => { const g = useGame.getState(); if (g.screen === 'race') g.restartRace(); },
  }), []);

  // pause when tab/app is hidden; mute audio
  useEffect(() => {
    const vis = () => {
      if (document.hidden) { audio.suspend(); const g = useGame.getState(); if (g.screen === 'race') g.setPaused(true); }
      else audio.resume();
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  // Capacitor (Android): hardware back button pauses instead of exiting, hide status bar
  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App: CapApp } = await import('@capacitor/app');
        const h = await CapApp.addListener('backButton', () => {
          const g = useGame.getState();
          if (g.screen === 'race') { if (g.paused && g.showSettingsInPause) g.closeSettings(); else g.setPaused(!g.paused); }
          else if (g.screen === 'settings') g.closeSettings();
          else if (g.screen !== 'menu') g.go('menu');
          else CapApp.minimizeApp();
        });
        const a = await CapApp.addListener('pause', () => { audio.suspend(); const g = useGame.getState(); if (g.screen === 'race') g.setPaused(true); });
        const b = await CapApp.addListener('resume', () => audio.resume());
        remove = () => { h.remove(); a.remove(); b.remove(); };
        const { StatusBar } = await import('@capacitor/status-bar');
        await StatusBar.hide();
      } catch { /* not native */ }
    })();
    return () => remove?.();
  }, []);

  const showTouch = screen === 'race' && !paused && (settings.touch === 'on' || (settings.touch === 'auto' && isTouchDevice()));

  return (
    <div className="fixed inset-0 overflow-hidden bg-void-900 text-cyan-50">
      <GameCanvas />
      {screen === 'menu' && <MainMenu />}
      {screen === 'tracks' && <RaceSetup />}
      {screen === 'garage' && <Garage />}
      {screen === 'settings' && <Settings />}
      {screen === 'howto' && <HowToPlay />}
      {screen === 'profile' && <Profile />}
      {screen === 'race' && <HUD />}
      {showTouch && !showSettingsInPause && <TouchControls />}
      {screen === 'results' && <Results />}
      <Toasts />
      <RotateOverlay />
    </div>
  );
}
