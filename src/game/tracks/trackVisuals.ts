import * as THREE from 'three';
import type { QualityCfg } from '../core/quality';
import type { Race } from '../core/race';
import { obstacleX } from '../physics/racerPhysics';
import { TrackData } from './trackData';
import { frameAt, makeFrame } from './trackBuilder';
import { buildArches, buildPadGeometry, buildRailGeometry, buildRoadGeometry, buildScenery, buildStartLineGeometry, composeBasis, surfaceBasis } from './trackGeometry';
import { WEATHERS, WeatherId } from '../weather/weather';
import { FogU, createBuildingMaterial, createCheckerMaterial, createFog, createObstacleMaterial, createPadMaterial, createRoadMaterial, createSkyMaterial } from '../effects/materials';

export interface TrackVisuals {
  group: THREE.Group;
  fog: FogU;
  update(time: number, camera: THREE.Camera, race: Race | null, dt?: number): void;
  setWeather(id: WeatherId): void;
  dispose(): void;
}

const KIND_COL: Record<string, THREE.Color> = {
  block: new THREE.Color(1, 0.22, 0.08),
  low: new THREE.Color(1, 0.8, 0.12),
  mover: new THREE.Color(1, 0.12, 0.85),
};

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: { m: THREE.Matrix4; c: THREE.Color }[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function createTrackVisuals(tr: TrackData, cfg: QualityCfg, obstacles: TrackData['obstacles'], gates: TrackData['gates']): TrackVisuals {
  const pal = tr.def.palette;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(o: T) => { disposables.push(o); return o; };
  const fog = createFog(pal.fog, 40, (tr.def.theme === 'city' ? 1100 : 1500) / (tr.def.fogMul ?? 1));
  const colA = new THREE.Color(pal.a), colB = new THREE.Color(pal.b), colC = new THREE.Color(pal.c);
  const timeMats: THREE.ShaderMaterial[] = [];

  // --- road surfaces
  const roadMat = keep(createRoadMaterial(pal, fog, cfg.post ? 0.3 : 0.45));
  timeMats.push(roadMat);
  const road = new THREE.Mesh(keep(buildRoadGeometry(tr)), roadMat);
  road.frustumCulled = false; road.renderOrder = 2;
  group.add(road);
  // --- rails
  const rail = new THREE.Mesh(keep(buildRailGeometry(tr, colA, colC)), keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, fog: false })));
  rail.frustumCulled = false;
  group.add(rail);
  // --- arches / checkpoints / gap warnings
  const arches = buildArches(tr, cfg.arches, [colA, colB, colC]);
  const archMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), keep(new THREE.MeshBasicMaterial({ toneMapped: false, fog: false })), arches.matrices.length);
  arches.matrices.forEach((m, i) => { archMesh.setMatrixAt(i, m); archMesh.setColorAt(i, arches.colors[i]); });
  archMesh.frustumCulled = false;
  group.add(archMesh);
  // --- pads + start line
  const padMat = keep(createPadMaterial(pal, fog)); timeMats.push(padMat);
  if (tr.pads.length) { const pads = new THREE.Mesh(keep(buildPadGeometry(tr)), padMat); pads.frustumCulled = false; pads.renderOrder = 3; group.add(pads); }
  const start = new THREE.Mesh(keep(buildStartLineGeometry(tr)), keep(createCheckerMaterial(fog)));
  start.frustumCulled = false;
  group.add(start);

  // --- obstacles
  const obsMat = keep(createObstacleMaterial(fog)); timeMats.push(obsMat);
  const obsMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), obsMat, Math.max(1, obstacles.length));
  obsMesh.count = obstacles.length;
  obsMesh.frustumCulled = false;
  const f = makeFrame(), nn = new THREE.Vector3(), rr = new THREE.Vector3(), pp = new THREE.Vector3(), tt = new THREE.Vector3();
  const obsFrames = obstacles.map((o) => {
    frameAt(tr.samples, o.s, f);
    surfaceBasis(f, o.surface, nn, rr);
    return { n: nn.clone(), r: rr.clone(), t: f.t.clone(), p: f.p.clone() };
  });
  const placeObstacle = (i: number, time: number) => {
    const o = obstacles[i], fr = obsFrames[i];
    const x = obstacleX(o, time);
    pp.copy(fr.p).addScaledVector(fr.n, -(tr.W - o.height / 2)).addScaledVector(fr.r, x);
    obsMesh.setMatrixAt(i, composeBasis(new THREE.Matrix4(), pp, fr.r, fr.n, tt.copy(fr.t), o.hw * 2, o.height, o.hl * 2));
  };
  obstacles.forEach((o, i) => { placeObstacle(i, 0); obsMesh.setColorAt(i, KIND_COL[o.kind]); });
  if (obsMesh.instanceColor) obsMesh.instanceColor.needsUpdate = true;
  group.add(obsMesh);
  const movers = obstacles.map((o, i) => (o.kind === 'mover' ? i : -1)).filter((i) => i >= 0);

  // --- gravity challenge gates
  let gateMesh: THREE.InstancedMesh | null = null;
  const gateCols = { pending: new THREE.Color(0.2, 0.9, 1).multiplyScalar(1.8), next: new THREE.Color(1, 1, 1).multiplyScalar(3), hit: new THREE.Color(0.2, 1, 0.4).multiplyScalar(1.2), miss: new THREE.Color(1, 0.15, 0.15).multiplyScalar(1.2) };
  let gateCache = -999;
  if (gates.length) {
    gateMesh = new THREE.InstancedMesh(keep(new THREE.TorusGeometry(1, 0.045, 8, 36)), keep(new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, side: THREE.DoubleSide })), gates.length);
    gateMesh.frustumCulled = false;
    gates.forEach((g, i) => {
      frameAt(tr.samples, g.s, f);
      surfaceBasis(f, g.surface, nn, rr);
      pp.copy(f.p).addScaledVector(nn, -(tr.W - 3.2)).addScaledVector(rr, g.x);
      gateMesh!.setMatrixAt(i, composeBasis(new THREE.Matrix4(), pp, rr, nn, tt.copy(f.t).negate(), g.hw, 2.6, 1));
      gateMesh!.setColorAt(i, gateCols.pending);
    });
    group.add(gateMesh);
  }

  // --- themed scenery
  const sc = buildScenery(tr, Math.max(10, Math.round(cfg.buildings * (tr.def.decor ?? 1))));
  const bMat = keep(createBuildingMaterial(fog)); timeMats.push(bMat);
  const glowBasic = () => keep(new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, side: THREE.DoubleSide }));
  if (tr.def.theme === 'city') {
    if (sc.towers.length) group.add(instanced(keep(new THREE.BoxGeometry(1, 1, 1)), bMat, sc.towers));
    if (sc.panels.length) group.add(instanced(keep(new THREE.PlaneGeometry(1, 1)), glowBasic(), sc.panels));
    const gm = keep(new THREE.ShaderMaterial({
      uniforms: { uA: { value: colA }, ...fog },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uA; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying vec3 vW;
        void main(){ vec2 p = vW.xz / 36.0; vec2 g = abs(fract(p) - 0.5); float l = smoothstep(0.46, 0.5, max(g.x, g.y));
        vec3 c = vec3(0.012,0.014,0.04) + uA * l * 0.55; float d = distance(cameraPosition, vW); c = mix(c, uFogColor, smoothstep(uFogNear * 0.3, uFogFar * 0.8, d)); gl_FragColor = vec4(c, 1.0); #include <colorspace_fragment> }`,
    }));
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(9000, 9000)), gm);
    ground.rotation.x = -Math.PI / 2; ground.position.set(sc.center.x, sc.groundY, sc.center.z);
    group.add(ground);
  } else if (tr.def.theme === 'desert') {
    if (sc.towers.length) group.add(instanced(keep(new THREE.BoxGeometry(1, 1, 1)), bMat, sc.towers));
    if (sc.crystals.length) group.add(instanced(keep(new THREE.DodecahedronGeometry(1, 0)), keep(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0, color: '#8a5a38' })), sc.crystals));
    const sandMat = keep(new THREE.ShaderMaterial({
      uniforms: { uA: { value: colA }, ...fog },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uA; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){ float rip = n(vW.xz * 0.02) * 0.6 + n(vW.xz * 0.2) * 0.25 + sin(vW.x * 0.08 + n(vW.xz * 0.03) * 6.0) * 0.08;
          vec3 c = mix(vec3(0.16,0.09,0.05), vec3(0.42,0.24,0.1), rip); vec2 g = abs(fract(vW.xz / 60.0) - 0.5); c += uA * smoothstep(0.485, 0.5, max(g.x, g.y)) * 0.08;
          float d = distance(cameraPosition, vW); c = mix(c, uFogColor, smoothstep(uFogNear * 0.3, uFogFar * 0.8, d)); gl_FragColor = vec4(c, 1.0); #include <colorspace_fragment> }`,
    }));
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(9000, 9000)), sandMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(sc.center.x, sc.groundY, sc.center.z);
    group.add(ground);
  } else if (tr.def.theme === 'core') {
    if (sc.crystals.length) {
      const g = keep(new THREE.OctahedronGeometry(1, 0));
      group.add(instanced(g, glowWire(keep), sc.crystals));
      group.add(instanced(g, keep(new THREE.MeshBasicMaterial({ color: '#02010a', fog: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })), sc.crystals.map((c) => ({ m: c.m.clone().scale(new THREE.Vector3(0.985, 0.985, 0.985)), c: c.c }))));
    }
    if (sc.rings.length) group.add(instanced(keep(new THREE.TorusGeometry(1, 0.025, 8, 64)), glowBasic(), sc.rings));
    if (sc.coreSphere) {
      const cs = sc.coreSphere;
      const m = keep(new THREE.ShaderMaterial({
        uniforms: { uC: { value: colB }, uD: { value: colC }, uTime: { value: 0 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uC; uniform vec3 uD; uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); vec3 c = mix(uC, uD, 0.5 + 0.5 * sin(uTime)) * (0.5 + f * 3.5); gl_FragColor = vec4(c, 0.5 + f * 0.5); #include <colorspace_fragment> }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      timeMats.push(m);
      const mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(cs.r, 32, 24)), m);
      mesh.position.copy(cs.pos);
      group.add(mesh);
    }
  } else {
    if (sc.crystals.length) group.add(instanced(keep(new THREE.DodecahedronGeometry(1, 0)), keep(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0.1 })), sc.crystals));
    if (sc.rings.length) group.add(instanced(keep(new THREE.TorusGeometry(1, 0.03, 8, 72)), glowBasic(), sc.rings));
    if (sc.panels.length) group.add(instanced(keep(new THREE.BoxGeometry(1, 1, 1)), glowBasic(), sc.panels));
    if (sc.planet) {
      const pm = keep(new THREE.ShaderMaterial({
        uniforms: { uC: { value: colB } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); vec3 c = vec3(0.01,0.02,0.05) + uC * f * 1.6; gl_FragColor = vec4(c, 1.0); #include <colorspace_fragment> }',
        fog: false,
      }));
      const planet = new THREE.Mesh(keep(new THREE.SphereGeometry(sc.planet.r, 40, 28)), pm);
      planet.position.copy(sc.planet.pos);
      group.add(planet);
    }
  }

  // --- sky dome (follows camera)
  const skyMat = keep(createSkyMaterial(pal.skyTop, pal.skyBottom, pal.c));
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(3500, 24, 16)), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  group.add(sky);

  // --- weather: re-tints fog / sky and makes the road wet. Lightning flashes briefly lift everything to white.
  const fogNear0 = 40, fogFar0 = (tr.def.theme === 'city' ? 1100 : 1500) / (tr.def.fogMul ?? 1);
  const baseFog = new THREE.Color(pal.fog), baseTop = new THREE.Color(pal.skyTop), baseBot = new THREE.Color(pal.skyBottom);
  let wx = WEATHERS.clear;
  let flash = 0, nextBolt = 3;
  const tmpC = new THREE.Color();
  const applyColors = () => {
    fog.uFogColor.value.copy(wx.fogColor ? tmpC.set(wx.fogColor) : baseFog);
    skyMat.uniforms.uTop.value.copy(wx.skyTop ? tmpC.set(wx.skyTop) : baseTop);
    skyMat.uniforms.uBottom.value.copy(wx.skyBottom ? tmpC.set(wx.skyBottom) : baseBot);
    if (wx.id === 'night') { skyMat.uniforms.uTop.value.multiplyScalar(0.6); skyMat.uniforms.uBottom.value.multiplyScalar(0.7); }
    fog.uFogNear.value = fogNear0 * wx.fogNearMul;
    fog.uFogFar.value = fogFar0 * wx.fogFarMul;
    roadMat.uniforms.uWet.value = wx.wet;
    roadMat.uniforms.uSky.value.copy(skyMat.uniforms.uBottom.value).lerp(new THREE.Color('#9fb4ff'), 0.25);
  };

  const tmpM = new THREE.Matrix4();
  return {
    group, fog,
    setWeather(id) { wx = WEATHERS[id]; flash = 0; nextBolt = 2 + Math.random() * 3; applyColors(); },
    update(time, camera, race, dt = 1 / 60) {
      if (wx.lightning) {
        nextBolt -= dt;
        if (nextBolt <= 0) { flash = 1; nextBolt = 3 + Math.random() * 6; }
      }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 4.5);
        const k = flash * (0.6 + 0.4 * Math.sin(time * 90));
        fog.uFogColor.value.copy(wx.fogColor ? tmpC.set(wx.fogColor) : baseFog).lerp(tmpC.set('#d8e6ff'), k * 0.55);
        skyMat.uniforms.uTop.value.copy(tmpC.set(wx.skyTop ?? pal.skyTop)).lerp(tmpC.set('#c9d8ff'), k * 0.7);
        if (flash === 0) applyColors();
      }
      for (const m of timeMats) if (m.uniforms.uTime) m.uniforms.uTime.value = time;
      sky.position.copy(camera.position);
      if (movers.length && race) {
        for (const i of movers) placeObstacle(i, race.time);
        obsMesh.instanceMatrix.needsUpdate = true;
      }
      if (gateMesh && race) {
        const c = race.challenge;
        const pulse = Math.floor(time * 4) % 2;
        const key = (c.nextGate * 1000 + c.hit) * 2 + pulse;
        if (key !== gateCache) {
          gateCache = key;
          for (let i = 0; i < gates.length; i++) {
            const col = c.results[i] === 1 ? gateCols.hit : c.results[i] === 2 ? gateCols.miss : i === c.nextGate ? gateCols.next : gateCols.pending;
            gateMesh.setColorAt(i, col);
          }
          if (gateMesh.instanceColor) gateMesh.instanceColor.needsUpdate = true;
        }
      }
      void tmpM;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      obsMesh.dispose(); archMesh.dispose(); gateMesh?.dispose();
    },
  };
}

function glowWire(keep: <T extends { dispose(): void }>(o: T) => T) {
  return keep(new THREE.MeshBasicMaterial({ wireframe: true, toneMapped: false, fog: false }));
}
