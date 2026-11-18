import { Race } from '../src/game/core/race';
import { CARS, effectiveStats, noUpgrades } from '../src/game/vehicles/cars';
import { emptyInput } from '../src/game/core/types';
const DT=1/60;
const r = new Race({ mode:'stunt', trackId:'neon-city', carId:'viper', paintIndex:0, stats: effectiveStats(CARS[0], noUpgrades()) });
for (let i=0;i<300&&r.phase==='countdown';i++) r.step(DT, emptyInput());
const inp=emptyInput(); inp.throttle=1;
(r.event as any).extraPads.length=0; r.track.pads.length=0;
for (let i=0;i<240;i++) r.step(DT, inp);
r.drainEvents();
const ev:any=r.event; const sc0=ev.score;
inp.jump=true; r.step(DT,inp); inp.jump=false;
for (let i=0;i<120;i++){ r.step(DT,inp); }
console.log('score delta', ev.score-sc0, 'airT', ev.airT, 'maxH', ev.maxH, r.drainEvents().filter(e=>e.type==='ev'||e.type==='land'));
