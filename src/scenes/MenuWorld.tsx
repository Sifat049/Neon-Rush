import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityCfg } from '../game/core/quality';
import { buildCar } from '../game/vehicles/carModel';
import { getCar, PAINTS } from '../game/vehicles/cars';
import { createBuildingMaterial, createFog, createSkyMaterial } from '../game/effects/materials';
import { Particles, ParticleApi } from '../game/effects/Particles';
import { useGame } from '../store/gameStore';
import { rng, damp } from '../game/core/math';

const POSES: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  menu: { pos: [6.8, 2.2, 9.5], look: [-1.9, 1.0, 0] },
  garage: { pos: [0.4, 2.3, 8.6], look: [0, 0.95, 0] },
  wide: { pos: [4.5, 2.4, 11], look: [-0.8, 1.1, 0] },
};

export function MenuWorld({ cfg }: { cfg: QualityCfg }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const particles = useRef<ParticleApi>(null);
  const screen = useGame((s) => s.screen);
  const selected = useGame((s) => s.save.selectedCar);
  const preview = useGame((s) => s.previewCar);
  const paints = useGame((s) => s.save.paint);
  const carId = screen === 'garage' ? preview : selected;
  const car = getCar(carId);
  const paint = PAINTS[(paints[carId] ?? car.defaultPaint) % PAINTS.length];
  const model = useMemo(() => buildCar(car.design, paint.primary, paint.accent), [car.design, paint]);
  useEffect(() => () => model.dispose(), [model]);

  const env = useMemo(() => {
    const group = new THREE.Group();
    const disposables: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(o: T) => { disposables.push(o); return o; };
    const fog = createFog('#07071f', 25, 520);
    const bm = keep(createBuildingMaterial(fog));
    const r = rng(77);
    const n = Math.max(40, Math.floor(cfg.buildings * 0.5));
    const towers = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), bm, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const cols = [new THREE.Color('#22e5ff'), new THREE.Color('#8b5cff'), new THREE.Color('#ff2bd6')];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = 26 + Math.pow(r(), 0.8) * 190;
      const w = 8 + r() * 22, h = 30 + r() * 220 * (1 - d / 330);
      m.compose(new THREE.Vector3(Math.cos(a) * d, -2 + h / 2 - 2, Math.sin(a) * d - 20), q.setFromEuler(e.set(0, r(), 0)), new THREE.Vector3(w, h, w));
      towers.setMatrixAt(i, m); towers.setColorAt(i, cols[Math.floor(r() * 3)].clone().multiplyScalar(0.8 + r() * 0.6));
    }
    towers.frustumCulled = false;
    group.add(towers);
    const gm = keep(new THREE.ShaderMaterial({
      uniforms: { ...fog },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying vec3 vW;
        void main(){ vec2 p = vW.xz / 3.0; vec2 g = abs(fract(p) - 0.5); float l = smoothstep(0.47, 0.5, max(g.x, g.y)); float d = distance(cameraPosition, vW);
        float rad = length(vW.xz); float ring = smoothstep(7.0, 5.0, rad);
        vec3 c = vec3(0.01,0.012,0.035) + vec3(0.1,0.6,1.0) * l * 0.7 * (1.0 - smoothstep(20.0, 150.0, d)) + vec3(0.4,0.2,1.0) * ring * 0.15;
        c = mix(c, uFogColor, smoothstep(fogNearFix, uFogFar, d)); gl_FragColor = vec4(c, 1.0); #include <colorspace_fragment> }`.replace('fogNearFix', 'uFogNear'),
    }));
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(1200, 1200)), gm);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.31;
    group.add(ground);
    // platform
    const plat = new THREE.Mesh(keep(new THREE.CylinderGeometry(5.2, 5.6, 0.3, 48)), keep(new THREE.MeshStandardMaterial({ color: '#080a16', metalness: 0.9, roughness: 0.25 })));
    plat.position.y = -0.15;
    group.add(plat);
    const ringMat1 = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#22e5ff').multiplyScalar(2.4), toneMapped: false }));
    const ringMat2 = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2bd6').multiplyScalar(2.2), toneMapped: false }));
    const ring1 = new THREE.Mesh(keep(new THREE.TorusGeometry(5.35, 0.06, 8, 80)), ringMat1); ring1.rotation.x = Math.PI / 2; ring1.position.y = 0.02;
    const ring2 = new THREE.Mesh(keep(new THREE.TorusGeometry(4.1, 0.04, 8, 80)), ringMat2); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.02;
    group.add(ring1, ring2);
    const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(900, 20, 12)), keep(createSkyMaterial('#02020b', '#22093f', '#ff2bd6')));
    group.add(sky);
    return { group, bm, dispose: () => disposables.forEach((d) => d.dispose()), ring1, ring2 };
  }, [cfg.buildings]);
  useEffect(() => () => env.dispose(), [env]);

  const drag = useRef({ down: false, x: 0, rot: 0, last: 0 });
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { drag.current.down = true; drag.current.x = e.clientX; drag.current.last = performance.now(); };
    const move = (e: PointerEvent) => { if (!drag.current.down) return; drag.current.rot += (e.clientX - drag.current.x) * 0.012; drag.current.x = e.clientX; drag.current.last = performance.now(); };
    const up = () => { drag.current.down = false; };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [gl]);

  const state = useRef({ pos: new THREE.Vector3(6.8, 2.2, 9.5), look: new THREE.Vector3(-1.9, 1, 0), rot: 0 });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dt) => {
    dt = Math.min(dt, 0.1);
    const st = state.current;
    const pose = screen === 'garage' ? POSES.garage : screen === 'menu' ? POSES.menu : POSES.wide;
    const k = 1 - Math.exp(-3 * dt);
    st.pos.lerp(tmp.set(...pose.pos), k);
    st.look.lerp(tmp.set(...pose.look), k);
    camera.up.set(0, 1, 0);
    camera.position.copy(st.pos).add(tmp.set(Math.sin(s.clock.elapsedTime * 0.3) * 0.25, Math.sin(s.clock.elapsedTime * 0.5) * 0.08, 0));
    camera.lookAt(st.look);
    if (Math.abs(camera.fov - 52) > 0.1) { camera.fov = damp(camera.fov, 52, 4, dt); camera.updateProjectionMatrix(); }
    const auto = performance.now() - drag.current.last > 2500;
    if (screen !== 'garage') drag.current.rot = damp(drag.current.rot, 0, 1.5, dt);
    st.rot += dt * (auto ? 0.45 : 0);
    model.group.rotation.y = st.rot + drag.current.rot;
    model.group.position.y = 0.35 + Math.sin(s.clock.elapsedTime * 1.6) * 0.07;
    model.spin(dt, 9);
    model.setBoost(0.35 + Math.sin(s.clock.elapsedTime * 3) * 0.1);
    env.bm.uniforms.uTime.value = s.clock.elapsedTime;
    env.ring1.rotation.z += dt * 0.2; env.ring2.rotation.z -= dt * 0.3;
    const pa = particles.current;
    if (pa) for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, rr = 2 + Math.random() * 14;
      const c = [[0.2, 0.9, 1], [0.6, 0.4, 1], [1, 0.2, 0.85]][Math.floor(Math.random() * 3)];
      pa.emit(Math.cos(a) * rr, 0.2, Math.sin(a) * rr - 2, 0, 1.2 + Math.random() * 2, 0, c[0] * 1.8, c[1] * 1.8, c[2] * 1.8, 0.5, 4);
    }
  });
  return (
    <>
      <primitive object={env.group} />
      <primitive object={model.group} />
      <ambientLight intensity={0.8} color="#9fb4ff" />
      <directionalLight position={[6, 10, 6]} intensity={1.6} color="#ffffff" />
      <pointLight position={[-6, 3, 4]} intensity={60} color="#ff2bd6" distance={30} />
      <pointLight position={[6, 2, -4]} intensity={60} color="#22e5ff" distance={30} />
      <Particles ref={particles} max={Math.min(cfg.particles, 500)} />
    </>
  );
}
