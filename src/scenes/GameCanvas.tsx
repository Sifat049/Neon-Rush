import { Suspense, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { qualityCfg } from '../game/core/quality';
import { useGame } from '../store/gameStore';
import { RaceWorld } from './RaceWorld';
import { MenuWorld } from './MenuWorld';
import { Effects } from './Effects';

/** Manual frame driver: gives us an FPS cap (30/60/unlimited) and stops rendering entirely when the tab/app is hidden. */
function Driver({ fps }: { fps: number }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let raf = 0, last = 0;
    const min = fps > 0 ? 1000 / fps - 1.5 : 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) { last = t; return; }
      if (t - last >= min) { last = t; advance(t / 1000); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, advance]);
  return null;
}

export function GameCanvas() {
  const screen = useGame((s) => s.screen);
  const raceKey = useGame((s) => s.raceKey);
  const q = useGame((s) => s.save.settings.quality);
  const rs = useGame((s) => s.save.settings.renderScale);
  const fps = useGame((s) => s.save.settings.fps);
  const cfg = useMemo(() => qualityCfg(q, rs), [q, rs]);
  return (
    <Canvas
      key={q + (cfg.antialias ? 'a' : 'n')}
      frameloop="never"
      dpr={cfg.dpr}
      flat
      gl={{ antialias: !cfg.post && cfg.antialias, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 60, near: 0.3, far: 6000, position: [0, 3, 10] }}
      onCreated={({ gl, scene }) => { gl.setClearColor(new THREE.Color('#03030a')); scene.background = new THREE.Color('#03030a'); }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Driver fps={fps} />
      <Suspense fallback={null}>
        {screen === 'race' ? <RaceWorld key={raceKey} cfg={cfg} /> : <MenuWorld cfg={cfg} />}
      </Suspense>
      <Effects cfg={cfg} />
    </Canvas>
  );
}
