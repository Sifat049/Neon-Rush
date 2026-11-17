import { Howl, Howler } from 'howler';
import type { Settings } from '../../store/saveData';
import * as S from './synth';

type SfxName = 'boost' | 'crash' | 'gravity' | 'beep' | 'go' | 'victory' | 'pad' | 'jump' | 'land' | 'checkpoint' | 'fall' | 'scrape' | 'gateOk' | 'gateBad';

class AudioEngine {
  private started = false;
  private sfx: Partial<Record<SfxName, Howl>> = {};
  private engine: Howl | null = null;
  private engineId: number | undefined;
  private musicHowls: Partial<Record<'race' | 'menu', Howl>> = {};
  private musicKind: 'race' | 'menu' | null = null;
  private vol = { master: 0.8, music: 0.5, sfx: 0.8, engine: 0.6 };
  private lastPlay: Record<string, number> = {};
  private pendingMusic: 'race' | 'menu' | null = null;

  /** Must be called from a user gesture handler the first time. Heavy synthesis is chunked so the UI never freezes. */
  ensure() {
    if (this.started) return;
    this.started = true;
    const mk = (url: string, o: Partial<ConstructorParameters<typeof Howl>[0]> = {}) => new Howl({ src: [url], format: ['wav'], html5: false, ...o });
    const jobs: (() => void)[] = [
      () => { this.engine = mk(S.toWavUrl(S.synthEngine()), { loop: true, volume: 0 }); },
      () => { this.sfx.boost = mk(S.toWavUrl(S.synthBoost())); this.sfx.crash = mk(S.toWavUrl(S.synthCrash())); },
      () => { this.sfx.gravity = mk(S.toWavUrl(S.synthGravity())); this.sfx.beep = mk(S.toWavUrl(S.synthBeep())); this.sfx.go = mk(S.toWavUrl(S.synthGo())); },
      () => { this.sfx.victory = mk(S.toWavUrl(S.synthVictory())); this.sfx.pad = mk(S.toWavUrl(S.synthPad())); this.sfx.jump = mk(S.toWavUrl(S.synthJump())); },
      () => {
        this.sfx.land = mk(S.toWavUrl(S.synthLand())); this.sfx.checkpoint = mk(S.toWavUrl(S.synthCheckpoint())); this.sfx.fall = mk(S.toWavUrl(S.synthFall()));
        this.sfx.scrape = mk(S.toWavUrl(S.synthScrape())); this.sfx.gateOk = mk(S.toWavUrl(S.synthGateOk())); this.sfx.gateBad = mk(S.toWavUrl(S.synthGateBad()));
      },
      () => { this.musicHowls.menu = mk(S.toWavUrl(S.synthMusic('menu')), { loop: true, volume: 0 }); this.applyMusic(); },
      () => { this.musicHowls.race = mk(S.toWavUrl(S.synthMusic('race')), { loop: true, volume: 0 }); this.applyMusic(); },
    ];
    let i = 0;
    const run = () => {
      if (i >= jobs.length) return;
      try { jobs[i++](); } catch (e) { console.warn('audio synth failed', e); }
      setTimeout(run, 16);
    };
    run();
  }

  setVolumes(s: Pick<Settings, 'master' | 'music' | 'sfx' | 'engine'>) {
    this.vol = { master: s.master, music: s.music, sfx: s.sfx, engine: s.engine };
    Howler.volume(1);
    this.applyMusic();
  }
  private applyMusic() {
    for (const k of ['race', 'menu'] as const) {
      const h = this.musicHowls[k];
      if (!h) continue;
      const target = this.musicKind === k ? this.vol.master * this.vol.music * 0.7 : 0;
      h.volume(target);
      if (this.musicKind === k && !h.playing()) h.play();
      if (this.musicKind !== k && h.playing()) h.pause();
    }
    if (this.pendingMusic && this.musicHowls[this.pendingMusic]) { /* handled above */ }
  }
  music(kind: 'race' | 'menu' | null) {
    this.musicKind = kind;
    this.applyMusic();
  }
  play(name: SfxName, vol = 1, rate = 1, minGap = 0.03) {
    const h = this.sfx[name];
    if (!h) return;
    const now = performance.now() / 1000;
    if (now - (this.lastPlay[name] ?? -1) < minGap) return;
    this.lastPlay[name] = now;
    const id = h.play();
    h.volume(Math.min(1, this.vol.master * this.vol.sfx * vol), id);
    if (rate !== 1) h.rate(rate, id);
  }
  engineStart() {
    if (!this.engine) return;
    if (this.engineId == null || !this.engine.playing(this.engineId)) this.engineId = this.engine.play();
    this.engine.volume(0, this.engineId);
  }
  /** speedFrac 0..~1.5, throttle 0..1 */
  engineUpdate(speedFrac: number, throttle: number, boosting: boolean) {
    if (!this.engine || this.engineId == null) return;
    const rate = 0.55 + Math.min(1.7, speedFrac) * 1.05 + (boosting ? 0.25 : 0);
    const v = this.vol.master * this.vol.engine * (0.25 + 0.55 * throttle + 0.2 * Math.min(1, speedFrac)) * 0.55;
    this.engine.rate(Math.min(3.4, rate), this.engineId);
    this.engine.volume(v, this.engineId);
  }
  engineStop() {
    if (this.engine && this.engineId != null) { this.engine.volume(0, this.engineId); this.engine.pause(this.engineId); this.engineId = undefined; }
  }
  suspend() { Howler.mute(true); }
  resume() { Howler.mute(false); }
}
export const audio = new AudioEngine();
