export function RotateOverlay() {
  return (
    <div className="nr-rotate pointer-events-auto fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-4 bg-black/95 text-center">
      <div className="text-6xl">📱↻</div>
      <div className="nr-title font-display text-xl font-black tracking-[0.3em]">ROTATE YOUR DEVICE</div>
      <div className="text-xs tracking-widest text-cyan-100/70">Neon Rush plays in landscape</div>
    </div>
  );
}
