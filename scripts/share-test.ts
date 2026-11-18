/* Real HTTP test of the self-hosted share server (spawns it on a random port with a temp data dir). */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-share-'));
const { createServer } = await import('../server/share-server');
const { starterDoc, exportJson } = await import('../src/editor/trackDoc');
const { uploadTrack, downloadTrack } = await import('../src/editor/shareClient');

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const srv = createServer();
await new Promise<void>((r) => srv.listen(0, r));
const port = (srv.address() as { port: number }).port;
const base = `http://localhost:${port}`;

const health = await (await fetch(`${base}/api/health`)).json();
ok('health endpoint answers', health.ok === true && health.tracks === 0);

const doc = starterDoc();
const code = await uploadTrack(base, doc);
ok('upload returns a 6-character code', /^[A-Z2-9]{6}$/.test(code), code);
const back = await downloadTrack(base, code.toLowerCase());
ok('download returns the same track (case-insensitive code)', back.pieces.length === doc.pieces.length && back.name === doc.name && back.id === doc.id);

const bad = await fetch(`${base}/api/tracks`, { method: 'POST', body: '{not json' });
ok('broken JSON is rejected with 400', bad.status === 400);
const hostile = await fetch(`${base}/api/tracks`, { method: 'POST', body: JSON.stringify({ v: 1, pieces: [{ type: '<script>' }], name: '<img onerror=x>' }) });
ok('invalid / hostile track is rejected with 422', hostile.status === 422, String(hostile.status));
const eight = Array.from({ length: 8 }, () => ({ type: 'sharp', dir: 1 }));
const unplayable = await fetch(`${base}/api/tracks`, { method: 'POST', body: JSON.stringify({ ...JSON.parse(exportJson(doc)), pieces: eight }) });
const ub = await unplayable.json();
ok('a self-crossing layout is parsed but rejected as not playable', unplayable.status === 422 && /not playable/i.test(ub.error), JSON.stringify(ub).slice(0, 120));
const missing = await fetch(`${base}/api/tracks/ZZZZZZ`);
ok('unknown code gives 404', missing.status === 404);
const huge = await fetch(`${base}/api/tracks`, { method: 'POST', body: 'x'.repeat(70_000) }).then((r) => r.status).catch(() => 413);
ok('oversized body is refused', huge === 413 || huge === 400);
let limited = 0;
for (let i = 0; i < 30; i++) { const r = await fetch(`${base}/api/tracks`, { method: 'POST', body: '{}' }); if (r.status === 429) limited++; }
ok('upload rate limit kicks in', limited > 0, `${limited} requests limited`);
const persisted = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR!, 'tracks.json'), 'utf8'));
ok('accepted tracks are persisted to disk', !!persisted[code]);
try { await downloadTrack('http://localhost:1', code); ok('unreachable server gives a clear error', false); } catch (e) { ok('unreachable server gives a clear error', /reach|answer/i.test((e as Error).message), (e as Error).message); }
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
