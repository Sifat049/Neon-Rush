import { useGame } from '../store/gameStore';
export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => <div key={t.id} className="nr-toast nr-panel px-4 py-2 font-display text-xs font-bold tracking-widest" style={{ color: t.kind === 'bad' ? '#ff7a8a' : t.kind === 'good' ? '#b6ff3b' : '#7df3ff' }}>{t.text}</div>)}
    </div>
  );
}
