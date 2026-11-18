/** Funny Banglish one-liners (mild, friendly gali). Rate-limited so they never spam. */
const LINES = {
  hit: ['DHUR GADHA, DEYAL DEKHOS NA?', 'ARE HADA, ROAD E THAK!', 'BOLOD, CHOKH KOI?', 'ABAR DHAKKA? PAGLA NAKI!', 'GARI TA TOR BAPER NA, ASTE!', 'SHALA, BREAK ER KOTHA MONE NAI?', 'ARE BAAL, ABAR LAGLO!', 'DEYAL TOR SHOSHUR BARI NA!'],
  fall: ['PORE GELI ZA! UDHAO!', 'DHUR BOKA, NICHE KEN GELI?', 'GRAVITY TOR BOSS, MANO!', 'ARE HADARAM, ROAD E UTHO!', 'BHAI PAKHI HOS NAKI? UROS KEN!'],
  bump: ['ARE, AMAR GARI TE KEN LAGLI?', 'DHAKKA DIS NA SHALA!', 'EKTU ASTE, HADA!'],
  miss: ['GATE MISS? AMDAR CHOKH NAI NAKI!', 'DHUR, GATE ER VITOR DIYE JA!', 'ARE GADHA, OTA GATE ER JAYGA!'],
  win: ['BAH! BAAP RE BAAP, JITE GELI!', 'KI MAMA, CHAMPION NAKI!', 'ERO NAM HOY, ERO!'],
  lose: ['HETE JETE PARTIS, GARI KEN!', 'DHUR, AMI HOLE ALU DIYE CHALATAM', 'AGAMIKAL ABAR ASHBO, KANDIS NA!', 'BOLOD, PICHONE PORE ACHOS!'],
  boost: ['ZOOOM! ROCKET NAKI!', 'ARE BAAP, URE GELO!', 'PETROL ER DAM BARBE RE!'],
  jump: ['UROO MAMA UROO!', 'PAKHI HOYE GELI!'],
};
type Cat = keyof typeof LINES;
let last = -99;
let lastLine = '';
/** Returns a funny line, or null if one was shown too recently. `gapSec` is the min seconds between lines. */
export function funny(cat: Cat, nowSec: number, gapSec = 6, chance = 0.7): string | null {
  if (nowSec - last < gapSec || Math.random() > chance) return null;
  const arr = LINES[cat];
  let l = arr[Math.floor(Math.random() * arr.length)];
  if (l === lastLine && arr.length > 1) l = arr[(arr.indexOf(l) + 1) % arr.length];
  last = nowSec; lastLine = l;
  return l;
}
export const funnyAlways = (cat: Cat) => { const a = LINES[cat]; return a[Math.floor(Math.random() * a.length)]; };
