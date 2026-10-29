// BUG-HUNT-10 P1-5 + P2 server fixes: static discover covers (never mock output), no host paths in /api/jobs (refBatches),
// migration log prefixes as labels (old records rewritten at boot), plain route lines / ledger notes, clip-length price estimate flag.
// Run: npx tsx test/bh10.e2e.ts (port 8957; temp data dir, mock backend, no keys)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { prefixLabel, labelPrefixes, publicPaths } from '../src/mediaPaths.js'; import { plainRoute } from '../src/routing/run.js'; import { localRunnerName } from '../src/routing/routes.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh10-')); const DATA = path.join(D, 'data');
// ---- unit ----
assert.equal(prefixLabel(DATA, DATA), '<data dir>/'); assert.equal(prefixLabel(DATA + '/', DATA), '<data dir>/');
assert.equal(prefixLabel('/home/someone/old/openhiggsfield/server/data/', DATA), '<other checkout>/server/data/'); assert.equal(prefixLabel('/data/', DATA), '<docker volume>/data/');
assert.deepEqual(labelPrefixes({ '/a/server/data/': 2, '/b/server/data/': 3, '<data dir>/': 1 }, DATA), { '<other checkout>/server/data/': 5, '<data dir>/': 1 });
assert.deepEqual(publicPaths([[path.join(DATA, 'x-refs1.png'), 'y.png'], ['/etc/passwd']], DATA), [['/files/x-refs1.png', '/files/y.png'], []]);
assert.equal(plainRoute({ routeId: 'fal:x', label: 'fal.ai · demo · list price 160 credits' }), 'fal.ai'); assert.equal(plainRoute({ routeId: 'local:comfy-open', label: 'Your computer · free' }), 'Your computer');
assert.equal(localRunnerName({ id: 'local-ffmpeg-hdr' }), 'Your computer'); assert.equal(localRunnerName({ id: 'comfy-open', workflows: ['a.json'] }), 'Your computer');
ok('labels, publicPaths, plainRoute, localRunnerName');
// ---- boot migration: an old record with host prefixes is rewritten to labels ----
fs.mkdirSync(DATA, { recursive: true });
const pre = path.join(D, 'pre.mts'); fs.writeFileSync(pre, `const { setKv } = await import(${JSON.stringify(path.join(ROOT, 'src/db.ts'))}); setKv('migration:relativeMediaPaths', { firstRunAt: 'x', lastRunAt: 'x', runs: [{ at: 'x', rows: 2, values: 3, prefixes: { '/old/clone/server/data/': 3, ${JSON.stringify(DATA + '/')}: 1 } }] }); process.exit(0);`);
const env = { ...process.env, OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock' };
execFileSync(path.join(ROOT, '../node_modules/.bin/tsx'), [pre], { env, cwd: ROOT });
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const PORT = testPort(8957); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const post = path.join(D, 'post.mts'); fs.writeFileSync(post, `const { getKv } = await import(${JSON.stringify(path.join(ROOT, 'src/db.ts'))}); console.log(JSON.stringify(getKv('migration:relativeMediaPaths', null))); process.exit(0);`);
  const kv = JSON.parse(execFileSync(path.join(ROOT, '../node_modules/.bin/tsx'), [post], { env, cwd: ROOT }).toString().trim().split('\n').pop()!);
  assert.deepEqual(kv.runs[0].prefixes, { '<other checkout>/server/data/': 3, '<data dir>/': 1 }); assert.ok(!JSON.stringify(kv).includes(D)); ok('migration log: old host prefixes rewritten to labels at boot');
  // ---- discover covers: static art only ----
  const mean = (f: string) => { const o = execFileSync('ffprobe', ['-v', 'error', '-f', 'lavfi', `movie=${f},signalstats`, '-show_entries', 'frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.SATAVG', '-of', 'csv=p=0']).toString().trim().split(',').map(Number); return o; };
  const posterDir = path.join(DATA, 'posters', 'v3');
  const kinds = new Map<string, string>(((await (await fetch(`${B}/api/posters`)).json() as any).items as any[]).map((x) => [x.toolId, x.kind]));
  const drawtext = (() => { try { return /\bdrawtext\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-filters'], { env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return false; } })(); // title cards need ffmpeg drawtext; builds without it 404 them (the web shows the tool glyph)
  for (const id of ['object-swap', 'camera', 'reframe', 'sdr-hdr', 'audio', 'soul']) {
    const r = await fetch(`${B}/api/posters/${id}.jpg`); if (r.status === 404 && kinds.get(id) === 'card' && !drawtext) { console.log(`  (no ffmpeg drawtext here: ${id} title card not rendered)`); continue; } assert.equal(r.status, 200, id); const buf = Buffer.from(await r.arrayBuffer()); assert.ok(buf.length > 1000, id);
    const f = path.join(D, `${id}.jpg`); fs.writeFileSync(f, buf); const [, sat] = mean(f); assert.ok(sat < 60, `${id} cover looks like colour bars (sat ${sat})`);
  }
  const made = fs.readdirSync(posterDir); assert.ok(made.some((f) => /^object-swap--preset-object-swap-/.test(f)), made.join()); if (drawtext || kinds.get('reframe') !== 'card') assert.ok(made.some((f) => /^reframe--card(-v2)?\.jpg$/.test(f)), made.join()); else assert.ok(!made.some((f) => /^reframe--/.test(f)), 'no half-written card without drawtext');
  ok('discover covers: preset posters or a plain title card, never a mock frame (' + made.length + ' made)');
  // ---- clip-length price before upload ----
  const q0 = (await (await fetch(`${B}/api/tools/reframe/price`)).json()) as any; assert.equal(q0.estimated, true); assert.equal(q0.assumedSeconds, 8); assert.match(q0.estimateMessage, /once your clip is loaded/); assert.match(q0.estimateMessage, /^Estimate for an 8 s clip/);
  const q1 = (await (await fetch(`${B}/api/tools/reframe/price?sample=/samples/sample-take.mp4`)).json()) as any; assert.equal(q1.estimated, false); assert.equal(q1.clipSeconds, 6);
  const q2 = (await (await fetch(`${B}/api/tools/reframe/price?seconds=6`)).json()) as any; assert.equal(q1.credits, q2.credits); assert.equal(q1.listCredits ?? null, q2.listCredits ?? null);
  assert.equal(q2.estimated, undefined); const q3 = (await (await fetch(`${B}/api/tools/reframe/price?sample=/samples/../src/x.mp4`)).json()) as any; assert.equal(q3.estimated, true);
  ok(`clip price: no clip → estimated (8 s, ${q0.listCredits ?? q0.credits}); ?sample= → real length (${q1.listCredits ?? q1.credits}) = ?seconds=6`);
  // ---- /api/jobs: refBatches as /files/ URLs ----
  const PNG = path.join(D, 'r.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=256x256', '-frames:v', '1', PNG]);
  const MP4 = path.join(D, 'c.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=854x480:r=24', '-t', '5', '-pix_fmt', 'yuv420p', MP4]);
  const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', prompt: 'swap the jacket for @image1', types: '["outfit"]' })) fd.append(k, v);
  fd.append('video', new Blob([fs.readFileSync(MP4)], { type: 'video/mp4' }), 'c.mp4'); fd.append('refs', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'r.png');
  const sr = await fetch(`${B}/api/tools/object-swap/jobs`, { method: 'POST', body: fd }); const sb = (await sr.json()) as any; assert.equal(sr.status, 200, JSON.stringify(sb));
  const j = (await (await fetch(`${B}/api/jobs/${sb.id}`)).json()) as any; assert.ok(Array.isArray(j.input.refBatches) && j.input.refBatches.flat().length, JSON.stringify(j.input));
  for (const u of j.input.refBatches.flat()) assert.match(u, /^\/files\/[^/]/); const all = await (await fetch(`${B}/api/jobs`)).text(); assert.ok(!all.includes(D), 'host path in /api/jobs');
  ok('/api/jobs refBatches = ' + JSON.stringify(j.input.refBatches) + ', no host path');
  console.log('ALL OK bh10');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } await new Promise((r) => setTimeout(r, 300)); fs.rmSync(D, { recursive: true, force: true }); }
