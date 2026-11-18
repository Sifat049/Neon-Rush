import { useGame } from '../store/gameStore';
import { Panel, ScreenFrame } from './primitives';

const KEYS: [string, string][] = [
  ['W / ↑', 'Accelerate'], ['S / ↓', 'Brake'], ['A / ←', 'Steer left'], ['D / →', 'Steer right'],
  ['SPACE', 'Jump'], ['SHIFT', 'Boost'], ['Z / C', 'Drift (hold with steering)'], ['Q', 'Rotate gravity left'], ['E', 'Rotate gravity right'], ['ESC / P', 'Pause'], ['F', 'Fullscreen'], ['SHIFT+R', 'Restart race'],
];

export function HowToPlay() {
  const go = useGame((s) => s.go);
  return (
    <ScreenFrame title="HOW TO PLAY" subtitle="Master the gravity" onBack={() => go('menu')}>
      <div className="nr-scroll pointer-events-auto grid h-full gap-3 pr-1 sm:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">THE GRAVITY TUBE</div>
          <p className="text-xs leading-relaxed text-cyan-50/85">Every track is a square tube. You can drive on the <b>floor</b>, the <b>left wall</b>, the <b>right wall</b> and the <b>ceiling</b>. Press <b>Q</b> / <b>E</b> (or the ⟲ ⟳ buttons) to rotate gravity — your car rolls onto the next surface without losing speed.</p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-cyan-50/85">
            <li>◆ <b>Obstacles and boost pads live on specific surfaces.</b> Switch away from a blocked lane, or onto a surface full of boost pads.</li>
            <li>◆ <b>Gaps</b> remove track on some or all surfaces. Ride a surface that is still there, or <b>jump</b> a full-width gap (red warning bars show where).</li>
            <li>◆ On a bend, centrifugal force pushes you toward the outside. Riding the <b>inside wall</b> removes that push.</li>
            <li>◆ <b>Drift</b> while steering to charge your boost. <b>Boost</b> burns the meter for a big speed surge.</li>
            <li>◆ Fall off the track and you respawn at the last checkpoint.</li>
          </ul>
        </Panel>
        <Panel className="p-4">
          <div className="mb-3 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">CONTROLS</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {KEYS.map(([k, v]) => (<div key={k} className="contents"><kbd className="rounded border border-cyan-400/40 bg-white/5 px-2 py-1 text-center font-display text-[11px] text-cyan-200">{k}</kbd><span className="self-center text-cyan-50/85">{v}</span></div>))}
          </div>
          <div className="mt-4 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">TOUCH</div>
          <p className="mt-1 text-xs leading-relaxed text-cyan-50/85">On phones and tablets the screen shows large buttons: ◀ ▶ steer, GAS, BRAKE, JUMP, BOOST, DRIFT and ⟲ ⟳ gravity. Rotate your device to landscape.</p>
          <div className="mt-4 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">MODES</div>
          <p className="mt-1 text-xs leading-relaxed text-cyan-50/85"><b>Quick Race</b> vs 3 AI · <b>Time Trial</b> records · <b>Gravity Challenge</b>: pass through glowing gates on the surface shown in the HUD · <b>Free Drive</b> practice.</p>
          <div className="mt-4 font-display text-sm font-bold tracking-[0.25em] text-cyan-200">EVENTS</div>
          <p className="mt-1 text-xs leading-relaxed text-cyan-50/85"><b>Drift Challenge</b>: hold DRIFT and steer to build a chain; the multiplier grows every 2 s, pink rings mark x2 zones, a crash loses the chain. <b>Stunt Arena</b>: hit the magenta ramps, in the air hold steer to spin and BRAKE to flip, release at a full turn and land clean to build combos. <b>Police Chase</b>: 3 cars ram you (arrest meter), drones lock on and fire an EMP — boost, jump or switch gravity to dodge. Reach a green zone with nobody close, or ram cops off the road.</p>
        </Panel>
      </div>
    </ScreenFrame>
  );
}
