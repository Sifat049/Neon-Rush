import { useGame } from '../store/gameStore';
import { CARS, MAX_UPGRADE, PAINTS, UPGRADE_KEYS, UPGRADE_LABEL, effectiveStats, getCar, noUpgrades, statNorm, upgradeCost } from '../game/vehicles/cars';
import { Credits, NeonButton, Panel, ScreenFrame, StatBar, fmtNum } from './primitives';

export function Garage() {
  const { save, go, garageTab, setGarageTab, previewCar, setPreview, buyCar, selectCar, setPaint, buyUpgrade } = useGame();
  const car = getCar(previewCar);
  const owned = save.unlockedCars.includes(car.id);
  const up = save.upgrades[car.id] ?? noUpgrades();
  const stats = effectiveStats(car, up);
  const baseStats = effectiveStats(car, noUpgrades());
  const paintIdx = save.paint[car.id] ?? car.defaultPaint;
  const tabs: ['vehicles' | 'paint' | 'upgrades', string][] = [['vehicles', 'Vehicles'], ['paint', 'Paint'], ['upgrades', 'Upgrades']];
  return (
    <ScreenFrame title="GARAGE" subtitle="Drag the car to rotate" onBack={() => go('menu')} right={<Credits n={save.credits} />}>
      <div className="pointer-events-none flex h-full min-h-0 gap-3">
        {/* left: tabs + list */}
        <div className="pointer-events-none flex w-[min(21rem,44vw)] min-h-0 flex-col gap-2">
          <div className="pointer-events-auto flex gap-1.5">
            {tabs.map(([id, label]) => <NeonButton key={id} size="sm" variant={garageTab === id ? 'primary' : 'ghost'} onClick={() => setGarageTab(id)}>{label}</NeonButton>)}
          </div>
          <Panel className="nr-scroll min-h-0 flex-1 p-3">
            {garageTab === 'vehicles' && (
              <div className="grid gap-2">
                {CARS.map((c) => {
                  const has = save.unlockedCars.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => setPreview(c.id)} className={`rounded-lg border p-3 text-left transition ${previewCar === c.id ? 'border-cyan-300 bg-cyan-400/10 shadow-neon' : 'border-white/10 hover:border-cyan-400/40'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-bold tracking-widest">{c.name}</span>
                        {save.selectedCar === c.id ? <span className="text-[10px] text-lime-300">EQUIPPED</span> : has ? <span className="text-[10px] text-cyan-300">OWNED</span> : <span className="text-[10px] text-amber-300">🔒 {fmtNum(c.price)}</span>}
                      </div>
                      <div className="text-[10px] tracking-widest text-cyan-100/60">{c.tagline}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {garageTab === 'paint' && (
              <div>
                <div className="mb-2 text-[10px] tracking-[0.2em] text-cyan-100/60">PAINT · {car.name}</div>
                <div className="grid grid-cols-2 gap-2">
                  {PAINTS.map((p, i) => (
                    <button key={p.name} onClick={() => setPaint(car.id, i)} className={`rounded-lg border p-2 text-left transition ${paintIdx === i ? 'border-cyan-300 shadow-neon' : 'border-white/10 hover:border-cyan-400/40'}`}>
                      <div className="flex gap-1"><span className="h-5 w-8 rounded" style={{ background: p.primary, boxShadow: 'inset 0 0 0 1px #ffffff33' }} /><span className="h-5 w-4 rounded" style={{ background: p.accent, boxShadow: `0 0 8px ${p.accent}` }} /></div>
                      <div className="mt-1 text-[10px] tracking-widest">{p.name}</div>
                    </button>
                  ))}
                </div>
                {!owned && <div className="mt-2 text-[10px] text-amber-300">Paint is saved even before you buy this car.</div>}
              </div>
            )}
            {garageTab === 'upgrades' && (
              <div>
                <div className="mb-2 text-[10px] tracking-[0.2em] text-cyan-100/60">UPGRADES · {car.name}{!owned && ' (buy the car first)'}</div>
                {UPGRADE_KEYS.map((k) => {
                  const lvl = up[k];
                  const cost = upgradeCost(lvl);
                  const maxed = lvl >= MAX_UPGRADE;
                  return (
                    <div key={k} className="mb-2 rounded-lg border border-white/10 p-3">
                      <div className="flex items-center justify-between text-xs font-bold tracking-widest"><span>{UPGRADE_LABEL[k]}</span><span className="text-cyan-300">LV {lvl}/{MAX_UPGRADE}</span></div>
                      <div className="my-2 flex gap-1">{Array.from({ length: MAX_UPGRADE }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded ${i < lvl ? 'bg-cyan-300 shadow-[0_0_8px_#22e5ff]' : 'bg-white/10'}`} />)}</div>
                      <NeonButton size="sm" variant={maxed ? 'ghost' : 'magenta'} disabled={!owned || maxed || save.credits < cost} onClick={() => buyUpgrade(car.id, k)} className="w-full">
                        {maxed ? 'MAXED' : `Upgrade · ${fmtNum(cost)}`}
                      </NeonButton>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
        <div className="flex-1" />
        {/* right: stats */}
        <div className="pointer-events-none flex w-[min(18rem,40vw)] flex-col justify-end gap-2 self-stretch">
          <Panel className="p-4">
            <div className="font-display text-lg font-black tracking-widest text-cyan-200">{car.name}</div>
            <div className="mb-3 text-[10px] tracking-widest text-cyan-100/60">{car.tagline}</div>
            <StatBar label="ACCELERATION" value={statNorm('accel', baseStats.accel)} extra={statNorm('accel', stats.accel) - statNorm('accel', baseStats.accel)} />
            <StatBar label="TOP SPEED" value={statNorm('top', baseStats.top)} extra={statNorm('top', stats.top) - statNorm('top', baseStats.top)} color="#8b5cff" />
            <StatBar label="HANDLING" value={statNorm('handling', baseStats.handling)} extra={statNorm('handling', stats.handling) - statNorm('handling', baseStats.handling)} color="#ff2bd6" />
            <StatBar label="BOOST" value={statNorm('boost', baseStats.boost)} extra={statNorm('boost', stats.boost) - statNorm('boost', baseStats.boost)} color="#b6ff3b" />
            <div className="mt-1 text-[10px] tracking-widest text-cyan-100/50">{(stats.top * 3.6).toFixed(0)} KM/H · {stats.accel.toFixed(0)} M/S² · BOOST {stats.boost.toFixed(0)}</div>
          </Panel>
          {owned ? (
            <NeonButton variant="primary" size="lg" disabled={save.selectedCar === car.id} onClick={() => selectCar(car.id)}>{save.selectedCar === car.id ? 'Equipped ✓' : 'Equip'}</NeonButton>
          ) : (
            <NeonButton variant="gold" size="lg" disabled={save.credits < car.price} onClick={() => buyCar(car.id)}>Buy · {fmtNum(car.price)}</NeonButton>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}
