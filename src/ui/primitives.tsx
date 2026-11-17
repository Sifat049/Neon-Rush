import { ReactNode } from 'react';
import { audio } from '../game/audio/audio';

type Variant = 'primary' | 'ghost' | 'magenta' | 'danger' | 'gold';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-cyan-300 to-blue-500 text-void-900 shadow-neon hover:brightness-125',
  ghost: 'border border-cyan-400/45 text-cyan-50 bg-void-800/70 hover:bg-cyan-400/15 hover:shadow-neon',
  magenta: 'border border-fuchsia-400/60 text-fuchsia-50 bg-fuchsia-500/15 hover:bg-fuchsia-500/30 hover:shadow-magenta',
  danger: 'border border-red-400/60 text-red-100 bg-red-500/15 hover:bg-red-500/30',
  gold: 'bg-gradient-to-r from-amber-300 to-orange-500 text-void-900 hover:brightness-110',
};
const SIZES = { sm: 'px-3 py-2 text-[11px]', md: 'px-5 py-3 text-sm', lg: 'px-7 py-4 text-base' };

export function NeonButton({ children, onClick, variant = 'ghost', size = 'md', disabled, className = '', title, active }: {
  children: ReactNode; onClick?: () => void; variant?: Variant; size?: keyof typeof SIZES; disabled?: boolean; className?: string; title?: string; active?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={() => { audio.ensure(); onClick?.(); }}
      className={`pointer-events-auto relative select-none rounded-lg font-display font-bold uppercase tracking-[0.16em] transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${SIZES[size]} ${VARIANTS[variant]} ${active ? 'ring-2 ring-cyan-300 shadow-neon' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`nr-panel pointer-events-auto ${className}`}>{children}</div>;
}

export function StatBar({ label, value, extra, color = '#22e5ff' }: { label: string; value: number; extra?: number; color?: string }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[10px] tracking-[0.2em] text-cyan-100/70"><span>{label}</span></div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 10px ${color}` }} />
        {extra != null && extra > 0 && <div className="absolute inset-y-0 rounded-full bg-lime-300/80" style={{ left: `${value * 100}%`, width: `${Math.min(100 - value * 100, extra * 100)}%` }} />}
      </div>
    </div>
  );
}

export function ScreenFrame({ title, subtitle, onBack, children, right }: { title: string; subtitle?: string; onBack: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="nr-in pointer-events-none absolute inset-0 flex flex-col p-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-5">
      <div className="pointer-events-none flex items-center gap-3">
        <NeonButton size="sm" onClick={onBack}>◀ Back</NeonButton>
        <div className="min-w-0">
          <h2 className="nr-title font-display text-xl font-black tracking-[0.2em] sm:text-3xl">{title}</h2>
          {subtitle && <div className="truncate text-[10px] tracking-[0.25em] text-cyan-200/60 sm:text-xs">{subtitle}</div>}
        </div>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      <div className="pointer-events-none mt-3 min-h-0 flex-1">{children}</div>
    </div>
  );
}

export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
export function Credits({ n }: { n: number }) {
  return (
    <div className="nr-panel pointer-events-auto flex items-center gap-2 px-3 py-1.5 font-display text-sm font-bold tracking-widest text-amber-200">
      <span className="inline-block h-3 w-3 rotate-45 bg-amber-300 shadow-[0_0_10px_#fbbf24]" />{fmtNum(n)}
    </div>
  );
}
