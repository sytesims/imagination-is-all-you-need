// Community seeds (Oct 18 steering): Blender sample clips are samples, not tool outputs; aiGenerated + sampleCredit on SeedSpec and in the community APIs;
// legacy seeded rows are migrated in place on boot without touching real user jobs. Run: npx tsx test/community-seed.e2e.ts (port 8954; temp data dirs).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cseed-'));
const LABEL = 'Sample · CC-BY Blender Foundation';
// ---- 1. legacy rows → migrate (separate process: env must be set before the db module loads) ----
const legacy = `
const { jobs, flushJobs } = await import('../src/jobs.ts'); const lib = await import('../src/library.ts'); const cs = await import('../src/communitySeed.ts'); const { SEED_OWNER } = await import('../src/owner.ts');
const v1 = cs.seedIdOf('v1'), v2 = cs.seedIdOf('v2'), i1 = cs.seedIdOf('i1'); const base = { status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, error: null, errorType: null, cost: 0, refunded: 0, warnings: [], parentId: null, createdAt: 1, finishedAt: 2, updatedAt: 2 };
jobs.set(v1, { ...base, id: v1, toolId: 'motion-transfer', provider: 'comfy-open', resultUrl: '/examples/hq-soar.mp4', outputs: [{ label: 'Video', url: '/examples/hq-soar.mp4' }], input: { prompt: 'a young dragon in flight', seededExample: 'ex-dance' }, owner: 'community:mira', seed: true });
lib.setCommunityMeta(v1, { author: 'mira', likes: 41, publishedAt: 5, aiGenerated: true }); 
jobs.set(v2, { ...base, id: v2, toolId: 'camera', provider: 'comfy-open', resultUrl: '/examples/hq-burrow.mp4', outputs: [{ label: 'Video', url: '/examples/hq-burrow.mp4' }], input: { prompt: 'a sunlit meadow' }, owner: SEED_OWNER, seed: true });
lib.setCommunityMeta(v2, { author: 'taro', likes: 19, publishedAt: 6, aiGenerated: true }); lib.trash(v2);
jobs.set(i1, { ...base, id: i1, toolId: 'create-image', provider: 'mock', resultUrl: '/x.png', outputs: [], input: { prompt: 'studio portrait' }, owner: SEED_OWNER, seed: true }); lib.setCommunityMeta(i1, { author: 'kofi', likes: 33, publishedAt: 7, aiGenerated: true });
// a real user job that looks like a sample (same clip, published) must stay as is
jobs.set('user0001', { ...base, id: 'user0001', toolId: 'motion-transfer', provider: 'comfy-open', resultUrl: '/examples/hq-soar.mp4', outputs: [{ label: 'Video', url: '/examples/hq-soar.mp4' }], input: { prompt: 'my own prompt' }, owner: 'local' });
lib.publishJob('user0001', true);
const { setKv } = await import('../src/db.ts'); setKv('communitySeed', { ids: [v1, v2, i1], at: Date.now() });
flushJobs(); console.log('LEGACY_OK');`;
fs.writeFileSync(path.join(ROOT, 'test', '.cseed-legacy.mts'), legacy);
try { const out = execFileSync('npx', ['tsx', 'test/.cseed-legacy.mts'], { cwd: ROOT, env: { ...process.env, OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' } }).toString(); assert.match(out, /LEGACY_OK/); }
finally { fs.rmSync(path.join(ROOT, 'test', '.cseed-legacy.mts'), { force: true }); }
ok('legacy seeded rows written (v1 motion-transfer/mira, v2 trashed, i1 image, user0001 real job)');
// ---- 2. boot: reseed + migrate, then check the APIs ----
const PORT = testPort(8954); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_INTERIM_TILES: '0' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  process.env.OPENHIGGSFIELD_INTERIM_TILES = '0'; const cs = await import('../src/communitySeed.ts');
  const ids = Object.fromEntries(cs.SEEDS.map((s) => [s.key, cs.seedIdOf(s.key)]));
  // SeedSpec
  for (const s of (cs.SEEDS as any[]).filter((x) => !/^c\d$/.test(x.key))) { assert.equal(s.aiGenerated, false, s.key); // interim stills off here (test/interim-tiles.e2e.ts covers them) assert.equal(s.prompt, undefined); assert.equal(s.example, undefined);
    if (s.media === 'video') { assert.equal(s.sampleCredit, LABEL); assert.equal(s.author, 'Blender Foundation'); } else { assert.equal(s.sampleCredit, 'Sample · Imagination Is All You Need'); assert.equal(s.author, 'Imagination Is All You Need samples'); } }
  ok('SeedSpec: 4 clips + 6 images, all samples with sampleCredit, no prompt/example, aiGenerated false');
  // shots
  const shots = (await get('/api/community/shots?limit=100')).items as any[]; const by = Object.fromEntries(shots.map((x) => [x.id, x]));
  for (const k of ['v1', 'v3', 'v4']) { const x = by[ids[k]]; assert.ok(x, `shot ${k}`);
    assert.equal(x.kind, 'sample'); assert.equal(x.toolId, null); assert.equal(x.toolName, null); assert.equal(x.prompt, null); assert.equal(x.aiGenerated, false); assert.equal(x.sampleCredit, LABEL);
    assert.equal(x.author, 'Blender Foundation'); assert.match(x.title, /^(Sintel|Big Buck Bunny) · sample clip$/); assert.match(x.posterUrl, /\/examples\/hq-[a-z]+\.jpg$/); }
  assert.equal(by[ids.v1].likes, 0, 'round 1: seeded like counts are never shown (real likes only)'); assert.ok(!by[ids.v2], 'trashed legacy seed stays gone');
  for (const k of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']) { const x = by[ids[k]]; assert.ok(x, `shot ${k}`); assert.equal(x.kind, 'sample'); assert.equal(x.toolId, null); assert.equal(x.toolName, null); assert.equal(x.prompt, null);
    assert.equal(x.aiGenerated, false); assert.equal(x.sampleCredit, 'Sample · Imagination Is All You Need'); assert.equal(x.author, 'Imagination Is All You Need samples'); assert.match(x.title, / · sample image$/); assert.match(x.posterUrl, /\.(jpg|png)$/); }
  assert.equal(by[ids.i1].likes, 0, 'round 1: legacy i1 seeded likes ignored');
  const u = by['user0001']; assert.ok(u); assert.equal(u.kind, 'result'); assert.equal(u.toolId, 'motion-transfer'); assert.equal(u.aiGenerated, true); assert.equal(u.prompt, 'my own prompt'); assert.equal(u.sampleCredit, null);
  ok(`shots: v1/v3/v4 samples (toolId null, prompt null, credit '${LABEL}'), legacy v1 migrated, v2 stays trashed, images are samples (legacy i1 migrated), user job untouched`);
  // community feed
  const feed = (await get('/api/community?sort=new&limit=200')).items as any[]; const fb = Object.fromEntries(feed.map((x) => [x.id, x]));
  const f1 = fb[`job:${ids.v1}`]; assert.equal(f1.kind, 'sample'); assert.equal(f1.toolId, null); assert.equal(f1.toolName, null); assert.equal(f1.aiGenerated, false); assert.equal(f1.sampleCredit, LABEL); assert.match(f1.title, /sample clip/); assert.ok(!/dragon/i.test(f1.title));
  assert.ok(feed.every((x) => typeof x.aiGenerated === 'boolean' && 'sampleCredit' in x), 'every feed item has both fields');
  const fi = fb[`job:${ids.i2}`]; assert.equal(fi.kind, 'sample'); assert.equal(fi.media, 'image'); assert.equal(fi.toolId, null); assert.equal(fi.sampleCredit, 'Sample · Imagination Is All You Need');
  assert.equal(fb['job:user0001'].aiGenerated, true); assert.equal(fb['job:user0001'].toolId, 'motion-transfer');
  for (const x of feed.filter((x) => x.id.startsWith('job:'))) assert.match(x.route, /^\/(jobs\/[\w-]+|s\/[\w-]+)$/, `community link ${x.route}`); assert.equal(f1.route, `/jobs/${ids.v1}`);
  ok('feed: sample kind, no tool, fields on every item; user job unchanged');
  // job detail: no tool-output framing left on the job itself
  const j = await get(`/api/jobs/${ids.v1}`); assert.equal(j.toolId, 'sample'); assert.equal(j.input?.prompt, undefined); assert.equal(j.input?.seededExample, undefined); assert.equal(j.sampleLabel, LABEL);
  const ji = await get(`/api/jobs/${ids.i1}`); assert.equal(ji.toolId, 'sample'); assert.equal(ji.input?.prompt, undefined);
  assert.equal(j.aiGenerated, false); assert.equal(j.sampleCredit, LABEL); assert.equal(ji.aiGenerated, false); assert.equal(ji.sampleCredit, 'Sample · Imagination Is All You Need');
  { const ju = await get('/api/jobs/user0001'); assert.equal(ju.aiGenerated, true); assert.equal(ju.sampleCredit, null); ok('/api/jobs/:id: aiGenerated + sampleCredit (sample false + credit, user job true + null)'); }
  const raw = JSON.stringify(shots.filter((x) => x.kind === 'sample')) + JSON.stringify(j) + JSON.stringify(ji); for (const w of ['mira', 'taro', 'kofi', 'lena', '"ana"', 'Motion Transfer', 'motion-transfer', 'Create Image', 'create-image', 'dragon in flight', 'studio portrait, soft key']) assert.ok(!raw.includes(w), `no '${w}'`);
  ok('job detail: toolId sample, no prompt/example; no made-up author or tool name in sample payloads');
  // openapi
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'openapi.json'), 'utf8')); const txt = JSON.stringify(spec.paths['/api/community/shots']) + JSON.stringify(spec.paths['/api/community']);
  assert.ok(txt.includes('aiGenerated') && txt.includes('sampleCredit')); assert.ok(JSON.stringify(spec.paths['/api/jobs/{id}']).includes('sampleCredit'), 'job detail documented'); ok('openapi documents aiGenerated + sampleCredit');
  console.log('ALL OK community-seed');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } }
