// `npm run filming -- on` seeds the demo history into the NEW scratch data dir only; `--no-seed` keeps it empty; `off` is reversible.
// The "real" data dir here is a temp dir holding a DB: its sha256 (and file list) must be identical before and after on / off.
// Also: interim AI stills (OPENHIGGSFIELD_EXAMPLES_DIR) → demo job posterUrl + caption; no elements are seeded (Elements left the UI 2026-10-23). No server on :8787 is touched (FILMING_NO_RESTART).
// Run: npx tsx test/filming-seed.e2e.ts
import assert from 'node:assert/strict'; import { spawnSync, execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const TSX = [path.join(ROOT, 'node_modules/.bin/tsx'), path.join(ROOT, '../node_modules/.bin/tsx')].find((f) => fs.existsSync(f))!; const T = fs.mkdtempSync(path.join(os.tmpdir(), 'filmseed-'));
const REAL = path.join(T, 'real-data'); fs.mkdirSync(REAL); const STATE = path.join(T, 'filming', 'state.json'); const EX = path.join(T, 'examples');
// a real-looking DB in the real dir (made by booting the db module there), plus a file
const script = (name: string, body: string) => { const f = path.join(T, name); fs.writeFileSync(f, body.replaceAll('./src/', `${ROOT}/src/`)); return f; };
execFileSync(TSX, [script('mkdb.mts', "const { db } = await import('./src/db.ts'); db.prepare('select 1').get(); db.close();")], { cwd: ROOT, env: { ...process.env, OPENHIGGSFIELD_DATA_DIR: REAL, OPENHIGGSFIELD_FILMING_FILE: path.join(T, 'none.json') } });
fs.writeFileSync(path.join(REAL, 'keep.txt'), 'real');
const sum = () => fs.readdirSync(REAL).sort().map((f) => `${f}:${createHash('sha256').update(fs.readFileSync(path.join(REAL, f))).digest('hex')}`).join('\n');
const before = sum(); assert.match(before, /openhiggsfield\.db:/);
// interim stills for 2 demo jobs (the rest stay on sample media)
fs.mkdirSync(path.join(EX, 'assets'), { recursive: true }); for (const f of ['demo01.jpg', 'demo06.jpg']) execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=64x40', '-frames:v', '1', path.join(EX, 'assets', f)]);
const film = (...a: string[]) => spawnSync(TSX, ['scripts/filming-mode.ts', ...a], { cwd: ROOT, encoding: 'utf8', timeout: 400_000,
  env: { ...process.env, OPENHIGGSFIELD_FILMING_FILE: STATE, OPENHIGGSFIELD_DATA_DIR: REAL, FILMING_NO_RESTART: '1', FILMING_NO_PREFLIGHT: '1', OPENHIGGSFIELD_EXAMPLES_DIR: EX, TMPDIR: process.env.TMPDIR ?? os.tmpdir() } });
const ok = (m: string) => console.log('ok ' + m);
try {
  const on = film('on'); assert.equal(on.status, 0, on.stderr + on.stdout); assert.match(on.stdout, /demo seed: seeded 9 demo jobs into .*\(2 with an AI poster still, 7 on sample media\)/, on.stdout);
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8')); assert.equal(st.on, true); assert.notEqual(path.resolve(st.dataDir), REAL); assert.ok(fs.existsSync(path.join(st.dataDir, 'openhiggsfield.db')));
  assert.equal(sum(), before, 'real data dir unchanged by on'); ok(`on: seeded ${st.dataDir} (real DB sha256 unchanged)`);
  // read the scratch DB through the app modules (filming ON → DATA_DIR = scratch)
  const probe = spawnSync(TSX, [script('probe.mts', `
    const { jobs } = await import('./src/jobs.ts'); const lib = await import('./src/library.ts'); const { jobPoster } = await import('./src/interimTiles.ts');
    const js = [...jobs.values()].filter((j) => /^demo0\\d$/.test(j.id)).sort((a, b) => a.id.localeCompare(b.id));
    console.log(JSON.stringify({ jobs: js.map((j) => ({ id: j.id, status: j.status, ...jobPoster(j.id) })), els: lib.listElements().map(lib.pubElement).map((e) => ({ name: e.name, url: e.url, aiGenerated: e.aiGenerated, credit: e.credit })) }));`)],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, OPENHIGGSFIELD_FILMING_FILE: STATE, OPENHIGGSFIELD_EXAMPLES_DIR: EX, OPENHIGGSFIELD_BACKEND: 'mock' } });
  const P = JSON.parse(probe.stdout.trim().split('\n').pop()!);
  assert.equal(P.jobs.length, 9); assert.equal(P.jobs.filter((j: any) => j.status === 'done').length, 8); assert.equal(P.jobs.find((j: any) => j.id === 'demo09').status, 'failed');
  assert.equal(P.jobs.find((j: any) => j.id === 'demo01').posterUrl, '/examples/assets/demo01.jpg'); assert.match(P.jobs.find((j: any) => j.id === 'demo01').caption, /AI-generated/);
  assert.equal(P.jobs.find((j: any) => j.id === 'demo02').posterUrl, null, 'no still yet → sample media thumb (null = use the output poster)');
  assert.equal(P.els.length, 0, 'no elements seeded');
  ok('scratch: 9 demo jobs (8 done + 1 failed), demo01/demo06 posterUrl = AI still + caption, others null; no elements');
  const again = film('on'); assert.equal(again.status, 0); assert.match(again.stdout, /already ON/); assert.equal(sum(), before);
  const off = film('off'); assert.equal(off.status, 0, off.stderr); const st2 = JSON.parse(fs.readFileSync(STATE, 'utf8')); assert.equal(st2.on, false); assert.equal(st2.lastDataDir, st.dataDir);
  assert.ok(fs.existsSync(st.dataDir), 'scratch kept'); assert.equal(sum(), before, 'real data dir unchanged by off'); ok('off: state off, back on the real dir, scratch kept, real DB unchanged');
  const on2 = film('on', '--no-seed'); assert.equal(on2.status, 0, on2.stderr); assert.match(on2.stdout, /skipped \(--no-seed\)/); const st3 = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  assert.notEqual(st3.dataDir, st.dataDir); assert.deepEqual(fs.readdirSync(st3.dataDir), [], '--no-seed: empty scratch dir'); assert.equal(film('off').status, 0); assert.equal(sum(), before);
  ok('--no-seed: new empty scratch dir; off again; real DB sha256 still identical');
  console.log('ALL OK filming-seed');
} finally { fs.rmSync(T, { recursive: true, force: true }); }
