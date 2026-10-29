// Media picker (2026-10-25): one copy per file and library references. Own mock server on a temp data dir.
//  - POST /api/media is content-addressed: the same file twice is one Uploads entry (upl-<hash16>).
//  - Job uploads with the same bytes are hard links to one copy; the Uploads tab lists the file once.
//  - Copies stored before content addressing fold into one entry (foldKeys, in process).
//  - `@file:<field>` = /files/<name> reuses a library file (upload or generation) with no re-upload; unknown / outside files → 400.
// Run: npx tsx test/media-picker.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mpick-')); const DATA = fs.mkdtempSync(path.join(D, 'data-')); const PORT = testPort(8805); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const REF = path.join(import.meta.dirname, 'fixtures/ref-512.png');
const WAV = path.join(D, 'tone.wav'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=4', WAV]);

// ---- in process: foldKeys groups copies made before content addressing (different inodes, same bytes) ----
{ const L = fs.mkdtempSync(path.join(D, 'legacy-')); process.env.OPENHIGGSFIELD_DATA_DIR = L;
  const MS = await import('../src/mediaStore.ts');
  fs.copyFileSync(REF, path.join(L, 'aaaaaaaa-image0.png')); fs.copyFileSync(REF, path.join(L, 'bbbbbbbb-image0.png')); fs.linkSync(path.join(L, 'aaaaaaaa-image0.png'), path.join(L, 'cccccccc-image0.png'));
  fs.writeFileSync(path.join(L, 'dddddddd-image0.png'), Buffer.alloc(fs.statSync(REF).size, 7)); // same size, other bytes
  const k = await MS.foldKeys(['aaaaaaaa-image0.png', 'bbbbbbbb-image0.png', 'cccccccc-image0.png', 'dddddddd-image0.png']);
  assert.equal(k.get('aaaaaaaa-image0.png'), k.get('bbbbbbbb-image0.png'), 'copies fold'); assert.equal(k.get('aaaaaaaa-image0.png'), k.get('cccccccc-image0.png'), 'hard links fold');
  assert.notEqual(k.get('aaaaaaaa-image0.png'), k.get('dddddddd-image0.png'), 'other bytes stay apart');
  ok('foldKeys: legacy copies + hard links fold into one entry, other content of the same size stays separate'); }

const srv: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_USE_LOCAL: '0' },
  stdio: ['ignore', fs.openSync(path.join(D, 'srv.log'), 'a'), fs.openSync(path.join(D, 'srv.log'), 'a')], detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const post = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const ino = (rel: string) => fs.statSync(path.join(DATA, rel)).ino;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  // ---- POST /api/media: same file twice → one upload ----
  { const a = await post('/api/media', {}, [['file', REF, 'image/png']]); assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await post('/api/media', {}, [['file', REF, 'image/png']]); assert.equal(b.status, 200);
    assert.equal(a.body.items[0].url, b.body.items[0].url, 'content-addressed url'); assert.match(a.body.items[0].url, /^\/files\/upl-[0-9a-f]{16}\.png$/); assert.equal(b.body.items[0].existing, true);
    const m = await get('/api/media?tab=uploads&type=image&pageSize=100'); assert.equal(m.total, 1, JSON.stringify(m.items.map((x: any) => x.url)));
    assert.equal(fs.readdirSync(DATA).filter((f) => f.startsWith('upl-tmp-')).length, 0, 'no temp left');
    ok(`POST /api/media twice with the same file → one entry (${a.body.items[0].url})`); }
  // ---- job uploads with the same bytes → hard links; Uploads lists the file once ----
  let genUrl = ''; let firstIn = '';
  { const ids: string[] = [];
    for (let i = 0; i < 2; i++) { const r = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1' }, [['image', REF, 'image/png']]); assert.equal(r.status, 200, JSON.stringify(r.body)); ids.push(r.body.id); }
    const js = await Promise.all(ids.map(until)); js.forEach((j) => assert.equal(j.status, 'done', j.error));
    const ins = ids.map((id) => fs.readdirSync(DATA).find((f) => f.startsWith(`${id}-image0`))!); firstIn = ins[0];
    assert.equal(ino(ins[0]), ino(ins[1]), 'second job input is a hard link to the first');
    const up = fs.readdirSync(DATA).find((f) => /^upl-[0-9a-f]{16}\.png$/.test(f))!; assert.equal(ino(up), ino(ins[0]), 'job input links to the earlier upload');
    const m = await get('/api/media?tab=uploads&type=image&pageSize=100'); assert.equal(m.total, 1, JSON.stringify(m.items.map((x: any) => x.url)));
    assert.equal(m.items[0].uses, 3, 'one entry, three uses'); assert.match(m.items[0].url, /upl-/, 'the upload row names the entry');
    genUrl = js[0].outputs.find((o: any) => /\.(png|jpe?g|webp)$/i.test(o.url))?.url ?? js[0].resultUrl; assert.ok(genUrl?.startsWith('/files/'), String(genUrl));
    const g = await get('/api/media?tab=generations&type=image'); assert.ok(g.items.some((x: any) => x.url === genUrl && x.toolName), 'generation listed with its feature name');
    ok(`two jobs with the same photo → one file on disk (hard links), Uploads shows it once (uses=3)`); }
  // ---- @file: reuse a generation with no re-upload ----
  { const before = (await get('/api/media?tab=uploads&type=image&pageSize=100')).total;
    const r = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1', '@file:image': genUrl }); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await until(r.body.id); assert.equal(j.status, 'done', j.error);
    const inName = fs.readdirSync(DATA).find((f) => f.startsWith(`${r.body.id}-image0`))!; assert.equal(ino(inName), ino(genUrl.slice(7)), 'input is the generation itself (linked)');
    assert.equal((await get('/api/media?tab=uploads&type=image&pageSize=100')).total, before, 'a library pick is not a new upload');
    const r2 = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1', '@file:image': `/files/${firstIn}` }); assert.equal(r2.status, 200, 'an earlier job input is reusable');
    ok('@file:image = a generation → job runs on the same file (hard link), Uploads unchanged; an earlier input works too'); }
  // ---- @file: refused for files outside the library ----
  { fs.copyFileSync(REF, path.join(DATA, 'stray.png'));
    for (const u of ['/files/stray.png', '/files/../openhiggsfield.db', '/files/nope.png', 'https://example.com/x.png', '/samples/x.png']) {
      const r = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1', '@file:image': u }); assert.equal(r.status, 400, `${u}: ${r.status}`); }
    const bad = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1', '@file:video': genUrl }); assert.equal(bad.status, 400, 'an image in a video field is refused');
    ok('@file: outside the library (stray file, .., missing, remote, samples) → 400; wrong media type for the field → 400'); }
  // ---- type filters: audio only with type=audio; image,video together ----
  { const a = await post('/api/media', {}, [['file', WAV, 'audio/wav']]); assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal((await get('/api/media?tab=uploads&type=audio')).total, 1); assert.equal((await get('/api/media?tab=uploads&type=image')).total, 1);
    assert.equal((await get('/api/media?tab=uploads&type=image,audio')).total, 2); assert.equal((await get('/api/media?tab=uploads')).total, 1, 'audio stays out of the default listing');
    ok('type=audio lists voice samples; type=image,audio lists both; default listing unchanged'); }
  console.log('media-picker: all ok');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
