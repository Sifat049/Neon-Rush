import * as THREE from 'three';
import type { TrackPalette } from '../tracks/definitions';

export interface FogU {
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}
export const createFog = (hex: string, near: number, far: number): FogU => ({
  uFogColor: { value: new THREE.Color(hex) }, uFogNear: { value: near }, uFogFar: { value: far },
});

const FOG_DECL = /* glsl */ `uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;`;

// ---------------------------------------------------------------- road (all 4 gravity surfaces)
const roadVert = /* glsl */ `
attribute float aTun; attribute float aKind;
varying vec2 vUv; varying vec3 vW; varying float vTun; varying float vKind;
void main(){ vUv = uv; vTun = aTun; vKind = aKind; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const roadFrag = /* glsl */ `
${FOG_DECL}
uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uBase; uniform float uGlass;
varying vec2 vUv; varying vec3 vW; varying float vTun; varying float vKind;
float band(float x, float w){ return 1.0 - smoothstep(0.0, w, abs(x)); }
void main(){
  float u = vUv.x * 2.0 - 1.0; float v = vUv.y; float au = abs(u);
  float edge = smoothstep(0.78, 1.0, au);
  float dash = step(0.5, fract(v / 10.0));
  float lane = band(au - 0.5, 0.014) * dash;
  float center = band(u, 0.012) * step(0.4, fract(v / 6.0));
  float g = abs(fract(v / 14.0) - 0.5); float cross = smoothstep(0.485, 0.5, g) * (1.0 - smoothstep(0.55, 1.0, au));
  float pulse = pow(0.5 + 0.5 * sin(v * 0.045 - uTime * 4.0), 20.0);
  bool odd = mod(vKind, 2.0) > 0.5;
  vec3 edgeCol = odd ? uC : uA;
  vec3 c = uBase;
  c += edgeCol * edge * 1.7;
  c += uA * (center * 0.9 + cross * 0.35);
  c += uB * (lane * 1.0 + pulse * 0.5 * (1.0 - edge));
  float ring = pow(max(0.0, cos(v / 22.0 * 6.2831)), 40.0);
  c += uC * ring * 2.2 * vTun;
  c *= mix(1.0, 0.6, vTun);
  float glow = clamp(edge + lane + center * 0.8 + cross * 0.5 + pulse * 0.25 * (1.0 - edge) + ring * vTun, 0.0, 1.0);
  float baseA = (vKind < 0.5 ? 0.9 : uGlass);
  baseA = mix(baseA, 0.985, vTun);
  float a = mix(baseA, 1.0, glow);
  float d = distance(cameraPosition, vW);
  float f = smoothstep(uFogNear, uFogFar, d);
  c = mix(c, uFogColor, f); a *= (1.0 - f * 0.9);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;
export function createRoadMaterial(p: TrackPalette, fog: FogU, glass: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uA: { value: new THREE.Color(p.a) }, uB: { value: new THREE.Color(p.b) }, uC: { value: new THREE.Color(p.c) },
      uBase: { value: new THREE.Color(p.base) }, uGlass: { value: glass }, ...fog,
    },
    vertexShader: roadVert, fragmentShader: roadFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------- instanced neon buildings
const instVert = /* glsl */ `
varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vUv = uv;
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  vec4 w = modelMatrix * im * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #else
  vCol = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const buildingFrag = /* glsl */ `
${FOG_DECL}
uniform float uTime;
varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 n = normalize(vN);
  float side = 1.0 - abs(n.y);
  vec2 wp = vec2(vW.x + vW.z, vW.y);
  vec2 q = vec2(wp.x / 3.2, wp.y / 4.2);
  vec2 cell = floor(q); vec2 f = fract(q);
  float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
  float on = step(0.5, h21(cell + floor(vCol.r * 9.0 + vCol.b * 5.0)));
  float tw = 0.7 + 0.3 * sin(uTime * 2.0 + h21(cell) * 40.0);
  vec3 c = vec3(0.012, 0.014, 0.03) + vCol * 0.035;
  c += vCol * win * on * side * 1.5 * tw;
  c += vCol * smoothstep(0.92, 1.0, n.y) * 0.8;
  float band = step(0.96, fract(wp.y / 38.0)) * side;
  c += vCol * band * 1.2;
  float d = distance(cameraPosition, vW);
  float fg = smoothstep(uFogNear, uFogFar, d);
  c = mix(c, uFogColor, fg);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
export function createBuildingMaterial(fog: FogU) {
  return new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, ...fog }, vertexShader: instVert, fragmentShader: buildingFrag });
}
const obstacleFrag = /* glsl */ `
${FOG_DECL}
uniform float uTime;
varying vec3 vCol; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = 1.0 - smoothstep(0.0, 0.1, e);
  float stripe = step(0.5, fract((vUv.x + vUv.y) * 3.0 - uTime * 0.25));
  vec3 c = vec3(0.04, 0.015, 0.03) + vCol * (0.12 + 0.2 * stripe) + vCol * edge * 2.6;
  float d = distance(cameraPosition, vW);
  c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
export function createObstacleMaterial(fog: FogU) {
  return new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, ...fog }, vertexShader: instVert, fragmentShader: obstacleFrag });
}

// ---------------------------------------------------------------- pads (boost chevrons / jump rings) and start line
const padVert = /* glsl */ `
attribute float aKind; varying vec2 vUv; varying float vKind; varying vec3 vW;
void main(){ vUv = uv; vKind = aKind; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const padFrag = /* glsl */ `
${FOG_DECL}
uniform float uTime; uniform vec3 uA; uniform vec3 uC;
varying vec2 vUv; varying float vKind; varying vec3 vW;
void main(){
  vec3 c; float a;
  vec2 p = vUv - 0.5;
  float frame = 1.0 - smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  if (vKind < 0.5) {
    float t = vUv.y * 3.0 + abs(p.x) * 1.6 - uTime * 2.4;
    float chev = smoothstep(0.30, 0.48, fract(t)) * (1.0 - smoothstep(0.52, 0.7, fract(t)));
    c = mix(vec3(0.2, 1.0, 0.55), uA, 0.5) * (chev * 2.0 + frame * 1.6);
    a = clamp(chev * 0.95 + frame + 0.12, 0.0, 1.0);
  } else {
    float r = length(p * vec2(2.0, 2.0));
    float ring = smoothstep(0.35, 0.5, fract(r * 2.5 - uTime * 1.4)) * (1.0 - smoothstep(0.5, 0.65, fract(r * 2.5 - uTime * 1.4)));
    c = uC * (ring * 2.2 + frame * 1.8);
    a = clamp(ring * 0.95 + frame + 0.15, 0.0, 1.0);
  }
  float d = distance(cameraPosition, vW);
  float f = smoothstep(uFogNear, uFogFar, d);
  c = mix(c, uFogColor, f); a *= 1.0 - f * 0.9;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;
export function createPadMaterial(p: TrackPalette, fog: FogU) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(p.a) }, uC: { value: new THREE.Color(p.c) }, ...fog },
    vertexShader: padVert, fragmentShader: padFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
const checkerFrag = /* glsl */ `
${FOG_DECL}
varying vec2 vUv; varying float vKind; varying vec3 vW;
void main(){
  vec2 q = floor(vec2(vUv.x * 16.0, vUv.y * 2.0));
  float ch = mod(q.x + q.y, 2.0);
  vec3 c = mix(vec3(0.02), vec3(1.6), ch);
  float d = distance(cameraPosition, vW);
  c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
export function createCheckerMaterial(fog: FogU) {
  return new THREE.ShaderMaterial({
    uniforms: { ...fog }, vertexShader: padVert, fragmentShader: checkerFrag, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
}

// ---------------------------------------------------------------- sky
export function createSkyMaterial(top: string, bottom: string, accent: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) }, uAccent: { value: new THREE.Color(accent) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uAccent; varying vec3 vDir;
      float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){
        float y = vDir.y;
        vec3 c = mix(uBottom, uTop, smoothstep(-0.15, 0.7, y));
        c += uAccent * 0.22 * pow(max(0.0, 1.0 - abs(y + 0.02) * 4.0), 3.0);
        vec3 gp = floor(vDir * 260.0);
        float s = step(0.9965, h31(gp));
        c += vec3(0.8, 0.9, 1.0) * s * smoothstep(-0.2, 0.2, y);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

// ---------------------------------------------------------------- additive soft glow quad (hover glow, flames)
export function createGlowMaterial(color: string, intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uI; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.2) * uI; gl_FragColor = vec4(uColor * a * 2.0, a); #include <colorspace_fragment> }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
