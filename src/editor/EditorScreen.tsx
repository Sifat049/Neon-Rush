import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/gameStore';
import { Credits, NeonButton, Panel, ScreenFrame } from '../ui/primitives';
import { registerCustomTrack } from '../game/tracks/definitions';
import { WEATHER_LIST } from '../game/weather/weather';
import { PIECES, compileDoc } from './compile';
import { History } from './history';
import { ENVS, MAX_PIECES, PIECE_TYPES, PieceType, SKIES, TrackDoc, emptyDoc, exportJson, fromShareCode, importJson, newId, starterDoc, toShareCode } from './trackDoc';
import { deleteTrack, getServerUrl, loadDraft, loadTracks, saveDraft, saveTrack, setServerUrl } from './storage';
import { downloadTrack, uploadTrack } from './shareClient';

const PIECE_COLOR: Record<PieceType, string> = {
  straight: '#22e5ff', curve: '#3b9bff', sharp: '#8b5cff', loop: '#ff2bd6', spiral: '#ff4d8d', ramp: '#ffb13b', bridge: '#b6ff3b', tunnel: '#7df3ff', wall: '#ff7a3b', ceiling: '#c07bff', platform: '#3bff9a',
};
const TURNY: PieceType[] = ['curve', 'sharp', 'loop', 'spiral', 'wall'];

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="mb-2 block">
      <div className="mb-0.5 flex justify-between text-[10px] tracking-[0.2em] text-cyan-100/80"><span>{label}</span><span className="text-cyan-300">{fmt ? fmt(value) : value}</span></div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}
function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[10px] tracking-[0.2em] text-cyan-100/80">{label}</div>
      <div className="flex flex-wrap gap-1">{options.map((o) => <NeonButton key={o.id} size="sm" variant={value === o.id ? 'primary' : 'ghost'} onClick={() => onChange(o.id)}>{o.text}</NeonButton>)}</div>
    </div>
  );
}
async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok; } catch { return false; }
  }
}

type Tab = 'pieces' | 'style' | 'race' | 'share';

export function EditorScreen() {
  const go = useGame((s) => s.go);
  const toast = useGame((s) => s.toast);
  const hist = useRef<History<TrackDoc>>(null as unknown as History<TrackDoc>);
  if (!hist.current) hist.current = new History<TrackDoc>(loadDraft() ?? starterDoc());
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const doc = hist.current.current;
  const [sel, setSel] = useState(-1);
  const [tab, setTab] = useState<Tab>('pieces');
  const [saved, setSaved] = useState<TrackDoc[]>(() => loadTracks());
  const [incoming, setIncoming] = useState<{ doc: TrackDoc; errors: string[] } | null>(null);
  const [importText, setImportText] = useState('');
  const [codeText, setCodeText] = useState('');
  const [server, setServer] = useState(getServerUrl());
  const [serverCode, setServerCode] = useState('');
  const [busy, setBusy] = useState(false);
  const lastKey = useRef({ key: '', t: 0 });

  const compiled = useMemo(() => compileDoc(doc), [doc]);
  const incomingCompiled = useMemo(() => (incoming ? compileDoc(incoming.doc) : null), [incoming]);
  useEffect(() => { saveDraft(doc); }, [doc]);

  /** Apply an edit. Edits with the same key in quick succession (slider drags) share one undo step. */
  const edit = (next: TrackDoc, key?: string) => {
    const now = performance.now();
    if (key && lastKey.current.key === key && now - lastKey.current.t < 900) hist.current.replace(next);
    else hist.current.push(next);
    lastKey.current = { key: key ?? '', t: now };
    bump();
  };
  const setStyle = (patch: Partial<TrackDoc['style']>, key: string) => edit({ ...doc, style: { ...doc.style, ...patch } }, key);
  const setRace = (patch: Partial<TrackDoc['race']>, key: string) => edit({ ...doc, race: { ...doc.race, ...patch } }, key);

  // ---- pieces
  const addPiece = (type: PieceType) => {
    if (doc.pieces.length >= MAX_PIECES) { toast(`Max ${MAX_PIECES} pieces`, 'bad'); return; }
    const at = sel >= 0 ? sel + 1 : doc.pieces.length;
    const pieces = [...doc.pieces];
    pieces.splice(at, 0, { type, dir: 1 });
    edit({ ...doc, pieces });
    setSel(at);
  };
  const removePiece = () => { if (sel < 0) return; const pieces = doc.pieces.filter((_, i) => i !== sel); edit({ ...doc, pieces }); setSel(Math.min(sel, pieces.length - 1)); };
  const rotatePiece = () => { if (sel < 0) return; const pieces = doc.pieces.map((p, i) => (i === sel ? { ...p, dir: (p.dir === 1 ? -1 : 1) as 1 | -1 } : p)); edit({ ...doc, pieces }); };
  const movePiece = (d: -1 | 1) => {
    const j = sel + d;
    if (sel < 0 || j < 0 || j >= doc.pieces.length) return;
    const pieces = [...doc.pieces];
    [pieces[sel], pieces[j]] = [pieces[j], pieces[sel]];
    edit({ ...doc, pieces }); setSel(j);
  };
  const dupPiece = () => { if (sel < 0 || doc.pieces.length >= MAX_PIECES) return; const pieces = [...doc.pieces]; pieces.splice(sel + 1, 0, { ...pieces[sel], cp: undefined }); edit({ ...doc, pieces }); setSel(sel + 1); };
  const toggleCp = () => { if (sel < 0) return; const pieces = doc.pieces.map((p, i) => (i === sel ? { ...p, cp: p.cp ? undefined : true } : p)); edit({ ...doc, pieces }); };

  const undo = () => { if (hist.current.undo()) { setSel(-1); bump(); } };
  const redo = () => { if (hist.current.redo()) { setSel(-1); bump(); } };
  const replaceDoc = (d: TrackDoc) => { hist.current.push(d); setSel(-1); bump(); };

  // ---- save / load / test
  const save = () => {
    if (!compiled.report.ok) { toast('Fix the track errors before saving', 'bad'); return; }
    setSaved(saveTrack(doc)); toast(`Saved "${doc.name}"`, 'good');
  };
  const test = (mode: 'quick' | 'trial') => {
    if (!compiled.def) { toast('Fix the track errors first', 'bad'); return; }
    registerCustomTrack(compiled.def);
    const g = useGame.getState();
    g.setTrack(compiled.def.id); g.setMode(mode); g.setAfterRace('editor'); g.startRace();
  };

  // ---- sharing
  const startImport = (r: ReturnType<typeof importJson>) => {
    if (!r.doc) { toast(r.errors[0] ?? 'Invalid track', 'bad'); return; }
    setIncoming({ doc: { ...r.doc, id: newId() }, errors: r.errors }); // imported tracks always get a fresh id
  };
  const json = useMemo(() => exportJson(doc), [doc]);
  const code = useMemo(() => toShareCode(doc), [doc]);
  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${doc.name.replace(/\W+/g, '_').toLowerCase() || 'track'}.neonrush.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const upload = async () => {
    if (!server) { toast('Enter your share server address', 'bad'); return; }
    if (!compiled.report.ok) { toast('Fix the track errors first', 'bad'); return; }
    setServerUrl(server); setBusy(true);
    try { const c = await uploadTrack(server.trim().replace(/\/+$/, ''), doc); setServerCode(c); toast(`Uploaded! Code ${c}`, 'good'); } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };
  const fetchByCode = async () => {
    if (!server || !serverCode.trim()) { toast('Enter server address and code', 'bad'); return; }
    setServerUrl(server); setBusy(true);
    try { const d = await downloadTrack(server.trim().replace(/\/+$/, ''), serverCode); setIncoming({ doc: { ...d, id: newId() }, errors: [] }); } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };

  // ---- preview
  const shown = incoming && incomingCompiled ? incomingCompiled : compiled;
  const shownDoc = incoming ? incoming.doc : doc;
  const view = useMemo(() => {
    const pts = shown.preview;
    if (!pts.length) return null;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const pad = 60, w = Math.max(200, x1 - x0 + pad * 2), h = Math.max(200, z1 - z0 + pad * 2);
    // group consecutive samples that belong to the same piece
    const groups: { piece: number; d: string }[] = [];
    pts.forEach((p, i) => {
      const last = groups[groups.length - 1];
      const seg = `${(p.x - x0 + pad).toFixed(1)},${(p.z - z0 + pad).toFixed(1)}`;
      if (last && last.piece === p.piece) last.d += ` ${seg}`;
      else { groups.push({ piece: p.piece, d: (i > 0 ? `${(pts[i - 1].x - x0 + pad).toFixed(1)},${(pts[i - 1].z - z0 + pad).toFixed(1)} ` : '') + seg }); }
    });
    return { w, h, x0, z0, pad, groups, step: Math.max(100, Math.round(Math.max(w, h) / 12 / 50) * 50) };
  }, [shown]);

  // animated "preview lap" dot
  const [playing, setPlaying] = useState(false);
  const [dot, setDot] = useState(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (t: number) => { const dt = Math.min(0.1, (t - last) / 1000); last = t; setDot((d) => d + dt * 0.12); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const dotPt = view && shown.preview.length ? shown.preview[Math.floor((dot % 1) * shown.preview.length)] : null;

  const errs = shown.report.errors, warns = shown.report.warnings;
  const selPiece = sel >= 0 ? doc.pieces[sel] : null;

  const tabBtn = (t: Tab, label: string) => <NeonButton key={t} size="sm" variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>{label}</NeonButton>;

  const left: ReactNode = (
    <>
      {tab === 'pieces' && (
        <div>
          <div className="mb-2 text-[10px] tracking-[0.2em] text-cyan-100/60">TAP A PIECE TO ADD IT {sel >= 0 ? `AFTER #${sel + 1}` : 'AT THE END'}. PIECES SNAP END-TO-END, THE LOOP CLOSES AUTOMATICALLY.</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PIECE_TYPES.map((t) => (
              <button key={t} title={PIECES[t].blurb} onClick={() => addPiece(t)} className="rounded-lg border border-white/10 p-2 text-left transition hover:border-cyan-300/60 hover:bg-cyan-400/10 active:scale-95">
                <div className="flex items-center gap-2"><span className="text-lg" style={{ color: PIECE_COLOR[t] }}>{PIECES[t].icon}</span><span className="font-display text-[11px] font-bold tracking-wider">{PIECES[t].label}</span></div>
                <div className="mt-0.5 text-[9px] leading-tight text-cyan-100/55">{PIECES[t].blurb}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-white/10 p-2">
            <div className="mb-1.5 text-[10px] tracking-[0.2em] text-cyan-100/70">{selPiece ? `SELECTED #${sel + 1} · ${PIECES[selPiece.type].label.toUpperCase()}` : 'SELECT A PIECE IN THE STRIP BELOW'}</div>
            <div className="flex flex-wrap gap-1">
              <NeonButton size="sm" disabled={!selPiece || !TURNY.includes(selPiece.type)} onClick={rotatePiece} title="Mirror: turn the other way">↺↻ Rotate</NeonButton>
              <NeonButton size="sm" disabled={!selPiece || sel === 0} onClick={() => movePiece(-1)}>◀ Move</NeonButton>
              <NeonButton size="sm" disabled={!selPiece || sel === doc.pieces.length - 1} onClick={() => movePiece(1)}>Move ▶</NeonButton>
              <NeonButton size="sm" disabled={!selPiece} onClick={dupPiece}>Copy</NeonButton>
              <NeonButton size="sm" disabled={!selPiece} variant={selPiece?.cp ? 'primary' : 'ghost'} onClick={toggleCp}>⚑ Checkpoint</NeonButton>
              <NeonButton size="sm" variant="danger" disabled={!selPiece} onClick={removePiece}>Delete</NeonButton>
            </div>
          </div>
        </div>
      )}
      {tab === 'style' && (
        <div>
          <Chips label="ENVIRONMENT" value={doc.env} options={ENVS.map((e) => ({ id: e, text: e }))} onChange={(env) => edit({ ...doc, env })} />
          <Chips label="WEATHER" value={doc.style.weather} options={WEATHER_LIST.map((w) => ({ id: w.id, text: `${w.icon} ${w.name}` }))} onChange={(weather) => setStyle({ weather }, 'weather')} />
          <Chips label="SKYBOX" value={doc.style.sky} options={SKIES.map((s) => ({ id: s, text: s }))} onChange={(sky) => setStyle({ sky }, 'sky')} />
          <div className="mb-2 flex gap-3">
            <label className="text-[10px] tracking-[0.2em] text-cyan-100/80">ROAD<input type="color" className="mt-1 block h-8 w-14 cursor-pointer rounded border border-white/20 bg-transparent" value={doc.style.roadColor} onChange={(e) => setStyle({ roadColor: e.target.value }, 'road')} /></label>
            <label className="text-[10px] tracking-[0.2em] text-cyan-100/80">NEON<input type="color" className="mt-1 block h-8 w-14 cursor-pointer rounded border border-white/20 bg-transparent" value={doc.style.neonColor} onChange={(e) => setStyle({ neonColor: e.target.value }, 'neon')} /></label>
          </div>
          <Slider label="TRACK WIDTH" value={doc.style.width} min={6} max={12} step={0.5} onChange={(width) => setStyle({ width }, 'width')} fmt={(v) => `${(v * 2).toFixed(0)} m`} />
          <Slider label="LIGHTING" value={doc.style.lighting} min={0.6} max={1.4} step={0.05} onChange={(lighting) => setStyle({ lighting }, 'light')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="FOG" value={doc.style.fog} min={0} max={1} step={0.05} onChange={(fog) => setStyle({ fog }, 'fog')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="DECORATIVE OBJECTS" value={doc.style.decor} min={0} max={1} step={0.05} onChange={(decor) => setStyle({ decor }, 'decor')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="OBSTACLES" value={doc.style.obstacles} min={0} max={1} step={0.05} onChange={(obstacles) => setStyle({ obstacles }, 'obs')} fmt={(v) => (v < 0.02 ? 'NONE' : `${Math.round(v * 100)}%`)} />
        </div>
      )}
      {tab === 'race' && (
        <div>
          <Slider label="LAPS" value={doc.race.laps} min={1} max={8} step={1} onChange={(laps) => setRace({ laps }, 'laps')} />
          <Slider label="AI DIFFICULTY" value={doc.race.aiDifficulty} min={0} max={1} step={0.05} onChange={(aiDifficulty) => setRace({ aiDifficulty }, 'ai')} fmt={(v) => (v < 0.34 ? 'EASY' : v < 0.67 ? 'NORMAL' : 'HARD')} />
          <Slider label="MAX RACERS (INCL. YOU)" value={doc.race.maxRacers} min={1} max={4} step={1} onChange={(maxRacers) => setRace({ maxRacers, startSlot: Math.min(doc.race.startSlot, maxRacers) }, 'racers')} />
          <Slider label="YOUR STARTING POSITION" value={Math.min(doc.race.startSlot, doc.race.maxRacers)} min={1} max={doc.race.maxRacers} step={1} onChange={(startSlot) => setRace({ startSlot }, 'slot')} />
          <Slider label="TIME LIMIT" value={doc.race.timeLimit} min={0} max={1800} step={30} onChange={(timeLimit) => setRace({ timeLimit }, 'limit')} fmt={(v) => (v === 0 ? 'NONE' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`)} />
          <div className="mt-2 text-[10px] leading-relaxed text-cyan-100/60">Checkpoints: select a piece and press ⚑ Checkpoint in the Pieces tab (default: 3 evenly spaced).</div>
        </div>
      )}
      {tab === 'share' && (
        <div className="text-[11px]">
          <label className="mb-2 block text-[10px] tracking-[0.2em] text-cyan-100/80">TRACK NAME
            <input value={doc.name} maxLength={24} onChange={(e) => edit({ ...doc, name: e.target.value.toUpperCase() }, 'name')} className="mt-1 block w-full rounded border border-cyan-400/40 bg-black/40 px-2 py-1.5 font-display tracking-widest outline-none focus:border-cyan-300" />
          </label>
          <div className="mb-2 text-[10px] tracking-widest text-cyan-100/50">MAP ID <span className="select-all text-cyan-200">{doc.id}</span></div>
          <div className="mb-3 flex flex-wrap gap-1">
            <NeonButton size="sm" variant="primary" onClick={save}>Save to my tracks</NeonButton>
            <NeonButton size="sm" onClick={downloadJson}>Download .json</NeonButton>
            <NeonButton size="sm" onClick={async () => toast((await copyText(json)) ? 'JSON copied' : 'Copy failed', 'info')}>Copy JSON</NeonButton>
          </div>
          <div className="mb-1 text-[10px] tracking-[0.2em] text-cyan-100/80">SHARE CODE (WORKS OFFLINE)</div>
          <textarea readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} className="mb-1 w-full rounded border border-white/15 bg-black/40 p-1.5 font-mono text-[9px] text-cyan-100/80" />
          <NeonButton size="sm" className="mb-3" onClick={async () => toast((await copyText(code)) ? 'Share code copied' : 'Copy failed', 'info')}>Copy share code</NeonButton>
          <div className="mb-1 text-[10px] tracking-[0.2em] text-cyan-100/80">IMPORT SHARE CODE</div>
          <div className="mb-3 flex gap-1"><input value={codeText} onChange={(e) => setCodeText(e.target.value)} placeholder="NR1...." className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px]" /><NeonButton size="sm" onClick={() => startImport(fromShareCode(codeText))}>Preview</NeonButton></div>
          <div className="mb-1 text-[10px] tracking-[0.2em] text-cyan-100/80">IMPORT JSON</div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} placeholder="Paste track JSON here" className="mb-1 w-full rounded border border-white/15 bg-black/40 p-1.5 font-mono text-[9px]" />
          <div className="mb-3 flex gap-1">
            <NeonButton size="sm" onClick={() => startImport(importJson(importText))}>Preview</NeonButton>
            <label className="pointer-events-auto cursor-pointer rounded-lg border border-cyan-400/45 bg-void-800/70 px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] hover:bg-cyan-400/15">Open file
              <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 64 * 1024) toast('File too large', 'bad'); else startImport(importJson(await f.text())); } e.target.value = ''; }} />
            </label>
          </div>
          <div className="mb-1 text-[10px] tracking-[0.2em] text-cyan-100/80">ONLINE SHARING (YOUR OWN SERVER)</div>
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://192.168.1.20:8787" className="mb-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px]" />
          <div className="flex gap-1">
            <NeonButton size="sm" disabled={busy} onClick={upload}>Upload</NeonButton>
            <input value={serverCode} onChange={(e) => setServerCode(e.target.value.toUpperCase())} maxLength={6} placeholder="CODE" className="w-20 rounded border border-white/15 bg-black/40 px-2 py-1 text-center font-mono text-xs" />
            <NeonButton size="sm" disabled={busy} onClick={fetchByCode}>Download</NeonButton>
          </div>
          <div className="mt-1 text-[9px] text-cyan-100/45">Run it with: npx tsx server/share-server.ts (see README).</div>
          <div className="mb-1 mt-3 text-[10px] tracking-[0.2em] text-cyan-100/80">MY TRACKS ({saved.length})</div>
          <div className="grid gap-1">
            {saved.length === 0 && <div className="text-[10px] text-cyan-100/50">Nothing saved yet.</div>}
            {saved.map((t) => (
              <div key={t.id} className="flex items-center gap-1 rounded bg-white/5 px-2 py-1">
                <div className="min-w-0 flex-1 truncate font-display text-[11px] tracking-wider">{t.name} <span className="text-cyan-100/45">· {t.pieces.length}</span></div>
                <NeonButton size="sm" onClick={() => { replaceDoc(t); toast(`Loaded "${t.name}"`, 'good'); }}>Load</NeonButton>
                <NeonButton size="sm" variant="danger" onClick={() => { if (confirm(`Delete "${t.name}"?`)) setSaved(deleteTrack(t.id)); }}>✕</NeonButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <ScreenFrame title="TRACK EDITOR" subtitle={`${doc.name} · ${doc.pieces.length} pieces${shown.report.length ? ` · ${(shown.report.length / 1000).toFixed(2)} km` : ''}`} onBack={() => go('menu')} right={<Credits n={useGame.getState().save.credits} />}>
      <div className="pointer-events-none flex h-full min-h-0 flex-col gap-2 md:flex-row">
        <div className="pointer-events-none flex min-h-0 w-full flex-col gap-2 md:w-[min(22rem,38vw)]">
          <div className="pointer-events-auto flex flex-wrap gap-1">
            {tabBtn('pieces', 'Pieces')}{tabBtn('style', 'Style')}{tabBtn('race', 'Race')}{tabBtn('share', 'Save · Share')}
          </div>
          <Panel className="nr-scroll min-h-0 flex-1 p-3">{left}</Panel>
        </div>
        <div className="pointer-events-none flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1">
            <NeonButton size="sm" disabled={!hist.current.canUndo} onClick={undo}>↶ Undo</NeonButton>
            <NeonButton size="sm" disabled={!hist.current.canRedo} onClick={redo}>Redo ↷</NeonButton>
            <NeonButton size="sm" onClick={() => { if (!doc.pieces.length || confirm('Start a new empty track? (You can undo this)')) { replaceDoc(emptyDoc()); } }}>New</NeonButton>
            <NeonButton size="sm" onClick={() => replaceDoc(starterDoc())}>Starter</NeonButton>
            <NeonButton size="sm" onClick={() => setPlaying((p) => !p)}>{playing ? '■ Stop preview' : '▶ Preview lap'}</NeonButton>
            <NeonButton size="sm" variant="magenta" onClick={save}>Save</NeonButton>
            <div className="ml-auto flex gap-1">
              <NeonButton size="sm" variant="primary" disabled={!compiled.report.ok} onClick={() => test('quick')}>Test race</NeonButton>
              <NeonButton size="sm" disabled={!compiled.report.ok} onClick={() => test('trial')}>Solo lap</NeonButton>
            </div>
          </div>
          <Panel className="relative min-h-0 flex-1 overflow-hidden p-1">
            {view ? (
              <svg className="h-full w-full" viewBox={`0 0 ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet">
                <defs>
                  <pattern id="grid" width={view.step} height={view.step} patternUnits="userSpaceOnUse" x={view.pad - (view.x0 % view.step)} y={view.pad - (view.z0 % view.step)}>
                    <path d={`M ${view.step} 0 L 0 0 0 ${view.step}`} fill="none" stroke="rgba(120,200,255,0.12)" strokeWidth={1} />
                  </pattern>
                </defs>
                <rect width={view.w} height={view.h} fill="url(#grid)" />
                {view.groups.map((g, i) => (
                  <polyline key={i} points={g.d} fill="none" strokeLinecap="round" strokeLinejoin="round"
                    stroke={g.piece < 0 ? 'rgba(160,190,255,0.35)' : PIECE_COLOR[shownDoc.pieces[g.piece]?.type ?? 'straight']}
                    strokeWidth={!incoming && g.piece === sel ? Math.max(view.w, view.h) / 55 : Math.max(view.w, view.h) / 120} opacity={!incoming && sel >= 0 && g.piece !== sel ? 0.55 : 1} />
                ))}
                {shown.preview[0] && <g><circle cx={shown.preview[0].x - view.x0 + view.pad} cy={shown.preview[0].z - view.z0 + view.pad} r={Math.max(view.w, view.h) / 70} fill="#b6ff3b" /><text x={shown.preview[0].x - view.x0 + view.pad + 8} y={shown.preview[0].z - view.z0 + view.pad - 8} fontSize={Math.max(view.w, view.h) / 45} fill="#b6ff3b">START</text></g>}
                {playing && dotPt && <circle cx={dotPt.x - view.x0 + view.pad} cy={dotPt.z - view.z0 + view.pad} r={Math.max(view.w, view.h) / 55} fill="#fff" />}
              </svg>
            ) : <div className="flex h-full items-center justify-center text-xs tracking-widest text-cyan-100/50">ADD PIECES TO SEE YOUR TRACK</div>}
            {incoming && (
              <div className="absolute inset-x-2 top-2 rounded-lg border border-amber-300/60 bg-black/80 p-2 text-[11px]">
                <div className="font-display text-xs font-bold tracking-widest text-amber-200">SHARED TRACK PREVIEW · {incoming.doc.name} · {incoming.doc.env.toUpperCase()} · {incoming.doc.pieces.length} pieces</div>
                {incomingCompiled && !incomingCompiled.report.ok && <div className="mt-1 text-red-300">Not playable: {incomingCompiled.report.errors[0]}</div>}
                {incoming.errors.map((e) => <div key={e} className="text-red-300">{e}</div>)}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <NeonButton size="sm" variant="primary" disabled={!incomingCompiled?.report.ok} onClick={() => { replaceDoc(incoming.doc); setIncoming(null); toast('Loaded into the editor', 'good'); }}>Load into editor</NeonButton>
                  <NeonButton size="sm" disabled={!incomingCompiled?.report.ok} onClick={() => { setSaved(saveTrack(incoming.doc)); setIncoming(null); toast('Saved to my tracks', 'good'); }}>Save a copy</NeonButton>
                  <NeonButton size="sm" variant="danger" onClick={() => setIncoming(null)}>Dismiss</NeonButton>
                </div>
              </div>
            )}
          </Panel>
          {/* piece strip */}
          <div className="nr-scroll pointer-events-auto flex gap-1 overflow-x-auto pb-1">
            {doc.pieces.map((p, i) => (
              <button key={i} onClick={() => setSel(i === sel ? -1 : i)} className={`flex min-w-[3.2rem] flex-col items-center rounded-lg border px-2 py-1 transition ${i === sel ? 'border-cyan-300 bg-cyan-400/15 shadow-neon' : 'border-white/10 hover:border-cyan-400/40'}`}>
                <span className="text-lg leading-none" style={{ color: PIECE_COLOR[p.type] }}>{PIECES[p.type].icon}</span>
                <span className="text-[8px] tracking-widest text-cyan-100/70">{i + 1}{TURNY.includes(p.type) ? (p.dir === 1 ? '↺' : '↻') : ''}{p.cp ? '⚑' : ''}</span>
              </button>
            ))}
            {doc.pieces.length === 0 && <div className="py-3 text-[10px] tracking-widest text-cyan-100/50">NO PIECES YET</div>}
          </div>
          <div className="pointer-events-none min-h-[1.4rem] text-[11px] tracking-wider">
            {compiled.report.ok ? <span className="text-lime-300">✔ Valid track · {(compiled.report.length / 1000).toFixed(2)} km · closes {compiled.report.closureError.toFixed(1)} m · clearance {compiled.report.minSeparation.toFixed(0)} m</span> : <span className="text-red-300">✖ {errs[0]}</span>}
            {warns[0] && <span className="ml-3 text-amber-300">⚠ {warns[0]}</span>}
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}
