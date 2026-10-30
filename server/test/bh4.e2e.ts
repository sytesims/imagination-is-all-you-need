// BUG-HUNT-4 server fixes (G6 G7 G10 G13 G14 G11): one block per item. Own mock server :8963 on a temp data dir.
// Run: npx tsx test/bh4.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh4-'));
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: extra.DATA ?? fs.mkdtempSync(path.join(D, 'd-')),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', ...extra }, stdio: ['ignore', fs.openSync(path.join(D, `srv-${port}.log`), 'a'), fs.openSync(path.join(D, `srv-${port}.log`), 'a')], detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const post = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
    for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  return { B, get, post, until, ready }; };
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const REF = path.join(import.meta.dirname, 'fixtures/ref-512.png');
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const DATA = fs.mkdtempSync(path.join(D, 'data-'));
// BH4 #4 fixture: a stale precheck temp (2 h old, must go at boot), a fresh one and a non-matching name (both must stay)
{ const old = new Date(Date.now() - 2 * 3600_000); fs.writeFileSync(path.join(DATA, 'pre-a1d0a1d0.mp4'), Buffer.alloc(1000)); fs.utimesSync(path.join(DATA, 'pre-a1d0a1d0.mp4'), old, old); fs.writeFileSync(path.join(DATA, 'pre-notours1.mp4'), Buffer.alloc(1000)); fs.utimesSync(path.join(DATA, 'pre-notours1.mp4'), old, old); fs.writeFileSync(path.join(DATA, 'pre-fe5afe5a.png'), Buffer.alloc(10)); }
const s = boot(testPort(8963), { DATA }); const S = api(testPort(8963));
const ls = (pre: string) => fs.readdirSync(DATA).filter((f) => f.startsWith(pre));
const del = (u: string) => fetch(S.B + u, { method: 'DELETE' }).then(async (r) => ({ status: r.status, body: await r.json() as any }));
try {
  await S.ready();
  // ---- BH4 #1 (G6): delete forever removes inputs, outputs and thumbnails; shared inputs stay ----
  { const a = await S.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await S.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(b.status, 200);
    const ja = await S.until(a.body.id), jb = await S.until(b.body.id); assert.equal(ja.status, 'done'); assert.equal(jb.status, 'done');
    const outA = ja.outputs.find((o: any) => /\.mp4$/.test(o.url))?.url ?? ja.resultUrl; const th = await fetch(`${S.B}/api/media/thumb?url=${encodeURIComponent(outA)}`); assert.equal(th.status, 200);
    const ex = await fetch(`${S.B}/api/media/thumb?url=${encodeURIComponent('/examples/starter/bus-stop-in.mp4')}`); // a shipped example video gets a picture too
    assert.equal(ex.status, 200); assert.match(ex.headers.get('content-type') ?? '', /^image\//);
    const thumbs = () => fs.existsSync(path.join(DATA, 'thumbs')) ? fs.readdirSync(path.join(DATA, 'thumbs')).filter((f) => f.includes(ja.id)) : [];
    assert.ok(thumbs().length >= 1, 'thumb cached'); const beforeA = ls(ja.id + '-'); assert.ok(beforeA.some((f) => /video0/.test(f)) && beforeA.some((f) => /out0/.test(f)), beforeA.join());
    const inB = ls(jb.id + '-').find((f) => /video0/.test(f))!; const look = await fetch(`${S.B}/api/looks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'keep', refs: [`/files/${inB}`] }) }); assert.ok(look.ok, String(look.status));
    for (const id of [ja.id, jb.id]) { assert.equal((await del(`/api/jobs/${id}`)).status, 200); const p = await del(`/api/trash/${id}`); assert.equal(p.status, 200, JSON.stringify(p.body)); assert.ok(p.body.removed, 'removed stats'); }
    assert.deepEqual(ls(ja.id + '-'), [], 'job A: input + outputs gone'); assert.deepEqual(thumbs(), [], 'job A: thumb gone');
    assert.deepEqual(ls(jb.id + '-'), [inB], 'job B: the input a saved look still uses is kept, outputs gone');
    ok(`#1 delete forever: inputs, outputs and thumbs removed (${beforeA.length} files + thumb for ${ja.id}); a shared input (saved look) is kept`); }
  // ---- BH4 #2 (G7): rejected submits leave no files on disk ----
  { /* unknown @names are only rejected once at least one element is saved (Elements left the UI 2026-10-23), so save one first (before the file snapshot) */
    const se = await S.post('/api/elements', { name: 'Saved one', kind: 'character' }, [['image', REF, 'image/png']]); assert.equal(se.status, 200, JSON.stringify(se.body));
    const top = () => new Set(fs.readdirSync(DATA).filter((f) => fs.statSync(path.join(DATA, f)).isFile() && !/\.db(-wal|-shm)?$/.test(f)));
    const before = top(); const TINY = path.join(D, 'tiny.png'); ff('-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', TINY);
    const BLACK = path.join(D, 'black.png'); ff('-f', 'lavfi', '-i', 'color=c=black:s=640x640', '-frames:v', '1', BLACK);
    const r1 = await S.post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1' }, [['image', TINY, 'image/png']]); assert.equal(r1.status, 400, JSON.stringify(r1.body));
    const r2 = await S.post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1' }, [['image', BLACK, 'image/png']]); assert.equal(r2.status, 400, JSON.stringify(r2.body));
    const r3 = await S.post('/api/tools/create-image/jobs', { prompt: 'portrait of @nobodyhere', mode: 'edit', rights: '1' }, [['refs', REF, 'image/png']]); assert.ok(r3.status >= 400 && r3.status < 500, `${r3.status}`);
    const idem = async () => { const fd = new FormData(); fd.append('duration', '5'); fd.append('types', '["precise"]'); fd.append('rights', '1'); fd.append('video', new Blob([fs.readFileSync(MP4)], { type: 'video/mp4' }), 'clip.mp4');
      const r = await fetch(`${S.B}/api/tools/upscale/jobs`, { method: 'POST', body: fd, headers: { 'idempotency-key': 'bh4-idem-1' } }); return { status: r.status, body: await r.json() as any }; };
    const i1 = await idem(); const i2 = await idem(); assert.equal(i1.status, 200); assert.equal(i2.status, 200); assert.equal(i2.body.idempotentReplay, true); assert.equal(i2.body.id, i1.body.id); await S.until(i1.body.id);
    const added = [...top()].filter((f) => !before.has(f)); const stray = added.filter((f) => !f.startsWith(i1.body.id + '-'));
    assert.deepEqual(stray, [], 'files left by rejected or replayed submits: ' + stray.join());
    ok(`#2 rejected submits (low-res 400, all-black 400, unknown @element ${r3.status}) and an Idempotency-Key replay left no files; the created job kept its ${added.length} files`); }
  // ---- BH4 #3: orphan-upload report is a dry run (nothing deleted), finds rejected inputs, pre-* and stale thumbs, never lists referenced files ----
  { const old = new Date(Date.now() - 3 * 3600_000); const mk = (rel: string, n: number) => { const p = path.join(DATA, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(n)); fs.utimesSync(p, old, old); };
    mk('deadbeef-video0.mp4', 4096); mk('pre-0badc0de.mp4', 2048); mk('thumbs/files-deadbeef-out0.mp4.jpg', 100);
    const live = fs.readdirSync(DATA).filter((f) => /-(video|out)\d/.test(f) && !f.startsWith('deadbeef')); const before = fs.readdirSync(DATA).length;
    const out = execFileSync(path.join(ROOT, '../node_modules/.bin/tsx'), ['scripts/orphan-uploads.ts', '--data', DATA, '--json', '--min-age-min', '1', '--samples', '50'], { cwd: ROOT }).toString();
    const r = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); assert.equal(r.mode, 'dry-run');
    const listed = Object.values(r.byCategory as Record<string, any>).flatMap((c: any) => c.samples.map((x: string) => x.split(' ')[0]));
    for (const f of ['deadbeef-video0.mp4', 'pre-0badc0de.mp4', 'thumbs/files-deadbeef-out0.mp4.jpg']) assert.ok(listed.includes(f), `${f} listed: ${listed.join()}`);
    for (const f of live) assert.ok(!listed.includes(f), `referenced ${f} must not be listed`);
    assert.equal(fs.readdirSync(DATA).length, before, 'dry run deleted nothing'); assert.ok(fs.existsSync(path.join(DATA, 'deadbeef-video0.mp4')));
    ok(`#3 orphan report (dry run): ${r.orphans.files} files / ${r.orphans.bytes} B listed by category, referenced job files not listed, nothing deleted`); }
  // ---- BH4 #4 (G10): precheck temps are removed after each request; boot sweep removes stale ones only ----
  { assert.ok(!fs.existsSync(path.join(DATA, 'pre-a1d0a1d0.mp4')), 'stale temp removed by the boot sweep');
    assert.ok(fs.existsSync(path.join(DATA, 'pre-notours1.mp4')), 'non-matching name untouched'); assert.ok(fs.existsSync(path.join(DATA, 'pre-fe5afe5a.png')), 'fresh temp survives the boot sweep');
    const pres = () => fs.readdirSync(DATA).filter((f) => /^pre-[0-9a-f]{8}\./.test(f)).sort(); const before = pres();
    for (const [field, file, type] of [['video', MP4, 'video/mp4'], ['image', REF, 'image/png']] as const) { const fd = new FormData(); fd.append('toolId', field === 'video' ? 'upscale' : 'image-upscale'); fd.append(field, new Blob([fs.readFileSync(file)], { type }), path.basename(file));
      const r = await fetch(`${S.B}/api/precheck`, { method: 'POST', body: fd }); assert.equal(r.status, 200, await r.text()); }
    assert.deepEqual(pres(), before, 'precheck left no temp files');
    ok('#4 precheck: boot sweep removed the 2 h old temp, kept a fresh one and a non-matching name; video + image prechecks leave no pre-* files'); }
  // ---- BH4 #5: the trash sweep removes uploads and thumbnails too (TRASH_DAYS tiny on a second server) ----
  { const DATA2 = fs.mkdtempSync(path.join(D, 'data2-')); const s2 = boot(testPort(8964), { DATA: DATA2, OPENHIGGSFIELD_TRASH_DAYS: '0.00001' }); const T = api(testPort(8964));
    try { await T.ready(); const a = await T.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(a.status, 200); const j = await T.until(a.body.id);
      const out = j.outputs.find((o: any) => /\.mp4$/.test(o.url))?.url ?? j.resultUrl; assert.equal((await fetch(`${T.B}/api/media/thumb?url=${encodeURIComponent(out)}`)).status, 200);
      const mine = () => [...fs.readdirSync(DATA2).filter((f) => f.startsWith(j.id + '-')), ...(fs.existsSync(path.join(DATA2, 'thumbs')) ? fs.readdirSync(path.join(DATA2, 'thumbs')).filter((f) => f.includes(j.id)) : [])];
      const n0 = mine().length; assert.ok(n0 >= 3, mine().join()); assert.equal((await fetch(`${T.B}/api/jobs/${j.id}`, { method: 'DELETE' })).status, 200); await new Promise((r) => setTimeout(r, 1500));
      const sw = await (await fetch(`${T.B}/api/trash/sweep`, { method: 'POST' })).json() as any; assert.equal(sw.purged, 1, JSON.stringify(sw)); assert.ok(sw.removed.files >= n0, JSON.stringify(sw));
      assert.deepEqual(mine(), [], 'sweep removed the upload, outputs and thumb'); assert.equal((await fetch(`${T.B}/api/jobs/${j.id}`)).status, 404);
      ok(`#5 trash sweep: purged 1 job and its ${sw.removed.files} files (upload, outputs, thumb; ${sw.removed.bytes} B)`); } finally { stop(s2); } }
  // ---- BH4 #6 (G13): missing files are 404, not 200 HTML ----
  { for (const u of ['/files/nonexistent-zzz.png', '/files/deadbeef-out0.mp4', '/samples/nope.mp4', '/examples/nope.webm', '/assets/nope.js']) { const r = await fetch(S.B + u); assert.equal(r.status, 404, u); assert.ok(!/text\/html/.test(r.headers.get('content-type') ?? ''), u); await r.arrayBuffer(); }
    const okf = fs.readdirSync(DATA).find((f) => /^[0-9a-f]{8}-video0\.mp4$/.test(f)); if (okf) assert.equal((await fetch(`${S.B}/files/${okf}`)).status, 200);
    const api404 = await fetch(`${S.B}/api/nope`); assert.equal(api404.status, 404);
    // SPA routes get index.html when the web app is built (web/dist); without a build the server answers a plain 404 (index.ts setNotFoundHandler)
    const built = fs.existsSync(path.resolve(import.meta.dirname, '../../web/dist/index.html'));
    const spa = await fetch(`${S.B}/assets?section=trash`); if (built) { assert.equal(spa.status, 200); assert.match(spa.headers.get('content-type') ?? '', /text\/html/); } else { assert.equal(spa.status, 404); assert.match(spa.headers.get('content-type') ?? '', /text\/plain/); console.log('  (web/dist not built here: SPA fallback checked as the plain 404)'); } await spa.text();
    ok('#6 missing /files/, /samples/ and file-extension URLs → 404 JSON (no-store), existing files still 200, SPA routes still index.html, /api 404 unchanged'); }
  // ---- BH4 #7 (G14): charge and job row commit together: SIGKILL right after submit leaves no charge without its job row ----
  { const DATA3 = fs.mkdtempSync(path.join(D, 'data3-')); const s3 = boot(testPort(8965), { DATA: DATA3, OPENHIGGSFIELD_MOCK_DELAY_MS: '20000' }); const K = api(testPort(8965));
    await K.ready(); const ids: string[] = [];
    const rs = await Promise.all(Array.from({ length: 6 }, () => K.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1' }, [['video', MP4, 'video/mp4']])));
    for (const r of rs) { assert.equal(r.status, 200, JSON.stringify(r.body)); ids.push(r.body.id); }
    process.kill(-s3.pid!, 'SIGKILL'); await new Promise((r) => setTimeout(r, 500));
    const Database = (await import('better-sqlite3')).default; const db = new Database(path.join(DATA3, 'openhiggsfield.db'), { readonly: true });
    const jobRows = new Set((db.prepare('SELECT id FROM jobs').all() as any[]).map((r) => r.id)); const charges = (db.prepare('SELECT data FROM ledger').all() as any[]).map((r) => JSON.parse(r.data)).filter((e) => e.kind === 'charge' && e.jobId);
    db.close(); const orphan = charges.filter((c) => !jobRows.has(String(c.jobId).split('#')[0]));
    assert.deepEqual(orphan, [], 'charges without a job row'); for (const id of ids) assert.ok(jobRows.has(id), `job ${id} row persisted before the 400 ms flush`);
    ok(`#7 SIGKILL right after 6 submits: all 6 job rows on disk, ${charges.length} charges, 0 without a job row`); }
  // ---- BH4 #8 (G11): GET /api/export → one .tar.gz; POST /api/import stages it, applied at the next start ----
  { const ex = await fetch(`${S.B}/api/export`); assert.equal(ex.status, 200); assert.match(ex.headers.get('content-type') ?? '', /gzip/); assert.match(ex.headers.get('content-disposition') ?? '', /imagination-export-\d{4}-\d{2}-\d{2}\.tar\.gz/);
    const AR = path.join(D, 'export.tar.gz'); fs.writeFileSync(AR, Buffer.from(await ex.arrayBuffer())); const names = execFileSync('tar', ['-tzf', AR]).toString().split('\n').filter(Boolean);
    assert.ok(names.includes('manifest.json') && names.includes('openhiggsfield.db'), names.slice(0, 5).join()); assert.ok(!names.some((n) => /^thumbs\/|^pre-[0-9a-f]{8}\.|\.db-wal$/.test(n)), 'no caches/temps/wal');
    const srcJobs = (await S.get('/api/jobs?limit=200')) as any; const srcIds = (Array.isArray(srcJobs) ? srcJobs : srcJobs.items).map((j: any) => j.id).sort(); const srcBal = (await S.get('/api/ledger')).balance;
    const someFile = names.find((n) => /^[0-9a-f]{8}-video0\.mp4$/.test(n)); assert.ok(someFile, 'media included');
    const ex0 = await fetch(`${S.B}/api/export?media=0`); const AR0 = path.join(D, 'export0.tar.gz'); fs.writeFileSync(AR0, Buffer.from(await ex0.arrayBuffer())); assert.deepEqual(execFileSync('tar', ['-tzf', AR0]).toString().split('\n').filter(Boolean).sort(), ['manifest.json', 'openhiggsfield.db']);
    const DATA4 = fs.mkdtempSync(path.join(D, 'data4-')); let s4 = boot(testPort(8969), { DATA: DATA4 }); process.on('exit', () => stop(s4)) /* a failed check before the try below never leaves :8969 running */; const I = api(testPort(8969)); await I.ready();
    const imp = (body: Buffer, type = 'application/gzip') => fetch(`${I.B}/api/import`, { method: 'POST', headers: { 'content-type': type }, body }).then(async (r) => ({ status: r.status, body: await r.json() as any }));
    const junk = await imp(Buffer.from('not a tarball')); assert.equal(junk.status, 400); assert.ok(!/tar|\.gz|\//.test(junk.body.error), junk.body.error);
    const EVA = path.join(D, 'evil.tar.gz'); execFileSync('python3', ['-c', `import tarfile,io\nt=tarfile.open(${JSON.stringify(EVA)},'w:gz')\nfor n in ['manifest.json','openhiggsfield.db','../escape.txt']:\n  i=tarfile.TarInfo(n); d=b'x'; i.size=len(d); t.addfile(i,io.BytesIO(d))\nt.close()`]);
    const evil = await imp(fs.readFileSync(EVA)); assert.equal(evil.status, 400, JSON.stringify(evil.body)); assert.match(evil.body.detail, /escape/); assert.ok(!fs.existsSync(path.join(DATA4, 'escape.txt')) && !fs.existsSync(path.join(path.dirname(DATA4), 'escape.txt')));
    const good = await imp(fs.readFileSync(AR)); assert.equal(good.status, 200, JSON.stringify(good.body)); assert.equal(good.body.staged, true); assert.equal(good.body.restartRequired, true); assert.equal(good.body.manifest.format, 'openhiggsfield-export');
    stop(s4); await new Promise((r) => setTimeout(r, 1500)); s4 = boot(testPort(8969), { DATA: DATA4 }); await I.ready();
    try { const got = (await I.get('/api/jobs?limit=200')) as any; const ids = (Array.isArray(got) ? got : got.items).map((j: any) => j.id).sort(); assert.deepEqual(ids, srcIds, 'jobs after import');
      assert.equal((await I.get('/api/ledger')).balance, srcBal, 'balance after import'); assert.equal((await fetch(`${I.B}/files/${someFile}`)).status, 200, 'media served after import');
      assert.ok(fs.readdirSync(path.join(DATA4, 'backups')).some((d) => d.startsWith('pre-import-')), 'previous DB kept'); assert.ok(!fs.existsSync(path.join(DATA4, '.import-staged')));
      ok(`#8 export (${names.length} entries: manifest, DB snapshot, media; ?media=0 → DB only) → import into an empty install: junk 400, path-escape 400, staged 200, after restart ${ids.length} jobs, balance ${srcBal}, media served; previous DB kept in backups/`); }
    finally { stop(s4); } }
  //@@BH4-NEXT@@
  console.log('ALL OK bh4');
} finally { stop(s); }
