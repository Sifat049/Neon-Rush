import { TrackDoc, parseTrackDoc } from './trackDoc';

const KEY = 'neonrush.tracks.v1';
const DRAFT = 'neonrush.editor.draft.v1';
const SERVER = 'neonrush.shareServer';
const MAX_SAVED = 50;

/** Saved custom tracks (validated every time they are read). */
export function loadTracks(): TrackDoc[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const out: TrackDoc[] = [];
    for (const r of raw) { const p = parseTrackDoc(r); if (p.doc && p.ok) out.push(p.doc); }
    return out;
  } catch { return []; }
}
export function saveTrack(doc: TrackDoc): TrackDoc[] {
  const list = loadTracks().filter((t) => t.id !== doc.id);
  list.unshift(doc);
  list.length = Math.min(list.length, MAX_SAVED);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full */ }
  return list;
}
export function deleteTrack(id: string): TrackDoc[] {
  const list = loadTracks().filter((t) => t.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

/** The track currently being edited survives test races and page reloads. */
export function loadDraft(): TrackDoc | null {
  try { const raw = localStorage.getItem(DRAFT); if (!raw) return null; const p = parseTrackDoc(JSON.parse(raw)); return p.doc ?? null; } catch { return null; }
}
export function saveDraft(doc: TrackDoc) { try { localStorage.setItem(DRAFT, JSON.stringify(doc)); } catch { /* ignore */ } }

export const getServerUrl = () => { try { return localStorage.getItem(SERVER) ?? ''; } catch { return ''; } };
export const setServerUrl = (u: string) => { try { localStorage.setItem(SERVER, u.trim().replace(/\/+$/, '')); } catch { /* ignore */ } };
