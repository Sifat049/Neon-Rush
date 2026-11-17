import { forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface ParticleApi {
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, size: number, life: number): void;
}

/** Pooled additive point-sprite system (ring buffer) — one draw call for trails, sparks and ambient motes. */
export const Particles = forwardRef<ParticleApi, { max: number }>(function Particles({ max }, ref) {
  const data = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), base = new Float32Array(max);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); #include <colorspace_fragment> }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { geo, pos, col, size, alpha, vel, life, maxLife, base, mat, points, head: 0 };
  }, [max]);
  useEffect(() => () => { data.geo.dispose(); data.mat.dispose(); }, [data]);

  useImperativeHandle(ref, () => ({
    emit(x, y, z, vx, vy, vz, r, g, b, size, life) {
      const i = data.head; data.head = (i + 1) % max;
      data.pos[i * 3] = x; data.pos[i * 3 + 1] = y; data.pos[i * 3 + 2] = z;
      data.vel[i * 3] = vx; data.vel[i * 3 + 1] = vy; data.vel[i * 3 + 2] = vz;
      data.col[i * 3] = r; data.col[i * 3 + 1] = g; data.col[i * 3 + 2] = b;
      data.base[i] = size; data.life[i] = life; data.maxLife[i] = life;
    },
  }), [data, max]);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.1);
    const h = state.size.height;
    const cam = state.camera as THREE.PerspectiveCamera;
    data.mat.uniforms.uScale.value = (h / (2 * Math.tan((cam.fov * Math.PI) / 360))) * state.viewport.dpr * 0.6;
    for (let i = 0; i < max; i++) {
      const l = data.life[i];
      if (l <= 0) { data.alpha[i] = 0; continue; }
      data.life[i] = l - dt;
      data.pos[i * 3] += data.vel[i * 3] * dt; data.pos[i * 3 + 1] += data.vel[i * 3 + 1] * dt; data.pos[i * 3 + 2] += data.vel[i * 3 + 2] * dt;
      const k = Math.max(0, data.life[i]) / data.maxLife[i];
      data.alpha[i] = Math.min(1, k * 1.6);
      data.size[i] = data.base[i] * (0.4 + 0.6 * k);
    }
    (data.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (data.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (data.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (data.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  });
  return <primitive object={data.points} />;
});
