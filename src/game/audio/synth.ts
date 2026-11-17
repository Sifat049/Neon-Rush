/* Offline procedural synthesis -> 16-bit WAV blobs (so the game ships with zero audio asset files). */
export const SR = 22050;
const TAU = Math.PI * 2;

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const buf = (sec: number) => new Float32Array(Math.max(1, Math.floor(sec * SR)));

export function toWavUrl(samples: Float32Array): string {
  const n = samples.length;
  const b = new ArrayBuffer(44 + n * 2);
  const v = new DataView(b);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

function normalize(a: Float32Array, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] = (a[i] / m) * peak;
  return a;
}

export function synthEngine() {
  const a = buf(1);
  const f0 = 70;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    let s = 0;
    for (let h = 1; h <= 12; h++) s += Math.sin(TAU * h * f0 * t + h * 0.7) / Math.pow(h, 0.95);
    const am = 0.8 + 0.2 * Math.sin(TAU * 28 * t);
    s = s * am + 0.5 * Math.sin(TAU * f0 * 0.5 * t) + 0.25 * Math.sin(TAU * 3 * f0 * t + 0.3 * Math.sin(TAU * 7 * t));
    a[i] = s;
  }
  return normalize(a, 0.55);
}
export function synthBoost() {
  const r = prng(11); const a = buf(1.3);
  let lp = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    const k = 0.04 + 0.5 * Math.min(1, t / 0.7);
    lp += (r() * 2 - 1 - lp) * k;
    const env = Math.min(1, t / 0.06) * Math.exp(-Math.max(0, t - 0.5) * 3.2);
    const f = 180 + 900 * Math.pow(Math.min(1, t / 0.9), 1.6);
    a[i] = (lp * 1.6 + 0.35 * Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * f * 0.5 * t)) * env;
  }
  return normalize(a, 0.8);
}
export function synthCrash() {
  const r = prng(5); const a = buf(0.7);
  let lp = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    lp += (r() * 2 - 1 - lp) * 0.35;
    a[i] = lp * Math.exp(-t * 7) * 1.2 + Math.sin(TAU * (90 - 40 * t) * t) * Math.exp(-t * 8) + (r() * 2 - 1) * Math.exp(-t * 40) * 0.6;
  }
  return normalize(a, 0.95);
}
export function synthGravity() {
  const a = buf(0.45);
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    const f = 260 + 900 * Math.pow(t / 0.45, 1.4);
    const env = Math.sin(Math.PI * Math.min(1, t / 0.45)) ** 1.5;
    a[i] = (Math.sin(TAU * f * t + 2 * Math.sin(TAU * 14 * t)) * 0.6 + Math.sin(TAU * f * 1.5 * t) * 0.25) * env;
  }
  return normalize(a, 0.7);
}
const tone = (a: Float32Array, start: number, dur: number, f: number, vol = 1, shape: 'sine' | 'tri' | 'sq' = 'sine', decay = 5) => {
  const s0 = Math.floor(start * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < a.length; i++) {
    const t = i / SR;
    const ph = TAU * f * t;
    let v = Math.sin(ph);
    if (shape === 'tri') v = (2 / Math.PI) * Math.asin(Math.sin(ph));
    if (shape === 'sq') v = Math.sin(ph) + Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5;
    a[s0 + i] += v * vol * Math.min(1, t / 0.008) * Math.exp(-t * decay);
  }
};
export function synthBeep() { const a = buf(0.22); tone(a, 0, 0.22, 660, 1, 'sine', 8); tone(a, 0, 0.22, 1320, 0.3, 'sine', 12); return normalize(a, 0.8); }
export function synthGo() { const a = buf(0.6); tone(a, 0, 0.6, 990, 1, 'tri', 4); tone(a, 0, 0.6, 1980, 0.35, 'sine', 5); tone(a, 0, 0.6, 495, 0.5, 'sine', 4); return normalize(a, 0.85); }
export function synthVictory() {
  const a = buf(1.8);
  [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone(a, i * 0.13, 0.9, f, 0.6, 'tri', 3.2); tone(a, i * 0.13, 0.9, f * 2, 0.15, 'sine', 4); });
  return normalize(a, 0.8);
}
export function synthPad() { const a = buf(0.4); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(TAU * (500 + 1800 * t / 0.4) * t) * Math.exp(-t * 7); } return normalize(a, 0.7); }
export function synthJump() { const a = buf(0.28); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(TAU * (180 + 520 * t / 0.28) * t) * Math.exp(-t * 9) * Math.min(1, t / 0.01); } return normalize(a, 0.6); }
export function synthLand() { const r = prng(3); const a = buf(0.25); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = (Math.sin(TAU * 80 * t) + (r() * 2 - 1) * 0.3) * Math.exp(-t * 22); } return normalize(a, 0.8); }
export function synthCheckpoint() { const a = buf(0.35); tone(a, 0, 0.18, 880, 1, 'sine', 10); tone(a, 0.1, 0.25, 1320, 1, 'sine', 9); return normalize(a, 0.7); }
export function synthFall() { const a = buf(0.9); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(TAU * (700 * Math.exp(-t * 3.2) + 40) * t) * Math.exp(-t * 2.2); } return normalize(a, 0.7); }
export function synthScrape() { const r = prng(8); const a = buf(0.18); let lp = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; lp += ((r() * 2 - 1) - lp) * 0.7; a[i] = (r() * 2 - 1 - lp * 0.3) * Math.exp(-t * 12); } return normalize(a, 0.5); }
export function synthGateOk() { const a = buf(0.3); tone(a, 0, 0.3, 1046, 1, 'tri', 9); tone(a, 0.05, 0.25, 1568, 0.6, 'sine', 9); return normalize(a, 0.65); }
export function synthGateBad() { const a = buf(0.3); tone(a, 0, 0.3, 160, 1, 'sq', 8); return normalize(a, 0.5); }

const N = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Procedural loop: 8 bars. kind "race" = driving synthwave, "menu" = slower airy arpeggios. */
export function synthMusic(kind: 'race' | 'menu') {
  const bpm = kind === 'race' ? 132 : 96;
  const step = 60 / bpm / 4; // 16th
  const steps = 128;
  const a = buf(steps * step);
  const r = prng(kind === 'race' ? 21 : 33);
  const prog = [57, 53, 60, 55, 57, 53, 60, 67 - 12]; // A F C G (root midi) per bar
  const chords: number[][] = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
  const minor = [true, false, false, false, true, false, false, false];
  void minor;
  for (let st = 0; st < steps; st++) {
    const t0 = st * step;
    const bar = Math.floor(st / 16) % 8;
    const inBar = st % 16;
    const root = prog[bar];
    if (kind === 'race') {
      if (inBar % 4 === 0) { // kick
        const s0 = Math.floor(t0 * SR), n = Math.floor(0.28 * SR);
        for (let i = 0; i < n && s0 + i < a.length; i++) { const t = i / SR; a[s0 + i] += Math.sin(TAU * (48 + 120 * Math.exp(-t * 26)) * t) * Math.exp(-t * 9) * 0.9; }
      }
      if (inBar % 8 === 4) { // snare
        const s0 = Math.floor(t0 * SR), n = Math.floor(0.2 * SR);
        for (let i = 0; i < n && s0 + i < a.length; i++) { const t = i / SR; a[s0 + i] += ((r() * 2 - 1) * 0.5 + Math.sin(TAU * 190 * t) * 0.4) * Math.exp(-t * 16) * 0.6; }
      }
      if (inBar % 2 === 1) { // hat
        const s0 = Math.floor(t0 * SR), n = Math.floor(0.05 * SR);
        for (let i = 0; i < n && s0 + i < a.length; i++) { const t = i / SR; a[s0 + i] += (r() * 2 - 1) * Math.exp(-t * 70) * 0.18; }
      }
      // bass: 8th notes with octave pop
      if (inBar % 2 === 0) {
        const f = N(root - 24 + (inBar % 8 === 6 ? 12 : 0));
        const s0 = Math.floor(t0 * SR), n = Math.floor(step * 2 * SR);
        for (let i = 0; i < n && s0 + i < a.length; i++) {
          const t = i / SR; const ph = TAU * f * t;
          a[s0 + i] += (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) * Math.exp(-t * 6) * 0.42;
        }
      }
    } else if (inBar % 8 === 0) { // soft kick
      const s0 = Math.floor(t0 * SR), n = Math.floor(0.3 * SR);
      for (let i = 0; i < n && s0 + i < a.length; i++) { const t = i / SR; a[s0 + i] += Math.sin(TAU * (45 + 80 * Math.exp(-t * 20)) * t) * Math.exp(-t * 8) * 0.5; }
    }
    // arp lead
    const arp = chords[bar];
    const idx = [0, 1, 2, 1, 2, 1, 0, 2][inBar % 8];
    if (kind === 'race' ? true : inBar % 2 === 0) {
      const note = root + 12 + arp[idx % 3] + (inBar >= 8 ? 12 : 0);
      const f = N(note);
      const s0 = Math.floor(t0 * SR), n = Math.floor(step * 3 * SR);
      for (let i = 0; i < n && s0 + i < a.length; i++) {
        const t = i / SR; const ph = TAU * f * t;
        const v = Math.sin(ph) + Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5;
        a[s0 + i] += v * Math.exp(-t * (kind === 'race' ? 12 : 5)) * Math.min(1, t / 0.004) * (kind === 'race' ? 0.16 : 0.2);
      }
    }
    // pad on bar start
    if (inBar === 0) {
      const dur = step * 16;
      const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
      for (const iv of arp) {
        const f = N(root + 12 + iv);
        for (let i = 0; i < n && s0 + i < a.length; i++) {
          const t = i / SR;
          const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.3);
          a[s0 + i] += Math.sin(TAU * f * t) * env * (kind === 'race' ? 0.045 : 0.09);
        }
      }
    }
  }
  // feedback delay (wraps for seamless loop)
  const d = Math.floor(step * 3 * SR);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < a.length; i++) a[(i + d) % a.length] += a[i] * 0.28;
  return normalize(a, 0.75);
}
