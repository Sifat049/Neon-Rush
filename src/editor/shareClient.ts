import { TrackDoc, parseTrackDoc } from './trackDoc';

/** Talks to the optional self-hosted share server (server/share-server.ts). Everything else in the editor works offline. */
async function call(url: string, init?: RequestInit) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string; details?: string[] }).details?.join(' ') ?? (body as { error?: string }).error ?? `Server error ${r.status}`);
    return body;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Server did not answer');
    throw e instanceof TypeError ? new Error('Cannot reach the share server') : e;
  } finally { clearTimeout(t); }
}
export async function uploadTrack(server: string, doc: TrackDoc): Promise<string> {
  const body = (await call(`${server}/api/tracks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })) as { code: string };
  return body.code;
}
export async function downloadTrack(server: string, code: string): Promise<TrackDoc> {
  const body = await call(`${server}/api/tracks/${encodeURIComponent(code.trim().toUpperCase())}`);
  const p = parseTrackDoc(body);
  if (!p.ok || !p.doc) throw new Error('Server returned an invalid track');
  return p.doc;
}
