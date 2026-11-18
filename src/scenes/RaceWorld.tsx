import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityCfg } from '../game/core/quality';
import { getRace } from '../game/core/session';
import { Race } from '../game/core/race';
import { createTrackVisuals } from '../game/tracks/trackVisuals';
import { buildCar, CarModel } from '../game/vehicles/carModel';
import { getCar } from '../game/vehicles/cars';
import { Particles, ParticleApi } from '../game/effects/Particles';
import { SpeedLines } from '../game/effects/SpeedLines';
import { Rain } from '../game/effects/Rain';
import { WEATHERS } from '../game/weather/weather';
import { clamp, damp } from '../game/core/math';
import { clearPulses, readInput } from '../controls/input';
import { useGame } from '../store/gameStore';
import { hudMessage, useHud } from '../store/hudStore';
import { audio } from '../game/audio/audio';
import type { RaceEvent } from '../game/core/types';
import { formatTime } from '../game/core/math';
import { EventLayer } from './EventLayer';

const DT = 1 / 60;
const frameInfo = { speedF: 0, boost: false };

export function RaceWorld({ cfg }: { cfg: QualityCfg }) {
  const race = getRace() as Race;
  const scene = useThree((s) => s.scene);
  const particles = useRef<ParticleApi>(null);
  const vis = useMemo(() => createTrackVisuals(race.track, cfg, race.obstacles, race.gates), [race, cfg]);
  const models = useMemo<CarModel[]>(() => race.racers.map((r) => buildCar(getCar(r.carId).design, r.primary, r.accent)), [race]);
  useEffect(() => { vis.setWeather(race.weather); }, [vis, race]);
  useEffect(() => () => vis.dispose(), [vis]);
  useEffect(() => () => models.forEach((m) => m.dispose()), [models]);
  useEffect(() => {
    const pal = race.track.def.palette;
    const w = WEATHERS[race.weather];
    scene.fog = new THREE.Fog(w.fogColor ?? pal.fog, 80 * w.fogNearMul, 1200 * w.fogFarMul);
    return () => { scene.fog = null; };
  }, [scene, race]);

  return (
    <>
      <primitive object={vis.group} />
      {models.map((m, i) => <primitive key={i} object={m.group} />)}
      <ambientLight intensity={0.9 * WEATHERS[race.weather].light * (race.track.def.lighting ?? 1)} color="#9fb4ff" />
      <directionalLight position={[40, 80, 30]} intensity={1.4 * WEATHERS[race.weather].light * (race.track.def.lighting ?? 1)} color={race.weather === 'sunset' ? '#ff9a5a' : '#ffffff'} />
      <hemisphereLight args={['#6fa8ff', '#2a0a40', 0.8 * WEATHERS[race.weather].light]} />
      {WEATHERS[race.weather].rain > 0 && <Rain count={cfg.speedLines * 6} intensity={WEATHERS[race.weather].rain} getSpeed={() => frameInfo.speedF * 60} />}
      {WEATHERS[race.weather].dust > 0 && <Rain dust count={cfg.speedLines * 5} intensity={WEATHERS[race.weather].dust} getSpeed={() => frameInfo.speedF * 60} />}
      {WEATHERS[race.weather].headlights > 0.3 && cfg.post && <Headlights model={models[0]} intensity={WEATHERS[race.weather].headlights} />}
      {race.event && <EventLayer race={race} />}
      <Particles ref={particles} max={cfg.particles} />
      <SpeedLines count={cfg.speedLines} getSpeed={() => ({ f: frameInfo.speedF, boost: frameInfo.boost })} />
      <RaceRunner race={race} models={models} particles={particles} vis={vis} />
    </>
  );
}

const _v = new THREE.Vector3(), _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion(), _look = new THREE.Vector3(), _desired = new THREE.Vector3(), _p = new THREE.Vector3(), _off = new THREE.Vector3();

function RaceRunner({ race, models, particles, vis }: { race: Race; models: CarModel[]; particles: React.RefObject<ParticleApi>; vis: ReturnType<typeof createTrackVisuals> }) {
  const cam = useRef({ pos: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 70, shake: 0, kick: 0, init: false });
  const acc = useRef(0);
  const hudT = useRef(0);
  const fpsRef = useRef({ n: 0, t: 0, v: 60 });
  const pend = useRef({ gl: false, gr: false });
  const finished = useRef(false);
  const lastPaused = useRef(false);
  const lastPhase = useRef('');
  const palette = race.track.def.palette;
  const accent = useMemo(() => new THREE.Color(palette.a), [palette]);

  useEffect(() => {
    audio.engineStart();
    audio.music('race');
    race.refreshPoses();
    return () => { audio.engineStop(); audio.music('menu'); };
  }, [race]);

  const emitSparks = (pos: THREE.Vector3, normal: THREE.Vector3, n: number, power: number, col: THREE.Color) => {
    const pa = particles.current; if (!pa) return;
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(power * (0.3 + Math.random()));
      _v.addScaledVector(normal, power * 0.4);
      pa.emit(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, col.r * 2, col.g * 1.4, col.b * 0.8, 0.7 + Math.random() * 0.6, 0.35 + Math.random() * 0.4);
    }
  };

  const handleEvents = (events: RaceEvent[]) => {
    const p = race.player;
    const shakeOn = useGame.getState().save.settings.shake;
    for (const e of events) {
      switch (e.type) {
        case 'count': audio.play('beep', 1, 1); useHud.setState({ count: String(e.n) }); break;
        case 'go': audio.play('go', 1, 1); useHud.setState({ count: 'GO!' }); window.setTimeout(() => useHud.setState({ count: '' }), 900); break;
        case 'hit': if (e.racer === 0) {
          audio.play('crash', 1, 0.9 + Math.random() * 0.2); if (shakeOn) cam.current.shake = Math.max(cam.current.shake, 0.9 * e.intensity);
          useHud.setState((s) => ({ flashHit: s.flashHit + 1 })); emitSparks(p.pos, p.normal, 26, 22, new THREE.Color(1, 0.6, 0.2));
        } break;
        case 'scrape': if (e.racer === 0) { audio.play('scrape', 0.7, 1, 0.1); if (shakeOn) cam.current.shake = Math.max(cam.current.shake, 0.18); _p.copy(p.pos).addScaledVector(p.lat, Math.sign(p.x) * 1.1); emitSparks(_p, p.normal, 4, 10, new THREE.Color(1, 0.8, 0.3)); } break;
        case 'bump': audio.play('land', 0.5, 1.4, 0.1); if (shakeOn) cam.current.shake = Math.max(cam.current.shake, 0.2); break;
        case 'jump': if (e.racer === 0) { audio.play('jump', 0.7); cam.current.kick = 6; } break;
        case 'land': if (e.racer === 0) { audio.play('land', 0.4 + e.intensity * 0.6); if (shakeOn) cam.current.shake = Math.max(cam.current.shake, 0.25 * e.intensity); cam.current.kick = -4; } break;
        case 'gravity': if (e.racer === 0) { audio.play('gravity', 0.9); useHud.setState((s) => ({ flashGrav: s.flashGrav + 1 })); } break;
        case 'boostStart': if (e.racer === 0) { audio.play('boost', 0.8); useHud.setState((s) => ({ flashBoost: s.flashBoost + 1 })); } break;
        case 'pad': if (e.racer === 0) { audio.play('pad', 0.8); if (e.kind === 'boost') useHud.setState((s) => ({ flashBoost: s.flashBoost + 1 })); } break;
        case 'checkpoint': if (e.racer === 0) { audio.play('checkpoint', 0.7); hudMessage(`CHECKPOINT  ${formatTime(race.time)}`, 'good'); } break;
        case 'lap': if (e.racer === 0) {
          useHud.setState({ lastLap: e.time, bestLap: isFinite(p.bestLap) ? p.bestLap : null });
          hudMessage(e.lap < race.laps ? `LAP ${e.lap} · ${formatTime(e.time)}${e.best ? '  BEST!' : ''}` : `FINAL LAP DONE · ${formatTime(e.time)}`, 'good');
          if (e.lap === race.laps - 1) window.setTimeout(() => hudMessage('FINAL LAP', 'info'), 1700);
        } break;
        case 'finish': if (e.racer === 0) { audio.play('victory', 1); hudMessage(race.event ? race.event.endText() : race.mode === 'challenge' ? 'COURSE COMPLETE' : `FINISHED — P${e.place}`, 'good'); } break;
        case 'ev': if (e.sfx) audio.play(e.sfx as 'gateOk', 0.8); hudMessage(e.text, e.kind); break;
        case 'fall': if (e.racer === 0) { audio.play('fall', 0.8); hudMessage('YOU FELL — RESPAWNING', 'bad'); } break;
        case 'respawn': if (e.racer === 0) cam.current.init = false; break;
        case 'gate': audio.play(e.ok ? 'gateOk' : 'gateBad', 0.8); hudMessage(e.ok ? `PERFECT ${Math.round(e.precision * 100)}%` : 'GATE MISSED', e.ok ? 'good' : 'bad'); break;
      }
    }
  };

  useFrame((state, delta) => {
    const g = useGame.getState();
    const paused = g.paused;
    const camera = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.1);

    // ---------- fixed-timestep simulation
    if (!paused && !race.over) {
      acc.current += dt;
      const inp = readInput();
      pend.current.gl ||= inp.gravLeft; pend.current.gr ||= inp.gravRight;
      let n = 0;
      while (acc.current >= DT && n < 6) {
        inp.gravLeft = pend.current.gl; inp.gravRight = pend.current.gr;
        pend.current.gl = pend.current.gr = false;
        race.step(DT, inp);
        acc.current -= DT; n++;
        handleEvents(race.drainEvents());
      }
      if (n === 6) acc.current = 0;
    } else if (paused) clearPulses();
    if (race.over && !finished.current && race.summary) { finished.current = true; g.finishRace(race.summary); }
    const alpha = paused || race.over ? 1 : acc.current / DT;

    // pause <-> audio
    if (paused !== lastPaused.current) { lastPaused.current = paused; if (paused) audio.engineStop(); else audio.engineStart(); }

    // ---------- interpolate cars
    const p = race.player;
    race.racers.forEach((r, i) => {
      const m = models[i];
      m.group.position.lerpVectors(r.prevPos, r.pos, alpha);
      m.group.quaternion.slerpQuaternions(r.prevQuat, r.quat, alpha);
      const t = state.clock.elapsedTime;
      const bob = r.grounded ? Math.sin(t * 6 + i * 2) * 0.03 : 0;
      m.pivot.position.y = bob;
      m.pivot.rotation.y = -r.vx * 0.012 - (r.drifting ? r.input.steer * 0.35 : 0);
      m.pivot.rotation.z = -clamp(r.vx * 0.022, -0.4, 0.4);
      m.pivot.rotation.x = clamp(r.vh * 0.012, -0.25, 0.25);
      if (i === 0 && race.event && !r.grounded) { m.pivot.rotation.y += race.event.trick.spin; m.pivot.rotation.x -= race.event.trick.flip; }
      m.setBoost(r.boosting || r.padBoost > 0 ? 1 : clamp(r.input.throttle * 0.35 + r.speed / (r.stats.top * 3), 0, 0.5));
      m.group.visible = !(r.invuln > 0 && Math.floor(t * 14) % 2 === 0 && r.stun > 0);
    });

    // ---------- trails, sparks, ambient motes
    const pa = particles.current;
    if (pa && !paused) {
      race.racers.forEach((r, i) => {
        if (r.speed < 6) return;
        const boost = r.boosting || r.padBoost > 0;
        const rep = boost ? 3 : 1;
        for (let k = 0; k < rep; k++) for (const side of [-0.5, 0.5]) {
          _p.copy(models[i].group.position).addScaledVector(r.fwd, -2.5 - Math.random() * 0.3).addScaledVector(r.lat, side).addScaledVector(r.normal, 0.45);
          const c = boost ? _off.set(1.0, 0.75, 0.35) : _off.set(0.35, 0.8, 1);
          const col = r.isPlayer ? c.set(accent.r + (boost ? 0.7 : 0.1), accent.g + (boost ? 0.5 : 0.1), accent.b + (boost ? 0.3 : 0.1)) : _off.set(0.55, 0.45, 1);
          pa.emit(_p.x, _p.y, _p.z, -r.fwd.x * r.speed * 0.12 + (Math.random() - 0.5) * 2, -r.fwd.y * r.speed * 0.12 + (Math.random() - 0.5) * 2, -r.fwd.z * r.speed * 0.12 + (Math.random() - 0.5) * 2, col.x * 1.6, col.y * 1.6, col.z * 1.6, boost ? 1.5 : 1, boost ? 0.55 : 0.4);
        }
        const lc = race.event?.lightColor(r.id, state.clock.elapsedTime);
        if (lc) {
          _p.copy(models[i].group.position).addScaledVector(r.normal, 1.15);
          pa.emit(_p.x, _p.y, _p.z, 0, 0, 0, lc[0], lc[1], lc[2], 1.6, 0.2);
        }
        if (r.drifting) {
          _p.copy(models[i].group.position).addScaledVector(r.fwd, -1.6).addScaledVector(r.normal, 0.1);
          pa.emit(_p.x, _p.y, _p.z, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 1.8, 1.0, 0.3, 0.9, 0.35);
        }
      });
      if (p.speed > 10) {
        for (let k = 0; k < 2; k++) {
          const ang = Math.random() * Math.PI * 2, rad = Math.random() * (race.track.W - 1);
          _p.copy(p.pos).addScaledVector(p.fwd, 25 + Math.random() * 70).addScaledVector(p.lat, Math.cos(ang) * rad).addScaledVector(p.normal, Math.abs(Math.sin(ang)) * rad * 1.6);
          const c = k ? new THREE.Color(palette.b) : accent;
          pa.emit(_p.x, _p.y, _p.z, 0, 0, 0, c.r * 1.8, c.g * 1.8, c.b * 1.8, 0.35, 2.2);
        }
      }
    }

    // ---------- chase camera
    const c = cam.current;
    const sf = clamp(p.speed / (p.stats.top * 1.1), 0, 1.5);
    frameInfo.speedF = sf; frameInfo.boost = p.boosting || p.padBoost > 0;
    const pos = models[0].group.position;
    _q.copy(models[0].group.quaternion);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const intro = race.phase === 'countdown' ? 1.2 + race.countdown * 0.9 : 0;
    const dist = 7.6 + sf * 2.0 + (frameInfo.boost ? 1.5 : 0) + intro;
    const height = 2.9 + sf * 0.35 + Math.max(0, p.h) * 0.35 + intro * 0.25;
    _desired.copy(pos).addScaledVector(_fwd, -dist).addScaledVector(_up, height);
    if (!c.init) { c.pos.copy(_desired); c.up.copy(_up); c.init = true; }
    // keep the forward component locked (no trailing lag), spring only the perpendicular components
    _off.copy(c.pos).sub(_desired);
    const along = _off.dot(_fwd);
    _off.addScaledVector(_fwd, -along);
    _off.multiplyScalar(Math.exp(-9 * dt));
    c.pos.copy(_desired).add(_off);
    c.up.lerp(_up, 1 - Math.exp(-5.5 * dt)).normalize();
    c.shake = Math.max(0, c.shake - dt * 2.6);
    c.kick *= Math.exp(-6 * dt);
    camera.position.copy(c.pos);
    if (c.shake > 0.001) camera.position.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(c.shake * 0.9));
    camera.up.copy(c.up);
    _look.copy(pos).addScaledVector(_fwd, 14).addScaledVector(_up, 1.3);
    camera.lookAt(_look);
    const tf = 64 + sf * 17 + (frameInfo.boost ? 10 : 0) + c.kick;
    c.fov = damp(c.fov, tf, 6, dt);
    if (Math.abs(camera.fov - c.fov) > 0.02) { camera.fov = c.fov; camera.updateProjectionMatrix(); }

    vis.update(state.clock.elapsedTime, camera, race, Math.min(delta, 0.05));
    if (!paused) audio.engineUpdate(p.speed / p.stats.top, p.input.throttle, p.boosting);

    // ---------- HUD (throttled ~15 Hz)
    hudT.current += dt;
    fpsRef.current.n++; fpsRef.current.t += dt;
    if (fpsRef.current.t >= 0.5) { fpsRef.current.v = Math.round(fpsRef.current.n / fpsRef.current.t); fpsRef.current.n = 0; fpsRef.current.t = 0; }
    if (hudT.current > 0.066 || race.phase !== lastPhase.current) {
      hudT.current = 0; lastPhase.current = race.phase;
      const ch = race.challenge;
      const next = race.gates[ch.nextGate];
      useHud.setState({
        speed: Math.round(p.speed * 3.6),
        lap: p.lap, laps: race.laps, place: p.place, total: race.racers.length,
        time: race.time, lapTime: race.time - p.lapStart,
        boost: clamp(p.boostEnergy / p.stats.boost, 0, 1), boosting: p.boosting,
        surf: p.surf, transit: p.transit, progress: race.progress(), phase: race.phase,
        bestLap: isFinite(p.bestLap) ? p.bestLap : null, mode: race.mode, fps: fpsRef.current.v,
        event: race.event ? race.event.hud() : null,
        gateInfo: race.mode === 'challenge' ? { score: ch.score, combo: ch.combo, hit: ch.hit, missed: ch.nextGate - ch.hit, total: ch.total, nextSurface: next ? next.surface : -1, nextIdx: ch.nextGate, lastOk: ch.lastGateOk } : null,
      });
    }
  });
  return null;
}


/** One cheap spot light on the player's car so the road ahead is lit in the dark / rain. */
function Headlights({ model, intensity }: { model: CarModel; intensity: number }) {
  useEffect(() => {
    const spot = new THREE.SpotLight('#cfe8ff', 120 * intensity, 90, 0.5, 0.7, 1.4);
    spot.position.set(0, 0.6, -1.2);
    const target = new THREE.Object3D();
    target.position.set(0, -0.2, -30);
    model.group.add(spot, target);
    spot.target = target;
    return () => { model.group.remove(spot, target); spot.dispose(); };
  }, [model, intensity]);
  return null;
}
