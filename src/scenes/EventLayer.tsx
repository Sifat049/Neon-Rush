import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Race } from '../game/core/race';
import { frameAt, makeFrame } from '../game/tracks/trackBuilder';
import { surfacePose } from '../game/tracks/trackData';
import { HALF_PI } from '../game/core/math';

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _pos = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Draws event objects: glowing rings (drift / escape zones), stunt ramps and police drones. */
export function EventLayer({ race }: { race: Race }) {
  const ev = race.event!;
  const droneRefs = useRef<(THREE.Group | null)[]>([]);
  const rings = useMemo(() => ev.markers.filter((m) => m.kind === 'ring'), [ev]);
  const ramps = useMemo(() => ev.markers.filter((m) => m.kind === 'ramp'), [ev]);

  const ringMesh = useMemo(() => {
    const geo = new THREE.TorusGeometry(1, 0.045, 6, 4); // 4 segments = a square frame (after the 45 degree turn)
    geo.rotateZ(Math.PI / 4);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, rings.length));
    const F = makeFrame(), W = race.track.W;
    const c = new THREE.Color();
    rings.forEach((m, i) => {
      frameAt(race.track.samples, m.s, F);
      _x.copy(F.r); _y.copy(F.u); _z.crossVectors(_x, _y);
      _m.makeBasis(_x, _y, _z);
      _m.setPosition(F.p);
      const k = (W * 0.97) / Math.SQRT1_2; // the diamond torus turned 45 degrees has half-side 0.7071 * radius
      _m.scale(_s.set(k, k, 1));
      mesh.setMatrixAt(i, _m);
      c.set(m.color).multiplyScalar(2.2);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = rings.length;
    mesh.frustumCulled = false;
    return mesh;
  }, [rings, race]);

  const rampMesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 0.35, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, ramps.length));
    const F = makeFrame(), tr = race.track;
    const c = new THREE.Color();
    const n = new THREE.Vector3(), l = new THREE.Vector3();
    ramps.forEach((m, i) => {
      frameAt(tr.samples, m.s, F);
      surfacePose(F, tr.W, m.surface * HALF_PI, m.x, 0.12, _pos, n, l);
      _x.copy(l); _y.copy(n); _z.crossVectors(_x, _y);
      _m.makeBasis(_x, _y, _z);
      _m.setPosition(_pos);
      _m.scale(_s.set(m.hw * 2, 1, m.hl * 2));
      mesh.setMatrixAt(i, _m);
      c.set(m.color).multiplyScalar(2.4);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = ramps.length;
    mesh.frustumCulled = false;
    return mesh;
  }, [ramps, race]);

  useEffect(() => () => { ringMesh.geometry.dispose(); (ringMesh.material as THREE.Material).dispose(); rampMesh.geometry.dispose(); (rampMesh.material as THREE.Material).dispose(); ringMesh.dispose(); rampMesh.dispose(); }, [ringMesh, rampMesh]);

  useFrame((state) => {
    ev.drones.forEach((d, i) => {
      const g = droneRefs.current[i];
      if (!g) return;
      g.position.copy(d.pos);
      g.rotation.y = state.clock.elapsedTime * 2 + i;
      const beam = g.children[1] as THREE.Mesh;
      beam.visible = d.warn > 0;
      (g.children[0] as THREE.Mesh).scale.setScalar(d.warn > 0 && Math.floor(state.clock.elapsedTime * 12) % 2 ? 1.4 : 1);
      const eye = (g.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      eye.color.setRGB(d.warn > 0 ? 4 : 0.5, d.warn > 0 ? 0.2 : 0.6, d.warn > 0 ? 0.2 : 3);
    });
    void _q;
  });

  return (
    <>
      <primitive object={ringMesh} />
      <primitive object={rampMesh} />
      {ev.drones.map((_, i) => (
        <group key={i} ref={(el) => { droneRefs.current[i] = el; }}>
          <mesh><sphereGeometry args={[0.55, 10, 8]} /><meshBasicMaterial toneMapped={false} /></mesh>
          <mesh position={[0, -3.2, 0]} visible={false}><cylinderGeometry args={[0.05, 0.9, 6.4, 8, 1, true]} /><meshBasicMaterial color={[4, 0.2, 0.2]} transparent opacity={0.45} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
          <mesh scale={[1.6, 0.12, 0.35]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#202040" /></mesh>
          <mesh scale={[0.35, 0.12, 1.6]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#202040" /></mesh>
        </group>
      ))}
    </>
  );
}
