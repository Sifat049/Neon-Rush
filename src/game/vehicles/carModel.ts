import * as THREE from 'three';
import type { CarDesign } from './cars';
import { createGlowMaterial } from '../effects/materials';

export interface CarModel {
  group: THREE.Group; // world transform target
  pivot: THREE.Group; // cosmetic yaw/roll
  setBoost(b: number): void; // 0..1 flame strength
  dispose(): void;
}

type Pts = [number, number][];
// Side profiles (z forward = +, y up). Extruded across the car width.
const PROFILES: Record<CarDesign, { pts: Pts; width: number; scaleZ: number }> = {
  viper: { pts: [[-2.1, 0.12], [2.0, 0.08], [2.35, 0.26], [1.9, 0.5], [0.75, 0.62], [0.2, 0.9], [-0.7, 0.92], [-1.4, 0.68], [-2.15, 0.72], [-2.22, 0.4]], width: 1.5, scaleZ: 1 },
  phantom: { pts: [[-2.5, 0.1], [2.5, 0.06], [3.0, 0.2], [1.7, 0.4], [0.5, 0.5], [-0.1, 0.78], [-1.0, 0.8], [-2.0, 0.55], [-2.55, 0.6]], width: 1.25, scaleZ: 1 },
  bulwark: { pts: [[-2.0, 0.14], [1.9, 0.14], [2.15, 0.42], [1.7, 0.66], [0.6, 0.82], [0.2, 1.18], [-1.0, 1.2], [-1.6, 0.98], [-2.05, 1.0]], width: 1.7, scaleZ: 1 },
  nova: { pts: [[-1.9, 0.18], [-1.2, 0.08], [0.8, 0.08], [1.9, 0.24], [2.2, 0.4], [1.6, 0.58], [0.5, 0.86], [-0.5, 1.0], [-1.4, 0.9], [-2.0, 0.6]], width: 1.45, scaleZ: 1 },
  eclipse: { pts: [[-2.3, 0.1], [2.0, 0.06], [2.9, 0.18], [1.6, 0.36], [0.6, 0.46], [-0.2, 0.72], [-1.2, 0.74], [-2.4, 0.5]], width: 1.35, scaleZ: 1 },
};

const geoCache = new Map<string, THREE.BufferGeometry>();
function bodyGeometry(design: CarDesign) {
  const key = 'body-' + design;
  let g = geoCache.get(key);
  if (g) return g;
  const prof = PROFILES[design];
  const shape = new THREE.Shape();
  prof.pts.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  g = new THREE.ExtrudeGeometry(shape, { depth: prof.width, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1, steps: 1 });
  g.rotateY(Math.PI / 2); // profile x -> -z (forward), extrusion z -> x
  g.translate(-prof.width / 2, 0, 0);
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}
function box(w: number, h: number, d: number) {
  const key = `box-${w}-${h}-${d}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(key, g); }
  return g;
}
function cyl(r: number, l: number) {
  const key = `cyl-${r}-${l}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.CylinderGeometry(r, r * 0.8, l, 10); g.rotateX(Math.PI / 2); geoCache.set(key, g); }
  return g;
}
const planeGeo = new THREE.PlaneGeometry(1, 1);
const torusGeo = new THREE.TorusGeometry(0.5, 0.09, 8, 20);
const coneGeo = (() => { const g = new THREE.ConeGeometry(0.34, 2.4, 10, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 1.2); return g; })();

export function buildCar(design: CarDesign, primary: string, accent: string): CarModel {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  const mats: THREE.Material[] = [];
  const track = <T extends THREE.Material>(m: T) => { mats.push(m); return m; };
  const body = track(new THREE.MeshStandardMaterial({ color: primary, metalness: 0.75, roughness: 0.3, emissive: new THREE.Color(accent).multiplyScalar(0.05) }));
  const dark = track(new THREE.MeshStandardMaterial({ color: '#0a0c14', metalness: 0.9, roughness: 0.35 }));
  const glass = track(new THREE.MeshStandardMaterial({ color: '#05070d', metalness: 1, roughness: 0.04, emissive: new THREE.Color(accent).multiplyScalar(0.12) }));
  const neon = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.2), toneMapped: false }));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); pivot.add(m); return m;
  };
  const prof = PROFILES[design];
  const bodyMesh = add(bodyGeometry(design), body, 0, 0.2, 0);
  void bodyMesh;
  // cockpit canopy
  const cockZ = design === 'bulwark' ? -0.4 : design === 'phantom' ? -0.5 : -0.2;
  add(box(prof.width * 0.62, 0.22, 1.05), glass, 0, design === 'bulwark' ? 1.28 : 0.98, cockZ);
  // underbody + neon strips
  add(box(prof.width + 0.2, 0.1, design === 'phantom' ? 4.6 : 4.0), dark, 0, 0.18, 0);
  add(box(0.08, 0.05, design === 'phantom' ? 4.2 : 3.6), neon, prof.width / 2 + 0.12, 0.22, 0);
  add(box(0.08, 0.05, design === 'phantom' ? 4.2 : 3.6), neon, -prof.width / 2 - 0.12, 0.22, 0);

  const flames: THREE.Mesh[] = [];
  const flameMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const flame = (x: number, y: number, z: number, s = 1) => {
    const m = new THREE.Mesh(coneGeo, flameMat); m.position.set(x, y, z); m.scale.set(s, s, 1); pivot.add(m); flames.push(m);
  };
  const exhaust = (x: number, y: number, z: number, r = 0.3) => { add(cyl(r, 0.7), dark, x, y, z); add(cyl(r * 0.7, 0.72), neon, x, y, z + 0.02); };

  switch (design) {
    case 'viper':
      add(box(0.55, 0.32, 2.3), body, 1.1, 0.34, 0.2); add(box(0.55, 0.32, 2.3), body, -1.1, 0.34, 0.2);
      add(box(2.7, 0.06, 0.55), neon, 0, 0.3, 2.0); // front splitter
      add(box(2.3, 0.1, 0.5), body, 0, 1.05, -2.0); add(box(0.1, 0.45, 0.2), dark, 0.8, 0.8, -2.0); add(box(0.1, 0.45, 0.2), dark, -0.8, 0.8, -2.0);
      exhaust(0.5, 0.5, -2.35); exhaust(-0.5, 0.5, -2.35); flame(0.5, 0.5, -2.7); flame(-0.5, 0.5, -2.7);
      break;
    case 'phantom':
      add(box(0.3, 0.9, 1.2), body, 0.55, 1.05, -2.0); add(box(0.3, 0.9, 1.2), body, -0.55, 1.05, -2.0);
      add(box(0.06, 0.05, 1.0), neon, 0.55, 1.5, -2.0); add(box(0.06, 0.05, 1.0), neon, -0.55, 1.5, -2.0);
      add(box(2.2, 0.06, 0.7), dark, 0, 0.28, 2.1);
      exhaust(0, 0.5, -2.75, 0.38); flame(0, 0.5, -3.1, 1.3);
      break;
    case 'bulwark':
      add(box(0.7, 0.55, 2.6), dark, 1.2, 0.5, 0.0); add(box(0.7, 0.55, 2.6), dark, -1.2, 0.5, 0.0);
      add(box(0.12, 0.2, 1.8), neon, 1.58, 0.6, 0.0); add(box(0.12, 0.2, 1.8), neon, -1.58, 0.6, 0.0);
      add(box(2.9, 0.18, 0.7), body, 0, 1.3, -1.95);
      exhaust(0.65, 0.65, -2.3, 0.34); exhaust(-0.65, 0.65, -2.3, 0.34); flame(0.65, 0.65, -2.7, 1.2); flame(-0.65, 0.65, -2.7, 1.2);
      break;
    case 'nova':
      add(box(0.12, 0.05, 1.6), neon, 0.55, 0.96, 0.4); add(box(0.12, 0.05, 1.6), neon, -0.55, 0.96, 0.4);
      add(box(0.9, 0.05, 0.5), body, 0.95, 0.6, 1.2); add(box(0.9, 0.05, 0.5), body, -0.95, 0.6, 1.2);
      { const ring = new THREE.Mesh(torusGeo, neon); ring.position.set(0, 0.62, -2.15); pivot.add(ring); }
      flame(0, 0.62, -2.3, 1.5);
      break;
    case 'eclipse':
      add(box(1.3, 0.05, 1.3), dark, 1.15, 0.7, -1.4).rotation.z = 0.18; add(box(1.3, 0.05, 1.3), dark, -1.15, 0.7, -1.4).rotation.z = -0.18;
      add(box(1.3, 0.04, 0.05), neon, 1.15, 0.8, -2.04).rotation.z = 0.18; add(box(1.3, 0.04, 0.05), neon, -1.15, 0.8, -2.04).rotation.z = -0.18;
      add(box(0.08, 0.04, 3.4), neon, 0, 0.52, 0.2);
      exhaust(0.4, 0.45, -2.5, 0.28); exhaust(-0.4, 0.45, -2.5, 0.28); flame(0.4, 0.45, -2.85, 1.1); flame(-0.4, 0.45, -2.85, 1.1);
      break;
  }
  // hover pads (4) + under-glow
  const padMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.8), toneMapped: false }));
  for (const [x, z] of [[0.85, 1.4], [-0.85, 1.4], [0.85, -1.3], [-0.85, -1.3]]) add(cyl(0.28, 0.1), padMat, x, 0.12, z).rotation.x = Math.PI / 2;
  const glowMat = createGlowMaterial(accent, 0.9); mats.push(glowMat);
  const glow = new THREE.Mesh(planeGeo, glowMat);
  glow.rotation.x = -Math.PI / 2; glow.scale.set(4.5, 6.2, 1); glow.position.set(0, 0.02, 0);
  pivot.add(glow);
  pivot.rotation.order = 'YXZ';
  return {
    group, pivot,
    setBoost(b: number) {
      const s = 0.55 + b * 1.6;
      for (const f of flames) f.scale.z = s * (0.85 + Math.random() * 0.3);
      flameMat.opacity = 0.35 + b * 0.55;
    },
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}
