import { useGame } from '../store/gameStore';

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
const SAY: Record<string, string[]> = {
 "hit": [
  "ধুর গাধা, দেয়াল দেখিস না?",
  "আরে হাদা, রোডে থাক!",
  "বলদ, চোখ কই?",
  "আবার ধাক্কা? পাগলা নাকি!",
  "গাড়িটা তোর বাপের না, আস্তে!",
  "শালা, ব্রেকের কথা মনে নাই?",
  "আরে বাল, আবার লাগলো!",
  "দেয়াল তোর শ্বশুর বাড়ি না!"
 ],
 "fall": [
  "পড়ে গেলি যা! উদ্ধার!",
  "ধুর বোকা, নিচে কেন গেলি?",
  "গ্র্যাভিটি তোর বস, মানো!",
  "আরে হাদারাম, রোডে ওঠো!",
  "ভাই পাখি হোস নাকি? উড়স কেন!"
 ],
 "bump": [
  "আরে, আমার গাড়িতে কেন লাগলি?",
  "ধাক্কা দিস না শালা!",
  "একটু আস্তে, হাদা!"
 ],
 "miss": [
  "গেট মিস? আমদার চোখ নাই নাকি!",
  "ধুর, গেটের ভিতর দিয়ে যা!",
  "আরে গাধা, ওটা গেটের জায়গা!"
 ],
 "win": [
  "বাহ! বাপ রে বাপ, জিতে গেলি!",
  "কি মামা, চ্যাম্পিয়ন নাকি!",
  "এরই নাম হয়, এরই!"
 ],
 "lose": [
  "হেঁটে যেতে পারতিস, গাড়ি কেন!",
  "ধুর, আমি হলে আলু দিয়ে চালাতাম",
  "আগামীকাল আবার আসবো, কাঁদিস না!",
  "বলদ, পিছনে পড়ে আছস!"
 ],
 "boost": [
  "জুউউম! রকেট নাকি!",
  "আরে বাপ, উড়ে গেলো!",
  "পেট্রলের দাম বাড়বে রে!"
 ],
 "jump": [
  "উড়ো মামা উড়ো!",
  "পাখি হয়ে গেলি!"
 ]
};
type Cat = keyof typeof LINES;
let last = -99;
let lastLine = '';

let voices: SpeechSynthesisVoice[] = [];
function loadVoices() { try { voices = window.speechSynthesis.getVoices(); } catch { /* no speech support */ } }
if (typeof window !== 'undefined' && 'speechSynthesis' in window) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }

/** Speak the line with the device's own voice (Bangla if the device has one, otherwise an Indian-English voice reading Banglish). */
function speak(cat: Cat, idx: number) {
  try {
    if (!useGame.getState().save.settings.voice) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (!voices.length) loadVoices();
    const bn = voices.find((v) => v.lang.toLowerCase().startsWith('bn'));
    const fallback = voices.find((v) => v.lang.toLowerCase() === 'en-in') ?? voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
    const u = new SpeechSynthesisUtterance(bn ? SAY[cat][idx] : LINES[cat][idx].toLowerCase());
    if (bn) { u.voice = bn; u.lang = bn.lang; } else if (fallback) { u.voice = fallback; u.lang = fallback.lang; } else u.lang = 'en-IN';
    u.rate = 1.08; u.pitch = 1.25; u.volume = 1;
    synth.cancel(); synth.speak(u);
  } catch { /* voice is optional */ }
}
function pick(cat: Cat): string {
  const arr = LINES[cat];
  let i = Math.floor(Math.random() * arr.length);
  if (arr[i] === lastLine && arr.length > 1) i = (i + 1) % arr.length;
  lastLine = arr[i];
  speak(cat, i);
  return arr[i];
}
/** Returns a funny line (and speaks it), or null if one was shown too recently. */
export function funny(cat: Cat, nowSec: number, gapSec = 6, chance = 0.7): string | null {
  if (nowSec - last < gapSec || Math.random() > chance) return null;
  last = nowSec;
  return pick(cat);
}
export const funnyAlways = (cat: Cat) => pick(cat);
