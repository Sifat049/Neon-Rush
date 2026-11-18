import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Rain streaks in camera space (child of the camera), so rain always falls "down" relative to the driver. */
export function Rain({ count, intensity, getSpeed, dust = false }: { count: number; intensity: number; getSpeed: () => number; dust?: boolean }) {
  const { camera, scene } = useThree();
  const d = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 6);
    const seeds = Array.from({ length: count }, () => ({ x: (Math.random() - 0.5) * 50, y: Math.random() * 30 - 8, z: -Math.random() * 70 + 4, sp: 0.8 + Math.random() * 0.5 }));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.LineBasicMaterial({ color: dust ? new THREE.Color(1.0, 0.68, 0.35) : new THREE.Color(0.55, 0.75, 1).multiplyScalar(1.1), transparent: true, opacity: dust ? 0.35 : 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return { geo, pos, seeds, mat, lines };
  }, [count, dust]);
  useEffect(() => {
    if (!camera.parent) scene.add(camera);
    camera.add(d.lines);
    return () => { camera.remove(d.lines); d.geo.dispose(); d.mat.dispose(); };
  }, [camera, scene, d]);
  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05);
    const speed = getSpeed();
    const active = Math.floor(count * Math.max(0, Math.min(1, intensity)));
    d.geo.setDrawRange(0, active * 2);
    for (let i = 0; i < active; i++) {
      const s = d.seeds[i];
      s.y -= (dust ? 4 : 55) * s.sp * dt;
      if (dust) s.x -= 70 * s.sp * dt;
      s.z += (speed * 0.9 + 6) * dt; // streaks rush towards the camera
      if (s.y < -9 || s.z > 6 || s.x < -28) { s.y = dust ? Math.random() * 24 - 6 : 20 + Math.random() * 10; s.x = dust ? 28 : (Math.random() - 0.5) * 50; s.z = -Math.random() * 70 + 4; }
      const len = dust ? 3 + speed * 0.04 : 1.2 + speed * 0.025;
      d.pos[i * 6] = s.x; d.pos[i * 6 + 1] = s.y; d.pos[i * 6 + 2] = s.z;
      d.pos[i * 6 + 3] = s.x; d.pos[i * 6 + 4] = s.y + len; d.pos[i * 6 + 5] = s.z - len * 1.4;
    }
    (d.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return null;
}
