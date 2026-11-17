import { TRACKS } from '../src/game/tracks/definitions';
import { buildPath } from '../src/game/tracks/trackBuilder';
for (const d of TRACKS) {
  const b = buildPath(d.cmds);
  console.log(d.id, 'closure', b.closureError.toFixed(1), 'free lens', d.cmds.map((c, i) => (c.t === 's' && c.free ? `${i}:${b.lens[i].toFixed(0)}` : '')).filter(Boolean).join(' '));
}
