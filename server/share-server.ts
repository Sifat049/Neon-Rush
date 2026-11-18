/**
 * Neon Rush self-hosted track sharing server. No paid services, no extra dependencies.
 *
 *   npx tsx server/share-server.ts            (PORT=8787 DATA_DIR=./server/data by default)
 *
 * POST /api/tracks        body: track JSON  -> { code: "AB12CD" }   (validated + compiled; invalid tracks are rejected)
 * GET  /api/tracks/:code                    -> track JSON
 * GET  /api/health                          -> { ok: true, tracks: n }
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseTrackDoc, TrackDoc } from '../src/editor/trackDoc';
import { compileDoc } from '../src/editor/compile';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.DATA_DIR ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'data');
const FILE = path.join(DATA_DIR, 'tracks.json');
const MAX_BODY = 64 * 1024;
const MAX_TRACKS = 5000;
const POSTS_PER_MIN = 20;

fs.mkdirSync(DATA_DIR, { recursive: true });
let store: Record<string, TrackDoc> = {};
try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { store = {}; }
const persist = () => { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(store)); fs.renameSync(tmp, FILE); };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!store[c]) return c; } };

const hits = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > POSTS_PER_MIN;
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(body));
};

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, tracks: Object.keys(store).length });
    const m = /^\/api\/tracks\/([A-Za-z0-9]{6})$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const doc = store[m[1].toUpperCase()];
      return doc ? send(res, 200, doc) : send(res, 404, { error: 'No track with that code' });
    }
    if (req.method === 'POST' && url.pathname === '/api/tracks') {
      const ip = req.socket.remoteAddress ?? 'x';
      if (limited(ip)) return send(res, 429, { error: 'Too many uploads, try again in a minute' });
      let size = 0; const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { send(res, 413, { error: 'Track too large' }); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (size > MAX_BODY) return;
        let raw: unknown;
        try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Body is not valid JSON' }); }
        const parsed = parseTrackDoc(raw);
        if (!parsed.ok || !parsed.doc) return send(res, 422, { error: 'Invalid track', details: parsed.errors });
        const compiled = compileDoc(parsed.doc);
        if (!compiled.report.ok) return send(res, 422, { error: 'Track is not playable', details: compiled.report.errors });
        if (Object.keys(store).length >= MAX_TRACKS) return send(res, 507, { error: 'Server is full' });
        const code = newCode();
        store[code] = parsed.doc; persist();
        send(res, 201, { code });
      });
      return;
    }
    send(res, 404, { error: 'Not found' });
  });
}

if (process.argv[1] && new URL(import.meta.url).pathname === path.resolve(process.argv[1])) {
  createServer().listen(PORT, () => console.log(`Neon Rush share server listening on http://localhost:${PORT} (data: ${FILE})`));
}
