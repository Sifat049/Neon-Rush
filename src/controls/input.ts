import { DriveInput, emptyInput } from '../game/core/types';

/** Merges keyboard + touch (+ gamepad) into one DriveInput. Edge-triggered gravity pulses are consumed once. */
const keys = new Set<string>();
export const touch = { left: false, right: false, gas: false, brake: false, jump: false, boost: false, drift: false };
let pulseL = false, pulseR = false;
let onPause: (() => void) | null = null;
let onFullscreen: (() => void) | null = null;
let onRestart: (() => void) | null = null;

export function pulseGravity(dir: 'left' | 'right') { if (dir === 'left') pulseL = true; else pulseR = true; }
const out = emptyInput();

const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

function down(e: KeyboardEvent) {
  if (BLOCK.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyQ') pulseL = true;
  if (e.code === 'KeyE') pulseR = true;
  if (e.code === 'Escape' || e.code === 'KeyP') onPause?.();
  if (e.code === 'KeyR' && e.shiftKey) onRestart?.();
  if (e.code === 'KeyF') onFullscreen?.();
}
function up(e: KeyboardEvent) { keys.delete(e.code); }
function blur() { keys.clear(); for (const k in touch) (touch as Record<string, boolean>)[k] = false; }

export function attachInput(handlers: { pause: () => void; fullscreen: () => void; restart: () => void }) {
  onPause = handlers.pause; onFullscreen = handlers.fullscreen; onRestart = handlers.restart;
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    keys.clear();
  };
}

let padPrev = { l: false, r: false };
export function readInput(): DriveInput {
  const k = (...c: string[]) => c.some((x) => keys.has(x));
  let steer = (k('KeyD', 'ArrowRight') || touch.right ? 1 : 0) - (k('KeyA', 'ArrowLeft') || touch.left ? 1 : 0);
  let throttle = k('KeyW', 'ArrowUp') || touch.gas ? 1 : 0;
  let brake = k('KeyS', 'ArrowDown') || touch.brake ? 1 : 0;
  let jump = k('Space') || touch.jump;
  let boost = k('ShiftLeft', 'ShiftRight') || touch.boost;
  let drift = k('KeyZ', 'KeyC', 'ControlLeft', 'KeyX') || touch.drift;
  // gamepad (optional)
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (gp) {
    const ax = gp.axes[0] ?? 0;
    if (Math.abs(ax) > 0.12) steer = ax;
    if (gp.buttons[7]?.pressed || gp.buttons[0]?.pressed) throttle = Math.max(throttle, gp.buttons[7]?.value || 1);
    if (gp.buttons[6]?.pressed || gp.buttons[1]?.pressed) brake = 1;
    if (gp.buttons[2]?.pressed) jump = true;
    if (gp.buttons[5]?.pressed || gp.buttons[3]?.pressed) boost = true;
    if (gp.buttons[4]?.pressed) drift = true;
    const l = !!gp.buttons[14]?.pressed, r = !!gp.buttons[15]?.pressed;
    if (l && !padPrev.l) pulseL = true;
    if (r && !padPrev.r) pulseR = true;
    padPrev = { l, r };
  }
  out.steer = Math.max(-1, Math.min(1, steer));
  out.throttle = throttle; out.brake = brake; out.jump = jump; out.boost = boost; out.drift = drift;
  out.gravLeft = pulseL; out.gravRight = pulseR;
  pulseL = pulseR = false;
  return out;
}
export const clearPulses = () => { pulseL = pulseR = false; };
