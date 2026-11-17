import type { QualityLevel } from './types';

export interface QualityCfg {
  dpr: number; post: boolean; bloom: boolean; ca: boolean; vignette: boolean;
  particles: number; buildings: number; speedLines: number; antialias: boolean; arches: number; stars: number;
}
export function qualityCfg(q: QualityLevel, renderScale: number): QualityCfg {
  const dev = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const base = {
    LOW: { cap: 1, post: false, bloom: false, ca: false, vignette: false, particles: 220, buildings: 110, speedLines: 36, antialias: false, arches: 70, stars: 500 },
    MEDIUM: { cap: 1.5, post: true, bloom: true, ca: false, vignette: false, particles: 520, buildings: 240, speedLines: 70, antialias: false, arches: 45, stars: 1200 },
    HIGH: { cap: 2, post: true, bloom: true, ca: true, vignette: true, particles: 1200, buildings: 420, speedLines: 120, antialias: true, arches: 32, stars: 2500 },
  }[q];
  return {
    dpr: Math.max(0.5, Math.min(dev, base.cap) * renderScale),
    post: base.post, bloom: base.bloom, ca: base.ca, vignette: base.vignette,
    particles: base.particles, buildings: base.buildings, speedLines: base.speedLines,
    antialias: base.antialias, arches: base.arches, stars: base.stars,
  };
}
