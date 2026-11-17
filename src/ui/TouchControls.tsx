import { PointerEvent, ReactNode } from 'react';
import { touch, pulseGravity } from '../controls/input';
import { useGame } from '../store/gameStore';

type Key = keyof typeof touch;

function Hold({ k, children, className = '', style }: { k: Key; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const on = (e: PointerEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); touch[k] = true; (e.currentTarget as HTMLElement).dataset.down = '1'; };
  const off = (e: PointerEvent) => { touch[k] = false; delete (e.currentTarget as HTMLElement).dataset.down; };
  return (
    <button onPointerDown={on} onPointerUp={off} onPointerCancel={off} onPointerLeave={off} onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto flex touch-none select-none items-center justify-center rounded-2xl border-2 border-cyan-300/50 bg-void-800/60 font-display font-black tracking-widest text-cyan-100 backdrop-blur-sm transition-transform data-[down]:scale-95 data-[down]:bg-cyan-400/40 data-[down]:shadow-neon ${className}`} style={style}>
      {children}
    </button>
  );
}
function Tap({ dir, children, className = '' }: { dir: 'left' | 'right'; children: ReactNode; className?: string }) {
  return (
    <button onPointerDown={(e) => { e.preventDefault(); pulseGravity(dir); (e.currentTarget as HTMLElement).dataset.down = '1'; }} onPointerUp={(e) => delete (e.currentTarget as HTMLElement).dataset.down} onPointerLeave={(e) => delete (e.currentTarget as HTMLElement).dataset.down} onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto flex touch-none select-none items-center justify-center rounded-2xl border-2 border-violet-400/60 bg-violet-600/25 font-display font-black text-violet-100 backdrop-blur-sm data-[down]:scale-95 data-[down]:bg-violet-500/60 ${className}`}>{children}</button>
  );
}

export function TouchControls() {
  const size = useGame((s) => s.save.settings.touchSize);
  const u = `calc(${size} * min(17vh, 11vw))`; // base button size adapts to screen
  const sq = { width: u, height: u, fontSize: `calc(${u} * 0.34)` };
  const wide = { width: `calc(${u} * 1.25)`, height: u, fontSize: `calc(${u} * 0.2)` };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2"><Tap dir="left" className="" ><span style={{ fontSize: `calc(${u} * 0.4)`, width: u, height: `calc(${u} * 0.7)` }} className="flex items-center justify-center">⟲</span></Tap><Tap dir="right"><span style={{ fontSize: `calc(${u} * 0.4)`, width: u, height: `calc(${u} * 0.7)` }} className="flex items-center justify-center">⟳</span></Tap></div>
        <div className="flex gap-2"><Hold k="left" style={sq}>◀</Hold><Hold k="right" style={sq}>▶</Hold></div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2"><Hold k="drift" style={wide}>DRIFT</Hold><Hold k="jump" style={wide}>JUMP</Hold><Hold k="boost" style={{ ...wide, borderColor: '#ff2bd6', color: '#ffd1f7' }}>BOOST</Hold></div>
        <div className="flex gap-2"><Hold k="brake" style={wide}>BRAKE</Hold><Hold k="gas" style={{ ...wide, width: `calc(${u} * 1.6)`, borderColor: '#b6ff3b', color: '#eaffb3' }}>GAS</Hold></div>
      </div>
    </div>
  );
}
