import { ReactNode } from 'react';
import { useGame } from '../store/gameStore';
import { NeonButton, Panel, ScreenFrame } from './primitives';
import type { QualityLevel } from '../game/core/types';
import { toggleFullscreen } from '../app/fullscreen';

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, fmt }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; fmt?: (v: number) => string }) {
  return (
    <label className="pointer-events-auto mb-2.5 block">
      <div className="mb-1 flex justify-between text-[11px] tracking-[0.2em] text-cyan-100/80"><span>{label}</span><span className="text-cyan-300">{fmt ? fmt(value) : Math.round(value * 100) + '%'}</span></div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}
function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] tracking-[0.2em] text-cyan-100/80">{label}</div>
      <div className="flex flex-wrap gap-1.5">{options.map(([v, l]) => <NeonButton key={String(v)} size="sm" variant={value === v ? 'primary' : 'ghost'} onClick={() => onChange(v)}>{l}</NeonButton>)}</div>
    </div>
  );
}

export function SettingsBody({ compact }: { compact?: boolean }): ReactNode {
  const { save, setSettings, resetSave } = useGame();
  const s = save.settings;
  return (
    <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
      <Panel className="p-4">
        <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">AUDIO</div>
        <Slider label="MASTER" value={s.master} onChange={(v) => setSettings({ master: v })} />
        <Slider label="MUSIC" value={s.music} onChange={(v) => setSettings({ music: v })} />
        <Slider label="SOUND FX" value={s.sfx} onChange={(v) => setSettings({ sfx: v })} />
        <Slider label="ENGINE" value={s.engine} onChange={(v) => setSettings({ engine: v })} />
      </Panel>
      <Panel className="p-4">
        <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">GRAPHICS</div>
        <Seg<QualityLevel> label="QUALITY PRESET" value={s.quality} options={[['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High']]} onChange={(v) => setSettings({ quality: v })} />
        <Seg<number> label="FRAME RATE" value={s.fps} options={[[30, '30 FPS'], [60, '60 FPS'], [0, 'Max']]} onChange={(v) => setSettings({ fps: v as 30 | 60 | 0 })} />
        <Slider label="RENDER RESOLUTION" value={s.renderScale} min={0.5} max={1} step={0.05} onChange={(v) => setSettings({ renderScale: v })} />
        <Seg<string> label="FUNNY VOICE (BANGLISH)" value={s.voice ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setSettings({ voice: v === 'on' })} />
        <Seg<string> label="CAMERA SHAKE" value={s.shake ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setSettings({ shake: v === 'on' })} />
        <Seg<string> label="FPS COUNTER" value={s.showFps ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setSettings({ showFps: v === 'on' })} />
      </Panel>
      {!compact && (
        <Panel className="p-4">
          <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">CONTROLS</div>
          <Seg<string> label="TOUCH CONTROLS" value={s.touch} options={[['auto', 'Auto'], ['on', 'Always'], ['off', 'Off']]} onChange={(v) => setSettings({ touch: v as 'auto' | 'on' | 'off' })} />
          <Slider label="TOUCH BUTTON SIZE" value={s.touchSize} min={0.7} max={1.4} step={0.05} onChange={(v) => setSettings({ touchSize: v })} fmt={(v) => Math.round(v * 100) + '%'} />
          <NeonButton size="sm" onClick={toggleFullscreen}>Toggle fullscreen</NeonButton>
        </Panel>
      )}
      {!compact && (
        <Panel className="p-4">
          <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">DATA</div>
          <p className="mb-3 text-[11px] leading-relaxed text-cyan-100/70">Progress is saved automatically in this browser/app (LocalStorage).</p>
          <NeonButton size="sm" variant="danger" onClick={() => { if (confirm('Erase ALL progress, credits and records?')) resetSave(); }}>Reset progress</NeonButton>
        </Panel>
      )}
    </div>
  );
}

export function Settings() {
  const { closeSettings } = useGame();
  return (
    <ScreenFrame title="SETTINGS" subtitle="Audio · graphics · controls" onBack={closeSettings}>
      <div className="nr-scroll pointer-events-auto h-full pr-1"><SettingsBody /></div>
    </ScreenFrame>
  );
}
