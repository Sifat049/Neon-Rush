import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Streaks flowing past the camera (child of the camera). Opacity & length scale with speed / boost. */
export function SpeedLines({ count, getSpeed }: { count: number; getSpeed: () => { f: number; boost: boolean } }) {
  const { camera, scene } = useThree();
  const d = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 6);
    const seeds = Array.from({ length: count }, () => ({ a: Math.random() * Math.PI * 2, r: 1.4 + Math.random() * 5, z: -Math.random() * 40, sp: 0.6 + Math.random() * 0.8 }));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 0.9, 1).multiplyScalar(1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return { geo, pos, seeds, mat, lines };
  }, [count]);
  useEffect(() => {
    if (!camera.parent) scene.add(camera);
    camera.add(d.lines);
    return () => { camera.remove(d.lines); d.geo.dispose(); d.mat.dispose(); };
  }, [camera, scene, d]);
  useFrame((_, dt) => {
    const { f, boost } = getSpeed();
    d.mat.opacity = Math.max(0, Math.min(0.85, (f - 0.45) * 1.5 + (boost ? 0.3 : 0)));
    d.mat.color.setRGB(boost ? 1.0 : 0.6, boost ? 0.8 : 0.9, 1.0);
    const v = 40 + f * 140 + (boost ? 80 : 0);
    const len = 1.5 + f * 9 + (boost ? 5 : 0);
    for (let i = 0; i < count; i++) {
      const s = d.seeds[i];
      s.z += v * s.sp * Math.min(dt, 0.05);
      if (s.z > 2) { s.z = -60 - Math.random() * 20; s.a = Math.random() * Math.PI * 2; s.r = 1.6 + Math.random() * 5.5; }
      const x = Math.cos(s.a) * s.r, y = Math.sin(s.a) * s.r;
      d.pos[i * 6] = x; d.pos[i * 6 + 1] = y; d.pos[i * 6 + 2] = s.z;
      d.pos[i * 6 + 3] = x; d.pos[i * 6 + 4] = y; d.pos[i * 6 + 5] = s.z - len;
    }
    (d.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return null;
}
