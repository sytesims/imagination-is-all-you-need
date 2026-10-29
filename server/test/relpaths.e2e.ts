// BUG-HUNT-8 P1: job rows store media paths relative to the data dir. Seeds a temp data dir with job rows written by another host
// (/old/host/openjutsu/server/data/..., …/openhiggsfield/server/data/..., Docker /data/...), boots the server and checks:
// boot migration (rows relative, kv record, idempotent on a 2nd boot), live jobs resolve under the new data dir, a retry of the old job
// resolves its inputs and runs, /files serving, new jobs are stored relative, export excludes orphans (manifest excluded[]).
// Run: npx tsx test/relpaths.e2e.ts (port 8978; temp data dir).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'relp-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(8978); const B = `http://localhost:${PORT}`;
const OLD = '/old/host/openjutsu/server/data/'; const OLD2 = '/srv/x/openhiggsfield/server/data/';
// media: a real tiny mp4 + png; an orphan (old mtime); a young unreferenced file (kept)
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '1', '-pix_fmt', 'yuv420p', path.join(D, 'aaaa0001-video0.mp4')]);
fs.copyFileSync(path.join(ROOT, 'test/fixtures/ref-512.png'), path.join(D, 'aaaa0001-refs1.png'));
fs.copyFileSync(path.join(ROOT, 'test/fixtures/ref-512.png'), path.join(D, 'bbbb0002-refs1.png'));
fs.mkdirSync(path.join(D, 'voice-previews')); fs.writeFileSync(path.join(D, 'voice-previews/old.wav'), 'x');
fs.writeFileSync(path.join(D, 'el-gone.png'), 'orphan'); const old = new Date(Date.now() - 3600_000);
for (const f of ['el-gone.png', 'voice-previews/old.wav']) fs.utimesSync(path.join(D, f), old, old);
fs.writeFileSync(path.join(D, 'upl-inflight.png'), 'young');
const job = (id: string, pre: string, extra: any = {}) => ({ id, toolId: 'object-swap', provider: 'comfy-open', status: 'failed', stage: 'failed', progress: 50, queuePos: 0, eta: 0, resultUrl: null, outputs: [],
  error: `ENOENT: no such file or directory, open '${pre}${id}-video0.mp4'`, errorType: 'temporary', warnings: [], parentId: null, createdAt: Date.now() - 7200_000,
  input: { videoPath: `${pre}${id}-video0.mp4`, videoUrl: `/files/${id}-video0.mp4`, duration: 1, width: 320, height: 180, hasAudio: false, refPaths: [`${pre}${id}-refs1.png`], refUrls: [`/files/${id}-refs1.png`],
    imagePath: `${pre}${id}-refs1.png`, refBatches: [[`${pre}${id}-refs1.png`]], refGroupLabels: ['Refs 1–1'], pinned: [], prompt: 'relpaths swap', preset: 'outfit', resolution: '720p', seed: 1, warnings: [], draft: false,
    keepAudio: true, mentions: [], simulate: '', simulateGroup: 0, mode: 'object_swap', target: '', point: null, count: 1, elements: [], hostedLoras: [{ path: 'https://example.com/x.safetensors' }], audioPath: '', ...extra },
  cost: 0, refunded: 0, lane: 'paid', etaInitial: 0, routing: { modelId: 'comfy-open', mode: 'pinned', allowFallback: false, order: ['local:comfy-open'], prices: { 'local:comfy-open': 0 } }, route: 'local:comfy-open', routeAttempts: [] });
fs.copyFileSync(path.join(D, 'aaaa0001-video0.mp4'), path.join(D, 'bbbb0002-video0.mp4'));
{ const db = new Database(path.join(D, 'openhiggsfield.db')); for (const t of ['jobs', 'ledger', 'job_meta', 'projects', 'elements', 'kv', 'uploads']) db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  const ins = db.prepare('INSERT INTO jobs (id, data) VALUES (?, ?)'); ins.run('aaaa0001', JSON.stringify(job('aaaa0001', OLD))); ins.run('bbbb0002', JSON.stringify(job('bbbb0002', OLD2, { voiceSamplePaths: ['/data/bbbb0002-refs1.png'] }))); db.close(); }
const rows = () => { const db = new Database(path.join(D, 'openhiggsfield.db'), { readonly: true }); const r = db.prepare('SELECT id, data FROM jobs').all() as any[]; const kv = db.prepare("SELECT data FROM kv WHERE id='migration:relativeMediaPaths'").get() as any; db.close(); return { r, kv: kv ? JSON.parse(kv.data) : null }; };
const ABS = /"\/[^"]*\/(server\/)?data\/|\/old\/host|\/srv\/x/;
const boot = () => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('no server'); };
const down = async (p: any) => { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* */ } for (let i = 0; i < 40; i++) { try { await fetch(`${B}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 250)); } };
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
let p = boot();
try {
  await up();
  // ---- migration ----
  const a = rows(); assert.ok(a.r.some((r: any) => r.id === 'aaaa0001') && a.r.some((r: any) => r.id === 'bbbb0002')); for (const r of a.r) assert.ok(!ABS.test(r.data), `row ${r.id} still absolute: ${r.data.slice(0, 300)}`);
  const ja = JSON.parse(a.r.find((r: any) => r.id === 'aaaa0001').data); assert.equal(ja.input.videoPath, 'aaaa0001-video0.mp4'); assert.deepEqual(ja.input.refBatches, [['aaaa0001-refs1.png']]);
  assert.equal(ja.input.hostedLoras[0].path, 'https://example.com/x.safetensors'); assert.equal(ja.input.audioPath, ''); assert.equal(ja.error, "ENOENT: no such file or directory, open 'aaaa0001-video0.mp4'");
  const jb = JSON.parse(a.r.find((r: any) => r.id === 'bbbb0002').data); assert.deepEqual(jb.input.voiceSamplePaths, ['bbbb0002-refs1.png']);
  assert.ok(a.kv && a.kv.runs.length === 1 && a.kv.runs[0].rows === 2 && a.kv.runs[0].values === 9, JSON.stringify(a.kv)); ok(`migration: 2 rows / ${a.kv.runs[0].values} values relative; kv ${JSON.stringify(a.kv.runs[0].prefixes)}`);
  // ---- live map resolves under the current data dir ----
  // ---- retry of an old job resolves its inputs and runs ----
  const rr = await fetch(`${B}/api/jobs/aaaa0001/retry`, { method: 'POST' }); const rj = (await rr.json()) as any; assert.equal(rr.status, 200, JSON.stringify(rj));
  let nj: any; for (let i = 0; i < 120; i++) { nj = await get(`/api/jobs/${rj.id}`); if (['done', 'failed'].includes(nj.status)) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(nj.status, 'done', JSON.stringify(nj).slice(0, 600));
  if (nj.input?.videoPath) { assert.equal(nj.input.videoPath, path.join(D, 'aaaa0001-video0.mp4')); assert.ok(fs.existsSync(nj.input.videoPath)); assert.deepEqual(nj.input.refBatches, [[path.join(D, 'aaaa0001-refs1.png')]]); }
  else { const { toAbsDeep } = await import('../src/mediaPaths.ts'); const live = toAbsDeep(JSON.parse(rows().r.find((r: any) => r.id === rj.id).data), D); assert.ok(fs.existsSync(live.input.videoPath) && fs.existsSync(live.input.imagePath), JSON.stringify(live.input).slice(0, 300)); }
  for (const u of [nj.resultUrl, '/files/aaaa0001-video0.mp4', '/files/aaaa0001-refs1.png', '/files/voice-previews/old.wav'].filter(Boolean)) assert.equal((await fetch(B + u)).status, 200, u);
  ok(`retry of old job aaaa0001 → ${rj.id} done, inputs resolved under the new data dir; /files 200`);
  await new Promise((r) => setTimeout(r, 900)); // flush
  const b = rows(); for (const r of b.r) assert.ok(!ABS.test(r.data) && !r.data.includes(D), `row ${r.id} stores a host path: ${r.data.slice(0, 300)}`);
  const nr = JSON.parse(b.r.find((r: any) => r.id === rj.id).data); assert.equal(nr.input.videoPath, 'aaaa0001-video0.mp4'); ok(`new job ${rj.id} stored relative (${b.r.length} rows, none absolute)`);
  // ---- export: orphans excluded and listed ----
  const ex = await fetch(`${B}/api/export`); assert.equal(ex.status, 200); const tgz = path.join(D, '..', path.basename(D) + '-exp.tgz'); fs.writeFileSync(tgz, Buffer.from(await ex.arrayBuffer()));
  const list = execFileSync('tar', ['-tzf', tgz]).toString().split('\n').filter(Boolean); const mf = JSON.parse(execFileSync('tar', ['-xzOf', tgz, 'manifest.json']).toString()); fs.rmSync(tgz);
  for (const f of ['aaaa0001-video0.mp4', 'aaaa0001-refs1.png', 'bbbb0002-refs1.png', 'upl-inflight.png']) assert.ok(list.includes(f), `${f} exported`);
  for (const f of ['el-gone.png', 'voice-previews/old.wav']) { assert.ok(!list.includes(f), `${f} not exported`); assert.ok(mf.excluded.some((e: any) => e.path === f && e.reason === 'orphan'), `${f} in excluded[]`); }
  assert.equal(mf.orphans.files, 2); assert.equal(mf.media.pathsRelativeToDataDir, true); ok(`export: ${list.length} entries, orphans excluded ${JSON.stringify(mf.excluded.filter((e: any) => e.reason === 'orphan'))}`);
  // ---- idempotent: second boot changes nothing ----
  await down(p); p = boot(); await up(); const c = rows(); assert.equal(c.kv.runs.length, 1, 'no second migration run'); assert.deepEqual(c.r.map((r: any) => r.data).sort(), b.r.map((r: any) => r.data).sort().length ? c.r.map((r: any) => r.data).sort() : []);
  for (const r of c.r) assert.ok(!ABS.test(r.data)); ok('second boot: migration is a no-op (kv runs 1)');
  console.log('ALL OK relpaths');
} finally { await down(p); fs.rmSync(D, { recursive: true, force: true }); }
